import { z } from 'zod';

export const motionHash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(2000);
const seconds = z.number().finite().nonnegative();
const unit = z.number().finite().min(0).max(1);
export const motionBoxSchema = z.object({ x: unit, y: unit, width: unit.positive(), height: unit.positive() }).strict()
  .refine(b => b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001, 'Box must fit the output picture');
const transform = z.object({ dx: z.number().finite().min(-1).max(1), dy: z.number().finite().min(-1).max(1),
  scale: z.number().finite().min(.5).max(1.5), rotation: z.number().finite().min(-30).max(30), opacity: unit }).strict();
export const motionSettingsSchema = z.object({
  entrySeconds: z.number().finite().min(.03).max(3), exitSeconds: z.number().finite().min(.03).max(3),
  staggerSeconds: z.number().finite().min(0).max(.5), minHoldSeconds: z.number().finite().min(.08).max(2),
  entry: transform, exit: transform,
  easing: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut']),
  blurPx: z.number().finite().min(0).max(24),
  fontFamily: z.string().regex(/^[\p{L}\p{N} _-]{1,80}$/u), fontWeight: z.number().int().min(100).max(900),
  fontSize: z.number().finite().min(.025).max(.15), // fraction of the shorter output side
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/), maxLines: z.number().int().min(1).max(4),
  maxCharsPerSecond: z.number().finite().min(6).max(60), layout: motionBoxSchema,
}).strict();
export type MotionSettings = z.infer<typeof motionSettingsSchema>;

export const motionIntentSchema = z.object({ elementId: text, entryPhase: text, exitPhase: text,
  rationale: text, settings: motionSettingsSchema.omit({ entrySeconds: true, exitSeconds: true, entry: true, exit: true }).partial().default({}),
}).strict();
export const motionRecipeSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('caption-motion-recipe'),
  reference: z.object({ sequenceSha256: motionHash, breakdownSha256: motionHash, elementId: text,
    author: text, inspectedFrames: z.array(z.number().int().nonnegative()).min(1),
    entryFrames: z.tuple([z.number().int(), z.number().int()]), exitFrames: z.tuple([z.number().int(), z.number().int()]),
  }).strict(), settings: motionSettingsSchema, rationale: text, uncertainties: z.array(text).min(1),
  status: z.literal('candidate'),
}).strict();
export type MotionRecipe = z.infer<typeof motionRecipeSchema>;

export const motionInputSchema = z.object({
  source: z.object({ path: text, sha256: motionHash }).strict(),
  range: z.object({ start: seconds, end: seconds }).strict().refine(r => r.end > r.start && r.end - r.start <= 30, 'Preview range must be 0–30 seconds'),
  width: z.number().int().min(240).max(1920).refine(n => n % 2 === 0),
  height: z.number().int().min(240).max(1920).refine(n => n % 2 === 0), fps: z.literal(30).default(30),
  captions: z.object({ sourceSha256: motionHash, provenance: text,
    verification: z.enum(['unverified', 'user_verified']),
    cues: z.array(z.object({ id: z.string().regex(/^[\w-]{1,60}$/), start: seconds, end: seconds,
      text: z.string().trim().min(1).max(300).refine(t => !/[\x00-\x08\x0b-\x1f]/.test(t), 'Unsupported caption control character'),
    }).strict()).min(1).max(24),
  }).strict(),
  protectedRegions: z.array(z.object({ start: seconds, end: seconds, box: motionBoxSchema, reason: text }).strict()).max(100).default([]),
  subjectCoverage: z.enum(['agent_inspected', 'unknown']).default('unknown'),
}).strict();
export type MotionInput = z.infer<typeof motionInputSchema>;
export const motionCorrectionSchema = z.object({ adaptationSha256: motionHash, reviewSha256: motionHash,
  reason: text, settings: motionSettingsSchema.partial().default({}),
  captionOffsetSeconds: z.number().finite().min(-.5).max(.5).default(0),
}).strict();
export const motionReviewSchema = z.object({ adaptationSha256: motionHash, renderSha256: motionHash, inspectionSha256: motionHash,
  reviewer: text, inspectedArtifactIds: z.array(text).min(1).max(200),
  checks: z.array(z.object({ kind: z.enum(['motion', 'timing', 'readability', 'placement', 'audio']),
    status: z.enum(['pass', 'fail', 'unknown', 'not_applicable']), note: text,
    evidenceIds: z.array(text).max(200),
  }).strict()).length(5),
}).strict();

export type MotionCard = { id: string; start: number; end: number; lines: string[]; fontSize: number;
  box: z.infer<typeof motionBoxSchema>; entrySeconds: number; exitSeconds: number; staggerSeconds: number };
export type MotionAdaptation = { schemaVersion: 1; kind: 'caption-motion-adaptation'; recipe: MotionRecipe;
  input: MotionInput; duration: number; cards: MotionCard[]; warnings: string[]; renderer: 'native' | 'canvas';
  previewSamples: number[]; status: 'draft'; safeToAutoPublish: false };
