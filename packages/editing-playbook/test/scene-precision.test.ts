import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { precisionEase, precisionPose, precisionMotionRuntime, sceneCurveSchema } from '../src/scene-dynamics.ts';
import { measuredTextLayout, measuredTextRuntime } from '../src/scene-text-layout.ts';
import { reflowSceneLayout } from '../src/scene-layout.ts';
import { compareTrackedMotion, captureSceneGolden, compareSceneGoldens, sceneMeasurementSchema } from '../src/scene-precision.ts';
import { sceneFixture } from './scene-fixture.ts';
import { adaptScene, scenePoseAt } from '../src/scene-motion.ts';
import { sceneComposition } from '../src/scene-composition.ts';
import { runMedia } from '../src/media-process.ts';

test('curves have deterministic endpoints, Bezier inversion, spring overshoot and bounce',()=>{
  const curves=['linear','easeIn','easeOut','easeInOut','hold','bounce',{kind:'bezier',x1:.2,y1:0,x2:.4,y2:1},{kind:'spring',damping:6,cycles:1.5}];
  for(const raw of curves){const c=sceneCurveSchema.parse(raw);assert.equal(precisionEase(0,c),0);assert.equal(precisionEase(1,c),1);
    for(let i=0;i<100;i++)assert.ok(Number.isFinite(precisionEase(i/99,c)));}
  assert.ok(Math.abs(precisionEase(.4,{kind:'bezier',x1:0,y1:0,x2:1,y2:1})-.4)<1e-7);
  assert.ok(precisionEase(.3,{kind:'spring',damping:4,cycles:2})>1);
  assert.throws(()=>sceneCurveSchema.parse({kind:'bezier',x1:-1,y1:0,x2:1,y2:1}));
});
test('spatial curves and per-property delays seek identically in Node and embedded compositor',()=>{
  const {recipe}=sceneFixture(),layer=recipe.templates[0].layers[0];
  layer.keys=[{at:0,pose:{x:.1,y:.1,opacity:0},easing:{kind:'bezier',x1:.2,y1:0,x2:.6,y2:1},path:{x1:.8,y1:.1,x2:.2,y2:.9},propertyTiming:{opacity:{start:.5,end:1,easing:'linear'}}},
    {at:1,pose:{x:.9,y:.9,opacity:1},easing:'linear'}];
  const sandbox=vm.createContext({});vm.runInContext(precisionMotionRuntime+';globalThis.run=precisionPose;',sandbox);
  for(const t of [.9,.1,.5,0,1,.2]){const node=scenePoseAt(layer,t),browser=sandbox.run(JSON.parse(JSON.stringify(layer)),t);
    assert.deepEqual(JSON.parse(JSON.stringify(browser)),node);}
  assert.equal(scenePoseAt(layer,.2).opacity,0);assert.ok(scenePoseAt(layer,.25).x>.1);
  assert.equal(precisionPose({...layer,keys:[] } as Parameters<typeof precisionPose>[0],.2).x,layer.pose.x);
});
test('media aspect timing and path ownership are guarded',()=>{
  const x=sceneFixture();x.recipe.compositor='layered-v2';
  x.recipe.templates[0].layers[0].keys=[{at:0,pose:{width:.5,height:.5},easing:'linear',propertyTiming:{width:{start:.5,end:1}}},{at:1,pose:{width:1,height:1},easing:'linear'}];
  assert.throws(()=>adaptScene(x.recipe,x.input),/identical width/);
  x.recipe.templates[0].layers[0].keys[0].propertyTiming={x:{start:0,end:1}};
  x.recipe.templates[0].layers[0].keys[0].path={x1:0,y1:0,x2:1,y2:1};assert.throws(()=>adaptScene(x.recipe,x.input),/spatial path/);
});
function textContext(){return {font:'',letterSpacing:'',textBaseline:'',textAlign:'',measureText(text:string){const px=Number(/([\d.]+)px/.exec(this.font)?.[1]??0);return {width:text.length*px*.55,actualBoundingBoxAscent:px*.75,actualBoundingBoxDescent:px*.2};}};}
test('measured typography wraps without dropping words, enforces a minimum, and matches embedded code',()=>{
  const x=sceneFixture(),font=x.recipe.caption.font,ctx=textContext();
  const layout=measuredTextLayout(ctx,'A longer readable headline',font,260,130,40,24,3,1.1);
  assert.ok(layout.lines.length>1);assert.equal(layout.lines.map(l=>l.text).join(' '),'A longer readable headline');assert.ok(layout.size>=24);
  assert.throws(()=>measuredTextLayout(ctx,'UNBREAKABLELONGWORD',font,25,20,40,24,2,1.1),/cannot fit/);
  const sandbox=vm.createContext({});vm.runInContext(measuredTextRuntime+';globalThis.run=measuredTextLayout;',sandbox);
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.run(textContext(),'A longer readable headline',font,260,130,40,24,3,1.1))),layout);
});
test('constraint reflow protects caption regions, preserves speech, and reports impossible layouts',()=>{
  const x=sceneFixture();x.recipe.compositor='layered-v2';x.recipe.templates[0].layers.push({...x.recipe.templates[0].layers[0],id:'title',kind:'text',slot:undefined,
    text:'A VERY LONG READABLE TITLE',font:x.recipe.caption.font,pose:{...x.recipe.templates[0].layers[0].pose,y:.7,width:.7,height:.04}});
  const before=structuredClone(x),r=reflowSceneLayout(x.recipe,x.input,{minFontSize:.04,maxLines:2});
  assert.deepEqual(x,before);assert.deepEqual(r.input.transcript,x.input.transcript);assert.deepEqual(r.input.audio,x.input.audio);
  assert.equal(r.report.changes.length,1);assert.ok(r.recipe.templates[0].layers[1].pose.y<.65);assert.equal(r.recipe.templates[0].layers[1].textLayout!.maxLines,2);
  const code=sceneComposition(adaptScene(r.recipe,r.input),{audio:'/a.wav',media:{'one/main':'/a.mp4'}});assert.ok(code.includes('measuredTextLayout'));
  x.input.shots[0].framing.protectedRegions=[{x:0,y:0,width:1,height:.64}];
  const impossible=reflowSceneLayout(x.recipe,x.input,{margin:.1,minFontSize:.1,maxLines:4});assert.equal(impossible.report.unresolved.length,1);
});
test('measured motion compares source-clock displacement, flags drift, and keeps incomplete tracks unknown',()=>{
  const x=sceneFixture(),layer=x.recipe.templates[0].layers[0];layer.pose.x=.2;layer.keys=[{at:1,pose:{x:.8},easing:'linear'}];
  const a=adaptScene(x.recipe,x.input),target=sceneMeasurementSchema.parse({targets:[{id:'a',shotId:'one',layerId:'footage',start:0,end:1,seedTime:0,box:{x:.1,y:.4,width:.2,height:.2}}]}).targets[0];
  const track=Array.from({length:30},(_,i)=>({frame:i,time:i/30,x:.2+.6*(i/30)/2,y:.5,scale:1,rotationDegrees:0,score:1,status:i?'candidate' as const:'seed' as const}));
  assert.ok(compareTrackedMotion(a,target,track).positionRmsPixels<1e-8);
  track[15].x+=.1;assert.ok(compareTrackedMotion(a,target,track).flaggedFrames.includes(15));
  const lost=[...track,{frame:30,time:1,x:null,y:null,scale:null,rotationDegrees:null,score:null,status:'lost' as const}];
  assert.equal(compareTrackedMotion(a,target,lost).status,'incomplete_track_needs_inspection');
});
test('actual-pixel golden capture detects visual changes, rejects mismatched input and tampering',async()=>{
  const root=await mkdtemp(join(tmpdir(),'scene-golden-')),a=adaptScene(...(()=>{const x=sceneFixture();return [x.recipe,x.input] as const;})());
  a.input.width=240;a.input.height=240;
  const files=[];for(const c of ['red','blue']){const path=join(root,c+'.mp4');await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i',`color=c=${c}:s=240x240:r=30:d=2`,'-c:v','libx264','-pix_fmt','yuv420p',path]);files.push(path);}
  const left=await captureSceneGolden(files[0],a,{frames:[0,15,40]}),right=await captureSceneGolden(files[1],a,{frames:[0,15,40]});
  assert.equal(compareSceneGoldens(left,left).status,'within_regression_tolerance');assert.equal(compareSceneGoldens(left,right).status,'visual_change_requires_review');
  assert.throws(()=>compareSceneGoldens(left,{...right,inputSha256:'b'.repeat(64)}),/same source/);
  assert.throws(()=>compareSceneGoldens(left,{...right,pixelsBase64:left.pixelsBase64}),/fingerprint/);
  a.input.width=320;a.input.height=2560;
  await assert.rejects(captureSceneGolden(files[0],a,{frames:Array.from({length:24},(_,i)=>i),width:320}),/budget/);
});
test('off-center seed motion includes layer rotation rather than false positional drift',()=>{
  const x=sceneFixture(),l=x.recipe.templates[0].layers[0];l.pose.x=.5;l.pose.y=.5;
  l.keys=[{at:0,pose:{rotation:0},easing:'linear'},{at:1,pose:{rotation:60},easing:'linear'}];
  const a=adaptScene(x.recipe,x.input),target=sceneMeasurementSchema.parse({targets:[{id:'rotate',shotId:'one',layerId:'footage',start:0,end:1,seedTime:0,box:{x:.55,y:.4,width:.1,height:.2}}]}).targets[0];
  const tracks=Array.from({length:30},(_,i)=>{const angle=30*i/30,r=angle*Math.PI/180;return {frame:i,time:i/30,x:.5+.1*Math.cos(r),y:.5+.1*a.input.width/a.input.height*Math.sin(r),scale:1,rotationDegrees:angle,score:1,status:i?'candidate' as const:'seed' as const};});
  assert.ok(compareTrackedMotion(a,target,tracks).positionRmsPixels<1e-7);
});
