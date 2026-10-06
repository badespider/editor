import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildChannelDemoPayload} from '../src/channel-payload.ts';
import {channelDemoRequest} from '../../editing-playbook/src/channel-template.ts';

test('silent channel demos have no speech, captions, source paths or media and preserve explicit section timings',()=>{
  for(const layout of ['landscape','portrait'] as const){
    const p=buildChannelDemoPayload(channelDemoRequest(layout));
    assert.equal(p.duration,45);assert.equal(p.shots.length,6);assert.equal(p.input.transcript.words.length,0);assert.equal(p.input.captions.length,0);
    assert.equal(p.recipe.caption.visible,false);assert.doesNotMatch(JSON.stringify(p),/sourceSha256|sourceIn|file:\/\/|cache/);
    for(const s of p.shots){assert.deepEqual(s.paths,{});assert.ok(s.template.layers.every(l=>!l.slot));assert.ok(s.template.layers.every(l=>l.keys.every(k=>typeof k.at==='number')));}
  }
});
test('footage cannot enter the generated-only renderer and unknown fields/extra captions are rejected',()=>{
  const r=channelDemoRequest();r.mode='footage';r.sections.forEach(s=>delete s.demoCaption);
  assert.throws(()=>buildChannelDemoPayload(r),/scene workflow/);
  assert.throws(()=>buildChannelDemoPayload({...channelDemoRequest(),assets:[{path:'secret.mp4'}]}));
  const r2=channelDemoRequest();r2.sections[0].demoCaption=['ok','ok'];
  assert.throws(()=>buildChannelDemoPayload({...r2,sections:[{...r2.sections[0],demoCaption:['one','two','three']}]}));
});

test('native editorial payload reaches Remotion without canvas fallback or fabricated captions',()=>{
  const p=buildChannelDemoPayload({...channelDemoRequest('portrait'),visualStyle:'editorial'});
  assert.equal(p.shots.length,6);assert.equal(p.width,1080);assert.equal(p.height,1920);
  assert.equal(p.input.transcript.words.length,0);assert.equal(p.recipe.caption.visible,false);
  for(const s of p.shots){assert.equal(s.template.channel?.version,1);assert.equal(s.template.layers.length,0);assert.deepEqual(s.paths,{});}
});
