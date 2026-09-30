import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { adaptScene } from '../src/scene-motion.ts';
import { preflightScene, scanSceneFrames, sceneWorldPose } from '../src/scene-quality.ts';
import { sceneSegments } from '../src/scene-cache.ts';
import { sceneDrawingRuntime } from '../src/scene-composition.ts';
import { layeredRuntime } from '../src/scene-layered.ts';
import { sceneFixture } from './scene-fixture.ts';

function twoShots() {
  const x=sceneFixture();x.recipe.compositor='layered-v2';
  x.input.shots[0].end=1;
  x.input.shots.push({...structuredClone(x.input.shots[0]),id:'two',start:1,end:2});
  x.input.captions=[{id:'first',start:0,end:.6,words:[{wordId:'w1',row:0,scale:1}]},
    {id:'cross-cut',start:.7,end:2,words:[{wordId:'w2',row:0,scale:1}]}];
  return x;
}
const prepared={audio:'/test/narration.wav',media:{'one/main':'/test/a.mp4','two/main':'/test/b.mp4'}};
const hashes={'/test/a.mp4':'a'.repeat(64),'/test/b.mp4':'b'.repeat(64)};

test('preflight finds swept heading occlusion and includes both sides of every scene cut',()=>{
  const x=twoShots(),p=x.recipe.templates[0].layers[0].pose;
  x.recipe.templates[0].layers.unshift({id:'heading',kind:'text',text:'READ ME',font:x.recipe.caption.font,
    pose:{...p,x:.2,y:.3,width:.25,height:.1},keys:[{at:1,pose:{x:.8},easing:'linear'}],fill:'#FFFFFF',stroke:'#FFFFFF',strokeWidth:0,shadow:0});
  const q=preflightScene(adaptScene(x.recipe,x.input));
  assert.equal(q.frames,60);assert(q.findings.some(f=>f.code==='text_occlusion_risk'));
  for(const frame of [0,1,28,29,30,31,32,58,59])assert(q.boundaryFrames.includes(frame));
  assert(q.expectedMotionFrames.includes(15));assert(!q.expectedMotionFrames.includes(30),'A cut is not a frozen-motion candidate');
});

test('quality group transforms match the actual compositor at every sampled frame',()=>{
  const x=twoShots(),layer=x.recipe.templates[0].layers[0];layer.group='camera';
  const groups=[{id:'camera',pose:{...layer.pose,width:1.3,height:1.3,rotation:27},keys:[]}];
  for(let f=0;f<60;f++)assert.deepEqual(sceneWorldPose(layer,f/60,groups,1080,1920),
    JSON.parse(JSON.stringify(runInNewContext(sceneDrawingRuntime+layeredRuntime+';worldScene(layer,t,groups,1080,1920)',{layer,t:f/60,groups}))));
});

test('stalled-motion hints ignore intentional holds and reject truncated pixel buffers',()=>{
  const x=twoShots(),a=adaptScene(x.recipe,x.input),q=preflightScene(a),pixels=new Uint8Array(60*4);
  assert.equal(scanSceneFrames(pixels,4,q).suspectedStalls.length,0);
  q.expectedMotionFrames=[1,2,3,8];
  assert.deepEqual(scanSceneFrames(pixels,4,q).suspectedStalls,[{firstFrame:1,lastFrame:3}]);
  for(let f=0;f<60;f++)pixels.fill(f*3,f*4,(f+1)*4);
  assert.equal(scanSceneFrames(pixels,4,q).suspectedStalls.length,0);
  assert.throws(()=>scanSceneFrames(pixels.subarray(1),4,q),/count/);
});

test('scene cache invalidates only captions in affected scenes, including cross-cut groups',()=>{
  const x=twoShots(),base=sceneSegments(adaptScene(x.recipe,x.input),prepared,hashes,'renderer-1');
  x.input.captions[0].words[0].color='#FF0000';
  let changed=sceneSegments(adaptScene(x.recipe,x.input),prepared,hashes,'renderer-1');
  assert.notEqual(base[0].key,changed[0].key);assert.equal(base[1].key,changed[1].key);
  x.input.captions[1].words[0].scale=1.5;
  changed=sceneSegments(adaptScene(x.recipe,x.input),prepared,hashes,'renderer-1');
  assert.notEqual(base[0].key,changed[0].key);assert.notEqual(base[1].key,changed[1].key);
});

test('scene cache binds media bytes and renderer implementation but ignores revision paths',()=>{
  const x=twoShots(),a=adaptScene(x.recipe,x.input),base=sceneSegments(a,prepared,hashes,'renderer-1');
  const relocated={audio:'/new/audio.wav',media:{'one/main':'/new/a.mp4','two/main':'/new/b.mp4'}};
  assert.deepEqual(sceneSegments(a,relocated,{'/new/a.mp4':hashes['/test/a.mp4'],'/new/b.mp4':hashes['/test/b.mp4']},'renderer-1').map(s=>s.key),base.map(s=>s.key));
  assert(sceneSegments(a,prepared,hashes,'renderer-2').every((s,i)=>s.key!==base[i].key));
  const changed=sceneSegments(a,prepared,{...hashes,'/test/a.mp4':'c'.repeat(64)},'renderer-1');
  assert.notEqual(changed[0].key,base[0].key);assert.equal(changed[1].key,base[1].key);
});

test('segment clock preserves captions already revealed before the cut',()=>{
  const x=twoShots(),segments=sceneSegments(adaptScene(x.recipe,x.input),prepared,hashes,'renderer');
  const data=JSON.parse(segments[1].code.match(/const data=(.*);\n/)![1]);
  assert(Math.abs(data.input.captions[0].start+.3)<1e-12);assert.equal(data.input.audio.start,11);
  assert.equal(data.input.transcript.words[0].start,10.8);
  const labels:string[]=[],ctx={font:'',measureText:()=>({width:20}),save(){},restore(){},fillText:(s:string)=>labels.push(s)};
  runInNewContext(sceneDrawingRuntime+';drawSceneCaptions(ctx,0,data)',{ctx,data});
  assert.deepEqual(labels,['WORLD']);assert.equal(segments[1].frames,30);
});
