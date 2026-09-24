import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AgentEvidenceService} from '../src/agent.ts';
import {ReferenceAnalysisService} from '../src/reference.ts';
import {run} from '../src/media.ts';

test('every 60fps frame, one-frame flash, native geometry, paging, cache, comparison and tamper detection',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dapi-reference-')),path=join(dir,'flash.mp4'),cache=join(dir,'cache');
  await run('ffmpeg',['-v','error','-n','-f','lavfi','-i',"color=black:size=160x90:rate=60:duration=2,drawbox=x=20:y=30:w=40:h=20:color=white:t=fill:enable='eq(n,41)'",'-c:v','libx264','-crf','0',path]);
  const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network forbidden')};
  try{
    const agent=new AgentEvidenceService(cache),s=await agent.open({path,overviewCount:2}),service=new ReferenceAnalysisService(cache);
    await assert.rejects(service.extract(s.id,{start:0,end:2,maxFrames:10}),/Frame budget/);
    await assert.rejects(service.extract(s.id,{start:0,end:2,maxDecodedMiB:1}),/budget/);
    const result=await service.extract(s.id,{start:0,end:2});assert.equal(result.frameCount,120);assert.equal(result.externalModelCalls,0);assert.equal(result.cached,false);
    const packet=JSON.parse(await readFile(result.manifestPath,'utf8'));assert.equal(packet.frames.length,120);assert.equal(packet.source.width,160);assert.equal(packet.source.height,90);
    const narrow=await service.extract(s.id,{start:41/60-.00001,end:41/60+.00001});assert.equal(narrow.frameCount,1,'Sub-tick bounds around a real frame must not round the interval away');
    assert(packet.frames[41].change.meanAbsoluteDifference>.02);assert(packet.frames[42].change.meanAbsoluteDifference>.02);assert.equal(packet.frames[40].change.meanAbsoluteDifference,0);
    assert.equal(packet.frames[0].sha256,packet.frames[40].sha256);assert.notEqual(packet.frames[41].sha256,packet.frames[40].sha256);
    const first=await service.page(s.id,result.id,{from:0,count:24});assert.equal(first.artifacts.length,24);assert.equal(first.nextFrom,24);assert.equal(first.inspected,false);
    assert.equal((await service.page(s.id,result.id,{from:119,count:24})).nextFrom,null);
    await assert.rejects(service.page(s.id,result.id,{from:120}),/final/);
    await assert.rejects(service.page(s.id,result.id,{count:49}));
    assert.equal((await service.extract(s.id,{start:0,end:2})).cached,true);
    const same=await service.compare(s.id,result.id,s.id,result.id);assert.equal(same.pairs.length,24);assert.equal(same.nextFrom,24);assert(same.pairs.every(p=>'meanAbsoluteDifference' in p&&p.meanAbsoluteDifference===0));
    const shifted=await service.compare(s.id,result.id,s.id,result.id,{offsetSeconds:.1,from:30,count:24});assert(shifted.pairs.some(p=>'meanAbsoluteDifference' in p&&p.meanAbsoluteDifference!>0));
    const tail=await service.compare(s.id,result.id,s.id,result.id,{offsetSeconds:.1,from:114,count:6});assert(tail.pairs.some(p=>p.candidateFrame===null));assert.equal(tail.nextFrom,null);
    const note={sequenceSha256:result.sequenceSha256,author:'Synthetic integration only',inspectedFrames:[40,41,42],elements:[{id:'flash',label:'One-frame flash',observation:'Fixture contract, no human viewing claim',inference:'Known test input',uncertainty:'Not real footage',phases:[{label:'flash',startFrame:41,endFrame:42}],keyframes:[]}]};
    const recorded=await service.annotate(s.id,result.id,note);assert.equal(recorded.status,'agent_reported');assert.equal(recorded.coverage.inspectedFrames,3);
    assert.equal((await agent.read(s.id)).inspections.length,1,'Dense evidence must not exhaust sparse artifact budget');
    await assert.rejects(service.annotate(s.id,result.id,{...note,inspectedFrames:[40]}),/endpoints/);
    const artifact=first.artifacts[0];await writeFile(artifact.path,'tampered');await assert.rejects(service.page(s.id,result.id,{from:0,count:1}),/changed/);
    await assert.rejects(service.compare(s.id,result.id,s.id,result.id),/changed/);
    const before=await stat(path);await utimes(path,new Date(),new Date(before.mtimeMs+10000));await assert.rejects(service.page(s.id,result.id),/Source changed/);
  }finally{globalThis.fetch=originalFetch;}
});

test('VFR positive-origin selection equals independent full-source decoder timestamps',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'dapi-reference-vfr-')),path=join(dir,'vfr.mp4'),cache=join(dir,'cache');
  await run('ffmpeg',['-v','error','-n','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=3','-vf',"select='lt(n,30)+not(mod(n,3))',setpts=PTS+7/TB",'-copyts','-fps_mode','passthrough','-c:v','libx264',path]);
  const s=await new AgentEvidenceService(cache).open({path,overviewCount:2}),service=new ReferenceAnalysisService(cache);
  const result=await service.extract(s.id,{start:.31,end:2.73}),packet=JSON.parse(await readFile(result.manifestPath,'utf8'));
  const decoded=JSON.parse(await run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp,best_effort_timestamp_time','-of','json',path]));
  const expected=decoded.frames.filter((f:{best_effort_timestamp_time:string})=>{const t=Number(f.best_effort_timestamp_time)-s.source.startTime;return t>=.31&&t<2.73;});
  assert.deepEqual(packet.frames.map((f:{pts:number})=>f.pts),expected.map((f:{best_effort_timestamp:number})=>f.best_effort_timestamp));
  const gaps=packet.frames.slice(1).map((f:{time:number},i:number)=>f.time-packet.frames[i].time);assert(Math.max(...gaps)-Math.min(...gaps)>.05);
  assert(packet.frames.every((f:{time:number})=>f.time>=.31&&f.time<2.73));
  await assert.rejects(service.extract(s.id,{start:0,end:99}),/30 seconds/);
  await assert.rejects(service.extract(s.id,{start:0,end:1},AbortSignal.abort()),/abort/i);
});
