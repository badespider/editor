import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { GeminiProvider, readApiKey } from "./gemini.ts";
import type { AnalysisProvider, MediaInput } from "./gemini.ts";
import { clip, fingerprint, frame, prepare } from "./media.ts";
import { PROMPT_VERSION, SCHEMA_VERSION, editReadiness, overviewSchema, requestSchema, reviewSchema, searchEvidence, validateOverview } from "./types.ts";
import type { AnalysisOptions, AnalysisRecord, AnalyzeRequest, AudioEvidence, EvidenceEvent, Job, Review, VideoEvent } from "./types.ts";

export { searchEvidence } from "./types.ts";
export type { AnalyzeRequest, AnalysisRecord, Job } from "./types.ts";
export function defaultCacheDirectory() {
  return process.env.DIFFUSION_UNDERSTANDING_DIR || join(process.env.LOCALAPPDATA || join(homedir(), ".cache"), "diffusion-studio", "video-understanding");
}
export function cacheKey(hash: string, options: AnalysisOptions, model: string) {
  return createHash("sha256").update(JSON.stringify({ hash, model, goal: options.goal, maxEvents: options.maxEvents,
    maxVerificationSeconds: options.maxVerificationSeconds,
    mode: options.mode, schema: SCHEMA_VERSION, prompt: PROMPT_VERSION, preparation: "native-h264-crf18-vfr-video-origin-1" })).digest("hex");
}
async function save(path: string, data: unknown) {
  await mkdir(resolve(path, ".."), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2), { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}
const terminal = (job: Job) => !["queued", "running"].includes(job.state);

export function validateReview(value: unknown, clipDuration: number): Review {
  const review = reviewSchema.parse(value);
  const { observedStart: start, observedEnd: end } = review;
  if ((start === null) !== (end === null) || (start !== null && end !== null && (start >= end || end > clipDuration + 0.05))) {
    throw new Error("Verification returned invalid clip-relative timestamps");
  }
  if (review.status === "supported" && start === null) throw new Error("Supported verification requires a localized observation");
  return review;
}

export function applyEvidenceChecks(review: Review, event: VideoEvent, audio: AudioEvidence, fullCoverage = true): Review {
  const checked = structuredClone(review);
  const applicable = [checked.checks.observation];
  if (event.speech.trim()) applicable.push(checked.checks.speech);
  if (event.onScreenText.trim()) applicable.push(checked.checks.screenText);
  for (const check of applicable) if (check.status === "not_applicable") {
    check.status = "insufficient_evidence"; check.reason = "The verifier did not check this nonempty claim.";
  }
  if (audio.digitalSilence || !audio.hasTrack) {
    if (event.speech.trim()) {
      checked.checks.speech = { status: "contradicted", reason: "Deterministic check: decoded audio is digital silence or has no audio track. A spoken quote cannot be supported." };
    }
    if (event.modalities.includes("sound")) checked.checks.observation = {
      status: "contradicted", reason: "Deterministic check: a sound claim conflicts with digital silence or absent audio.",
    };
  } else if (event.speech.trim() && audio.peakDb !== null && audio.peakDb < -75) {
    checked.checks.speech = { status: "insufficient_evidence", reason: "Audio level is too low for this automatic speech claim; inspect the source separately." };
  }
  const claims = [checked.checks.observation, ...(event.speech.trim() ? [checked.checks.speech] : []),
    ...(event.onScreenText.trim() ? [checked.checks.screenText] : [])];
  checked.status = claims.some(check => check.status === "contradicted") ? "contradicted" :
    claims.some(check => check.status !== "supported") || !fullCoverage ? "insufficient_evidence" : "supported";
  checked.reason = claims.map(check => check.reason).join(" ");
  if (!fullCoverage) checked.reason += " Verification budget covered only part of this candidate; the full event remains unverified.";
  return checked;
}

/** Bounded, cancellable jobs. Immutable run folders; an atomic index points to a completed result. */
export class UnderstandingService {
  readonly directory: string;
  private jobs = new Map<string, { job: Job; controller: AbortController }>();
  private tail: Promise<void> = Promise.resolve();
  private factory: () => Promise<AnalysisProvider>;

  constructor(directory = defaultCacheDirectory(), factory: () => Promise<AnalysisProvider> = async () => new GeminiProvider(await readApiKey())) {
    this.directory = resolve(directory);
    this.factory = factory;
  }

  async start(input: AnalyzeRequest): Promise<Job> {
    const options = requestSchema.parse(input);
    if (options.mode === "analyze" && !options.allowUpload) throw new Error("Analysis uploads video/audio to Google Gemini and can incur API charges. Pass --upload (allowUpload: true), or use --prepare-only for local inspection.");
    const info = await stat(resolve(options.path));
    if (!info.isFile()) throw new Error("Source must be a regular file");
    if ([...this.jobs.values()].filter(entry => !terminal(entry.job)).length >= 4) throw new Error("Queue is full (four jobs maximum)");
    const now = new Date().toISOString();
    const job: Job = { id: randomUUID(), state: "queued", stage: "queued", createdAt: now, updatedAt: now };
    const controller = new AbortController();
    this.jobs.set(job.id, { job, controller });
    try { await save(join(this.directory, "jobs", `${job.id}.json`), job); }
    catch (error) { this.jobs.delete(job.id); throw error; }
    this.tail = this.tail.then(() => this.execute(job, options, controller.signal)).catch(() => {});
    return { ...job };
  }

  async status(id: string): Promise<Job> {
    this.assertId(id);
    const live = this.jobs.get(id);
    if (live) return { ...live.job };
    const job = JSON.parse(await readFile(join(this.directory, "jobs", `${id}.json`), "utf8")) as Job;
    if (!terminal(job)) return { ...job, state: "interrupted", stage: "The owning process stopped; start a new job." };
    return job;
  }

  async cancel(id: string) {
    this.assertId(id);
    const entry = this.jobs.get(id);
    if (!entry) throw new Error("Job is not active in this process");
    if (!terminal(entry.job)) entry.controller.abort(new Error("Cancelled by user"));
    return this.status(id);
  }

  async wait(id: string, progress?: (job: Job) => void) {
    let previous = "";
    for (;;) {
      const job = await this.status(id);
      if (job.stage !== previous) { progress?.(job); previous = job.stage; }
      if (terminal(job)) return job;
      await delay(250);
    }
  }

  async evidence(id: string, query = "", supportedOnly = false) {
    const job = await this.status(id);
    if (job.state !== "completed" || !job.resultPath) throw new Error(`Job is ${job.state}; no completed evidence available`);
    const record = JSON.parse(await readFile(job.resultPath, "utf8")) as AnalysisRecord;
    if (record.schemaVersion !== SCHEMA_VERSION) throw new Error("Cached evidence schema is incompatible; rerun analysis");
    const warnings = [...record.warnings];
    if (record.mode === "analyze" && record.usage[0]?.processing_calls === 0) {
      warnings.push("Agentic processing was requested, but no navigation calls were observed in the overview. It may have relied on the supplied frames; do not assume full timeline coverage.");
    }
    return { ...record, warnings, events: searchEvidence(record, query, supportedOnly).map(event => ({
      ...event, editReadiness: editReadiness(event.verification.status),
    })) };
  }

  stop() {
    for (const entry of this.jobs.values()) if (!terminal(entry.job)) entry.controller.abort();
  }

  private assertId(id: string) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid job id");
  }

  private async execute(job: Job, options: AnalysisOptions, cancellation: AbortSignal) {
    const signal = AbortSignal.any([cancellation, AbortSignal.timeout(30 * 60 * 1000)]);
    let provider: AnalysisProvider | undefined;
    const update = async (stage: string) => {
      job.stage = stage; job.updatedAt = new Date().toISOString();
      await save(join(this.directory, "jobs", `${job.id}.json`), job);
    };
    try {
      signal.throwIfAborted(); job.state = "running";
      await update("hashing source");
      const hash = await fingerprint(resolve(options.path), signal);
      const model = options.model || process.env.GEMINI_VIDEO_MODEL || "gemini-3.5-flash-lite";
      const key = cacheKey(hash.sha256, options, model);
      job.cacheKey = key;
      const indexPath = join(this.directory, "index", `${key}.json`);
      if (!options.force) {
        let cached: { resultPath: string } | undefined;
        try { cached = JSON.parse(await readFile(indexPath, "utf8")); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
        if (cached) {
          const record = JSON.parse(await readFile(cached.resultPath, "utf8")) as AnalysisRecord;
          if (record.source.duration > options.maxDuration) throw new Error("Cached source exceeds the requested duration limit");
          await Promise.all([record.source.preparedPath, ...record.overviewFrames.map(item => item.path),
            ...record.events.flatMap(event => event.evidence.map(item => item.path))].map(path => stat(path)));
          job.cached = true; job.resultPath = cached.resultPath; job.state = "completed";
          await update("completed (cache hit)"); return;
        }
      }
      // Fail missing credentials BEFORE transcoding; offline mode never constructs a provider.
      if (options.mode === "analyze") provider = await this.factory();
      const runDirectory = join(this.directory, "runs", job.id);
      await update("preparing native-resolution video");
      const source = await prepare(options.path, runDirectory, options.maxDuration, signal);
      if (source.sha256 !== hash.sha256) throw new Error("Source changed since hashing; retry");
      const record: AnalysisRecord = { schemaVersion: SCHEMA_VERSION, promptVersion: PROMPT_VERSION, cacheKey: key,
        createdAt: new Date().toISOString(), model, goal: options.goal, source, summary: "Local preparation only; no model analysis performed.",
        events: [], overviewFrames: [], mode: options.mode, usage: [], warnings: [
          "Model review is fallible, not ground truth. Review evidence before applying edits.",
          "The overview summary and inferences are model hypotheses, not independently verified claims.",
          "Model event times are approximate; evidence frame times use decoded PTS. Map source seconds to the editor timeline before cutting.",
          "Local cache contains private video, audio, text and frames; it is not encrypted by this feature.",
          "Cancelling a local request stops further calls; a request already accepted by Gemini may still incur charges.",
        ] };
      await update("extracting timestamped overview frames");
      for (const [i, t] of [0, source.duration / 2, Math.max(0, source.duration - 0.25)].entries()) {
        record.overviewFrames.push(await frame(source.preparedPath, t, runDirectory, `overview-${i}`, signal));
      }
      if (provider) {
        await update("Gemini agentic overview");
        const remote = await provider.upload(source.preparedPath, signal);
        const overviewInput: MediaInput[] = [{ type: "video", uri: remote.uri, mime_type: "video/mp4", processing: "agentic", resolution: "high" }];
        for (const image of [record.overviewFrames[0], record.overviewFrames[2]]) overviewInput.push({ type: "image",
          data: (await readFile(image.path)).toString("base64"), mime_type: "image/png", resolution: "high" });
        const result = await provider.ask(model, overviewInput,
          `Goal: ${options.goal}\nInspect the whole video with adaptive seeking and zooming. Also compare the first and last supplied native-resolution images, at source seconds 0 and ${record.overviewFrames[2].time}; do not collapse visible changes into a generic static description. Return at most ${options.maxEvents} important temporal events, in chronological order. Prefer short localized actions/state changes to whole-video descriptions. Duration ${source.duration}s. All start/end times must be NUMERIC SECONDS relative to the first video frame, not MM.SS. Deterministically measured audio: ${JSON.stringify(source.audio)}. If digitalSilence is true, there is NO spoken audio: leave speech empty, do not invent a transcript. Otherwise transcribe speech and screen text only when clear. Leave absent or unreadable text empty and explain uncertainty. Separate observation from inference. Keep descriptions concise. Do not claim you verified anything.`, overviewSchema, signal);
        const overview = validateOverview(result, source.duration, options.maxEvents);
        record.summary = overview.summary;
        for (const [i, event] of overview.events.entries()) {
          await update(`verifying event ${i + 1}/${overview.events.length}`);
          const start = Math.max(0, event.start - 0.75), end = Math.min(source.duration, event.end + 0.75, start + options.maxVerificationSeconds);
          const fullCoverage = event.end <= end;
          const clipPath = join(runDirectory, `event-${i}.mp4`);
          await clip(source.preparedPath, start, end, clipPath, signal);
          const evidence = [];
          for (const [n, t] of [event.start, (event.start + event.end) / 2, Math.max(event.start, event.end - 0.1)].entries()) {
            evidence.push(await frame(source.preparedPath, t, runDirectory, `event-${i}-${n}`, signal));
          }
          const targeted = await provider.upload(clipPath, signal);
          const inputs: MediaInput[] = [{ type: "video", uri: targeted.uri, mime_type: "video/mp4",
            processing: { type: "static", fps: 5 }, resolution: "high" }];
          for (const image of evidence) inputs.push({ type: "image", data: (await readFile(image.path)).toString("base64"), mime_type: "image/png", resolution: "high" });
          const review = applyEvidenceChecks(validateReview(await provider.ask(model, inputs,
            `Independently check this candidate against the supplied CLIP AND FRAMES, not the previous model's confidence. Candidate: ${JSON.stringify(event)}. The clip spans original-source seconds ${start}..${end}. Images have original-source PTS ${evidence.map(image => image.time).join(", ")}. Measured source audio: ${JSON.stringify(source.audio)}. Return observedStart/observedEnd in CLIP-RELATIVE NUMERIC SECONDS, or both null if not localizable. Independently report checks.observation, checks.speech and checks.screenText, with a reason for EACH. Only use not_applicable for an empty claim. Reading the interface does NOT verify speech. Quote what you actually hear/see in the check reasons. Check before/after changes, not just the existence of the app. Supported requires evidence for ALL nonempty claims. Do not endorse inference as fact. Contradicted means clearly false; insufficient_evidence means not resolvable.`, reviewSchema, signal), end - start), event, source.audio, fullCoverage);
          const verified: EvidenceEvent = { ...event, evidence, editReadiness: editReadiness(review.status), verification: { ...review,
            observedStart: review.observedStart === null ? null : start + review.observedStart,
            observedEnd: review.observedEnd === null ? null : Math.min(end, start + review.observedEnd),
            method: "targeted_clip_and_native_frames", clipStart: start, clipEnd: end } };
          record.events.push(verified);
        }
        record.usage = provider.usage;
        job.usage = provider.usage;
        await update("removing remote uploads and interactions");
        record.warnings.push(...await provider.close()); provider = undefined;
      }
      signal.throwIfAborted();
      job.resultPath = join(runDirectory, "analysis.json");
      await save(job.resultPath, record);
      await save(indexPath, { resultPath: job.resultPath });
      job.state = "completed"; await update("completed");
    } catch (error) {
      if (provider) job.usage = provider.usage;
      const cleanup = provider ? await provider.close().catch(() => ["Remote cleanup failed; check your Gemini account."]) : [];
      provider = undefined;
      job.state = cancellation.aborted ? "cancelled" : "failed";
      job.error = [(error as Error).message || String(error), ...cleanup].join(" ");
      await update(job.state);
    } finally {
      if (provider) await provider.close().catch(() => {});
    }
  }
}
