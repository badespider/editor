import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MotionCatalog,composeMotionCatalog} from '../src/motion-catalog.ts';
import {adaptScene,reviewScene} from '../src/scene-motion.ts';
import {catalogRequest} from './motion-catalog-fixture.ts';
import {styleGuideFixture} from '../../video-understanding/test/style-fixture.ts';
import {styleDigest} from '@diffusionstudio/video-understanding/reference-style';
import {portableDesign} from '@diffusionstudio/video-understanding/reference-design';
import {designFixture} from '../../video-understanding/test/design-fixture.ts';

const shared=new MotionCatalog(fileURLToPath(new URL('../../../motion-catalog/',import.meta.url)));
async function fixture(){
  const catalog=new MotionCatalog(await mkdtemp(join(tmpdir(),'motion-style-'))),base=await shared.get('word-stack@1');
  const design=designFixture();design.features.forEach(f=>f.target='ONLY_THE_ORIGINAL_REFERENCE_HEADLINE');
  const entry={...base,designKnowledge:[portableDesign(design)]};await catalog.add(entry);
  const guide=styleGuideFixture(),profile=await catalog.captureStyle({value:guide,sha256:styleDigest(guide),status:'agent_reported',externalModelCalls:0,safeToAutoEdit:false},
    [{template:'word-stack@1',purpose:'Explain new words',useWhen:'Speech-led explanation',avoidWhen:'A diagram would explain it better'}]);
  const request=catalogRequest(entry);request.style={profile:'test-style@1',applications:guide.rules.map(r=>({ruleId:r.id,shotIds:['one'],rationale:'New explanation',adaptation:'New words and footage'}))};
  return {catalog,entry,profile,request};
}

test('versioned styles carry generalized rules while editable recipes bind different content',async()=>{
  const {catalog,entry,profile,request}=await fixture(),saved=await catalog.addStyle(profile);
  assert.equal((await catalog.listStyles('synthetic'))[0].selector,'test-style@1');
  assert.deepEqual(await catalog.getStyle('test-style@1'),profile);
  await assert.rejects(catalog.addStyle(profile),/EEXIST/);
  const before=structuredClone(request),result=await catalog.apply(request);
  assert.deepEqual(request,before);assert.equal(result.recipe.style.guide?.guideSha256,styleDigest(profile.guide));
  assert.equal(result.recipe.style.criteria.length,8);assert.equal(result.input.shots[0].criteria.length,8);
  assert.doesNotMatch(JSON.stringify(result.recipe.style.criteria),/ONLY_THE_ORIGINAL_REFERENCE_HEADLINE/);
  assert.deepEqual(result.input.audio,request.input.audio);assert.deepEqual(result.input.transcript,request.input.transcript);
  assert.equal(result.recipe.templates[0].layers.find(l=>l.kind==='video')?.slot,'picture');
  assert.equal(composeMotionCatalog([entry],{...request,style:undefined}).recipe.style.criteria.length,8,'Direct use retains detailed original technique criteria');
  const stored=JSON.parse(await readFile(saved.path,'utf8'));stored.entry.guide.rules[0].principle='Tampered';
  await writeFile(saved.path,JSON.stringify(stored));await assert.rejects(catalog.getStyle('test-style@1'),/fingerprint/);
});

test('style rules, shot decisions and pinned recipe membership cannot silently disappear',async()=>{
  const {catalog,entry,profile,request}=await fixture();await catalog.addStyle(profile);
  const applied=await catalog.apply(request);
  const dropped=structuredClone(applied.recipe);dropped.style.criteria.pop();assert.throws(()=>adaptScene(dropped,applied.input),/style rule/);
  const weakened=structuredClone(applied.recipe);weakened.style.criteria.at(-1)!.essential=false;assert.throws(()=>adaptScene(weakened,applied.input),/style rule/);
  const mapping=structuredClone(applied.input);mapping.shots[0].criteria.pop();assert.throws(()=>adaptScene(applied.recipe,mapping),/essential|mapping/);
  const unknown=structuredClone(request);unknown.style!.applications[0].shotIds=['missing'];assert.throws(()=>composeMotionCatalog([entry],unknown,profile),/essential|unknown shot/);
  assert.throws(()=>composeMotionCatalog([{...entry,description:'Changed recipe'}],request,profile),/pinned member/);
  request.style!.applications[0].shotIds=[];
  const omitted=composeMotionCatalog([entry],request,profile);assert.match(omitted.recipe.style.criteria[4].requirement,/Proposed omission/);
  const adaptation=adaptScene(omitted.recipe,omitted.input),hash='a'.repeat(64),finding={status:'pass',note:'Synthetic contract only',renderEvidenceIds:['new-frame'],referenceEvidenceIds:[]};
  const expected={adaptation,evidence:[{id:'new-frame',role:'render' as const,kind:'frame' as const}],revisionSha256:hash,renderSha256:hash,inspectionSha256:hash,revision:0,maxCorrections:2};
  const review={revisionSha256:hash,renderSha256:hash,inspectionSha256:hash,reviewer:'Synthetic',inspectedEvidenceIds:['new-frame'],
    criteria:adaptation.recipe.style.criteria.map(c=>({...finding,criterionId:c.id})),
    checks:['readability','continuity','speech_sync','audio'].map(kind=>({...finding,kind,status:['audio','speech_sync'].includes(kind)?'unknown':'pass'}))};
  assert.equal(reviewScene(review,expected).styleMatch,'agent_reported_template_conformance');
  review.criteria.pop();assert.throws(()=>reviewScene(review,expected),/criterion|Criteria|Every/);
});
