import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentEvidenceService } from '../src/agent.ts';
import { run, probe } from '../src/media.ts';

test('agent evidence: real media, persistence, provenance, budgets and source changes; no provider', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dapi-agent-test-'));
  const path = join(dir, 'source.mp4');
  await run('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=10:duration=3',
    '-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac','-n',path]);
  const service = new AgentEvidenceService(join(dir,'cache'));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network is forbidden in agent mode'); };
  try {
    const session = await service.open({path, overviewCount:3});
    assert.equal(session.externalModelCalls,0);
    assert.equal(session.safeToAutoEdit,false);
    assert.equal(session.audio.digitalSilence,false);
    assert.equal(session.inspections[0].artifacts.length,3);
    assert(!((await readdir(join(service.directory,session.id))).includes('source.mp4')));
    for(const frame of session.inspections[0].artifacts) {
      assert(frame.start + 1e-6 >= frame.requestedTime!);
      assert(frame.start - frame.requestedTime! < .101);
    }
    const inspection = await service.inspect(session.id,{start:.35,end:1.8,count:3,clip:true,audio:true});
    assert.equal(inspection.cached,false);
    assert.equal(inspection.artifacts.length,5);
    const clip = inspection.artifacts.find(a=>a.kind==='clip')!;
    assert(Math.abs((await probe(clip.path)).duration-1.45)<.15);
    const again = await service.inspect(session.id,{start:.35,end:1.8,count:3,clip:true,audio:true});
    assert.equal(again.cached,true);
    assert.equal((await service.read(session.id)).revision,2);
    const payload={sourceSha256:session.source.sha256,origin:'test ASR',verification:'unverified_transcript',segments:[{start:.4,end:1.5,text:'a test sentence'}]};
    await assert.rejects(service.importTranscript(session.id,{...payload,sourceSha256:'0'.repeat(64)}),/fingerprint/);
    await assert.rejects(service.importTranscript(session.id,{...payload,segments:[{start:2,end:4,text:'bad'}]}),/interval/);
    const transcript = await service.importTranscript(session.id,payload);
    await service.importTranscript(session.id,payload);
    assert.equal((await service.read(session.id)).transcripts.length,1);
    const notes={sourceSha256:session.source.sha256,author:'test agent',observations:[{
      id:'note1',start:.35,end:1.8,observation:'Moving test pattern',modalities:['visual','transcript'],evidenceIds:[clip.id,transcript.id]
    }]};
    await assert.rejects(service.observe(session.id,{...notes,observations:[{...notes.observations[0],evidenceIds:['unknown']}]}),/Unknown/);
    await assert.rejects(service.observe(session.id,{...notes,observations:[{...notes.observations[0],evidenceIds:[transcript.id]}]}),/Visual/);
    const recorded = await service.observe(session.id,notes);
    assert.equal(recorded[0].status,'agent_reported');
    assert.equal(recorded[0].safeToAutoEdit,false);
    await assert.rejects(service.observe(session.id,notes),/Duplicate/);
    const fresh = new AgentEvidenceService(join(dir,'cache'));
    assert.equal((await fresh.search(session.id,'test pattern')).observations.length,1);
    assert.equal((await fresh.open({path,overviewCount:3})).observations.length,1);
    await assert.rejects(service.inspect(session.id,{times:[3]}),/before source end/);
    await assert.rejects(service.inspect(session.id,{start:0,end:4}),/duration/);
    await assert.rejects(service.read('../escape'),/Invalid/);
    await assert.rejects(service.inspect(session.id,{times:[1]},AbortSignal.abort()),/abort/i);
    await service.inspect(session.id,{times:[1]}); // lock released after cancellation
    await utimes(path,new Date(),new Date(Date.now()+10000));
    await assert.rejects(service.inspect(session.id,{times:[1]}),/Source changed/);
  } finally { globalThis.fetch = originalFetch; }
});

test('agent evidence: variable rate, positive video PTS, and delayed audio share one origin', async () => {
  const dir = await mkdtemp(join(tmpdir(),'dapi-agent-pts-'));
  const path=join(dir,'offset.mp4');
  await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=10:duration=3',
    '-f','lavfi','-i','sine=frequency=500:duration=2','-filter_complex',
    "[0:v]select='lt(n,10)+not(mod(n,3))',setpts=PTS+7/TB[v];[1:a]asetpts=PTS+8/TB[a]",
    '-map','[v]','-map','[a]','-fps_mode','vfr','-c:v','libx264','-c:a','aac','-copyts','-n',path]);
  const service=new AgentEvidenceService(join(dir,'cache'));
  const s=await service.open({path,overviewCount:3});
  assert(s.source.startTime>=6.9);
  const sample=await service.inspect(s.id,{start:0,end:2,count:3,audio:true,clip:true,native:true});
  const frame=sample.artifacts.filter(a=>a.kind==='frame')[1];
  assert(frame.start>=frame.requestedTime! && frame.start-frame.requestedTime! <.31);
  const audio=sample.artifacts.find(a=>a.kind==='audio')!;
  const stats=await run('ffmpeg',['-hide_banner','-i',audio.path,'-af','silencedetect=noise=-45dB:d=0.1','-f','null','-']);
  const silenceEnd=Number(/silence_end: ([\d.]+)/.exec(stats)?.[1]);
  assert(silenceEnd>.85 && silenceEnd<1.1, `Delayed audio was shifted: ${silenceEnd}`);
});

test('agent evidence: no-audio sources cannot acquire speech or audio claims', async () => {
  const dir=await mkdtemp(join(tmpdir(),'dapi-agent-silent-'));
  const path=join(dir,'silent.mp4');
  await run('ffmpeg',['-v','error','-f','lavfi','-i','color=red:size=160x120:rate=10:duration=2','-c:v','libx264','-n',path]);
  const service=new AgentEvidenceService(join(dir,'cache'));
  const s=await service.open({path,overviewCount:2});
  assert.equal(s.audio.digitalSilence,true);
  await assert.rejects(service.inspect(s.id,{start:0,end:1,audio:true}),/no audio/);
  await assert.rejects(service.importTranscript(s.id,{sourceSha256:s.source.sha256,origin:'bad transcript',verification:'unverified_transcript',segments:[{start:0,end:1,text:'phantom speech'}]}),/silent audio/);
  const result=await service.inspect(s.id,{start:0,end:1,count:1,clip:true});
  assert.equal((await probe(result.artifacts.find(a=>a.kind==='clip')!.path)).hasAudio,false);
});
