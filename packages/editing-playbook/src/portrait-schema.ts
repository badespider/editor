import { z } from 'zod';
import { clipCollectionSchema } from './clip-schema.ts';
import { mobileOutputSchema } from './mobile.ts';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(4000);
const frame = z.number().int().min(0).max(3600);
export const portraitReviewSchema = z.object({
  recipeSha256: hash, reviewer: text, decision: z.enum(['accept', 'reject']),
  checks: z.array(z.object({ dimension: z.enum(['subject', 'context', 'motion']),
    outcome: z.enum(['pass', 'fail']), note: text }).strict()).length(3),
}).strict();
export const portraitRecipeSchema = z.object({
  sourceWidth: z.number().int().min(1).max(16384), sourceHeight: z.number().int().min(1).max(16384),
  width: z.union([z.literal(360), z.literal(720), z.literal(1080)]).default(1080),
  height: z.union([z.literal(640), z.literal(1280), z.literal(1920)]).default(1920),
  fps: z.literal(30).default(30), frames: frame.refine(n => n > 0),
  shots: z.array(z.object({
    startFrame: frame, endFrame: frame, mode: z.enum(['cover', 'contain']),
    // Clip-relative integer frames; coordinates normalized to the whole source image.
    keyframes: z.array(z.object({ frame, x: z.number().finite().min(0).max(1),
      y: z.number().finite().min(0).max(1) }).strict()).max(64),
    reason: z.string().trim().max(4000), evidenceIds: z.array(text).max(100),
  }).strict()).min(1).max(16),
}).strict().refine(v => v.width * 16 === v.height * 9, 'Portrait dimensions must be 9:16')
  .refine(v => v.shots.reduce((n, s) => n + s.keyframes.length, 0) <= 64, 'At most 64 keyframes per clip');
export const portraitMobileReviewSchema = z.object({
  recipeSha256: hash, reviewer: text, decision: z.enum(['accept', 'reject']),
  checks: z.array(z.object({ dimension: z.enum(['subject', 'context', 'motion', 'captions', 'placement']),
    outcome: z.enum(['pass', 'fail', 'not_applicable']), note: text }).strict()).length(5),
}).strict();
export const portraitFramingReviewSchema = z.union([portraitReviewSchema, portraitMobileReviewSchema]);
export const portraitDocumentV1Schema = z.object({
  schemaVersion: z.literal(1), kind: z.literal('agent-portrait-clip'),
  collection: clipCollectionSchema, candidateId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  planSha256: hash, recipe: portraitRecipeSchema,
  review: portraitReviewSchema.nullable().default(null),
}).strict();
export const portraitDocumentV2Schema = portraitDocumentV1Schema.extend({
  schemaVersion: z.literal(2), mobile: mobileOutputSchema,
  review: portraitMobileReviewSchema.nullable().default(null),
}).strict();
export const portraitDocumentSchema = z.discriminatedUnion('schemaVersion', [portraitDocumentV1Schema, portraitDocumentV2Schema]);
const renderReviewBase = {
  packetSha256: hash, reviewer: text, decision: z.enum(['accept', 'reject']),
  evidenceIds: z.array(text).max(3072), coverage: text,
};
export const portraitRenderReviewV1Schema = z.object({ ...renderReviewBase,
  checks: z.array(z.object({ dimension: z.enum(['story', 'speech', 'framing', 'continuity']),
    outcome: z.enum(['pass', 'fail', 'not_applicable']), note: text }).strict()).length(4),
}).strict();
export const portraitRenderReviewV2Schema = z.object({ ...renderReviewBase,
  checks: z.array(z.object({ dimension: z.enum(['story', 'speech', 'framing', 'continuity', 'readability', 'captions', 'placement']),
    outcome: z.enum(['pass', 'fail', 'not_applicable']), note: text }).strict()).length(7),
}).strict();
export const portraitRenderReviewSchema = z.union([portraitRenderReviewV1Schema, portraitRenderReviewV2Schema]);
export const mobileInspectionPayloadSchema = z.object({
  schemaVersion: z.literal(1), width: z.literal(360), height: z.literal(640),
  profileSha256: hash, videoSha256: hash,
  preview: z.object({ id: z.literal('phone-motion'), path: text, sha256: hash }).strict(),
  frames: z.array(z.object({ id: z.string().regex(/^phone-frame-\d+$/), frame, path: text, sha256: hash }).strict()).min(1).max(1200),
}).strict();
export const mobileInspectionSchema = mobileInspectionPayloadSchema.extend({ recordSha256: hash }).strict();
export type MobileInspection = z.infer<typeof mobileInspectionSchema>;
export type PortraitRecipe = z.infer<typeof portraitRecipeSchema>;
export type PortraitDocument = z.infer<typeof portraitDocumentSchema>;

export function coverGeometry(recipe: PortraitRecipe) {
  const scale = Math.max(recipe.width / recipe.sourceWidth, recipe.height / recipe.sourceHeight);
  const width = Math.ceil(recipe.sourceWidth * scale / 2) * 2;
  const height = Math.ceil(recipe.sourceHeight * scale / 2) * 2;
  return { width, height, minX: recipe.width / (2 * width), minY: recipe.height / (2 * height) };
}

export function validatePortraitGeometry(recipe: PortraitRecipe) {
  const errors: string[] = [], geometry = coverGeometry(recipe);
  if (recipe.shots.some(s=>s.mode==='cover') && (geometry.width > 16384 || geometry.height > 16384 || geometry.width * geometry.height > 34_000_000)) errors.push('Cover scaling exceeds the local pixel budget; use contain framing');
  let end = 0;
  for (const [i, s] of recipe.shots.entries()) {
    if (s.startFrame !== end || s.endFrame <= s.startFrame || s.endFrame > recipe.frames) errors.push(`Shot ${i}: gaps, overlaps or out-of-range frames`);
    end = s.endFrame;
    if (s.mode === 'contain' && s.keyframes.length) errors.push(`Shot ${i}: contain mode must have no crop keyframes`);
    if (s.mode === 'cover' && s.keyframes[0]?.frame !== s.startFrame) errors.push(`Shot ${i}: cover needs a keyframe at its first frame`);
    let previous = -1;
    for (const k of s.keyframes) {
      if (k.frame < s.startFrame || k.frame >= s.endFrame || k.frame <= previous) errors.push(`Shot ${i}: keyframes must be unique, ascending and inside the shot`);
      if (k.x < geometry.minX - 1e-9 || k.x > 1 - geometry.minX + 1e-9 ||
          k.y < geometry.minY - 1e-9 || k.y > 1 - geometry.minY + 1e-9) errors.push(`Shot ${i}: crop center leaves the image; x must be ${geometry.minX}..${1-geometry.minX}, y ${geometry.minY}..${1-geometry.minY}`);
      previous = k.frame;
    }
  }
  if (end !== recipe.frames) errors.push('Shots must cover every output frame');
  return errors;
}

/** Boundaries, pan control points, midpoints and periodic holds; sampling, not tracking. */
export function portraitSampleFrames(recipe: PortraitRecipe) {
  const frames = new Set<number>();
  for (const s of recipe.shots) {
    const anchors = [...new Set([s.startFrame, ...s.keyframes.map(k => k.frame), s.endFrame - 1])].sort((a,b) => a-b);
    for (const [i, f] of anchors.entries()) {
      frames.add(f);
      if (i) frames.add(Math.floor((anchors[i-1] + f) / 2));
    }
    for (let f = s.startFrame; f < s.endFrame; f += 150) frames.add(f);
  }
  return [...frames].sort((a,b) => a-b);
}

/** Output-only caption samples do not inflate the source-framing evidence requirement. */
export function portraitOutputSampleFrames(doc: PortraitDocument) {
  const frames = new Set(portraitSampleFrames(doc.recipe));
  if (doc.schemaVersion === 2) for (const cue of doc.mobile.captions?.cues ?? []) {
    for (const f of [cue.startFrame - 1, cue.startFrame, Math.floor((cue.startFrame + cue.endFrame - 1) / 2), cue.endFrame - 1, cue.endFrame]) {
      if (f >= 0 && f < doc.recipe.frames) frames.add(f);
    }
  }
  const result = [...frames].sort((a,b) => a-b);
  if (result.length > 1200) throw new Error('Mobile inspection exceeds the 1200-frame evidence budget');
  return result;
}

function axisExpression(shot: PortraitRecipe['shots'][number], axis: 'x' | 'y') {
  let expression = String(shot.keyframes.at(-1)![axis]);
  for (let i = shot.keyframes.length - 2; i >= 0; i--) {
    const a = shot.keyframes[i], b = shot.keyframes[i+1];
    const value = `${a[axis]}+(${b[axis]}-${a[axis]})*(n-${a.frame-shot.startFrame})/${b.frame-a.frame}`;
    expression = `if(lt(n,${b.frame-shot.startFrame}),${value},${expression})`;
  }
  return expression;
}

/** Pure numeric filter generation. No source strings or agent prose become expressions. */
export function portraitVideoFilter(recipe: PortraitRecipe, input = 'portrait-input', output = 'v') {
  if (![input, output].every(label => /^[a-zA-Z0-9_-]+$/.test(label))) throw new Error('Invalid portrait filter label');
  const errors = validatePortraitGeometry(recipe); if (errors.length) throw new Error(errors.join('; '));
  const geometry = coverGeometry(recipe), filters: string[] = [];
  const count = recipe.shots.length;
  filters.push(`[${input}]split=${count}${recipe.shots.map((_,i)=>`[ps${i}]`).join('')}`);
  recipe.shots.forEach((s,i) => {
    const fit = s.mode === 'contain' ? `scale=${recipe.width}:${recipe.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${recipe.width}:${recipe.height}:(ow-iw)/2:(oh-ih)/2:color=0x121A1A` :
      `scale=${geometry.width}:${geometry.height},crop=${recipe.width}:${recipe.height}:x='max(0,min(iw-ow,iw*(${axisExpression(s,'x')})-ow/2))':y='max(0,min(ih-oh,ih*(${axisExpression(s,'y')})-oh/2))'`;
    filters.push(`[ps${i}]trim=start_frame=${s.startFrame}:end_frame=${s.endFrame},setpts=PTS-STARTPTS,${fit},setsar=1[pv${i}]`);
  });
  filters.push(`${recipe.shots.map((_,i)=>`[pv${i}]`).join('')}concat=n=${count}:v=1:a=0,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=${recipe.frames+4},format=yuv420p[${output}]`);
  return filters.join(';');
}
