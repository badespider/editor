import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import type { AudioEvidence, FrameEvidence, Source } from "./types.ts";

export function run(binary: string, args: string[], signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolveOutput, reject) => {
    const child = spawn(binary, args, { windowsHide: true, signal, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-32000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolveOutput(stdout || stderr) :
      reject(new Error(`${binary} exited ${code}: ${stderr.slice(-3000)}`)));
  });
}

export async function probe(path: string, signal?: AbortSignal) {
  const raw = await run(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_entries",
    "format=duration,start_time:stream=codec_type,width,height,start_time,duration", "-of", "json", path], signal);
  const data = JSON.parse(raw) as { format: { duration: string; start_time?: string }; streams: Array<{
    codec_type: string; width?: number; height?: number; start_time?: string; duration?: string;
  }> };
  const video = data.streams.find(stream => stream.codec_type === "video");
  const duration = Number(video?.duration ?? data.format.duration);
  if (!video?.width || !video.height || !Number.isFinite(duration) || duration <= 0) throw new Error("A finite-duration video is required");
  return { duration, width: video.width, height: video.height,
    hasAudio: data.streams.some(stream => stream.codec_type === "audio"), startTime: Number(video.start_time || 0),
    containerStartTime: Number(data.format.start_time || 0) };
}

export async function fingerprint(path: string, signal?: AbortSignal) {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("Source must be a regular file");
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  return { sha256: hash.digest("hex"), bytes: info.size, mtimeMs: info.mtimeMs };
}

export async function audioEvidence(path: string, hasTrack: boolean, signal?: AbortSignal): Promise<AudioEvidence> {
  if (!hasTrack) return { hasTrack: false, digitalSilence: true, peakDb: null, samples: 0 };
  const output = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-nostdin", "-i", path,
    "-map", "0:a:0", "-vn", "-af", "astats=metadata=0:reset=0", "-f", "null", "-"], signal);
  const peak = [...output.matchAll(/Peak level dB: (-?inf|[\d.e+-]+)/g)].at(-1)?.[1];
  const samples = Number(/Number of samples: (\d+)/.exec(output)?.[1]);
  if (!peak || !Number.isFinite(samples) || samples <= 0) throw new Error("Could not measure decoded audio");
  return { hasTrack, digitalSilence: peak === "-inf", peakDb: peak === "-inf" ? null : Number(peak), samples };
}

export async function prepare(path: string, directory: string, maxDuration: number, signal?: AbortSignal): Promise<Source> {
  path = resolve(path);
  const [metadata, hash] = await Promise.all([probe(path, signal), fingerprint(path, signal)]);
  if (metadata.duration > maxDuration) throw new Error(`Video is ${metadata.duration}s; limit is ${maxDuration}s. Use a smaller clip or explicitly raise --max-duration.`);
  await mkdir(directory, { recursive: true });
  const preparedPath = join(directory, "source.mp4");
  // Keep native spatial detail and variable frame timing. Shift BOTH tracks by
  // the same video origin; do not independently zero audio and lose A/V sync.
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", "-copyts", "-i", path,
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", `setpts=PTS-(${metadata.startTime})/TB,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
    "-af", `asetpts=PTS-(${metadata.startTime})/TB`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", preparedPath], signal);
  const after = await stat(path);
  if (after.size !== hash.bytes || after.mtimeMs !== hash.mtimeMs) throw new Error("Source changed while preparing; retry with a stable file");
  const prepared = await probe(preparedPath, signal);
  const audio = await audioEvidence(preparedPath, prepared.hasAudio, signal);
  return { path, ...hash, ...metadata, preparedPath, preparedDuration: prepared.duration,
    duration: prepared.duration, audio, timeBasis: "seconds from first video presentation timestamp" };
}

export async function frame(source: string, time: number, directory: string, id: string, signal?: AbortSignal): Promise<FrameEvidence> {
  const path = join(directory, `${id}.png`);
  // Decode to the first presentation timestamp at/after the request, report the
  // actual PTS (VFR safe). Never manufacture a frame index from average FPS.
  const output = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-nostdin", "-n", "-i", source,
    "-vf", `select=gte(t\\,${time}),showinfo`, "-frames:v", "1", "-fps_mode", "vfr", "-update", "1", path], signal);
  const actual = /pts_time:([\d.e+-]+)/.exec(output);
  if (!actual || !(await stat(path)).size) throw new Error(`No decoded frame at ${time}s`);
  return { id, path, requestedTime: time, time: Number(actual[1]) };
}

export async function clip(source: string, start: number, end: number, output: string, signal?: AbortSignal) {
  await run(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", "-i", source,
    "-ss", String(start), "-t", String(end - start), "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-fps_mode", "vfr", "-c:a", "aac", output], signal);
}
