import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateHash, clipToPlan, proposeClips, recordClipReview } from '../src/clips.ts';
import type { ClipContext } from '../src/clips.ts';
import { draftPortrait, draftMobilePortrait, portraitHash, checkPortrait, recordPortraitReview, assertPortraitForPlan } from '../src/portrait.ts';
import { portraitDocumentSchema, portraitOutputSampleFrames, portraitRenderReviewV1Schema, portraitRenderReviewV2Schema } from '../src/portrait-schema.ts';
import { defaultMobileProfile, mobileOutputSchema } from '../src/mobile.ts';
import { fontFamilies } from '../src/mobile-node.ts';

function fixture() {
  const context:ClipContext={id:'a'.repeat(64),source:{path:'/fixture.mp4',sha256:'b'.repeat(64),duration:10},
    audio:{hasTrack:true,digitalSilence:false},transcripts:[],observations:[{id:'event',start:3,end:4,observation:'Generated fixture',uncertainty:'',modalities:['visual'],evidenceIds:['clip']}],
    inspections:[{artifacts:[{id:'clip',path:'/fixture-evidence.mp4',kind:'clip',start:0,end:10}]}]};
  let collection=proposeClips(context,{goal:'fixture',count:1,minDuration:2,maxDuration:6,contextSeconds:1}).collection;
  const candidate=collection.candidates[0];candidate.range={start:2,end:6};candidate.title='Synthetic';candidate.narrative.whyStandalone='Known synthetic fixture';
  for(const r of ['promise','setup','action','payoff'] as const)candidate.narrative[r]={statement:'Contract fixture only',observationIds:['event']};
  collection=recordClipReview(collection,context,{candidateId:candidate.id,candidateSha256:candidateHash(collection,candidate),reviewer:'Synthetic test',decision:'accept',evidenceIds:['clip'],
    checks:['story','speech','boundaries','framing','context'].map(dimension=>({dimension,outcome:'pass',note:'Synthetic contract, not human viewing'}))});
  const geometry={width:320,height:180},legacy=draftPortrait(collection,context,candidate.id,geometry);
  legacy.recipe.shots[0].reason='Keep the generated pattern';legacy.recipe.shots[0].evidenceIds=['clip'];
  const mobile=mobileOutputSchema.parse({schemaVersion:1,profile:defaultMobileProfile,captions:{
    source:{path:'/captions.srt',sha256:'c'.repeat(64),format:'srt',timebase:'source'},
    font:{path:'/font.ttf',sha256:'d'.repeat(64),family:'Fixture Sans'},
    style:{fontSize:60,outline:3,position:'bottom',maxLines:3},cues:[{startFrame:7,endFrame:24,text:'Visible caption'}],
  }});
  return {context,geometry,legacy,mobile,plan:clipToPlan(collection,context,candidate.id)};
}
function review(doc: ReturnType<typeof draftMobilePortrait>) {
  return {recipeSha256:portraitHash(doc),reviewer:'Synthetic contract',decision:'accept',
    checks:['subject','context','motion','captions','placement'].map(dimension=>({dimension,outcome:'pass',note:'Synthetic fixture; no claim of human viewing'}))};
}

test('legacy documents round-trip unchanged and mobile upgrade clears existing approval',()=>{
  const {legacy,mobile,context,geometry}=fixture();
  const approved=recordPortraitReview(legacy,context,geometry,{recipeSha256:portraitHash(legacy),reviewer:'Synthetic',decision:'accept',
    checks:['subject','context','motion'].map(dimension=>({dimension,outcome:'pass',note:'Fixture'}))});
  assert.equal(approved.schemaVersion,1);
  assert.deepEqual(portraitDocumentSchema.parse(approved),approved);
  const updated=draftMobilePortrait(approved,mobile);
  assert.equal(updated.schemaVersion,2);assert.equal(updated.review,null);
  assert.notEqual(portraitHash(updated),portraitHash(approved));
  assert(!checkPortrait(updated,context,geometry).canPrepare);
});

test('mobile preparation requires all five framing checks and the exact mobile hash',()=>{
  const {legacy,mobile,context,geometry,plan}=fixture(),doc=draftMobilePortrait(legacy,mobile);
  assert.throws(()=>recordPortraitReview(doc,context,geometry,{...review(doc),checks:review(doc).checks.slice(0,3)}));
  const accepted=recordPortraitReview(doc,context,geometry,review(doc));
  assert(checkPortrait(accepted,context,geometry).canPrepare);assertPortraitForPlan(accepted,plan);
  if(accepted.schemaVersion!==2)throw new Error('Expected mobile document');
  for(const mutate of [
    (d:typeof accepted)=>{d.mobile.profile.revision++;},
    (d:typeof accepted)=>{d.mobile.profile.safeArea.bottom=.25;},
    (d:typeof accepted)=>{d.mobile.captions!.font.sha256='e'.repeat(64);},
    (d:typeof accepted)=>{d.mobile.captions!.source.sha256='f'.repeat(64);},
    (d:typeof accepted)=>{d.mobile.captions!.cues[0].text='Edited caption';},
    (d:typeof accepted)=>{d.mobile.captions!.style.position='top';},
  ]) {
    const changed=structuredClone(accepted);mutate(changed);
    assert.notEqual(portraitHash(changed),portraitHash(accepted));
    assert.throws(()=>assertPortraitForPlan(changed,plan),/stale/);
    assert(!checkPortrait(changed,context,geometry).canPrepare);
  }
});

test('caption absence permits only the caption check to be not-applicable',()=>{
  const {legacy,mobile,context,geometry}=fixture();
  const doc=draftMobilePortrait(legacy,{...mobile,captions:null});
  const valid={...review(doc),checks:review(doc).checks.map(c=>c.dimension==='captions'?{...c,outcome:'not_applicable'}:c)};
  assert(checkPortrait(recordPortraitReview(doc,context,geometry,valid),context,geometry).canPrepare);
  assert.throws(()=>recordPortraitReview(doc,context,geometry,{...valid,checks:valid.checks.map(c=>c.dimension==='placement'?{...c,outcome:'not_applicable'}:c)}),/not-applicable/);
  const captioned=draftMobilePortrait(legacy,mobile);
  assert.throws(()=>recordPortraitReview(captioned,context,geometry,{...valid,recipeSha256:portraitHash(captioned)}),/not-applicable/);
});

test('mobile document rejects out-of-range captions, hidden V1 mobile fields and duplicate checks',()=>{
  const {legacy,mobile,context,geometry}=fixture();
  assert(!portraitDocumentSchema.safeParse({...legacy,mobile}).success);
  assert.throws(()=>draftMobilePortrait(legacy,{...mobile,captions:{...mobile.captions,cues:[{startFrame:119,endFrame:121,text:'Outside'}]}}));
  const doc=draftMobilePortrait(legacy,mobile),r=review(doc);r.checks[4]=r.checks[3];
  assert.throws(()=>recordPortraitReview(doc,context,geometry,r),/dimension/);
});

test('output sampling covers caption on/off frames without changing source-framing sampling',()=>{
  const {legacy,mobile,context,geometry}=fixture(),doc=draftMobilePortrait(legacy,mobile);
  assert.deepEqual(checkPortrait(doc,context,geometry).sampleFrames,checkPortrait(legacy,context,geometry).sampleFrames);
  const frames=portraitOutputSampleFrames(doc);
  for(const frame of [6,7,15,23,24])assert(frames.includes(frame));
  assert(frames.every(f=>f>=0&&f<120));
  assert.deepEqual(frames,[...new Set(frames)].sort((a,b)=>a-b));
});

test('legacy rendered reviews cannot certify mobile readability and captions',()=>{
  const base={packetSha256:'a'.repeat(64),reviewer:'Synthetic',decision:'accept',evidenceIds:['fixture'],coverage:'Contract test only'};
  const old={...base,checks:['story','speech','framing','continuity'].map(dimension=>({dimension,outcome:'pass',note:'Fixture'}))};
  assert(portraitRenderReviewV1Schema.safeParse(old).success);
  assert(!portraitRenderReviewV2Schema.safeParse(old).success);
  assert(portraitRenderReviewV2Schema.safeParse({...old,checks:[...old.checks,...['readability','captions','placement'].map(dimension=>({dimension,outcome:'pass',note:'Fixture'}))]}).success);
});

function namedFont(name:string) {
  const text=Buffer.from(name,'utf16le').swap16(),names=Buffer.alloc(18+text.length),font=Buffer.alloc(28+names.length);
  names.writeUInt16BE(1,2);names.writeUInt16BE(18,4);names.writeUInt16BE(3,6);names.writeUInt16BE(1,8);
  names.writeUInt16BE(0x409,10);names.writeUInt16BE(1,12);names.writeUInt16BE(text.length,14);text.copy(names,18);
  font.writeUInt32BE(0x10000,0);font.writeUInt16BE(1,4);font.write('name',12,'ascii');font.writeUInt32BE(28,20);font.writeUInt32BE(names.length,24);names.copy(font,28);
  return font;
}
test('font family lookup is bounded, reads Unicode names and rejects unsafe or malformed tables',()=>{
  assert.deepEqual(fontFamilies(namedFont('Fixture Sans')),['Fixture Sans']);
  assert.deepEqual(fontFamilies(namedFont('文字 Sans')),['文字 Sans']);
  assert.throws(()=>fontFamilies(namedFont('Injected,Style')),/family/);
  assert.throws(()=>fontFamilies(Buffer.from('not a font')),/font/);
  const truncated=namedFont('Fixture');truncated.writeUInt32BE(0xffffff,20);
  assert.throws(()=>fontFamilies(truncated),/table/);
});
