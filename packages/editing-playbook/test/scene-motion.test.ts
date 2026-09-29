import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { adaptScene, reviewScene, scenePoseAt, resolveSceneTemplate, styleDimensions, type SceneRecipe, type SceneInput } from '../src/scene-motion.ts';
import { sceneComposition, sceneDrawingRuntime } from '../src/scene-composition.ts';
import { layeredRuntime } from '../src/scene-layered.ts';

const hash='a'.repeat(64);
export function sceneFixture() {
  const pose={x:.5,y:.5,width:1,height:1,rotation:0,opacity:1,blur:0,skewX:0,reveal:1};
  const font={family:'Arial',size:.06,weight:800,color:'#FFFFFF',italic:false};
  const recipe: SceneRecipe={schemaVersion:1,kind:'scene-motion-recipe',style:{name:'Synthetic fixture; no real viewing',
    references:[{id:'ref',cache:'/synthetic',sessionId:hash,sequenceId:hash,sequenceSha256:hash,inspectedFrames:[0,1]}],
    criteria:styleDimensions.map(d=>({id:d,dimension:d,essential:true,requirement:'Synthetic '+d,evidence:[{referenceId:'ref',frames:[0,1]}]})),avoid:[],uncertainties:['Synthetic fixture only']},
    templates:[{id:'picture',background:'#111111',layers:[{id:'footage',kind:'video',slot:'main',pose,keys:[],fill:'#FFFFFF',stroke:'#FFFFFF',strokeWidth:0,shadow:0}]}],
    caption:{font,box:{x:.1,y:.65,width:.8,height:.2},minFontSize:.025,lineGap:1.2,entrySeconds:.08,lift:.01,blur:2,uppercase:true,shadow:4}};
  const input:SceneInput={width:1080,height:1920,fps:30,assets:[{id:'a',path:'/synthetic/source.mp4',sha256:hash,kind:'video',provenance:'Synthetic test source',permission:'original'}],
    audio:{assetId:'a',start:10,end:12},transcript:{sourceSha256:hash,provenance:'Synthetic not ASR',verification:'unverified',words:[{id:'w1',text:'Hello',start:10.1,end:10.5},{id:'w2',text:'world',start:10.8,end:11.5}]},
    shots:[{id:'one',templateId:'picture',start:0,end:2,purpose:'Synthetic',criteria:[...styleDimensions],framing:{rationale:'Synthetic',evidence:['fixture'],protectedRegions:[]},bindings:[{slot:'main',assetId:'a',sourceIn:10}]}],
    captions:[{id:'words',start:0,end:2,words:[{wordId:'w1',row:0,scale:1},{wordId:'w2',row:1,scale:1.5}]}]};return {recipe,input};
}
test('scene adaptation retains source word clocks, reusable slots and explicit uncertainty',()=>{
  const {recipe,input}=sceneFixture(),a=adaptScene(recipe,input);assert.equal(a.duration,2);assert.equal(a.input.transcript.words[1].start,10.8);assert.ok(a.warnings.some(w=>w.includes('unverified')));
  input.assets[0].path='/synthetic/other.mp4';input.audio={assetId:'a',start:20,end:22};input.transcript.words.forEach(w=>{w.start+=10;w.end+=10;});input.shots[0].bindings[0].sourceIn=20;
  assert.equal(adaptScene(recipe,input).duration,2);
});
test('scene rejects lost speech, invented ordering, zero durations and missing style coverage',()=>{
  for(const mutate of [
    (x:ReturnType<typeof sceneFixture>)=>x.input.captions[0].words.pop(),
    (x:ReturnType<typeof sceneFixture>)=>x.input.transcript.words[0].end=x.input.transcript.words[0].start,
    (x:ReturnType<typeof sceneFixture>)=>x.input.captions[0].words.reverse(),
    (x:ReturnType<typeof sceneFixture>)=>x.input.shots[0].criteria.pop(),
    (x:ReturnType<typeof sceneFixture>)=>x.recipe.style.criteria[0].evidence[0].frames.push(99),
    (x:ReturnType<typeof sceneFixture>)=>x.input.shots[0].start=.1,
    (x:ReturnType<typeof sceneFixture>)=>x.input.captions[0].words[0].row=2,
    (x:ReturnType<typeof sceneFixture>)=>x.input.shots[0].bindings[0].assetId='missing',
  ]) {const x=sceneFixture();mutate(x);assert.throws(()=>adaptScene(x.recipe,x.input));}
});
test('declared protected regions block caption placement',()=>{
  const x=sceneFixture();x.input.shots[0].framing.protectedRegions.push({x:.1,y:.7,width:.8,height:.2});assert.throws(()=>adaptScene(x.recipe,x.input),/protected/);
});
test('piecewise overshoot, hold and arbitrary seeking agree with actual canvas runtime',()=>{
  const x=sceneFixture(),layer=x.recipe.templates[0].layers[0];layer.keys=[{at:0,pose:{x:-.2},easing:'easeOut'},{at:.4,pose:{x:.6},easing:'easeInOut'},{at:.6,pose:{x:.5},easing:'hold'},{at:1,pose:{x:1},easing:'linear'}];
  for(const t of [.5,0,.9,.3,1,.4,.7,.1]) {const runtime=runInNewContext(sceneDrawingRuntime+';poseScene(layer,t)',{layer,t});assert.deepEqual(JSON.parse(JSON.stringify(runtime)),scenePoseAt(layer,t));}
  assert.equal(scenePoseAt(layer,.9).x,.5);assert.equal(scenePoseAt(layer,1).x,1);
});
test('composition uses inert caption data, continuous audio, muted picture and rejects unsupported media effects',()=>{
  const x=sceneFixture();x.input.transcript.words[0].text='</script>';const a=adaptScene(x.recipe,x.input),p={audio:'/audio.wav',media:{'one/main':'/main.mp4'}};
  const code=sceneComposition(a,p);assert.ok(code.includes('muted={true}'));assert.ok(code.includes('Continuous original narration'));assert.ok(code.includes('"text":"</script>"'));
  a.recipe.templates[0].layers[0].pose.skewX=.3;assert.throws(()=>sceneComposition(a,p),/not supported/);
});
test('word renderer uses real individual onsets, hierarchy, fixed final positions and minimum size',()=>{
  const x=sceneFixture(),a=adaptScene(x.recipe,x.input),drawn:string[]=[];
  const ctx={font:'',measureText:(s:string)=>({width:s.length*20}),save(){},restore(){},fillText(s:string){drawn.push(s);}};
  runInNewContext(sceneDrawingRuntime+';drawSceneCaptions(ctx,.6,data)',{ctx,data:a});assert.deepEqual(drawn,['HELLO']);
  drawn.length=0;runInNewContext(sceneDrawingRuntime+';drawSceneCaptions(ctx,1,data)',{ctx,data:a});assert.deepEqual(drawn,['HELLO','WORLD']);
  a.recipe.caption.box.width=.001;assert.throws(()=>runInNewContext(sceneDrawingRuntime+';drawSceneCaptions(ctx,1,data)',{ctx,data:a}),/minimum readable/);
});
function reviewFixture(){const x=sceneFixture(),adaptation=adaptScene(x.recipe,x.input);const evidence=[{id:'r',role:'render' as const,kind:'frame' as const},{id:'a',role:'render' as const,kind:'audio' as const},...[0,1].map(i=>({id:`ref-ref-${i}`,role:'reference' as const,kind:'frame' as const}))];
  const expected={adaptation,evidence,revisionSha256:hash,renderSha256:hash,inspectionSha256:hash,revision:0,maxCorrections:2};
  const finding={status:'pass',note:'Synthetic test declaration, not real viewing',renderEvidenceIds:['r'],referenceEvidenceIds:['ref-ref-0']};
  const review={revisionSha256:hash,renderSha256:hash,inspectionSha256:hash,reviewer:'Synthetic',inspectedEvidenceIds:evidence.filter(e=>e.kind==='frame').map(e=>e.id),
    criteria:styleDimensions.map(d=>({...finding,criterionId:d})),checks:['readability','continuity','speech_sync','audio'].map(kind=>({...finding,kind,status:['audio','speech_sync'].includes(kind)?'unknown':'pass',referenceEvidenceIds:[]}))};return {expected,review};}
test('technical/readability passes cannot override reference mismatch or unavailable listening',()=>{
  const {expected,review}=reviewFixture();let result=reviewScene(review,expected);assert.equal(result.styleMatch,'agent_reported_match');assert.equal(result.status,'needs_human_review');
  review.criteria[0].status='fail';result=reviewScene(review,expected);assert.equal(result.styleMatch,'mismatch');assert.equal(result.status,'needs_correction');
  expected.revision=2;assert.equal(reviewScene(review,expected).status,'correction_limit');
});
test('review rejects stale bytes, uninspected evidence and unsupported audio/style passes',()=>{
  for(const mutate of [(x:ReturnType<typeof reviewFixture>)=>x.review.renderSha256='b'.repeat(64),
    (x:ReturnType<typeof reviewFixture>)=>x.review.inspectedEvidenceIds.pop(),
    (x:ReturnType<typeof reviewFixture>)=>x.review.criteria[0].referenceEvidenceIds=[],
    (x:ReturnType<typeof reviewFixture>)=>x.review.checks[3].status='pass',
  ]){const x=reviewFixture();mutate(x);assert.throws(()=>reviewScene(x.review,x.expected));}
});
test('unmatched optional reference detail remains a partial match, never a full match',()=>{
  const {expected,review}=reviewFixture();
  expected.adaptation.recipe.style.criteria.push({id:'detail',dimension:'motion',essential:false,requirement:'Fine optical detail',evidence:[{referenceId:'ref',frames:[0]}]});
  review.criteria.push({...review.criteria[0],criterionId:'detail' as typeof styleDimensions[number],status:'fail'});
  assert.equal(reviewScene(review,expected).styleMatch,'partial_match');
});

test('layered v2 extends duration without changing the legacy limit',()=>{
 const x=sceneFixture();x.input.audio.end=61;x.input.shots[0].end=51;
 assert.throws(()=>adaptScene(x.recipe,x.input),/0–30/);x.recipe.compositor='layered-v2';assert.equal(adaptScene(x.recipe,x.input).duration,51);
 x.input.audio.end=71;x.input.shots[0].end=61;assert.throws(()=>adaptScene(x.recipe,x.input),/0–60/);
});
test('speech cues resolve per input at source-clock starts/ends and reject invalid bindings/order/ranges',()=>{
 const x=sceneFixture();x.recipe.compositor='layered-v2';const layer=x.recipe.templates[0].layers[0];
 layer.keys=[{at:0,pose:{x:.2},easing:'hold'},{at:{cue:'emphasis',edge:'start',offsetSeconds:0},pose:{x:.2},easing:'easeOut'},
  {at:{cue:'emphasis',edge:'end',offsetSeconds:.1},pose:{x:.8},easing:'linear'}];
 x.input.shots[0].cues={emphasis:'w2'};adaptScene(x.recipe,x.input);
 let resolved=resolveSceneTemplate(x.recipe.templates[0],x.input.shots[0],x.input);
 assert.ok(Math.abs(resolved.layers[0].keys[1].at-.4)<1e-9);assert.ok(Math.abs(resolved.layers[0].keys[2].at-.8)<1e-9);
 assert.throws(()=>scenePoseAt(layer,.5),/Resolve/);
 x.input.shots[0].cues.emphasis='missing';assert.throws(()=>adaptScene(x.recipe,x.input),/binding|cue/);
 x.input.shots[0].cues.emphasis='w2';layer.keys[2].at={cue:'emphasis',edge:'start',offsetSeconds:-1};assert.throws(()=>adaptScene(x.recipe,x.input),/ordered/);
});
test('ordered layer blocks preserve image/graphic/video interleaving and mask/sampling data',()=>{
 const x=sceneFixture();x.recipe.compositor='layered-v2';const l=x.recipe.templates[0].layers[0];
 x.recipe.templates[0].layers=[{...l,id:'back',kind:'rect',slot:undefined},{...l,id:'photo',kind:'image',slot:'still',
   mask:{kind:'polygon',points:[[0,0],[1,0],[.5,1]]},motionBlur:{samples:4,shutter:.5}},
   {...l,id:'foreground',kind:'ellipse',slot:undefined},l];
 x.input.assets.push({...x.input.assets[0],id:'still',kind:'image',path:'/image.png'});x.input.shots[0].bindings.push({slot:'still',assetId:'still',sourceIn:0,crop:{x:.1,y:.1,width:.8,height:.8}});
 const a=adaptScene(x.recipe,x.input),code=sceneComposition(a,{audio:'/audio.wav',media:{'one/main':'/main.mp4','one/still':'/image.png'}});
 const data=JSON.parse(code.match(/const data=(.*);\n/)![1]);assert.deepEqual(data.shots[0].blocks.map((b:any)=>b.kind),['draw','image','draw','video']);
 assert.ok(code.includes('plus-lighter'));assert.ok(code.includes('Source-aligned typography'));assert.ok(code.includes('exposureTimes'));
 delete x.recipe.compositor;assert.throws(()=>adaptScene(x.recipe,x.input));
});
test('group cameras have deterministic pixel-aspect-correct transforms and bounded exposure samples',()=>{
 const x=sceneFixture(),l=x.recipe.templates[0].layers[0];l.group='camera';l.pose.x=.75;l.pose.y=.5;
 const groups=[{id:'camera',pose:{...l.pose,x:.5,y:.5,width:2,height:2,rotation:90,opacity:.5},keys:[]}];
 const result=runInNewContext(sceneDrawingRuntime+layeredRuntime+';worldScene(l,.5,groups,100,200)',{l,groups});
 assert.ok(Math.abs(result.x-.5)<1e-9);assert.ok(Math.abs(result.y-.75)<1e-9);assert.equal(result.width,2);assert.equal(result.opacity,.5);
 const times=runInNewContext(layeredRuntime+';exposureTimes(.5,2,{samples:4,shutter:.5})');assert.equal(times.length,4);assert.ok(times.every((t:number)=>t<.5&&t>.49));
 const early=runInNewContext(layeredRuntime+';exposureTimes(0,2,{samples:8,shutter:1})');assert.ok(early.every((t:number)=>t===0));
 x.recipe.compositor='layered-v2';x.recipe.templates[0].groups=groups;adaptScene(x.recipe,x.input);groups[0].pose.height=1;assert.throws(()=>adaptScene(x.recipe,x.input),/uniform/);
});
test('v2 rejects unsupported native-video effects before a render is claimed',()=>{
 for(const effect of [{mask:{kind:'ellipse'}},{motionBlur:{samples:4,shutter:.5}},{shadow:10}]){
  const x=sceneFixture();x.recipe.compositor='layered-v2';Object.assign(x.recipe.templates[0].layers[0],effect);assert.throws(()=>adaptScene(x.recipe,x.input),/unsupported/);
 }
});
test('v2 readability checks the smallest scaled word, not only the base font',()=>{
 const x=sceneFixture();x.recipe.compositor='layered-v2';x.input.captions[0].words[0].scale=.4;
 const a=adaptScene(x.recipe,x.input),code=sceneComposition(a,{audio:'/audio.wav',media:{'one/main':'/main.mp4'}});
 const runtime=code.slice(code.indexOf('function easeScene'),code.indexOf('export default function'));
 const ctx={font:'',measureText:(s:string)=>({width:s.length*20}),save(){},restore(){},fillText(){}};
 assert.throws(()=>runInNewContext(runtime+';drawSceneCaptions(ctx,.6,data)',{ctx,data:a}),/word below minimum readable/);
});
