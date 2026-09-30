import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderSceneSegments, verifySceneSegment, type SceneSegment } from '../src/scene-cache.ts';
import { runMedia } from '../src/media-process.ts';

// Real file/codec/cache regression with an explicit synthetic renderer adapter.
// The separate desktop smoke test exercises the actual composition renderer.
test('cache reuses checked bytes, invalidates local edits, and refuses corruption or interrupted attempts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'scene-cache-test-')),audio=join(root,'audio.wav');
  await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i','sine=frequency=400:sample_rate=48000:duration=1','-ac','2',audio]);
  const segments:SceneSegment[]=[{shotId:'one',key:'a'.repeat(64),frames:6,width:240,height:240,code:'synthetic'},
    {shotId:'two',key:'b'.repeat(64),frames:6,width:240,height:240,code:'synthetic'}];
  const calls:string[]=[],render=async({output,segment}:{output:string;segment:SceneSegment})=>{
    calls.push(segment.shotId);await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i',
      `color=c=red:s=240x240:r=30:d=${segment.frames/30}`,'-an','-c:v','libx264','-pix_fmt','yuv420p',output]);
  };
  let index=0;
  async function run() {
    const directory=join(root,`revision-${index++}`);await mkdir(directory);
    return renderSceneSegments({root,directory,segments,audio,duration:.4,render,
      verify:path=>verifySceneSegment(path,{frames:12,width:240,height:240})});
  }
  const first=await run();assert.equal(first.renderedScenes,2);assert.deepEqual(calls,['one','two']);
  segments[0].key='c'.repeat(64);const second=await run();assert.equal(second.renderedScenes,1);assert.equal(second.reusedScenes,1);
  const third=await run();assert.equal(third.renderedScenes,0);assert.equal(third.reusedScenes,2);assert.equal(calls.length,3);
  await writeFile(join(root,'scene-cache',segments[0].key,'preview_DRAFT.mp4'),'corrupted fixture');
  await assert.rejects(run(),/Cached scene changed/);assert.equal(calls.length,3);
  segments[0].key='d'.repeat(64);await mkdir(join(root,'scene-cache',segments[0].key));
  await assert.rejects(run(),/EEXIST/);assert.equal(calls.length,3);
});

test('failed verification cannot publish a cache receipt or final output',async()=>{
  const root=await mkdtemp(join(tmpdir(),'scene-cache-failure-')),directory=join(root,'revision');await mkdir(directory);
  const segment={shotId:'one',key:'e'.repeat(64),frames:6,width:240,height:240,code:'synthetic'};
  await assert.rejects(renderSceneSegments({root,directory,segments:[segment],audio:join(root,'unused.wav'),duration:.2,
    render:async({output})=>{await writeFile(output,'not an MP4');},verify:async()=>({technicalPass:false,sha256:'f'.repeat(64)})}),/Media process exited/);
  const { stat }=await import('node:fs/promises');
  await assert.rejects(stat(join(root,'scene-cache',segment.key,'receipt.json')), {code:'ENOENT'});
  await assert.rejects(stat(join(directory,'preview_DRAFT.mp4')), {code:'ENOENT'});
});
