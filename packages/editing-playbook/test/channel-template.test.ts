import assert from 'node:assert/strict';
import {test} from 'node:test';
import {adaptChannelTemplate,buildChannelTemplate,channelDemoRequest,channelDesign,channelRequestSchema,channelWorkflow} from '../src/channel-template.ts';
import {adaptScene,scenePoseAt,sceneRecipeSchema,styleSpecSchema,reviewScene} from '../src/scene-motion.ts';
import {sceneFixture} from './scene-fixture.ts';
import {sceneComposition} from '../src/scene-composition.ts';

test('complete channel demo has six independently timed, fixed-style sections and no source assets',()=>{
  const r=channelDemoRequest(),before=structuredClone(r),b=buildChannelTemplate(r);
  assert.deepEqual(r,before);assert.equal(b.sections.length,6);assert.equal(b.duration,45);
  assert.deepEqual([b.width,b.height,b.fps],[1920,1080,30]);assert.equal(b.recipe.style.basis,'brief');
  assert.equal(b.recipe.style.references.length,0);assert.equal(b.recipe.style.catalogEntries,undefined);
  assert.equal(b.recipe.caption.visible,false);assert.equal(b.safeToAutoPublish,false);assert.equal(b.externalModelCalls,0);
  let end=0;for(const s of b.sections){assert.equal(s.start,end);end=s.end;}
  for(const t of b.recipe.templates){assert.ok(t.layers.length<=48);for(const l of t.layers){
    assert.ok(!l.slot);assert.ok(l.kind!=='video'&&l.kind!=='image');
    if(l.font){assert.equal(l.font.family,'Arial');assert.ok([400,700].includes(l.font.weight));assert.ok(l.textLayout);}
    let last=-1;for(const k of l.keys){assert.equal(typeof k.at,'number');assert.ok(Number(k.at)>last);assert.ok(Number(k.at)<=1);last=Number(k.at);}
  }}
});
test('portrait is authored rather than scaled/cropped: vertical roadmap, stacked cards and reserved two-line captions',()=>{
  const wide=buildChannelTemplate(channelDemoRequest()),phone=buildChannelTemplate(channelDemoRequest('portrait'));
  assert.deepEqual([phone.width,phone.height],[1080,1920]);
  const p=phone.recipe.templates.find(t=>t.id==='channel-roadmap')!,w=wide.recipe.templates.find(t=>t.id==='channel-roadmap')!;
  assert.equal(p.layers.find(l=>l.id==='stop-0')!.pose.x,p.layers.find(l=>l.id==='stop-2')!.pose.x);
  assert.notEqual(w.layers.find(l=>l.id==='stop-0')!.pose.x,w.layers.find(l=>l.id==='stop-2')!.pose.x);
  const cards=phone.recipe.templates.find(t=>t.id==='channel-compare')!.layers.filter(l=>/^card-[0-9]$/.test(l.id));
  assert.equal(cards.length,3);assert.equal(cards[0].pose.x,cards[2].pose.x);assert.ok(cards[2].pose.y>cards[0].pose.y);
  for(const t of phone.recipe.templates){const captions=t.layers.filter(l=>l.id.startsWith('demo-caption-'));assert.equal(captions.length,2);
    for(const l of captions){assert.equal(l.textLayout?.maxLines,1);assert.ok(l.pose.y>=channelDesign.portraitCaptionArea.y);}
  }
});
test('roadmap stops stay dark before their explicit cues, light up in order, lines draw and arbitrary seeking is deterministic',()=>{
  const b=buildChannelTemplate(channelDemoRequest()),t=b.recipe.templates.find(t=>t.id==='channel-roadmap')!,l=t.layers.find(l=>l.id==='active-2')!;
  assert.equal(scenePoseAt(l,0).opacity,0);assert.equal(scenePoseAt(l,5/9).opacity,0);assert.equal(scenePoseAt(l,6.5/9).opacity,1);
  const connector=t.layers.find(l=>l.id==='connector-1')!;
  const base=t.layers.find(l=>l.id==='connector-base-1')!;assert.equal(scenePoseAt(base,1/9).opacity,1);
  assert.equal(scenePoseAt(connector,5/9).opacity,0);assert.ok(scenePoseAt(connector,6.15/9).reveal>0);assert.ok(scenePoseAt(connector,6.15/9).reveal<1);
  assert.deepEqual(scenePoseAt(l,.8),scenePoseAt(l,.8));assert.equal(scenePoseAt(l,1).opacity,0);
});
test('download invitation is absent until a ready resource is explicitly supplied',()=>{
  const r=channelDemoRequest();assert.ok(!JSON.stringify(buildChannelTemplate(r).recipe.templates).includes('Download:'));
  const next=r.sections.at(-1)!;if(next.kind!=='next-step')throw Error();next.pdf={ready:true,label:'Your AI starter checklist',url:'https://example.com/checklist'};
  const b=buildChannelTemplate(r);assert.ok(b.recipe.templates.at(-1)!.layers.some(l=>l.id==='pdf-invitation'));
  assert.throws(()=>buildChannelTemplate({...r,sections:[{...next,pdf:{...next.pdf,ready:false}}]}));
  assert.throws(()=>buildChannelTemplate({...r,sections:[{...next,pdf:{...next.pdf,url:'file:///private.pdf'}}]}));
  assert.throws(()=>buildChannelTemplate({...r,sections:[{...next,keyPhrase:'Do another thing'}]}),/omit the extra/);
});
test('same comparison fields support two or three options, and a Short can use one section',()=>{
  const r=channelDemoRequest('portrait'),s=r.sections.find(s=>s.kind==='comparison')!;if(s.kind!=='comparison')throw Error();s.options.pop();
  r.sections=[s];const b=buildChannelTemplate(r);assert.equal(b.sections.length,1);
  assert.equal(b.recipe.templates[0].layers.filter(l=>/^card-[0-9]$/.test(l.id)).length,2);
  for(const i of [0,1])assert.deepEqual(b.recipe.templates[0].layers.filter(l=>l.id.startsWith(`card-${i}-field-`)).map(l=>l.text),['Skills','Work involved','First project']);
});
test('limits, duplicate IDs, bad cue order, out-of-screen focus and unknown executable fields fail closed',()=>{
  const r=channelDemoRequest();assert.throws(()=>buildChannelTemplate({...r,code:'fetch()'}));
  assert.throws(()=>buildChannelTemplate({...r,sections:[...r.sections,r.sections[0]]}));
  assert.throws(()=>buildChannelTemplate({...r,sections:r.sections.map(s=>({...s,duration:20}))}));
  const roadmap=r.sections[1];if(roadmap.kind!=='roadmap')throw Error();roadmap.steps[2].activateAt=1;assert.throws(()=>buildChannelTemplate(r));
  const demo=channelDemoRequest().sections[3];if(demo.kind!=='demonstration')throw Error();demo.highlight.x=.9;
  assert.throws(()=>buildChannelTemplate({...channelDemoRequest(),sections:[demo]}));
  assert.throws(()=>channelRequestSchema.parse({...r,sections:[{...r.sections[0],duration:3.01}]}));
});
function bound(layout:'landscape'|'portrait'='landscape'){
  const request=channelDemoRequest(layout);request.mode='footage';request.sections=[{id:'hook',kind:'hook',duration:3,headline:'Start with one task'}];
  const {input}=sceneFixture();input.width=layout==='landscape'?1920:1080;input.height=layout==='landscape'?1080:1920;
  input.audio.end=13;input.shots[0]={...input.shots[0],id:'hook',start:0,end:3,bindings:[{slot:'camera',assetId:'a',sourceIn:10}]};
  input.captions[0].end=3;input.shots[0].framing.protectedRegions=[];input.captions[0].words[1].scale=1;
  return {request,input};
}
test('real footage uses genuine source timing, normal scene validation, aspect-preserving camera slots and fresh brief criteria',()=>{
  const {request,input}=bound(),before=structuredClone(input),a=adaptChannelTemplate(request,input);
  assert.deepEqual(input,before);assert.deepEqual(a.input.transcript,input.transcript);assert.deepEqual(a.input.audio,input.audio);
  assert.equal(a.recipe.caption.visible,false);assert.ok(a.warnings.some(w=>w.includes('User brief')));
  const media=a.recipe.templates[0].layers.find(l=>l.slot==='camera')!;
  assert.ok(Math.abs(media.pose.width*input.width/(media.pose.height*input.height)-16/9)<1e-8);
  assert.equal(a.input.shots[0].templateId,'channel-hook');assert.equal(a.input.shots[0].criteria.length,4);
  input.transcript.sourceSha256='b'.repeat(64);assert.throws(()=>adaptChannelTemplate(request,input),/audio source/);
});
test('portrait actual captions cannot use a third row, moved band, fabricated demo captions or mismatched layout/time',()=>{
  const {request,input}=bound('portrait');assert.equal(adaptChannelTemplate(request,input).recipe.caption.visible,true);
  input.captions[0].words[1].row=2;assert.throws(()=>adaptChannelTemplate(request,input),/two rows/);input.captions[0].words[1].row=1;
  input.captions[0].box={x:.1,y:.1,width:.8,height:.2};assert.throws(()=>adaptChannelTemplate(request,input),/reserved/);delete input.captions[0].box;
  input.shots[0].end=2;assert.throws(()=>adaptChannelTemplate(request,input),/IDs\/times/);input.shots[0].end=3;
  input.width=1920;assert.throws(()=>adaptChannelTemplate(request,input),/dimensions/);
  request.sections[0].demoCaption=['Made-up timing','Cannot use'];assert.throws(()=>buildChannelTemplate(request),/source-aligned/);
  assert.throws(()=>adaptChannelTemplate(channelDemoRequest(),input),/footage mode/);
});
test('brief schema cannot masquerade as catalog/reference evidence and review reports brief conformance only',()=>{
  const {request,input}=bound(),a=adaptChannelTemplate(request,input),s=a.recipe.style;
  assert.throws(()=>styleSpecSchema.parse({...s,brief:undefined}));assert.throws(()=>styleSpecSchema.parse({...s,basis:'catalog'}));
  assert.throws(()=>styleSpecSchema.parse({...s,references:sceneFixture().recipe.style.references}));
  assert.throws(()=>sceneRecipeSchema.parse({...a.recipe,style:{...s,criteria:s.criteria.map(c=>({...c,evidence:[{referenceId:'x',frames:[0]}]}))}}));
  const sha='a'.repeat(64),pass={status:'pass',note:'Synthetic test verdict',renderEvidenceIds:['frame'],referenceEvidenceIds:[]};
  const report=reviewScene({revisionSha256:sha,renderSha256:sha,inspectionSha256:sha,reviewer:'Unit test',inspectedEvidenceIds:['frame','audio'],
    criteria:s.criteria.map(c=>({...pass,criterionId:c.id})),checks:['readability','continuity','speech_sync','audio'].map(kind=>({...pass,kind,renderEvidenceIds:kind==='audio'||kind==='speech_sync'?['audio']:['frame']}))},
    {revisionSha256:sha,renderSha256:sha,inspectionSha256:sha,adaptation:a,evidence:[{id:'frame',role:'render',kind:'frame'},{id:'audio',role:'render',kind:'audio'}],revision:0,maxCorrections:2});
  assert.equal(report.styleMatch,'agent_reported_brief_conformance');assert.equal(report.safeToAutoPublish,false);
});
test('all agents can obtain the complete request schema and bounded demo/production instructions',()=>{
  const workflow=channelWorkflow();assert.equal(workflow.template,'channel-explainer@1');assert.ok(workflow.requestSchema.properties);
  assert.ok(workflow.notes.some(n=>n.includes('genuine transcript')));assert.ok(workflow.notes.some(n=>n.includes('60 seconds')));
});
test('paper style is reusable, opt-out clean stays flat, and material is background-only',()=>{
  const request=channelDemoRequest(),b=buildChannelTemplate(request);
  assert.equal(b.request.visualStyle,'paper');assert.equal(b.design.version,2);
  for(const t of b.recipe.templates){assert.deepEqual(t.surface,channelDesign.paper);assert.equal(t.finish,undefined);
    assert.ok(t.layers.filter(l=>l.cornerRadius).every(l=>l.kind==='rect'));}
  assert.deepEqual(b,buildChannelTemplate(request));
  const clean=buildChannelTemplate({...request,visualStyle:'clean'});
  for(const t of clean.recipe.templates){assert.equal(t.surface,undefined);assert.ok(t.layers.every(l=>l.cornerRadius===undefined));}
  assert.notEqual(clean.recipe.style.brief?.sha256,b.recipe.style.brief?.sha256);
  assert.throws(()=>buildChannelTemplate({...request,visualStyle:'unknown'}));
  const {request:real,input}=bound();const a=adaptChannelTemplate(real,input);
  assert.equal(a.recipe.templates[0].layers.find(l=>l.kind==='video')!.cornerRadius,undefined);
  assert.match(sceneComposition(a,{audio:'audio.wav',media:{'hook/camera':'camera.mp4'}}),/Remotion-only/);
});
test('paper comparison groups stagger together without entering the portrait phrase/caption bands',()=>{
  const b=buildChannelTemplate(channelDemoRequest('portrait')),t=b.recipe.templates.find(t=>t.id==='channel-compare')!;
  for(const i of [0,1,2]){
    const group=t.layers.filter(l=>l.id===`card-${i}`||l.id===`card-name-${i}`||l.id===`card-accent-${i}`||l.id.startsWith(`card-${i}-`));
    assert.ok(group.every(l=>l.keys[0].at===i*.12/9));
    const card=group.find(l=>l.id===`card-${i}`)!;assert.ok(card.pose.y+card.pose.height/2<.715);
    assert.ok(card.cornerRadius);assert.equal(scenePoseAt(card,.8).opacity,1);
  }
  for(const t of b.recipe.templates)assert.ok(t.layers.length<=48);
});

test('editorial scenes retain six typed content contracts, independent layouts and no demo media',()=>{
  for(const layout of ['landscape','portrait'] as const){
    const request={...channelDemoRequest(layout),visualStyle:'editorial' as const},b=buildChannelTemplate(request);
    assert.equal(b.duration,45);assert.equal(b.recipe.templates.length,6);
    b.recipe.templates.forEach((t,i)=>{
      assert.deepEqual(t.channel?.section,request.sections[i]);assert.equal(t.channel?.layout,layout);
      assert.equal(t.channel?.index,i);assert.equal(t.channel?.count,6);assert.equal(t.channel?.version,1);
      assert.deepEqual(t.layers,[]);assert.equal(t.surface,undefined);
    });
    assert.deepEqual(buildChannelTemplate(request),b);
    const bad=structuredClone(b.recipe);bad.templates[0].channel!.version=2 as 1;assert.throws(()=>sceneRecipeSchema.parse(bad));
    const injection={...b.recipe.templates[0].channel,source:'https://example.com/private'};
    assert.throws(()=>sceneRecipeSchema.parse({...b.recipe,templates:[{...b.recipe.templates[0],channel:injection}]}));
  }
});

test('editorial footage keeps normal source binding and rejects silently ignored geometry/modes',()=>{
  for(const layout of ['landscape','portrait'] as const){
    const {request,input}=bound(layout);request.visualStyle='editorial';
    const a=adaptChannelTemplate(request,input),t=a.recipe.templates[0];
    assert.equal(t.channel!.mode,'footage');assert.equal(t.layers.length,1);assert.equal(t.layers[0].slot,'camera');
    assert.deepEqual(a.input.transcript,input.transcript);assert.deepEqual(a.input.audio,input.audio);
    assert.match(sceneComposition(a,{audio:'audio.wav',media:{'hook/camera':'camera.mp4'}}),/Remotion-only/);
    const mutate=(edit:(r:typeof a.recipe)=>void)=>{const r=structuredClone(a.recipe);edit(r);assert.throws(()=>adaptScene(r,a.input),/Native channel/);};
    mutate(r=>r.templates[0].layers[0].pose.x=.1);
    mutate(r=>r.templates[0].layers[0].keys=[{at:0,pose:{opacity:0},easing:'linear'}]);
    mutate(r=>r.templates[0].channel!.mode='layout-demo');
    mutate(r=>r.templates[0].channel!.section.duration=4);
    mutate(r=>r.templates[0].layers=[]);
    mutate(r=>r.templates[0].surface=channelDesign.paper);
  }
});
