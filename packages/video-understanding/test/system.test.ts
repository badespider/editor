import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EditorUnderstandingService,understandingRequestSchema} from '../src/system.ts';
import {UnderstandingService} from '../src/service.ts';
import {run} from '../src/media.ts';
import type {AnalyzeRequest,Job} from '../src/types.ts';

test('public editor default performs the complete evidence loop without constructing cloud or fetching',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dapi-system-'));
 const path=join(dir,'source.mp4');
 await run('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x120:rate=10:duration=2',
  '-f','lavfi','-i','sine=duration=2','-c:v','libx264','-c:a','aac','-n',path]);
 const noCloud=()=>{throw Error('Cloud adapter must never be constructed');};
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw Error('Network is forbidden');};
 const service=new EditorUnderstandingService(join(dir,'cache'),noCloud);
 try{
  const session=await service.understand({path,overviewCount:2}); // deliberately omit provider
  assert.equal(session.kind,'agent-video-evidence'); assert.equal(session.externalModelCalls,0);
  const inspection=await service.inspect(session.id,{start:.1,end:1.5,count:3,audio:true,clip:true});
  const transcript=await service.importTranscript(session.id,{sourceSha256:session.source.sha256,origin:'synthetic test',verification:'unverified_transcript',segments:[{start:.2,end:1,text:'test phrase'}]});
  const frame=inspection.artifacts.find(a=>a.kind==='frame')!;
  const report={sourceSha256:session.source.sha256,author:'agent one',observations:[{id:'pattern',start:.1,end:1.5,observation:'Test pattern visible',modalities:['visual','transcript'],evidenceIds:[frame.id,transcript.id]}]};
  await service.observe(session.id,report);
  const second=new EditorUnderstandingService(join(dir,'cache'),noCloud);
  const resumed=await second.dossier(session.id,'pattern');
  assert.equal(resumed.observations[0].author,'agent one'); assert.equal(resumed.safeToAutoEdit,false);
  assert.equal((await second.inspect(session.id,{start:.1,end:1.5,count:3,audio:true,clip:true})).cached,true);
  await assert.rejects(second.observe(session.id,{...report,observations:[{...report.observations[0],id:'invalid',evidenceIds:['invented']}]}),/Unknown evidence/);
  service.stop(); await assert.rejects(service.understand({path}),/abort/i);
  second.stop();
 }finally{service.stop();globalThis.fetch=original;}
});

test('provider selection cannot silently upgrade default requests to Gemini',async()=>{
 const service=new EditorUnderstandingService(undefined,()=>{throw Error('Factory must not be called');});
 for(const request of [
  {path:'not-accessed',allowUpload:true}, {path:'not-accessed',model:'gemini-test'},
  {path:'not-accessed',provider:'agent',allowUpload:true}, {path:'not-accessed',provider:'unknown'},
 ])assert.equal(understandingRequestSchema.safeParse(request).success,false);
 await assert.rejects(service.understand({path:'not-accessed',provider:'gemini'}),/consent/);
 assert.equal(understandingRequestSchema.parse({path:'not-accessed'}).provider,'agent');
 service.stop();
});

test('explicit Gemini routing preserves job contract using a non-network fake',async()=>{
 let calls=0;
 class FakeCloud extends UnderstandingService{
  override async start(input:AnalyzeRequest):Promise<Job>{
   calls++;assert.equal(input.allowUpload,true);
   return {id:'fake',state:'queued',stage:'test',createdAt:'test',updatedAt:'test'};
  }
 }
 const service=new EditorUnderstandingService(undefined,()=>new FakeCloud());
 const result=await service.understand({path:'not-accessed',provider:'gemini',allowUpload:true});
 assert.equal(result.state,'queued');assert.equal(calls,1);service.stop();
});
