import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, mkdtemp, realpath, rmdir, stat, unlink } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { planSchema } from "./schema.ts";
import { validatePlan } from "./validate.ts";

function run(binary: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    const child = spawn(binary, args, { windowsHide: true, signal, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout = (stdout + chunk).slice(-2_000_000); });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-8000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveOutput(stdout) : reject(new Error(`${binary} exited ${code}: ${stderr.slice(-3000)}`)));
  });
}

export async function fingerprint(path: string, signal?: AbortSignal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  return hash.digest("hex");
}

export async function probe(path: string, signal?: AbortSignal) {
  const data = JSON.parse(await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries",
    "format=duration:stream=codec_type,width,height,start_time,duration", "-of", "json", "-protocol_whitelist", "file,pipe", path], signal));
  const video = data.streams?.find((stream: { codec_type: string }) => stream.codec_type === "video");
  const duration = Number(video?.duration ?? data.format?.duration);
  const startTime = Number(video?.start_time ?? 0);
  if (!video?.width || !video?.height || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(startTime)) throw new Error("Expected a finite-duration local video.");
  return { duration, startTime, width: Number(video.width), height: Number(video.height),
    hasAudio: data.streams.some((stream: { codec_type: string }) => stream.codec_type === "audio") };
}

/** Local cut-only preview. It never mounts a project, fetches a URL, or calls an AI provider. */
export async function renderPreview(input: unknown, options: { output: string; baseDirectory: string; signal?: AbortSignal }) {
  options.signal?.throwIfAborted();
  const report = validatePlan(input);
  if (!report.canRenderPreview) throw new Error(`Plan rejected: ${report.errors.map(error => error.message).join("; ")}`);
  const plan = planSchema.parse(input);
  if (report.duration > 120 || plan.segments.length > 24) throw new Error("Preview budget is 120 seconds and 24 segments. Make a smaller preview plan.");
  const output = resolve(options.output);
  if (extname(output).toLowerCase() !== ".mp4") throw new Error("Preview output must end in .mp4");
  try { await stat(output); throw new Error("Output already exists; choose a new filename."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000);
  const sourceInfo = new Map<string, { path: string; metadata: Awaited<ReturnType<typeof probe>>; bytes: number; mtimeMs: number }>();
  for (const source of plan.sources.filter(source => plan.segments.some(segment => segment.sourceId === source.id))) {
    const path = await realpath(resolve(options.baseDirectory, source.path));
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`${source.id} is not a regular file.`);
    // Bound work even when the plan references a long recording or huge source.
    if (info.size > 2_000_000_000) throw new Error("Preview source exceeds the 2 GB local budget.");
    const metadata = await probe(path, signal);
    if (metadata.duration > 7200) throw new Error("Preview source exceeds the two-hour local budget.");
    if (plan.segments.some(segment => segment.sourceId === source.id && segment.out > metadata.duration + 0.001)) throw new Error(`${source.id}: cut exceeds actual probed duration.`);
    if (source.sha256 && await fingerprint(path, signal) !== source.sha256) throw new Error(`${source.id}: source fingerprint changed. Reinspect it.`);
    if (source.audio === "no_track" && metadata.hasAudio) throw new Error(`${source.id}: declared no_track but an audio track exists.`);
    if (source.audio === "speech" && !metadata.hasAudio) throw new Error(`${source.id}: declared speech but no audio track exists.`);
    sourceInfo.set(source.id, { path, metadata, bytes: info.size, mtimeMs: info.mtimeMs });
  }
  await mkdir(dirname(output), { recursive: true });
  const scratch = await mkdtemp(join(dirname(output), ".playbook-preview-"));
  const partial = join(scratch, "preview.mp4");
  try {
    const args = ["-v", "error", "-nostdin", "-n", "-copyts"];
    const filters: string[] = [], labels: string[] = [];
    plan.segments.forEach((segment, index) => {
      const source = sourceInfo.get(segment.sourceId)!;
      args.push("-protocol_whitelist", "file,pipe", "-i", source.path);
      const duration = segment.out - segment.in;
      // Both tracks use the SAME video origin. Resampling pads delayed audio and drops negative samples.
      filters.push(`[${index}:v:0]setpts=PTS-(${source.metadata.startTime})/TB,trim=start=${segment.in}:end=${segment.out},setpts=PTS-(${segment.in})/TB,scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${index}]`);
      filters.push(source.metadata.hasAudio ?
        `[${index}:a:0]asetpts=PTS-(${source.metadata.startTime})/TB,aresample=48000:async=1:first_pts=0,atrim=start=${segment.in}:end=${segment.out},asetpts=PTS-(${segment.in})/TB,aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${duration}[a${index}]` :
        `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[a${index}]`);
      labels.push(`[v${index}][a${index}]`);
    });
    filters.push(`${labels.join("")}concat=n=${plan.segments.length}:v=1:a=1[v][a]`);
    args.push("-filter_complex", filters.join(";"), "-map", "[v]", "-map", "[a]", "-map_metadata", "-1",
      "-t", String(report.duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", partial);
    await run(process.env.FFMPEG_PATH || "ffmpeg", args, signal);
    const rendered = await probe(partial, signal);
    if (Math.abs(rendered.duration - report.duration) > 0.12) throw new Error("Rendered duration differs from the plan by more than 120 ms.");
    for (const [id, source] of sourceInfo) {
      const after = await stat(source.path);
      if (after.size !== source.bytes || after.mtimeMs !== source.mtimeMs) throw new Error(`${id}: source changed during render.`);
    }
    await copyFile(partial, output, constants.COPYFILE_EXCL);
    return { path: output, plannedDuration: report.duration, renderedDuration: rendered.duration,
      aiCalls: 0, sourceFilesModified: false, projectModified: false,
      reviewRequired: true, safeToAutoEdit: false,
      limitations: ["Cut-only 1280x720, 30 fps preview with source audio; no captions, overlays, zooms, transitions or music additions.",
        "Use original native-resolution frames for fine timing and text checks; preview resampling is not frame-accurate evidence."] };
  } finally {
    await unlink(partial).catch(() => {});
    await rmdir(scratch).catch(() => {});
  }
}
