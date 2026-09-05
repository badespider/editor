import { z } from "zod";
import { formats, skillIds } from "./catalog.ts";

const text = z.string().trim().min(1).max(4000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const seconds = z.number().finite().nonnegative();
const interval = z.object({ start: seconds, end: seconds }).strict()
  .refine(range => range.end > range.start, "end must be greater than start");
const outcome = z.enum(["pass", "fail", "not_applicable"]);

export const planSchema = z.object({
  schemaVersion: z.literal(1),
  brief: z.object({
    goal: text, audience: text, format: z.enum(formats),
    minDuration: seconds, maxDuration: z.number().finite().positive(),
    allowReorder: z.boolean().default(false),
  }).strict().refine(brief => brief.maxDuration >= brief.minDuration, "maxDuration must be >= minDuration"),
  skills: z.array(z.enum(skillIds)).max(skillIds.length),
  sources: z.array(z.object({
    id, path: text, duration: z.number().finite().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    audio: z.enum(["unknown", "speech", "silent", "no_track", "other"]),
  }).strict()).min(1).max(32),
  evidence: z.array(z.object({
    id, sourceId: id, ...interval.shape, observation: text,
    kind: z.enum(["visual", "speech", "screen_text", "audio_measurement"]),
    verification: z.enum(["observed", "model_supported", "uncertain"]),
    artifact: text.optional(),
  }).strict().refine(range => range.end > range.start, "end must be greater than start")).max(1000),
  beats: z.array(z.object({
    id, role: z.enum(["hook", "setup", "action", "explanation", "proof", "payoff", "ending"]),
    purpose: text, evidenceIds: z.array(id).min(1),
  }).strict()).min(1).max(100),
  segments: z.array(z.object({
    id, beatId: id, sourceId: id, in: seconds, out: seconds,
    reason: text, evidenceIds: z.array(id).min(1),
  }).strict().refine(segment => segment.out > segment.in, "out must be greater than in")).min(1).max(100),
  // Each required range must survive intact in one segment, without a cut inside it.
  protectedRanges: z.array(z.object({ sourceId: id, ...interval.shape, reason: text }).strict()
    .refine(range => range.end > range.start, "end must be greater than start")).max(1000),
  // Known speech units cannot be bisected, even when removing whole sentences is intentional.
  speechRanges: z.array(z.object({ sourceId: id, ...interval.shape, text }).strict()
    .refine(range => range.end > range.start, "end must be greater than start")).max(5000),
  preferences: z.array(z.object({ statement: text, scope: z.enum([...formats, "all"]),
    userApproved: z.literal(true), sourceNote: text }).strict()).max(100),
  review: z.object({
    previewInspected: z.boolean(), reviewer: z.string().max(200),
    checks: z.array(z.object({
      dimension: z.enum(["story", "speech", "readability", "continuity"]), outcome, note: text,
    }).strict()).max(4),
  }).strict(),
}).strict();
export type Plan = z.infer<typeof planSchema>;

export const youtubeUrlSchema = z.string().url().refine(value => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (url.hostname === "youtu.be") return /^\/[A-Za-z0-9_-]{11}$/.test(url.pathname);
  if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) return false;
  return (url.pathname === "/watch" && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get("v") || "")) ||
    /^\/(shorts|embed)\/[A-Za-z0-9_-]{11}$/.test(url.pathname);
}, "Use an HTTPS link to one YouTube video, not a channel, playlist or lookalike host");

export const referenceSchema = z.object({
  schemaVersion: z.literal(1), status: z.literal("candidate"), url: youtubeUrlSchema,
  title: text, technique: text,
  moments: z.array(z.object({ ...interval.shape, observation: text,
    inspected: z.enum(["transcript_only", "frames_only", "video_and_audio"]) }).strict()
    .refine(range => range.end > range.start, "end must be greater than start")).min(1).max(30),
  takeaway: text, useWhen: z.array(text).min(1), avoidWhen: z.array(text).min(1),
  localTests: z.array(z.object({ planPath: text, result: z.enum(["better", "worse", "mixed"]),
    reviewer: text, note: text }).strict()).max(30),
}).strict();
