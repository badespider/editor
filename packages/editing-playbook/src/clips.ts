import { createHash } from 'node:crypto';
import { clipBriefSchema, clipCollectionSchema, clipReviewSchema } from './clip-schema.ts';
import type { ClipBrief, ClipCandidate, ClipCollection } from './clip-schema.ts';
import type { DeliveryBundle } from './delivery-schema.ts';
import type { Plan } from './schema.ts';
import { validatePlan } from './validate.ts';

// Structural subset of the evidence service's session; no model/service import.
export type ClipContext = {
  id: string; source: { path: string; sha256: string; duration: number };
  audio: { hasTrack: boolean; digitalSilence: boolean };
  observations: { id: string; start: number; end: number; observation: string; uncertainty: string;
    modalities: ('visual' | 'audio' | 'transcript')[]; evidenceIds: string[] }[];
  transcripts: { id: string; segments: { start: number; end: number; text: string }[] }[];
  inspections: { artifacts: { id: string; kind: 'frame' | 'clip' | 'audio'; start: number; end: number; path: string }[] }[];
};
const EPS = 1e-6;
const inside = (outer: {start: number; end: number}, inner: {start: number; end: number}) => inner.start >= outer.start - EPS && inner.end <= outer.end + EPS;
const overlaps = (a: {start: number; end: number}, b: {start: number; end: number}) => a.start < b.end && b.start < a.end;
export const jsonHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function transcriptFor(context: ClipContext, id: string | null) {
  const transcript = context.transcripts.find(t => t.id === id);
  if (id !== null && !transcript) throw new Error('Selected transcript is not in this source session');
  return transcript;
}
export function candidateHash(collection: ClipCollection, candidate: ClipCandidate) {
  const { review: _, ...selection } = candidate;
  return jsonHash({ source: collection.source, brief: collection.brief, delivery: collection.delivery, selection });
}
export function contextRange(candidate: ClipCandidate, brief: ClipBrief, duration: number) {
  return { start: Math.max(0, candidate.range.start - brief.contextSeconds), end: Math.min(duration, candidate.range.end + brief.contextSeconds) };
}
export function overlapFraction(a: {start: number; end: number}, b: {start: number; end: number}) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / Math.min(a.end-a.start, b.end-b.start);
}

/** Boundary hints only. It does not infer a hook, payoff, or verified speech. */
export function proposeClips(context: ClipContext, input: unknown, transcriptId?: string) {
  const brief = clipBriefSchema.parse(input);
  if (!transcriptId && context.transcripts.length > 1) throw new Error('Multiple transcript versions: select one with --transcript-id');
  const transcript = transcriptFor(context, transcriptId ?? context.transcripts[0]?.id ?? null);
  const terms = [...new Set(brief.goal.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
  const anchors = [
    ...context.observations.map(o => ({ type: 'observation' as const, id: o.id, start: o.start, end: o.end, text: o.observation })),
    ...(transcript?.segments.map((s, i) => ({ ...s, type: 'transcript' as const, id: `${transcript.id}:${i}` })) ?? []),
  ].map(a => ({ ...a, matches: terms.filter(t => a.text.toLowerCase().includes(t)).length }))
    .sort((a,b) => b.matches-a.matches || (a.type === b.type ? 0 : a.type === 'observation' ? -1 : 1) || a.start-b.start);
  const candidates: ClipCandidate[] = [];
  for (const anchor of anchors.slice(0,512)) {
    if (candidates.length >= brief.count) break;
    if (anchor.end - anchor.start > brief.maxDuration) continue;
    let start = Math.max(0, anchor.start - Math.min(brief.contextSeconds, brief.minDuration/4));
    let end = Math.min(context.source.duration, Math.max(anchor.end, start + brief.minDuration));
    start = Math.max(0, Math.min(start, end-brief.minDuration));
    // Expand, never snap inward through a known unit. Chained overlaps reach a fixed point.
    for (let pass = 0; pass <= (transcript?.segments.length ?? 0); pass++) {
      const previous = `${start}:${end}`;
      for (const unit of transcript?.segments ?? []) {
        if (start > unit.start+EPS && start < unit.end-EPS) start = unit.start;
        if (end > unit.start+EPS && end < unit.end-EPS) end = unit.end;
      }
      if (previous === `${start}:${end}`) break;
    }
    const duration = end-start;
    if (duration < brief.minDuration-EPS || Math.ceil(duration*30-EPS)/30 > brief.maxDuration+EPS) continue;
    if (candidates.some(c => overlapFraction(c.range, {start,end}) >= .5)) continue;
    const empty = () => ({ statement: '', observationIds: [] });
    candidates.push({ id: `clip-${candidates.length+1}`, title: '', mode: 'original_moment', range: {start,end},
      seed: {type: anchor.type, id: anchor.id}, narrative: {promise: empty(), setup: empty(), action: empty(), payoff: empty(), whyStandalone: ''},
      protectedRanges: [], review: null });
  }
  const collection = clipCollectionSchema.parse({ schemaVersion: 1, kind: 'agent-clip-candidates',
    source: { sessionId: context.id, sha256: context.source.sha256, path: context.source.path, transcriptId: transcript?.id ?? null },
    brief, candidates, delivery: null });
  return { collection, algorithm: 'observation/transcript anchors, lexical query matches, conservative boundary expansion and overlap suppression',
    requested: brief.count, proposed: candidates.length, externalModelCalls: 0,
    note: 'Hints are not semantic highlight detection or a virality score. Fewer candidates are valid when evidence is sparse. Inspect context, then author narrative and review.',
    nextInspectionRanges: candidates.length ? candidates.map(c => ({ candidateId: c.id, ...contextRange(c, brief, context.source.duration) })) :
      Array.from({length: Math.min(brief.count, 3)}, (_, i) => ({ candidateId: null, start: i*context.source.duration/Math.min(brief.count,3),
        end: Math.min(context.source.duration, i*context.source.duration/Math.min(brief.count,3) + 60) })),
  };
}

/** Split export-time intervals into original-source spans, preserving quantized holds. */
export function mapOriginalRanges(bundle: DeliveryBundle, selection: {start: number; end: number}) {
  if (selection.start < 0 || selection.end > bundle.duration+EPS || selection.end <= selection.start) throw new Error('Selection exceeds delivery timeline');
  const spans = [];
  let cursor = 0;
  for (const clip of bundle.clips) {
    if (clip.startFrame !== cursor || clip.sourceOut <= clip.sourceIn) throw new Error('Invalid delivery timeline/source range');
    cursor += clip.durationFrames;
    const source = bundle.sources.find(s => s.id === clip.sourceId);
    if (!source) throw new Error('Delivery refers to a missing original source');
    const start = clip.startFrame/bundle.fps, end = cursor/bundle.fps;
    const contentEnd = start + clip.sourceOut-clip.sourceIn;
    if (contentEnd > end+EPS || end-contentEnd > 1/bundle.fps+EPS) throw new Error('Unsupported speed change or padding in delivery mapping');
    for (const [kind, left, right] of [['source',start,contentEnd], ['held_picture_padded_audio',contentEnd,end]] as const) {
      const a = Math.max(selection.start,left), b = Math.min(selection.end,right);
      if (b-a <= EPS) continue;
      spans.push({ kind, exportStart: a, exportEnd: b, bundleClipId: clip.id,
        originalSourceId: source.id, originalPath: source.path, originalSha256: source.sha256,
        originalStart: kind === 'source' ? clip.sourceIn+a-start : clip.sourceOut,
        originalEnd: kind === 'source' ? clip.sourceIn+b-start : clip.sourceOut });
    }
  }
  if (cursor !== bundle.frames || Math.abs(cursor/bundle.fps-bundle.duration)>EPS || Math.abs(spans.reduce((n,s)=>n+s.exportEnd-s.exportStart,0)-(selection.end-selection.start))>EPS) throw new Error('Incomplete source mapping');
  return spans;
}

export function checkClips(input: unknown, context: ClipContext) {
  const collection = clipCollectionSchema.parse(input);
  if (collection.source.sessionId !== context.id || collection.source.sha256 !== context.source.sha256 || collection.source.path !== context.source.path) throw new Error('Candidate source/session binding mismatch');
  const transcript = transcriptFor(context, collection.source.transcriptId);
  const artifacts = context.inspections.flatMap(i => i.artifacts);
  const ids = new Set<string>();
  if (collection.candidates.length > collection.brief.count) throw new Error('Candidate count exceeds the brief');
  for(const c of collection.candidates) { if(ids.has(c.id))throw new Error('Duplicate candidate id'); ids.add(c.id); }
  const results = collection.candidates.map(c => {
    const errors: string[] = [], warnings: string[] = [], needs: string[] = [];
    const duration = c.range.end-c.range.start;
    if (c.range.end > context.source.duration+EPS || duration < collection.brief.minDuration-EPS || Math.ceil(duration*30-EPS)/30 > collection.brief.maxDuration+EPS) errors.push('Candidate outside source/duration budget');
    const seed = c.seed.type === 'observation' ? context.observations.find(o => o.id === c.seed.id) :
      transcript?.segments.find((_,i) => `${transcript.id}:${i}` === c.seed.id);
    if (!seed || !inside(c.range, seed)) errors.push('Seed must exist in the selected evidence and survive within the candidate');
    const used = new Set<string>();
    for (const [role, beat] of Object.entries(c.narrative).filter(([key]) => key !== 'whyStandalone') as [string, {statement:string;observationIds:string[]}][]) {
      if (!beat.statement || !beat.observationIds.length) needs.push(`Ground the ${role} in inspected observations`);
      for (const id of beat.observationIds) {
        const o = context.observations.find(o => o.id === id); used.add(id);
        if (!o || !inside(c.range,o)) errors.push(`${role}: cited observation ${id} is missing or not wholly retained`);
        else if (o.uncertainty.trim()) needs.push(`${role}: ${id} still records uncertainty; inspect and record a resolving observation`);
      }
    }
    if (!c.title || !c.narrative.whyStandalone) needs.push('Add a metadata title and explain why the moment stands alone');
    for (const p of c.protectedRanges) if (!inside(c.range,p)) errors.push('Missing protected action/context range');
    for (const s of transcript?.segments ?? []) if ([c.range.start,c.range.end].some(t => t>s.start+EPS && t<s.end-EPS)) errors.push('Cut bisects a known transcript unit; expand or revise the source transcript');
    if (!transcript && context.audio.hasTrack && !context.audio.digitalSilence) warnings.push('No selected transcript: speech remains unknown until actual audio review');
    if (transcript) warnings.push('Transcript boundaries are fallible hints, not verified word alignment');
    const review = c.review;
    if (!review) needs.push('Source/context review has not been recorded');
    else {
      if (review.candidateId !== c.id || review.candidateSha256 !== candidateHash(collection,c)) errors.push('Review is stale or belongs to another candidate; review this exact selection');
      const dimensions = new Set(review.checks.map(check => check.dimension));
      if (dimensions.size !== 5) errors.push('Review dimensions must each appear once');
      for (const check of review.checks) {
        if (check.outcome === 'fail') needs.push(`${check.dimension}: ${check.note}`);
        if (check.outcome === 'not_applicable' && (check.dimension !== 'speech' || context.audio.hasTrack && !context.audio.digitalSilence)) errors.push(`${check.dimension} cannot be marked not applicable`);
      }
      const covered = contextRange(c,collection.brief,context.source.duration);
      const cited = artifacts.filter(a => review.evidenceIds.includes(a.id));
      if (review.evidenceIds.some(id => !artifacts.some(a => a.id === id))) errors.push('Review references an unknown inspection artifact');
      if (!cited.some(a => (a.kind === 'frame' || a.kind === 'clip') && a.start < c.range.end && a.end >= c.range.start)) errors.push('Review needs visual evidence for this candidate');
      // Boundary/context inspection must exist on each available side. Availability is not proof it was watched.
      for (const t of [covered.start, c.range.start, Math.max(c.range.start,c.range.end-1/30), Math.max(covered.start,covered.end-1/30)]) {
        if (!cited.some(a => a.kind !== 'audio' && (a.kind === 'clip' ? a.start <= t+1/30 && a.end >= t : Math.abs(a.start-t) <= .25))) needs.push(`Inspect visual boundary/context near ${t.toFixed(3)}s`);
      }
      if (context.audio.hasTrack && !context.audio.digitalSilence && !coversInterval(cited.filter(a => a.kind === 'audio' || a.kind === 'clip'), covered)) needs.push('Review needs audio/clip evidence covering the candidate and surrounding context');
      if (review.decision === 'reject') needs.push('Reviewer rejected this candidate');
    }
    for (const other of collection.candidates) if (other.id !== c.id && overlapFraction(c.range,other.range)>=.5) {
      warnings.push(`Substantial overlap with ${other.id}`);
      if (review?.decision==='accept' && other.review?.decision==='accept') errors.push(`Accepted selection duplicates ${other.id}; reject or revise one`);
    }
    return { id:c.id, candidateSha256:candidateHash(collection,c), duration, context:contextRange(c,collection.brief,context.source.duration),
      status:errors.length?'invalid':review?.decision==='reject'?'rejected':needs.length?'needs_review':'source_review_recorded',
      canCreatePlan:!errors.length && !needs.length && review?.decision==='accept', errors,warnings,needs, observationIds:[...used] };
  });
  return { kind:'clip-candidate-check', results, externalModelCalls:0, safeToAutoPublish:false,
    note:'Checks validate provenance, timing and attributed review declarations, not semantic truth or actual inspection. Rendered output still needs review.' };
}
function coversInterval(spans: {start:number;end:number}[], range: {start:number;end:number}) {
  let end=range.start;
  for (const s of [...spans].sort((a,b)=>a.start-b.start)) { if(s.end<=end)continue; if(s.start>end+EPS)break; end=Math.max(end,s.end); }
  return end>=range.end-EPS;
}
export function recordClipReview(input: unknown, context: ClipContext, reviewInput: unknown) {
  const collection=clipCollectionSchema.parse(input), review=clipReviewSchema.parse(reviewInput);
  const candidate=collection.candidates.find(c=>c.id===review.candidateId);
  if(!candidate || candidateHash(collection,candidate)!==review.candidateSha256)throw new Error('Review does not match this exact candidate');
  candidate.review=review;
  const result=checkClips(collection,context).results.find(r=>r.id===candidate.id)!;
  if(review.decision==='accept' && (result.errors.length || !result.canCreatePlan))throw new Error(`Review cannot be accepted: ${[...result.errors,...result.needs].join('; ')}`);
  return collection;
}
export function clipToPlan(input: unknown, context: ClipContext, candidateId: string): Plan {
  const collection=clipCollectionSchema.parse(input), check=checkClips(collection,context).results.find(r=>r.id===candidateId);
  if(!check?.canCreatePlan)throw new Error(`Candidate needs review before plan export: ${[...(check?.errors??[]),...(check?.needs??['Unknown candidate'])].join('; ')}`);
  const c=collection.candidates.find(c=>c.id===candidateId)!;
  const observations=context.observations.filter(o=>check.observationIds.includes(o.id));
  const transcript=transcriptFor(context,collection.source.transcriptId);
  const plan:Plan={schemaVersion:1,brief:{goal:collection.brief.goal,audience:collection.brief.audience,format:'story',minDuration:collection.brief.minDuration,maxDuration:collection.brief.maxDuration,allowReorder:false},
    skills:['editor-video-evidence','editor-story-plan','editor-review'],
    sources:[{id:'long_form',path:context.source.path,sha256:context.source.sha256,duration:context.source.duration,
      audio:!context.audio.hasTrack?'no_track':context.audio.digitalSilence?'silent':transcript?'speech':'unknown'}],
    evidence:observations.map(o=>({id:o.id,sourceId:'long_form',start:o.start,end:o.end,observation:o.observation,
      kind:o.modalities.includes('visual')?'visual':o.modalities.includes('transcript')?'speech':'audio_measurement',verification:'observed',
      artifact:`session:${context.id}/observation:${o.id}`})),
    beats:[{id:'moment',role:'action',purpose:c.narrative.action.statement,evidenceIds:check.observationIds}],
    segments:[{id:c.id,beatId:'moment',sourceId:'long_form',in:c.range.start,out:c.range.end,reason:c.narrative.whyStandalone,evidenceIds:check.observationIds}],
    protectedRanges:c.protectedRanges.map(p=>({...p,sourceId:'long_form'})),
    speechRanges:(transcript?.segments.filter(s=>overlaps(s,c.range))??[]).map(s=>({...s,sourceId:'long_form'})),
    preferences:[], review:{previewInspected:false,reviewer:'',checks:[]}};
  const valid=validatePlan(plan); if(!valid.technicalPass)throw new Error(valid.errors.map(e=>e.message).join('; '));
  return plan;
}
