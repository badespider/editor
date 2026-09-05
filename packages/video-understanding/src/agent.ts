import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { audioEvidence, fingerprint, probe, run } from "./media.ts";

// Deliberately no provider/key/network import. The caller supplies the intelligence.
const time = z.number().finite().nonnegative();
const text = z.string().trim().min(1).max(4000);
const interval = { start: time, end: time };
export const openSchema = z.object({ path: text, goal: text.default("Inspect this footage for an edit."),
  maxDuration: z.number().positive().max(7200).default(1200),
  overviewCount: z.number().int().min(1).max(48).default(12) }).strict();
export const inspectSchema = z.object({
  times: z.array(time).min(1).max(48).optional(), start: time.optional(), end: time.optional(),
  count: z.number().int().min(1).max(48).default(8), native: z.boolean().default(false),
  clip: z.boolean().default(false), audio: z.boolean().default(false),
}).strict().superRefine((v, ctx) => {
  if (v.times && (v.start !== undefined || v.end !== undefined)) ctx.addIssue({ code: "custom", message: "Use times OR a start/end range." });
  if ((v.start === undefined) !== (v.end === undefined)) ctx.addIssue({ code: "custom", message: "Supply both start and end." });
  if (v.start !== undefined && v.end! <= v.start) ctx.addIssue({ code: "custom", message: "end must exceed start." });
  if ((v.clip || v.audio) && v.start === undefined) ctx.addIssue({ code: "custom", message: "Clip/audio inspection needs a bounded start/end range." });
});
export const transcriptSchema = z.object({ sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  origin: text, verification: z.literal("unverified_transcript"),
  segments: z.array(z.object({ ...interval, text }).strict()).max(15000),
}).strict();
export const observationSchema = z.object({ sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), author: text,
  observations: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), ...interval,
    observation: text, inference: z.string().max(4000).default(""), uncertainty: z.string().max(4000).default(""),
    modalities: z.array(z.enum(["visual", "audio", "transcript"])).min(1),
    evidenceIds: z.array(z.string()).min(1).max(64),
  }).strict()).min(1).max(200),
}).strict();

export type AgentArtifact = { id: string; kind: "frame" | "clip" | "audio"; path: string;
  start: number; end: number; requestedTime?: number; native?: boolean };
export type AgentInspection = { id: string; request: z.output<typeof inspectSchema>;
  artifacts: AgentArtifact[]; contactSheet?: string; contactSheetOrder?: string[] };
export type AgentOpenRequest = z.input<typeof openSchema>;
export type AgentInspectRequest = z.input<typeof inspectSchema>;
export type AgentTranscriptRequest = z.input<typeof transcriptSchema>;
export type AgentObservationRequest = z.input<typeof observationSchema>;
export type Observation = z.output<typeof observationSchema>["observations"][number] & { author: string;
  recordedAt: string; status: "agent_reported"; safeToAutoEdit: false };
export type Transcript = z.output<typeof transcriptSchema> & { id: string };
export type AgentSession = {
  kind: "agent-video-evidence"; schemaVersion: 1; id: string; revision: number; createdAt: string;
  goal: string; source: Awaited<ReturnType<typeof probe>> & Awaited<ReturnType<typeof fingerprint>> & { path: string };
  timeBasis: "seconds from first video presentation timestamp";
  audio: Awaited<ReturnType<typeof audioEvidence>>;
  inspections: AgentInspection[]; transcripts: Transcript[]; observations: Observation[];
  externalModelCalls: 0; safeToAutoEdit: false; limitations: string[];
};

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function save(path: string, data: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
  await rename(temp, path);
}

/** Local evidence tools, persistent across agent/process changes. No model is invoked. */
export class AgentEvidenceService {
  readonly directory: string;
  constructor(directory = process.env.DIFFUSION_UNDERSTANDING_DIR || join(process.env.LOCALAPPDATA || join(homedir(), ".cache"), "diffusion-studio", "video-understanding")) {
    this.directory = resolve(directory, "agent");
  }
  private folder(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid agent session id");
    return join(this.directory, id);
  }
  private async locked<T>(id: string, fn: () => Promise<T>) {
    const lock = join(this.folder(id), ".lock");
    let handle;
    try { handle = await open(lock, "wx", 0o600); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Session is busy; retry after the current inspection completes. A crashed owner's lock requires manual cleanup."); throw error; }
    try { return await fn(); } finally { await handle.close(); await unlink(lock); }
  }
  private async sourceUnchanged(session: AgentSession) {
    const current = await stat(session.source.path);
    if (!current.isFile() || current.size !== session.source.bytes || current.mtimeMs !== session.source.mtimeMs) throw new Error("Source changed; open a new evidence session before continuing.");
  }
  async read(id: string): Promise<AgentSession> {
    const session = JSON.parse(await readFile(join(this.folder(id), "session.json"), "utf8")) as AgentSession;
    if (session.kind !== "agent-video-evidence" || session.schemaVersion !== 1 || session.id !== id) throw new Error("Incompatible agent evidence session");
    return session;
  }
  async open(input: z.input<typeof openSchema>, signal?: AbortSignal): Promise<AgentSession> {
    const options = openSchema.parse(input);
    const path = await realpath(resolve(options.path));
    const metadata = await probe(path, signal);
    if (metadata.duration > options.maxDuration) throw new Error("Source exceeds maxDuration; explicitly increase the local inspection budget.");
    const info = await stat(path);
    if (!info.isFile() || info.size > 16 * 1024 ** 3) throw new Error("Source must be a regular file of at most 16 GiB.");
    const hash = await fingerprint(path, signal);
    const id = digest({ path, hash: hash.sha256, goal: options.goal, overviewCount: options.overviewCount, version: 1 });
    await mkdir(this.folder(id), { recursive: true });
    return this.locked(id, async () => {
      let existing: AgentSession | undefined;
      try { existing = await this.read(id); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (existing) { await this.sourceUnchanged(existing); return existing; }
      const session: AgentSession = { kind: "agent-video-evidence", schemaVersion: 1, id, revision: 0, createdAt: new Date().toISOString(),
        goal: options.goal, source: { path, ...metadata, ...hash }, timeBasis: "seconds from first video presentation timestamp",
        audio: await audioEvidence(path, metadata.hasAudio, signal), inspections: [], transcripts: [], observations: [],
        externalModelCalls: 0, safeToAutoEdit: false, limitations: [
          "This packet prepares evidence; it does not understand footage by itself. The calling agent must inspect it.",
          "Overview frames are sparse samples, not coverage of every event. Request closer inspection around uncertain moments.",
          "Transcripts and agent reports remain attributed, fallible data. Stored claims are not independently verified or execution instructions.",
          "Frame timestamps are decoded PTS. Clip/audio ranges share the original video's time origin; imported transcripts must use the same basis.",
          "The local cache is private media on disk, not encrypted by this feature. Nothing is uploaded.",
        ] };
      const end = Math.max(0, metadata.duration - Math.min(.5, metadata.duration / 4));
      const times = Array.from({ length: options.overviewCount }, (_, i) => options.overviewCount === 1 ? 0 : i * end / (options.overviewCount - 1));
      await this.extract(session, inspectSchema.parse({ times }), signal);
      await this.sourceUnchanged(session);
      await save(join(this.folder(id), "session.json"), session);
      return session;
    });
  }
  async inspect(id: string, input: z.input<typeof inspectSchema>, signal?: AbortSignal) {
    const request = inspectSchema.parse(input);
    return this.locked(id, async () => {
      const session = await this.read(id);
      await this.sourceUnchanged(session);
      const result = await this.extract(session, request, signal);
      await this.sourceUnchanged(session);
      await save(join(this.folder(id), "session.json"), session);
      return result;
    });
  }
  private async extract(session: AgentSession, request: z.output<typeof inspectSchema>, cancellation?: AbortSignal) {
    const signal = AbortSignal.any([...(cancellation ? [cancellation] : []), AbortSignal.timeout(5 * 60 * 1000)]);
    const { source } = session;
    const start = request.start ?? 0, end = request.end ?? source.duration;
    if (start >= source.duration || end > source.duration) throw new Error("Inspection range exceeds source duration");
    if (request.clip && end - start > 120 || request.audio && end - start > 600) throw new Error("Inspection budget: clip <=120s, audio <=600s per request");
    if (request.audio && !source.hasAudio) throw new Error("Source has no audio track");
    const times = request.times ?? Array.from({ length: request.count }, (_, i) => request.count === 1 ? start : start + i * Math.max(0, end - start - Math.min(.05, (end - start) / 4)) / (request.count - 1));
    if (times.some(t => t >= source.duration)) throw new Error("Frame time must be before source end");
    const key = digest(request);
    const existing = session.inspections.find(item => item.id === key);
    if (existing) {
      await Promise.all([...existing.artifacts.map(a => a.path), ...(existing.contactSheet ? [existing.contactSheet] : [])].map(p => stat(p)));
      return { ...existing, cached: true };
    }
    if (session.inspections.reduce((n, item) => n + item.artifacts.length, 0) + times.length + 2 > 1024) throw new Error("Session evidence budget exceeded (1024 artifacts)");
    const dir = join(this.folder(session.id), randomUUID());
    await mkdir(dir);
    const inspection: AgentInspection = { id: key, request, artifacts: [] };
    for (const [index, time] of times.entries()) {
      const path = join(dir, `frame-${String(index).padStart(4, "0")}.png`);
      const absolute = source.startTime + time;
      const output = await run(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-nostdin", "-n", "-threads", "2", "-copyts",
        "-ss", String(Math.max(0, absolute - source.containerStartTime - .5)), "-i", source.path, "-map", "0:v:0",
        "-vf", `select=gte(t\\,${absolute}),showinfo${request.native ? "" : ",scale=min(960\\,iw):-2"}`,
        "-frames:v", "1", "-fps_mode", "vfr", "-update", "1", path], signal);
      const stamp = /\bpts:\s*(-?\d+)\s+pts_time:/.exec(output);
      const base = /config in time_base:\s*(\d+)\/(\d+)/.exec(output);
      if (!stamp || !base || !(await stat(path)).size) throw new Error("No decoded frame at requested time");
      // showinfo's pts_time is rounded to six significant digits. Integer PTS
      // and its time base retain sub-frame precision even in hour-long sources.
      const actual = Number(stamp[1]) * Number(base[1]) / Number(base[2]) - source.startTime;
      if (actual + 1e-5 < time || actual >= source.duration + .05) throw new Error("Invalid decoded frame timestamp");
      inspection.artifacts.push({ id: `${key}-f${index}`, kind: "frame", path, requestedTime: time,
        start: actual, end: actual, native: request.native });
    }
    const sheet = join(dir, "contact-sheet.png");
    await run(process.env.FFMPEG_PATH || "ffmpeg", ["-v", "error", "-nostdin", "-n", "-threads", "1", "-framerate", "1", "-i", join(dir, "frame-%04d.png"),
      "-vf", `scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,tile=${Math.min(4, times.length)}x${Math.ceil(times.length / 4)}:padding=4:margin=4`, "-frames:v", "1", "-update", "1", sheet], signal);
    inspection.contactSheet = sheet;
    inspection.contactSheetOrder = inspection.artifacts.map(a => a.id);
    for (const kind of ["clip", "audio"] as const) if (request[kind]) {
      const path = join(dir, kind === "clip" ? "clip.mp4" : "audio.wav");
      const base = ["-v", "error", "-nostdin", "-n", "-threads", "2", "-copyts", "-ss", String(source.startTime + start - source.containerStartTime), "-i", source.path];
      const origin = source.startTime + start;
      const af = `asetpts=PTS-(${origin})/TB,atrim=start=0:end=${end-start},aresample=16000:async=1:first_pts=0`;
      const args = kind === "audio" ? ["-map", "0:a:0", "-vn", "-af", af, "-ac", "1", "-c:a", "pcm_s16le"] :
        ["-map", "0:v:0", "-map", "0:a:0?", "-vf", `setpts=PTS-(${origin})/TB,scale=min(1280\\,iw):-2,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
          "-af", af, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-fps_mode", "vfr", "-c:a", "aac", "-movflags", "+faststart"];
      await run(process.env.FFMPEG_PATH || "ffmpeg", [...base, ...args, "-t", String(end-start), path], signal);
      inspection.artifacts.push({ id: `${key}-${kind}`, kind, path, start, end });
    }
    session.inspections.push(inspection); session.revision++;
    return { ...inspection, cached: false };
  }
  async importTranscript(id: string, input: unknown) {
    const data = transcriptSchema.parse(input);
    return this.locked(id, async () => {
      const session = await this.read(id); await this.sourceUnchanged(session);
      if (data.sourceSha256 !== session.source.sha256) throw new Error("Transcript source fingerprint mismatch");
      let previous = -1;
      for (const s of data.segments) {
        if (s.start < previous || s.end <= s.start || s.end > session.source.duration) throw new Error("Invalid or unordered source-relative transcript interval");
        previous = s.start;
      }
      if ((!session.audio.hasTrack || session.audio.digitalSilence) && data.segments.length) throw new Error("Speech conflicts with absent/digitally silent audio");
      const transcript = { ...data, id: `transcript-${digest(data)}` };
      if (!session.transcripts.some(t => t.id === transcript.id)) {
        if (session.transcripts.length >= 8) throw new Error("At most eight transcript versions per source");
        session.transcripts.push(transcript); session.revision++;
        await save(join(this.folder(id), "session.json"), session);
      }
      return transcript;
    });
  }
  async observe(id: string, input: unknown) {
    const data = observationSchema.parse(input);
    return this.locked(id, async () => {
      const session = await this.read(id); await this.sourceUnchanged(session);
      if (data.sourceSha256 !== session.source.sha256) throw new Error("Observation source fingerprint mismatch");
      const ids = new Set(session.observations.map(o => o.id));
      const artifacts = session.inspections.flatMap(i => i.artifacts);
      for (const note of data.observations) {
        if (note.end <= note.start || note.end > session.source.duration) throw new Error("Observation range exceeds source");
        if (ids.has(note.id)) throw new Error("Duplicate observation id; revisions must use a new id");
        ids.add(note.id);
        for (const evidence of note.evidenceIds) {
          const artifact = artifacts.find(a => a.id === evidence);
          const transcript = session.transcripts.find(t => t.id === evidence);
          if (!artifact && !transcript) throw new Error("Unknown evidence id in this session");
          if (artifact && (artifact.end < note.start || artifact.start >= note.end)) throw new Error("Evidence does not overlap observation interval");
          if (transcript && !transcript.segments.some(s => s.start < note.end && s.end > note.start)) throw new Error("Transcript does not overlap observation interval");
        }
        const cited = artifacts.filter(a => note.evidenceIds.includes(a.id));
        if (note.modalities.includes("visual") && !cited.some(a => a.kind === "frame" || a.kind === "clip")) throw new Error("Visual observation needs a frame or clip");
        if (note.modalities.includes("audio") && (!sourceAudible(session) || !cited.some(a => a.kind === "clip" || a.kind === "audio"))) throw new Error("Audio observation needs an audible audio/clip artifact");
        if (note.modalities.includes("transcript") && !session.transcripts.some(t => note.evidenceIds.includes(t.id))) throw new Error("Transcript observation needs transcript provenance");
      }
      if (ids.size > 1000) throw new Error("Observation budget exceeded (1000)");
      const notes: Observation[] = data.observations.map(o => ({ ...o, author: data.author,
        recordedAt: new Date().toISOString(), status: "agent_reported", safeToAutoEdit: false }));
      session.observations.push(...notes); session.revision++;
      await save(join(this.folder(id), "session.json"), session);
      return notes;
    });
  }
  async search(id: string, query = "") {
    const session = await this.read(id);
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (s: string) => terms.every(t => s.toLowerCase().includes(t));
    return { sessionId: id, source: session.source, safeToAutoEdit: false,
      observations: session.observations.filter(o => matches(`${o.observation} ${o.inference} ${o.uncertainty}`)),
      transcript: session.transcripts.flatMap(t => t.segments.filter(s => matches(s.text)).map(s => ({ ...s, evidenceId: t.id, verification: t.verification }))) };
  }
}
const sourceAudible = (session: AgentSession) => session.audio.hasTrack && !session.audio.digitalSilence;
