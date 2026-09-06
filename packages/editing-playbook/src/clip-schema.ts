import { z } from 'zod';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(4000);
const time = z.number().finite().nonnegative();
const range = z.object({ start: time, end: time }).strict().refine(r => r.end > r.start, 'end must exceed start');
const beat = z.object({ statement: z.string().trim().max(4000).default(''), observationIds: z.array(id).max(32).default([]) }).strict();
export const clipBriefSchema = z.object({
  goal: text, audience: text.default('Viewers who have not watched the long video'),
  count: z.number().int().min(1).max(12).default(3),
  minDuration: z.number().finite().positive().max(120).default(30),
  maxDuration: z.number().finite().positive().max(120).default(90),
  contextSeconds: z.number().finite().min(1).max(30).default(8),
}).strict().refine(b => b.maxDuration >= b.minDuration, 'maxDuration must be >= minDuration');
export const clipReviewSchema = z.object({
  candidateId: id, candidateSha256: hash, reviewer: text,
  decision: z.enum(['accept', 'reject']),
  evidenceIds: z.array(z.string().min(1).max(200)).max(100),
  checks: z.array(z.object({ dimension: z.enum(['story', 'speech', 'boundaries', 'framing', 'context']),
    outcome: z.enum(['pass', 'fail', 'not_applicable']), note: text }).strict()).length(5),
}).strict();
export const clipCandidateSchema = z.object({
  id, title: z.string().trim().max(200), mode: z.literal('original_moment'),
  range, seed: z.object({ type: z.enum(['observation', 'transcript']), id: z.string().min(1).max(200) }).strict(),
  narrative: z.object({ promise: beat, setup: beat, action: beat, payoff: beat,
    whyStandalone: z.string().trim().max(4000).default('') }).strict(),
  protectedRanges: z.array(z.object({ start: time, end: time, reason: text }).strict().refine(r=>r.end>r.start, 'end must exceed start')).max(100),
  review: clipReviewSchema.nullable().default(null),
}).strict();
export const clipCollectionSchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('agent-clip-candidates'),
  source: z.object({ sessionId: hash, sha256: hash, path: text, transcriptId: z.string().min(1).max(200).nullable() }).strict(),
  brief: clipBriefSchema,
  // Optional existing delivery receipt; paths alone are never sufficient provenance.
  delivery: z.object({ bundleDirectory: text, receiptPath: text, receiptSha256: hash }).strict().nullable().default(null),
  candidates: z.array(clipCandidateSchema).max(12),
}).strict();
export type ClipBrief = z.infer<typeof clipBriefSchema>;
export type ClipCandidate = z.infer<typeof clipCandidateSchema>;
export type ClipCollection = z.infer<typeof clipCollectionSchema>;
export type ClipReview = z.infer<typeof clipReviewSchema>;
