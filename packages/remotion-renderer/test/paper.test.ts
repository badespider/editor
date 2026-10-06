import assert from 'node:assert/strict';
import {test} from 'node:test';
import {paperPixels} from '../src/paper.ts';
import {drawingModule} from '../src/runtime.ts';
import {sceneComposition} from '../../editing-playbook/src/scene-composition.ts';
import {adaptScene} from '../../editing-playbook/src/scene-motion.ts';
import {sceneFixture} from '../../editing-playbook/test/scene-fixture.ts';
const opts={color:'#071426',seed:37,strength:.85};
test('paper material is deterministic, seeded, opaque and retains the navy hue',()=>{
  const p=paperPixels(192,108,opts);assert.equal(p.length,192*108*4);
  assert.deepEqual(p,paperPixels(192,108,opts));assert.notDeepEqual(p,paperPixels(192,108,{...opts,seed:38}));
  const values=new Set<number>();for(let i=0;i<p.length;i+=4){assert.equal(p[i+3],255);assert.ok(p[i]<p[i+1]&&p[i+1]<p[i+2]);assert.ok(p[i+2]<70);values.add(p[i+2]);}
  assert.ok(values.size>10,'Material must have measurable tonal structure, not a flat fill');
});
test('zero strength yields the exact solid brand color, bad parameters fail closed',()=>{
  const p=paperPixels(16,16,{...opts,strength:0});for(let i=0;i<p.length;i+=4)assert.deepEqual([...p.slice(i,i+4)],[7,20,38,255]);
  for(const o of [{...opts,strength:NaN},{...opts,strength:1.1},{...opts,seed:-1},{...opts,color:'red'}])assert.throws(()=>paperPixels(16,16,o));
  for(const n of [0,1921,4.1])assert.throws(()=>paperPixels(n,16,opts));
});
test('rounded panels are included in actual layered drawing in both engines, not only unused legacy helpers',()=>{
  assert.match(drawingModule(),/function drawLayerV2[\s\S]*else if\(l.cornerRadius\)ctx.roundRect/);
  const {recipe,input}=sceneFixture();recipe.compositor='layered-v2';
  recipe.templates[0].layers.push({id:'panel',kind:'rect',pose:{...recipe.templates[0].layers[0].pose,width:.1,height:.1},keys:[],fill:'#10243B',stroke:'#24435D',strokeWidth:1,shadow:10,cornerRadius:.08});
  const a=adaptScene(recipe,input),code=sceneComposition(a,{audio:'audio.wav',media:{'one/main':'source.mp4'}});
  assert.match(code,/function drawLayerV2[\s\S]*else if\(l.cornerRadius\)ctx.roundRect/);
  const video=recipe.templates[0].layers.find(l=>l.kind==='video')!;video.cornerRadius=.1;
  assert.throws(()=>adaptScene(recipe,input),/Corner radius/);
});
