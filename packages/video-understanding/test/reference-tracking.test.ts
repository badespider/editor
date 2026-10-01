import assert from 'node:assert/strict';
import { test } from 'node:test';
import { trackGrayFrames } from '../src/reference-tracking.ts';

function fixture(lost=false){const W=96,H=80,N=10,pixels=new Uint8Array(W*H*N).fill(40),stamps=Array.from({length:N},(_,i)=>({index:i,time:i===0?0:.01+i*.037}));
  for(let f=0;f<N;f++)for(let y=0;y<20;y++)for(let x=0;x<24;x++){if(lost&&f>=6)continue;
    pixels[f*W*H+(25+y)*W+20+f+x]=60+(x*37+y*51+x*y*7)%180;}
  return {W,H,pixels,stamps,request:{seedFrame:0,from:0,count:N,box:{x:20/W,y:25/H,width:24/W,height:20/H},searchRadius:4,scaleStep:0,rotationStep:0,minScore:.75,ambiguityMargin:.01}};}
test('seeded tracking measures translation against irregular native times without inventing timestamps',()=>{
  const f=fixture(),result=trackGrayFrames(f.pixels,f.W,f.H,f.stamps,f.request);
  assert.equal(result.candidateFrames,10);for(const [i,m] of result.measurements.entries()){assert.ok(Math.abs(m.x!-(32+i)/f.W)<.012);assert.equal(m.time,f.stamps[i].time);}
  assert.equal(result.safeToAutoEdit,false);
});
test('uncertain occlusion stops tracking rather than reporting a confident stationary object',()=>{
  const f=fixture(true),r=trackGrayFrames(f.pixels,f.W,f.H,f.stamps,f.request);
  assert.equal(r.measurements[6].status,'uncertain');assert.equal(r.measurements[7].status,'lost');assert.equal(r.measurements[7].x,null);
});
test('textureless seeds, invalid geometry and frame budgets fail explicitly',()=>{
  const f=fixture();assert.throws(()=>trackGrayFrames(f.pixels.fill(20),f.W,f.H,f.stamps,f.request),/texture/);
  assert.throws(()=>trackGrayFrames(f.pixels,f.W,f.H,f.stamps,{...f.request,count:121}));
  assert.throws(()=>trackGrayFrames(f.pixels,f.W,f.H,f.stamps,{...f.request,seedFrame:99}));
});
test('a middle seed tracks both directions without changing the native clocks',()=>{
  const f=fixture(),seed=5;
  const r=trackGrayFrames(f.pixels,f.W,f.H,f.stamps,{...f.request,seedFrame:seed,box:{...f.request.box,x:(20+seed)/f.W}});
  assert.equal(r.candidateFrames,10);assert.equal(r.measurements[seed].status,'seed');
  for(let i=0;i<10;i++)assert.ok(Math.abs(r.measurements[i].x!-(32+i)/f.W)<.012);
});
test('duplicate competing patches are uncertain, not confidently promoted',()=>{
  const f=fixture();
  for(let frame=1;frame<10;frame++)for(let y=0;y<20;y++)for(let x=0;x<24;x++)
    f.pixels[frame*f.W*f.H+(25+y)*f.W+52+x]=60+(x*37+y*51+x*y*7)%180;
  const r=trackGrayFrames(f.pixels,f.W,f.H,f.stamps,{...f.request,searchRadius:36});
  assert.equal(r.measurements[1].status,'uncertain');assert.equal(r.measurements[2].status,'lost');
});
