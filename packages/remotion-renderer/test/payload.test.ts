import assert from 'node:assert/strict';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';
import {spring} from 'remotion';
import {sceneFixture} from '../../editing-playbook/test/scene-fixture.ts';
import {adaptScene,scenePoseAt} from '../../editing-playbook/src/scene-motion.ts';
import {buildPayload,remotionOptionsSchema} from '../src/payload.ts';
import {drawingModule} from '../src/runtime.ts';
import {MotionCatalog} from '../../editing-playbook/src/motion-catalog.ts';
import {catalogRequest} from '../../editing-playbook/test/motion-catalog-fixture.ts';
import {fileURLToPath} from 'node:url';

test('payload is data-only, preserves original words/timing, resolves cues and omits private paths',()=>{
  const {recipe,input}=sceneFixture();recipe.compositor='layered-v2';
  const original=structuredClone(input),a=adaptScene(recipe,input);
  const p=buildPayload(a,{'one/main':`asset-${'a'.repeat(64)}.mp4`},{captionEntrance:'spring'});
  assert.deepEqual(input,original);assert.deepEqual(p.input.transcript.words,input.transcript.words);
  assert.equal(p.input.audio.start,10);assert.equal(p.duration,2);assert.equal(p.remotion.captionEntrance,'spring');
  assert.doesNotMatch(JSON.stringify(p),/synthetic\/source|sessionId|permission|cache|sourceSha256/);
});
test('unsafe media, unsupported legacy and unknown renderer options fail closed',()=>{
  const {recipe,input}=sceneFixture(),a=adaptScene(recipe,input);
  assert.throws(()=>buildPayload(a,{}),/layered-v2/);recipe.compositor='layered-v2';
  for(const path of ['https://evil.test/a.mp4','../../secret.mp4','file:///C:/secret.mp4','asset-x.mp4'])
    assert.throws(()=>buildPayload(adaptScene(recipe,input),{'one/main':path}),/unsafe/);
  assert.throws(()=>remotionOptionsSchema.parse({concurrency:20}));
  assert.throws(()=>remotionOptionsSchema.parse({captionEntrance:'fetch()'}));
  assert.throws(()=>remotionOptionsSchema.parse({code:'execute'}));
});
test('frame seeking matches the existing scene curves; spring captions settle without changing text',()=>{
  const code=drawingModule().replace("import {spring} from 'remotion';",'').replace(/export /g,'').replace(/\{worldScene,exposureTimes,drawBlockV2,drawSceneCaptions\};/,'');
  const runtime=runInNewContext(code+';({poseScene,captionScale})',{spring});
  const {recipe}=sceneFixture(),l=recipe.templates[0].layers[0];
  l.keys=[{at:0,pose:{x:0},easing:{kind:'spring',cycles:1,damping:6}},{at:1,pose:{x:1},easing:'linear'}];
  for(const t of [.8,0,.5,.1,1,.1])assert.equal(runtime.poseScene(l,t).x,scenePoseAt(l,t).x);
  assert.equal(runtime.captionScale(0),.84);assert.ok(Math.abs(runtime.captionScale(2)-1)<.001);
  assert.ok(runtime.captionScale(.15)>.84);assert.ok(runtime.captionScale(.15)<=1.02);
});

test('all pinned catalog designs adapt to the Remotion payload across three aspect ratios',async()=>{
  const catalog=new MotionCatalog(fileURLToPath(new URL('../../../motion-catalog/',import.meta.url)));
  for(const item of await catalog.list()){
    const entry=await catalog.get(item.selector);
    for(const [width,height]of [[1080,1920],[1080,1080],[1920,1080]]){
      const request=catalogRequest(entry);request.input.width=width;request.input.height=height;
      const result=await catalog.apply(request),adaptation=adaptScene(result.recipe,result.input);
      const media=Object.fromEntries(result.input.shots.flatMap(s=>s.bindings.map(b=>[`${s.id}/${b.slot}`,`asset-${'b'.repeat(64)}.${b.assetId==='still'?'png':'mp4'}`])));
      const p=buildPayload(adaptation,media);
      assert.equal(p.shots.length,1);assert.equal(p.width,width);assert.equal(p.height,height);
      assert.equal(p.remotion.captionEntrance,'recipe');
      assert.ok(p.shots[0].template.layers.every(l=>l.keys.every(k=>typeof k.at==='number')));
    }
  }
});
