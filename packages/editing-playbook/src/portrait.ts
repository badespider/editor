import { candidateHash, clipToPlan, jsonHash } from './clips.ts';
import type { ClipContext } from './clips.ts';
import type { Plan } from './schema.ts';
import { planSchema } from './schema.ts';
import { portraitDocumentSchema, portraitReviewSchema, portraitMobileReviewSchema, portraitSampleFrames, validatePortraitGeometry } from './portrait-schema.ts';
import type { PortraitDocument } from './portrait-schema.ts';
import { mobileOutputSchema, validateMobileOutput } from './mobile.ts';

export const portraitHash = (input: PortraitDocument) => jsonHash({ ...portraitDocumentSchema.parse(input), review: null });
export const portraitPlanHash = (plan: Plan) => jsonHash(planSchema.parse({ ...plan, review: { previewInspected: false, reviewer: '', checks: [] } }));

export function draftPortrait(collection: unknown, context: ClipContext, candidateId: string, geometry: {width:number;height:number}) {
  const plan = clipToPlan(collection, context, candidateId), segment = plan.segments[0];
  const frames = Math.ceil((segment.out-segment.in)*30-1e-7);
  return portraitDocumentSchema.parse({ schemaVersion:1, kind:'agent-portrait-clip', collection, candidateId,
    planSha256:portraitPlanHash(plan), recipe:{sourceWidth:geometry.width,sourceHeight:geometry.height,frames,
      shots:[{startFrame:0,endFrame:frames,mode:'cover',keyframes:[{frame:0,x:.5,y:.5}],reason:'',evidenceIds:[]}]},review:null });
}

/** Explicit opt-in upgrade; changed presentation never inherits a framing approval. */
export function draftMobilePortrait(input: unknown, mobile: unknown) {
  const previous = portraitDocumentSchema.parse(input);
  const doc = portraitDocumentSchema.parse({ ...previous, schemaVersion: 2, mobile: mobileOutputSchema.parse(mobile), review: null });
  const errors = presentationErrors(doc);
  if (errors.length) throw new Error(errors.join('; '));
  return doc;
}

function presentationErrors(doc: PortraitDocument) {
  return [...validatePortraitGeometry(doc.recipe), ...(doc.schemaVersion === 2 ? validateMobileOutput(doc.mobile, doc.recipe) : [])];
}
function framingReviewErrors(doc: PortraitDocument) {
  if (!doc.review) return ['Exact portrait framing review is required'];
  const expected = doc.schemaVersion === 2 ? 5 : 3;
  const errors: string[] = [];
  if (doc.review.recipeSha256 !== portraitHash(doc)) errors.push('Portrait review is stale');
  if (new Set(doc.review.checks.map(c=>c.dimension)).size !== expected) errors.push('Each framing review dimension must appear once');
  if (doc.review.decision !== 'accept' || doc.review.checks.some(c => c.outcome !== 'pass' &&
      !(c.outcome === 'not_applicable' && c.dimension === 'captions' && doc.schemaVersion === 2 && !doc.mobile.captions))) {
    errors.push('Framing review rejected, failed, or has inappropriate not-applicable checks');
  }
  return errors;
}

/** Validate the render contract even for direct Node callers; context is checked separately. */
export function assertPortraitForPlan(input: unknown, plan: Plan) {
  const doc = portraitDocumentSchema.parse(input), errors = presentationErrors(doc);
  if (doc.planSha256 !== portraitPlanHash(plan)) errors.push('Portrait selection/plan changed; start a new portrait draft');
  const segment = plan.segments[0], candidate = doc.collection.candidates.find(c=>c.id===doc.candidateId);
  if (plan.segments.length !== 1 || !candidate || candidate.range.start !== segment.in || candidate.range.end !== segment.out ||
      doc.collection.source.sha256 !== plan.sources.find(s=>s.id===segment.sourceId)?.sha256 ||
      doc.collection.source.path !== plan.sources.find(s=>s.id===segment.sourceId)?.path ||
      doc.recipe.frames !== Math.ceil((segment.out-segment.in)*30-1e-7)) errors.push('Portrait must bind exactly one selected original moment');
  const sourceReview = candidate?.review;
  if (!candidate || !sourceReview || sourceReview.candidateId !== candidate.id || sourceReview.decision !== 'accept' || sourceReview.candidateSha256 !== candidateHash(doc.collection,candidate) ||
      new Set(sourceReview.checks.map(c=>c.dimension)).size !== 5 || sourceReview.checks.some(c=>c.outcome==='fail' ||
        c.outcome==='not_applicable' && (c.dimension!=='speech' || !['silent','no_track'].includes(plan.sources[0].audio)))) errors.push('Exact accepted source review is required before portrait preparation');
  errors.push(...framingReviewErrors(doc));
  if (doc.recipe.shots.some(s=>!s.reason || !s.evidenceIds.length)) errors.push('Every shot needs a reason and inspected source evidence');
  if (errors.length) throw new Error(errors.join('; '));
  return doc;
}

export function checkPortrait(input: unknown, context: ClipContext, geometry: {width:number;height:number}) {
  const doc = portraitDocumentSchema.parse(input), errors = presentationErrors(doc), needs: string[] = [];
  let plan: Plan | undefined;
  try { plan = clipToPlan(doc.collection,context,doc.candidateId); }
  catch(error) { errors.push((error as Error).message); }
  if (plan && doc.planSha256 !== portraitPlanHash(plan)) errors.push('Selection/plan changed; initialize again from the reviewed candidate');
  if (geometry.width !== doc.recipe.sourceWidth || geometry.height !== doc.recipe.sourceHeight) errors.push('Source geometry changed');
  const candidate = doc.collection.candidates.find(c=>c.id===doc.candidateId);
  if (!candidate) throw new Error('Unknown portrait candidate');
  if (doc.recipe.frames !== Math.ceil((candidate.range.end-candidate.range.start)*30-1e-7)) errors.push('Portrait frame count differs from the selection');
  const artifacts = context.inspections.flatMap(i=>i.artifacts);
  const sampleFrames = portraitSampleFrames(doc.recipe);
  for (const [i, shot] of doc.recipe.shots.entries()) {
    if (!shot.reason || !shot.evidenceIds.length) needs.push(`Shot ${i}: inspect and explain the framing`);
    const cited = artifacts.filter(a=>shot.evidenceIds.includes(a.id));
    if (shot.evidenceIds.some(id=>!artifacts.some(a=>a.id===id))) errors.push(`Shot ${i}: unknown evidence artifact`);
    for (const f of sampleFrames.filter(f=>f>=shot.startFrame && f<shot.endFrame)) {
      const t = candidate.range.start + f/30;
      if (!cited.some(a=>a.kind==='clip' ? a.start<=t+1e-6 && a.end>t : a.kind==='frame' && Math.abs(a.start-t)<=1/30+.001)) needs.push(`Shot ${i}: inspect source at ${t.toFixed(6)}s`);
    }
  }
  const recipeSha256 = portraitHash(doc);
  if (!doc.review) needs.push('Record the exact framing review after inspection');
  else errors.push(...framingReviewErrors(doc));
  return {kind:'portrait-check',recipeSha256,errors,needs,sampleFrames,
    sourceTimes:sampleFrames.map(f=>candidate.range.start+f/30),
    status:errors.length?'invalid':needs.length?'needs_review':'framing_review_recorded',
    canPrepare:!errors.length&&!needs.length,externalModelCalls:0,safeToAutoPublish:false,
    limitations:['Evidence availability and attributed review are not proof of viewing or automatic tracking.','The actual portrait render still needs a separate review.']};
}

export function recordPortraitReview(input: unknown, context: ClipContext, geometry: {width:number;height:number}, reviewInput: unknown) {
  const doc = portraitDocumentSchema.parse(input);
  const review = (doc.schemaVersion === 2 ? portraitMobileReviewSchema : portraitReviewSchema).parse(reviewInput);
  if (review.recipeSha256 !== portraitHash(doc)) throw new Error('Review does not bind this exact portrait recipe');
  const updated = portraitDocumentSchema.parse({ ...doc, review });
  const check = checkPortrait(updated,context,geometry);
  if (review.decision==='accept' && !check.canPrepare) throw new Error([...check.errors,...check.needs].join('; '));
  return updated;
}
