import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {referenceRequestSchema,parseReferenceStamps,checkReferenceBudget,frameChange,validateBreakdown} from '../src/reference-schema.ts';
import {referenceViewer} from '../src/reference-viewer.ts';
import {referenceProcess} from '../src/reference-process.ts';

test('dense ranges and budgets are explicit and finite',()=>{
  const r=referenceRequestSchema.parse({start:10,end:12});assert.equal(r.maxFrames,600);assert.equal(r.maxDecodedMiB,1024);
  for(const x of [{start:1,end:1},{start:0,end:31},{start:NaN,end:2},{start:0,end:2,maxFrames:1801},{start:0,end:2,maxDecodedMiB:4097},{start:0,end:2,fps:30}])assert.throws(()=>referenceRequestSchema.parse(x));
  assert.throws(()=>checkReferenceBudget(3840,2160,100,r),/budget/);
  assert.throws(()=>checkReferenceBudget(160,90,601,r),/Frame budget/);
  assert(checkReferenceBudget(160,90,120,r)>0);
});
test('integer PTS retain VFR gaps and duplicate timestamps without FPS math',()=>{
  const log='config in time_base: 1/1000\nn: 0 pts: 7000 pts_time:7 duration: 17\nn: 1 pts: 7017 pts_time:7.017 duration: 50\nn: 2 pts: 7067 pts_time:7.067 duration: 0\nn: 3 pts: 7067 pts_time:7.067 duration: 33';
  const result=parseReferenceStamps(log,7,0,.1);assert.equal(result.frames.length,4);assert(Math.abs(result.frames[2].time-.067)<1e-12);assert.equal(result.frames[3].pts,result.frames[2].pts);
  assert.throws(()=>parseReferenceStamps(log.replace('n: 2','n: 8'),7,0,.1),/timestamp/);
  assert.throws(()=>parseReferenceStamps(log.replace('7067','6999'),7,0,.1),/timestamp/);
  assert.throws(()=>parseReferenceStamps(log,7,0,.01),/timestamp/);
  assert.throws(()=>parseReferenceStamps('config in time_base: 1/1000',0,0,1),/No decoded/);
});
test('whole-image difference reports bounded measurements, not objects',()=>{
  const a=new Uint8Array(12),b=new Uint8Array(a);b[5]=255;
  const same=frameChange(a,a,4,3);assert.equal(same.meanAbsoluteDifference,0);assert.equal(same.changedBounds,null);
  const delta=frameChange(a,b,4,3);assert.equal(delta.changedFraction,1/12);assert.deepEqual(delta.changedBounds,{x:.25,y:1/3,width:.25,height:1/3});
});
test('authored breakdowns retain attribution, uncertainty and exact coverage',()=>{
  const frames=[0,1,2].map(index=>({index,pts:index*100,time:index/10,durationTicks:100})),hash='a'.repeat(64);
  const report={sequenceSha256:hash,author:'Synthetic fixture',inspectedFrames:[0,2],elements:[{id:'box',label:'Test box',observation:'Known fixture declaration',inference:'May move right',uncertainty:'Not a human review',phases:[{label:'entry',startFrame:0,endFrame:2}],keyframes:[{frame:0,x:.2,note:'Authored estimate'}]}]};
  const checked=validateBreakdown(report,hash,frames);assert.equal(checked.status,'agent_reported');assert.equal(checked.safeToAutoEdit,false);assert.equal(checked.coverage.allFramesReported,false);assert.equal(checked.timing[0].phases[0].end,.2);
  assert.throws(()=>validateBreakdown(report,'b'.repeat(64),frames),/different/);
  assert.throws(()=>validateBreakdown({...report,inspectedFrames:[0]},hash,frames),/endpoints/);
  assert.throws(()=>validateBreakdown({...report,inspectedFrames:[0,0,2]},hash,frames),/duplicate/);
  const motion=structuredClone(report);motion.elements[0].keyframes.push({frame:2,x:.6,note:'Second authored estimate'});
  const segment=validateBreakdown(motion,hash,frames).timing[0].segments[0];assert(Math.abs(segment.delta.x-.4)<1e-12);assert(Math.abs(segment.perSecond.x!-2)<1e-12);
});
test('viewer escapes embedded JSON and does not use fetch or external resources',()=>{
  const html=referenceViewer({frames:[{index:0,time:0,path:'</script><script>alert(1)</script>'}],start:0,end:1,width:10,height:10});
  assert(!html.includes('</script><script>alert'));assert(html.includes('\\u003c/script>'));assert(!html.includes('fetch('));assert(html.includes('Previous-frame overlay'));
});
test('reference process rejects cancellation and excessive output',async()=>{
  assert.throws(()=>referenceProcess(process.execPath,['-e','process.stdout.write("x")'],AbortSignal.abort()),/abort/i);
  await assert.rejects(referenceProcess(process.execPath,['-e','process.stdout.write("x".repeat(2048))'],undefined,100),/budget/);
});
test('viewer control logic steps, overlays and schedules VFR gaps in an isolated DOM stub',()=>{
  // Unit logic only: no browser, image loading, rendering, filesystem or network access.
  const nodes:Record<string,any>={};
  for(const id of ['seek','main','previous','readout','onion','native','back','next','play','speed','coordinates'])nodes[id]={style:{},checked:false,value:id==='speed'?'1':'',getBoundingClientRect:()=>({left:0,top:0,width:160,height:90})};
  const document:any={getElementById:(id:string)=>nodes[id]},timers:Array<{fn:()=>void;delay:number}>=[];
  const html=referenceViewer({frames:[{index:0,time:7,path:'frames/frame-000000.png'},{index:1,time:7.1,path:'frames/frame-000001.png'},{index:2,time:7.4,path:'frames/frame-000002.png'}],start:7,end:7.5,width:160,height:90});
  const script=/<script>([\s\S]*)<\/script>/.exec(html)![1];
  runInNewContext(script,{document,setTimeout:(fn:()=>void,delay:number)=>{timers.push({fn,delay});return timers.length;},clearTimeout:()=>{}},{timeout:1000});
  assert.equal(nodes.main.src,'frames/frame-000000.png');nodes.next.onclick();assert.equal(nodes.main.src,'frames/frame-000001.png');
  nodes.onion.checked=true;nodes.onion.onchange();assert.equal(nodes.previous.src,'frames/frame-000000.png');assert.equal(nodes.previous.style.display,'block');
  nodes.native.checked=true;nodes.native.onchange();assert.equal(nodes.main.style.maxWidth,'none');
  nodes.seek.value='0';nodes.seek.oninput();nodes.play.onclick();assert(Math.abs(timers.at(-1)!.delay-100)<1e-6);
  timers.at(-1)!.fn();assert(Math.abs(timers.at(-1)!.delay-300)<1e-6);nodes.play.onclick();
  document.onkeydown({target:{tagName:'BODY'},key:'ArrowRight',preventDefault:()=>{}});assert.equal(nodes.main.src,'frames/frame-000002.png');
  nodes.next.onclick();assert.equal(nodes.main.src,'frames/frame-000002.png');
});
