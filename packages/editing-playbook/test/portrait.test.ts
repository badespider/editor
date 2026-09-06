import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateHash, proposeClips, recordClipReview, clipToPlan } from '../src/clips.ts';
import type { ClipContext } from '../src/clips.ts';
import { draftPortrait, portraitHash, checkPortrait, recordPortraitReview, assertPortraitForPlan } from '../src/portrait.ts';
import { portraitRecipeSchema, portraitDocumentSchema, validatePortraitGeometry, portraitSampleFrames, portraitVideoFilter } from '../src/portrait-schema.ts';
import { planSchema } from '../src/schema.ts';

function fixture() {
  const context:ClipContext={id:'a'.repeat(64),source:{path:'/fixture.mp4',sha256:'b'.repeat(64),duration:10},
    audio:{hasTrack:true,digitalSilence:false},transcripts:[],observations:[{id:'event',start:3,end:4,observation:'Generated fixture',uncertainty:'',modalities:['visual'],evidenceIds:['clip']}],
    inspections:[{artifacts:[{id:'clip',path:'/fixture-evidence.mp4',kind:'clip',start:0,end:10}]}]};
  let collection=proposeClips(context,{goal:'fixture',count:1,minDuration:2,maxDuration:6,contextSeconds:1}).collection;
  const candidate=collection.candidates[0];candidate.range={start:2,end:6};candidate.title='Synthetic';candidate.narrative.whyStandalone='Known synthetic fixture';
  for(const r of ['promise','setup','action','payoff'] as const)candidate.narrative[r]={statement:'Contract fixture only',observationIds:['event']};
  collection=recordClipReview(collection,context,{candidateId:candidate.id,candidateSha256:candidateHash(collection,candidate),reviewer:'Synthetic test',decision:'accept',evidenceIds:['clip'],
    checks:['story','speech','boundaries','framing','context'].map(dimension=>({dimension,outcome:'pass',note:'Synthetic contract, not human viewing'}))});
  const geometry={width:320,height:180},doc=draftPortrait(collection,context,candidate.id,geometry);
  doc.recipe.shots[0].reason='Keep the generated pattern';doc.recipe.shots[0].evidenceIds=['clip'];
  return {context,collection,geometry,doc,plan:clipToPlan(collection,context,candidate.id)};
}
function framingReview(doc:ReturnType<typeof fixture>['doc']) {
  return {recipeSha256:portraitHash(doc),reviewer:'Synthetic contract',decision:'accept',
    checks:['subject','context','motion'].map(dimension=>({dimension,outcome:'pass',note:'Generated fixture declaration'}))};
}
test('portrait draft uses 1080x1920 but remains unreviewed, never an automatic crop approval',()=>{
  const {doc,context,geometry}=fixture();assert.equal(doc.recipe.width,1080);assert.equal(doc.recipe.height,1920);
  const check=checkPortrait(doc,context,geometry);assert.equal(check.canPrepare,false);assert.equal(check.externalModelCalls,0);assert.equal(check.safeToAutoPublish,false);
});
test('framing acceptance binds exact recipe and plan, not the future render',()=>{
  const {doc,context,geometry,plan}=fixture();const accepted=recordPortraitReview(doc,context,geometry,framingReview(doc));
  assert(checkPortrait(accepted,context,geometry).canPrepare);assertPortraitForPlan(accepted,plan);
  assertPortraitForPlan(accepted,planSchema.parse(plan));
  assert.equal(plan.review.previewInspected,false);
});
test('changed keyframe, reason, dimensions or narrative invalidate review',()=>{
  const {doc,context,geometry}=fixture(),accepted=recordPortraitReview(doc,context,geometry,framingReview(doc));
  for(const mutate of [(d:typeof doc)=>d.recipe.shots[0].keyframes[0].x=.6,(d:typeof doc)=>d.recipe.shots[0].reason+='changed',
    (d:typeof doc)=>{d.recipe.width=720;d.recipe.height=1280;},(d:typeof doc)=>d.collection.candidates[0].title+='changed']) {
    const changed=structuredClone(accepted);mutate(changed);const check=checkPortrait(changed,context,geometry);
    assert(!check.canPrepare);assert(check.errors.some(e=>/stale/.test(e)));
  }
});
test('incomplete source review cannot be laundered into a portrait plan',()=>{
  const {collection,context,geometry}=fixture();collection.candidates[0].review=null;
  assert.throws(()=>draftPortrait(collection,context,'clip-1',geometry),/review/);
});
test('portrait review requires visual source coverage, not audio or invented IDs',()=>{
  for(const ids of [[],['missing']]) {
    const {doc,context,geometry}=fixture();doc.recipe.shots[0].evidenceIds=ids;
    assert.throws(()=>recordPortraitReview(doc,context,geometry,framingReview(doc)),/inspect|evidence/);
  }
  const {doc,context,geometry}=fixture();context.inspections[0].artifacts[0].end=3.5;
  assert(!checkPortrait(doc,context,geometry).canPrepare);
});
test('geometry blocks off-image centers, gaps, overlaps, duplicate keys and missing initial keys',()=>{
  const {doc}=fixture();
  for(const mutate of [(r:typeof doc.recipe)=>r.shots[0].keyframes[0].x=0,(r:typeof doc.recipe)=>r.shots[0].keyframes[0].y=.1,
    (r:typeof doc.recipe)=>r.shots[0].startFrame=1,(r:typeof doc.recipe)=>r.shots[0].endFrame=119,
    (r:typeof doc.recipe)=>r.shots[0].keyframes.push({...r.shots[0].keyframes[0]}),
    (r:typeof doc.recipe)=>r.shots[0].keyframes[0].frame=2]) {
    const r=structuredClone(doc.recipe);mutate(r);assert(validatePortraitGeometry(r).length);assert.throws(()=>portraitVideoFilter(r));
  }
});
test('strict numeric schema rejects expressions, unsupported dimensions, fractions and excessive work',()=>{
  const {doc}=fixture();
  assert(!portraitRecipeSchema.safeParse({...doc.recipe,width:720}).success);
  assert(!portraitDocumentSchema.safeParse({...doc,approved:true}).success);
  const r=structuredClone(doc.recipe);r.shots[0].keyframes[0].frame=.5;assert(!portraitRecipeSchema.safeParse(r).success);
  assert(!portraitRecipeSchema.safeParse({...doc.recipe,frames:3601}).success);
  assert(!portraitRecipeSchema.safeParse({...doc.recipe,shots:Array(17).fill(doc.recipe.shots[0])}).success);
});
test('contain fallback preserves full picture and refuses hidden unused crop decisions',()=>{
  const {doc}=fixture(),r=doc.recipe;r.shots[0].mode='contain';assert(validatePortraitGeometry(r).length);
  r.shots[0].keyframes=[];assert.deepEqual(validatePortraitGeometry(r),[]);assert.match(portraitVideoFilter(r),/pad=/);assert.doesNotMatch(portraitVideoFilter(r),/crop=/);
});
test('shot-local pan expressions reset after nonzero trim and never interpolate across cuts',()=>{
  const {doc}=fixture(),r=doc.recipe;
  r.shots=[{...r.shots[0],endFrame:60,keyframes:[{frame:0,x:.2,y:.5},{frame:59,x:.8,y:.5}]},
    {...r.shots[0],startFrame:60,keyframes:[{frame:60,x:.8,y:.5},{frame:90,x:.2,y:.5}]}];
  const filter=portraitVideoFilter(r);assert.match(filter,/trim=start_frame=60:end_frame=120,setpts=PTS-STARTPTS/);
  assert.match(filter,/n-0/);assert.doesNotMatch(filter,/n-60/);assert.match(filter,/concat=n=2/);
  const frames=portraitSampleFrames(r);for(const f of [0,29,59,60,75,90,104,119])assert(frames.includes(f));
});
test('direct delivery rejects a stale plan and stale framing review',()=>{
  const {doc,context,geometry,plan}=fixture(),accepted=recordPortraitReview(doc,context,geometry,framingReview(doc));
  const changed=structuredClone(plan);changed.segments[0].out+=.1;assert.throws(()=>assertPortraitForPlan(accepted,changed),/changed|bind/);
  accepted.recipe.shots[0].keyframes[0].x=.6;assert.throws(()=>assertPortraitForPlan(accepted,plan),/review/);
});

test('pathological cover scales are bounded and direct callers cannot drop source review',()=>{
  const {doc,context,geometry,plan}=fixture(),accepted=recordPortraitReview(doc,context,geometry,framingReview(doc));
  accepted.collection.candidates[0].review=null;accepted.review=framingReview(accepted) as typeof accepted.review;
  assert.throws(()=>assertPortraitForPlan(accepted,plan),/source review/);
  doc.recipe.sourceHeight=1;assert(validatePortraitGeometry(doc.recipe).some(e=>e.includes('pixel budget')));
});
