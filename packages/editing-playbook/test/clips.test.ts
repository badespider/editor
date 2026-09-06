import test from 'node:test';
import assert from 'node:assert/strict';
import { clipCollectionSchema } from '../src/clip-schema.ts';
import { candidateHash, checkClips, clipToPlan, mapOriginalRanges, proposeClips, recordClipReview } from '../src/clips.ts';
import type { ClipContext } from '../src/clips.ts';
import type { ClipCollection } from '../src/clip-schema.ts';
import { deliveryBundleSchema } from '../src/delivery-schema.ts';

function context():ClipContext {
  return {id:'a'.repeat(64),source:{path:'C:/fixture/video.mp4',sha256:'b'.repeat(64),duration:180},audio:{hasTrack:true,digitalSilence:false},
    observations:[10,65,125].map((start,i)=>({id:`o${i}`,start,end:start+5,observation:`Known synthetic reveal ${i}`,uncertainty:'',modalities:['visual'],evidenceIds:['visual']})),
    transcripts:[{id:'transcript-v1',segments:[{start:2,end:12,text:'Complete fixture unit'},{start:20,end:34,text:'Another full unit'}]}],
    inspections:[{artifacts:[{id:'visual',kind:'clip',start:0,end:180,path:'C:/fixture/clip.mp4'}]}]};
}
function ready(ctx=context()) {
  const c=proposeClips(ctx,{goal:'reveal',count:1}).collection;
  c.candidates[0].title='Fixture moment';c.candidates[0].narrative.whyStandalone='Synthetic contract example, not a real story claim';
  for(const name of ['promise','setup','action','payoff'] as const)c.candidates[0].narrative[name]={statement:`Fixture ${name}`,observationIds:['o0']};
  c.candidates[0].protectedRanges=[{start:10,end:15,reason:'Keep the known generated event'}];
  return c;
}
function review(c:ClipCollection) {
  return {candidateId:c.candidates[0].id,candidateSha256:candidateHash(c,c.candidates[0]),reviewer:'Synthetic test, not an agent inspection',decision:'accept',evidenceIds:['visual'],
    checks:['story','speech','boundaries','framing','context'].map(dimension=>({dimension,outcome:'pass',note:'Fixture declaration for contract testing'}))};
}
test('proposal defaults to three distinct original moments, with no fabricated narrative or review',()=>{
  const c=proposeClips(context(),{goal:'reveal'});
  assert.equal(c.collection.candidates.length,3);assert.equal(c.externalModelCalls,0);
  assert(c.collection.candidates.every(x=>x.review===null && !x.narrative.payoff.statement));
  assert(c.collection.candidates[0].range.end>=34,'must expand through a transcript unit, not cut it');
  assert(checkClips(c.collection,context()).results.every(r=>!r.canCreatePlan));
});
test('no observations or transcript produces no invented highlights and offers inspection ranges',()=>{
  const ctx=context();ctx.observations=[];ctx.transcripts=[];
  const result=proposeClips(ctx,{goal:'Find a moment'});assert.equal(result.proposed,0);assert.equal(result.nextInspectionRanges.length,3);
});
test('multiple transcript versions require explicit selection',()=>{
  const ctx=context();ctx.transcripts.push({id:'transcript-v2',segments:[]});
  assert.throws(()=>proposeClips(ctx,{goal:'reveal'}),/Multiple transcript/);
  assert.equal(proposeClips(ctx,{goal:'reveal'},'transcript-v2').collection.source.transcriptId,'transcript-v2');
});
test('a valid recorded source review produces a plan but never a reviewed render',()=>{
  const ctx=context(),c=ready(ctx),accepted=recordClipReview(c,ctx,review(c));
  assert.equal(checkClips(accepted,ctx).results[0].canCreatePlan,true);
  const plan=clipToPlan(accepted,ctx,'clip-1');assert.equal(plan.review.previewInspected,false);
  assert.equal(plan.sources[0].sha256,ctx.source.sha256);assert.equal(plan.segments.length,1);
});
test('editing a range, narrative, brief, title or source invalidates recorded review',()=>{
  const ctx=context(),c=ready(ctx),accepted=recordClipReview(c,ctx,review(c));
  for(const change of [(v:ClipCollection)=>v.candidates[0].range.end++, (v:ClipCollection)=>v.candidates[0].title+=' changed',
    (v:ClipCollection)=>v.candidates[0].narrative.whyStandalone+=' changed',(v:ClipCollection)=>v.brief.goal+=' changed']) {
    const changed=structuredClone(accepted);change(changed);assert.throws(()=>clipToPlan(changed,ctx,'clip-1'),/stale/);
  }
  accepted.source.sha256='c'.repeat(64);assert.throws(()=>checkClips(accepted,ctx),/binding mismatch/);
});
test('missing payoff, unresolved observation, outside evidence and split speech cannot be accepted',()=>{
  const ctx=context();
  for(const change of [(c:ClipCollection)=>c.candidates[0].narrative.payoff.statement='',
    (c:ClipCollection)=>c.candidates[0].narrative.action.observationIds=['o2'],
    (c:ClipCollection)=>c.candidates[0].range.end=30]) {
    const c=ready(ctx);change(c);assert.throws(()=>recordClipReview(c,ctx,review(c)),/cannot be accepted/);
  }
  ctx.observations[0].uncertainty='The result was not inspected';const c=ready(ctx);assert.throws(()=>recordClipReview(c,ctx,review(c)),/uncertainty/);
});
test('review needs real source/context artifacts; transcript-only cannot pass audible speech review',()=>{
  const ctx=context(),c=ready(ctx);
  const bad=review(c);bad.evidenceIds=['transcript-v1'];assert.throws(()=>recordClipReview(c,ctx,bad),/unknown inspection/);
  const gap=context();gap.inspections[0].artifacts[0].end=20;assert.throws(()=>recordClipReview(c,gap,review(c)),/context/);
  const na=review(c);na.checks.find(c=>c.dimension==='speech')!.outcome='not_applicable';assert.throws(()=>recordClipReview(c,ctx,na),/not applicable/);
});
test('silent sources can declare speech not applicable without fabricated audio evidence',()=>{
  const ctx=context();ctx.audio={hasTrack:false,digitalSilence:true};ctx.transcripts=[];
  const c=ready(ctx),r=review(c);r.checks.find(c=>c.dimension==='speech')!.outcome='not_applicable';
  assert.equal(clipToPlan(recordClipReview(c,ctx,r),ctx,'clip-1').sources[0].audio,'no_track');
});
test('a reviewer can reject a candidate without pretending to inspect unavailable artifacts',()=>{
  const ctx=context(),c=ready(ctx),r=review(c);r.decision='reject';r.evidenceIds=[];
  const rejected=recordClipReview(c,ctx,r);
  assert.equal(rejected.candidates[0].review?.decision,'reject');
  assert.throws(()=>clipToPlan(rejected,ctx,'clip-1'),/needs review/);
});
test('duplicate ids and duplicate accepted selections are blocked',()=>{
  const ctx=context(),c=ready(ctx);c.brief.count=2;
  c.candidates.push(structuredClone(c.candidates[0]));assert.throws(()=>checkClips(c,ctx),/Duplicate candidate/);
  c.candidates[1].id='clip-2';
  const one=recordClipReview(c,ctx,review(c));
  const second={...review(one),candidateId:'clip-2',candidateSha256:candidateHash(one,one.candidates[1])};
  assert.throws(()=>recordClipReview(one,ctx,second),/duplicates/);
});
test('protected ranges validate and forged approval/unknown fields fail strict schema',()=>{
  const c=ready();assert.equal(clipCollectionSchema.safeParse(c).success,true);
  assert.equal(clipCollectionSchema.safeParse({...c,approved:true}).success,false);
  c.candidates[0].protectedRanges[0].end=100;
  assert.throws(()=>recordClipReview(c,context(),review(c)),/protected/);
});
test('output-to-original mapping handles cuts, repeated sources and quantized hold/padded audio separately',()=>{
  const bundle=deliveryBundleSchema.parse({schemaVersion:1,kind:'editor-delivery-bundle',name:'fixture',fps:30,width:320,height:180,frames:61,duration:61/30,
    compositionSha256:'1'.repeat(64),planSha256:'2'.repeat(64),sources:[{id:'a',path:'a.mp4',sha256:'3'.repeat(64),bytes:1,mtimeMs:0}],
    clips:[{id:'c0',sourceId:'a',sourceIn:10,sourceOut:11.01,startFrame:0,durationFrames:31,path:'media/c0.mp4',sha256:'4'.repeat(64),hasSourceAudio:true},
      {id:'c1',sourceId:'a',sourceIn:5,sourceOut:6,startFrame:31,durationFrames:30,path:'media/c1.mp4',sha256:'5'.repeat(64),hasSourceAudio:true}],chapters:[],limitations:[]});
  const mapped=mapOriginalRanges(bundle,{start:1,end:1.2});
  assert.equal(mapped.length,3);assert.equal(mapped[1].kind,'held_picture_padded_audio');
  assert.equal(mapped[1].originalStart,mapped[1].originalEnd);assert.equal(mapped[2].originalStart,5);
  assert.throws(()=>mapOriginalRanges(bundle,{start:0,end:10}),/exceeds/);
  bundle.clips[1].startFrame=30;assert.throws(()=>mapOriginalRanges(bundle,{start:1,end:1.2}),/Invalid delivery/);
});
