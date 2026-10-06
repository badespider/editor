import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {motionStyleGuideSchema,styleGuideCriteria,validateStyleGuide,draftStyleGuide} from '../src/reference-style.ts';
import {ReferenceAnalysisService} from '../src/reference.ts';
import {AgentEvidenceService} from '../src/agent.ts';
import {run} from '../src/media.ts';
import {styleGuideFixture,styleScenesFixture} from './style-fixture.ts';
import {designFixture} from './design-fixture.ts';

test('style rules bind distinct scene evidence, repetition confidence and the correct modality',()=>{
  const scenes=styleScenesFixture(),guide=styleGuideFixture(scenes);
  assert.deepEqual(validateStyleGuide(guide,scenes),guide);
  assert.equal(draftStyleGuide(scenes).rules.length,0,'Generalization must be authored, not copied from literal targets');
  const sameRole=structuredClone(guide);sameRole.scenes.forEach(s=>s.role='same');assert.throws(()=>motionStyleGuideSchema.parse(sameRole),/distinct scene/);
  const sameSequence=structuredClone(guide);sameSequence.scenes[1].sequenceSha256=sameSequence.scenes[0].sequenceSha256;assert.throws(()=>motionStyleGuideSchema.parse(sameSequence),/Duplicate style sequence/);
  const unsupported=structuredClone(guide);unsupported.rules[0].evidence.pop();assert.throws(()=>validateStyleGuide(unsupported,scenes),/Repeated/);
  const wrong=structuredClone(guide);wrong.rules[0].evidence[0].featureId='feature-1';assert.throws(()=>validateStyleGuide(wrong,scenes),/incompatible/);
  const audio=structuredClone(guide);audio.rules[0].verification='audio-listening';assert.throws(()=>validateStyleGuide(audio,scenes),/audio-listening/);
  const changed=structuredClone(guide);changed.scenes[0].analysisSha256='f'.repeat(64);assert.throws(()=>validateStyleGuide(changed,scenes),/provenance/);
});

test('all rule decisions survive into fresh review, including deliberate omissions',()=>{
  const guide=styleGuideFixture(),applications=guide.rules.map(r=>({ruleId:r.id,shotIds:['new-shot'],rationale:'New subject explanation',adaptation:'New words and cues'}));
  applications[0].shotIds=[];applications[0].rationale='This shot contains live action without a diagram';
  const criteria=styleGuideCriteria(guide,applications);
  assert.match(criteria[0].requirement,/Proposed omission/);assert.equal(criteria[0].essential,true);
  assert.match(criteria[1].requirement,/New words and cues/);assert(criteria.every(c=>!c.evidence.length));
  assert.throws(()=>styleGuideCriteria(guide,applications.slice(1)),/exactly once|Too small/);
  const duplicate=structuredClone(applications);duplicate[1]=duplicate[0];assert.throws(()=>styleGuideCriteria(guide,duplicate),/exactly once/);
});

test('local style service seals multiple scene designs, checks native evidence, overlap and sealed data',async()=>{
  const root=await mkdtemp(join(tmpdir(),'reference-style-')),path=join(root,'source.mp4'),cache=join(root,'cache');
  await run('ffmpeg',['-v','error','-n','-f','lavfi','-i','testsrc2=size=160x90:rate=6:duration=3','-c:v','libx264',path]);
  const agent=new AgentEvidenceService(cache),session=await agent.open({path,overviewCount:1}),service=new ReferenceAnalysisService(cache),sources=[],scenes=[];
  for(let i=0;i<3;i++){
    const seq=await service.extract(session.id,{start:i,end:i+1}),analysis=designFixture(seq.frameCount,seq.sequenceSha256),record=await service.design(session.id,seq.id,analysis);
    sources.push({id:`scene-${i}`,role:`role-${i}`,sessionId:session.id,sequenceId:seq.id,designSha256:record.sha256});
    scenes.push({id:`scene-${i}`,role:`role-${i}`,analysis});
  }
  const guide=styleGuideFixture(scenes),request={sources,guide},record=await service.style(request);
  assert.equal(record.externalModelCalls,0);assert.equal(record.safeToAutoEdit,false);
  assert.deepEqual(await service.style(request),record);assert.equal((await service.styleTemplate(sources)).scenes.length,3);
  const overlap=await service.extract(session.id,{start:.5,end:1.5}),overlapAnalysis=designFixture(overlap.frameCount,overlap.sequenceSha256);
  const overlapRecord=await service.design(session.id,overlap.id,overlapAnalysis);
  await assert.rejects(service.styleTemplate([sources[0],{...sources[1],sequenceId:overlap.id,designSha256:overlapRecord.sha256},sources[2]]),/nonoverlapping/);
  const manifest=await service.sequence(session.id,sources[2].sequenceId);
  await writeFile(join(cache,'agent',session.id,'references',sources[2].sequenceId,manifest.frames[0].path),'modified evidence');
  await assert.rejects(service.style(request),/artifact changed/);
});
