import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeClips, clipToPlan } from '../src/clips.ts';
import type { ClipContext } from '../src/clips.ts';
import { checkPortraitDraft, exportPortraitDraft } from '../src/portrait-draft.ts';
import { draftPortrait } from '../src/portrait.ts';
import { portraitDocumentSchema } from '../src/portrait-schema.ts';

function fixture() {
  const context:ClipContext={id:'a'.repeat(64),source:{path:'/fixture.mp4',sha256:'b'.repeat(64),duration:10},
    audio:{hasTrack:true,digitalSilence:false},transcripts:[],
    observations:[{id:'event',start:3,end:4,observation:'Generated test pattern',uncertainty:'Unreviewed fixture',modalities:['visual'],evidenceIds:['clip']}],
    inspections:[{artifacts:[{id:'clip',path:'/evidence.mp4',kind:'clip',start:0,end:10}]}]};
  const collection=proposeClips(context,{goal:'pattern',count:1,minDuration:2,maxDuration:6,contextSeconds:1}).collection;
  collection.candidates[0].range={start:2,end:6};
  const recipe={sourceWidth:320,sourceHeight:180,width:360,height:640,frames:120,
    shots:[{startFrame:0,endFrame:120,mode:'cover',keyframes:[{frame:0,x:.5,y:.5}],reason:'Keep generated pattern',evidenceIds:['clip']}]};
  return {context,collection,recipe,geometry:{width:320,height:180}};
}

test('explicit draft stays unreviewed and does not mutate or unlock source selection',()=>{
  const {context,collection,recipe,geometry}=fixture(),before=JSON.stringify(collection);
  const result=checkPortraitDraft(collection,context,'clip-1',recipe,geometry);
  assert.equal(result.status,'unreviewed_draft');assert.equal(result.safeToAutoPublish,false);assert(result.reviewRequired);
  assert(result.needs.some(n=>n.includes('review')));assert.equal(JSON.stringify(collection),before);
  assert.throws(()=>clipToPlan(collection,context,'clip-1'),/review/);
  assert.throws(()=>draftPortrait(collection,context,'clip-1',geometry),/review/);
  assert.equal(portraitDocumentSchema.safeParse(result).success,false);
});
test('draft does not relax source, selection, seed, or recipe technical checks',()=>{
  const {context,collection,recipe,geometry}=fixture();
  for(const change of [(c:typeof collection)=>c.source.sha256='c'.repeat(64),
    (c:typeof collection)=>c.candidates[0].range.end=11,(c:typeof collection)=>c.candidates[0].seed.id='missing']) {
    const changed=structuredClone(collection);change(changed);
    assert.throws(()=>checkPortraitDraft(changed,context,'clip-1',recipe,geometry));
  }
  assert.throws(()=>checkPortraitDraft(collection,context,'clip-1',{...recipe,frames:121},geometry),/frame/);
  assert.throws(()=>checkPortraitDraft(collection,context,'clip-1',recipe,{width:640,height:360}),/geometry/);
  const bad=structuredClone(recipe);bad.shots[0].keyframes[0].x=0;
  assert.throws(()=>checkPortraitDraft(collection,context,'clip-1',bad,geometry),/crop center/);
  bad.shots[0].keyframes[0].x=.5;bad.shots[0].evidenceIds=['invented'];
  assert.throws(()=>checkPortraitDraft(collection,context,'clip-1',bad,geometry),/unknown evidence/);
});
test('missing framing coverage remains a visible need, not a fictional pass',()=>{
  const {context,collection,recipe,geometry}=fixture();recipe.shots[0].evidenceIds=[];
  const result=checkPortraitDraft(collection,context,'clip-1',recipe,geometry);
  assert(result.needs.some(n=>n.includes('remains to be inspected')));assert.equal(result.safeToAutoPublish,false);
});
test('draft still refuses to bisect a known transcript unit',()=>{
  const {context,collection,recipe,geometry}=fixture();
  context.transcripts=[{id:'speech',segments:[{start:1,end:3,text:'Fixture speech.'}]}];collection.source.transcriptId='speech';
  assert.throws(()=>checkPortraitDraft(collection,context,'clip-1',recipe,geometry),/bisects/);
});
test('draft export needs explicit acknowledgement and a clearly labelled destination before I/O',async()=>{
  const {context,collection,recipe}=fixture();
  await assert.rejects(exportPortraitDraft(collection,context,'clip-1',recipe,{output:'test_DRAFT.mp4',acknowledgeUnreviewed:false,mobile:null}),/acknowledge/);
  await assert.rejects(exportPortraitDraft(collection,context,'clip-1',recipe,{output:'final.mp4',acknowledgeUnreviewed:true,mobile:null}),/filename/);
});
