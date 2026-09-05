import { z } from "zod";

export const SCHEMA_VERSION = 2;
export const PROMPT_VERSION = "evidence-first-2-per-claim-audio";
export const requestSchema = z.object({
  path: z.string().min(1),
  goal: z.string().min(1).max(4000).default("Describe the actions, speech, and visible state changes needed to edit this video accurately."),
  model: z.string().regex(/^gemini-[a-z0-9.-]+$/).optional(),
  mode: z.enum(["analyze", "prepare"]).default("analyze"),
  allowUpload: z.boolean().default(false),
  maxEvents: z.number().int().min(1).max(24).default(8),
  maxVerificationSeconds: z.number().min(1).max(60).default(20),
  maxDuration: z.number().positive().max(7200).default(1200),
  force: z.boolean().default(false),
});
export type AnalyzeRequest = z.input<typeof requestSchema>;
export type AnalysisOptions = z.output<typeof requestSchema>;

const time = z.number().finite().nonnegative();
export const eventSchema = z.object({
  id: z.string().min(1).max(80), start: time, end: time,
  observation: z.string().min(1).max(4000),
  speech: z.string().max(4000), onScreenText: z.string().max(4000),
  inference: z.string().max(4000), uncertainty: z.string().max(2000),
  modalities: z.array(z.enum(["visual", "speech", "sound", "text"])).min(1),
});
export const overviewSchema = z.object({
  summary: z.string().min(1).max(8000),
  events: z.array(eventSchema).max(24),
});
export type VideoEvent = z.infer<typeof eventSchema>;
const claimCheck = z.object({
  status: z.enum(["supported", "contradicted", "insufficient_evidence", "not_applicable"]),
  reason: z.string().min(1).max(2000),
});
export const reviewSchema = z.object({
  status: z.enum(["supported", "contradicted", "insufficient_evidence"]),
  reason: z.string().min(1).max(4000),
  observedStart: time.nullable(), observedEnd: time.nullable(),
  checks: z.object({ observation: claimCheck, speech: claimCheck, screenText: claimCheck }),
});
export type Review = z.infer<typeof reviewSchema>;
export type FrameEvidence = { id: string; path: string; requestedTime: number; time: number };
export type AudioEvidence = { hasTrack: boolean; digitalSilence: boolean; peakDb: number | null; samples: number };
export type EvidenceEvent = VideoEvent & {
  evidence: FrameEvidence[];
  verification: Review & { method: "targeted_clip_and_native_frames"; clipStart: number; clipEnd: number };
  editReadiness: { safeToAutoEdit: false; reason: string };
};
export type Source = {
  path: string; sha256: string; bytes: number; duration: number;
  width: number; height: number; hasAudio: boolean; startTime: number;
  audio: AudioEvidence;
  preparedPath: string; preparedDuration: number;
  timeBasis: "seconds from first video presentation timestamp";
};
export type AnalysisRecord = {
  schemaVersion: number; promptVersion: string; cacheKey: string; createdAt: string;
  model: string; goal: string; source: Source; summary: string;
  events: EvidenceEvent[]; overviewFrames: FrameEvidence[];
  mode: "analyze" | "prepare"; warnings: string[];
  usage: Array<Record<string, unknown>>;
};
export type Job = {
  id: string; state: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  stage: string; createdAt: string; updatedAt: string;
  cacheKey?: string; resultPath?: string; error?: string; cached?: boolean;
  usage?: Array<Record<string, unknown>>;
};

export function validateOverview(value: unknown, duration: number, maxEvents: number) {
  const result = overviewSchema.parse(value);
  if (result.events.length > maxEvents) throw new Error("Model exceeded the requested event budget");
  const ids = new Set<string>();
  for (const event of result.events) {
    if (ids.has(event.id)) throw new Error("Duplicate event id");
    ids.add(event.id);
    if (event.start >= event.end || event.end > duration + 0.05) {
      throw new Error(`Event ${event.id} has invalid source timestamps`);
    }
    event.end = Math.min(event.end, duration);
  }
  return result;
}

/** Search is a transparent lexical baseline, not a claim of semantic retrieval. */
export function searchEvidence(record: AnalysisRecord, query = "", supportedOnly = false) {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return record.events.filter(event => {
    if (supportedOnly && event.verification.status !== "supported") return false;
    const text = [event.observation, event.speech, event.onScreenText, event.inference].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
}

export function editReadiness(status: Review["status"]): EvidenceEvent["editReadiness"] {
  return { safeToAutoEdit: false, reason: status === "supported"
    ? "Supported is a fallible semantic model review, not validated cut timing. Inspect the source and verify boundaries before editing."
    : "This candidate is contradicted or lacks sufficient evidence. Resolve it before using it in an edit." };
}
