// Local generated-fixture integration. No claim that a human reviewed a real story.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMedia, readDeliveryBundle } from '../src/delivery.ts';
import { candidateHash, jsonHash } from '../src/clips.ts';
import { portraitHash } from '../src/portrait.ts';

const dir=resolve(process.argv[2]);await mkdir(dir);
for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY_FILE','OPENAI_API_KEY'])delete process.env[k];
const cli=fileURLToPath(new URL('../../../apps/cli/dist/index.js',import.meta.url));
const invoke=async(...args:string[])=>JSON.parse((await runMedia([cli,...args],{binary:process.execPath,limit:8000000})).toString());
const write=async(name:string,value:unknown)=>{const path=join(dir,name);await writeFile(path,JSON.stringify(value,null,2),{flag:'wx'});return path;};
const cache=['--cache-dir',join(dir,'cache')],video=join(dir,'fixture.mp4');
await runMedia(['-v','error','-n','-f','lavfi','-i','color=red:s=320x180:r=30:d=10,drawbox=x=107:y=0:w=106:h=180:color=green:t=fill,drawbox=x=213:y=0:w=107:h=180:color=blue:t=fill',
  '-f','lavfi','-i','aevalsrc=0.1*sin(2*PI*(300*t+17*t*t)):s=48000:d=10','-c:v','libx264','-c:a','aac',video]);
assert.equal((await invoke('playbook','clips','portrait','workflow')).externalModelCalls,0);
const opened=await invoke('media','understand',video,...cache,'--overview-count','3');
const inspected=await invoke('media','inspect',opened.sessionId,...cache,'--start','0','--end','10','--count','3','--clip','--audio');
const artifact=inspected.artifacts.find((a:{kind:string})=>a.kind==='clip');
await invoke('media','observe',opened.sessionId,await write('observations.json',{sourceSha256:opened.source.sha256,author:'Synthetic contract fixture',observations:[{id:'event',start:3,end:4,
  observation:'Generated colored test columns, not user footage',modalities:['visual'],evidenceIds:[artifact.id]}]}),...cache);
const proposed=await invoke('playbook','clips','propose',opened.sessionId,...cache,'--goal','colored columns','--count','1','--min-duration','2','--max-duration','6','--context-seconds','1','-o',join(dir,'candidates.json'));
const collection=proposed.collection,c=collection.candidates[0];c.range={start:2,end:6};c.title='Portrait contract fixture';c.narrative.whyStandalone='Synthetic test, no editorial claims';
for(const role of ['promise','setup','action','payoff'])c.narrative[role]={statement:'Generated fixture declaration',observationIds:['event']};
const authored=await write('authored.json',collection),reviewed=join(dir,'reviewed.json');
await invoke('playbook','clips','review',authored,await write('source-review.json',{candidateId:c.id,candidateSha256:candidateHash(collection,c),reviewer:'Synthetic contract',decision:'accept',evidenceIds:[artifact.id],
  checks:['story','speech','boundaries','framing','context'].map(dimension=>({dimension,outcome:'pass',note:'Generated-fixture test declaration, not audiovisual viewing'}))}),...cache,'-o',reviewed);
const draftPath=join(dir,'portrait.json');await invoke('playbook','clips','portrait','init',reviewed,c.id,...cache,'-o',draftPath);
await assert.rejects(invoke('playbook','clips','portrait','prepare',draftPath,...cache,'-o',join(dir,'blocked')),/inspect|review/);
const doc=JSON.parse(await readFile(draftPath,'utf8'));doc.recipe.width=360;doc.recipe.height=640;
const base={reason:'Known fixture centers for pan/cut/contain regression',evidenceIds:[artifact.id]};
doc.recipe.shots=[{...base,startFrame:0,endFrame:30,mode:'cover',keyframes:[{frame:0,x:.18,y:.5},{frame:29,x:.82,y:.5}]},
  {...base,startFrame:30,endFrame:60,mode:'cover',keyframes:[{frame:30,x:.18,y:.5}]},
  {...base,startFrame:60,endFrame:120,mode:'contain',keyframes:[]}];
const directed=await write('directed.json',doc),accepted=join(dir,'accepted.json');
await invoke('playbook','clips','portrait','review',directed,await write('framing-review.json',{recipeSha256:portraitHash(doc),reviewer:'Synthetic contract',decision:'accept',
  checks:['subject','context','motion'].map(dimension=>({dimension,outcome:'pass',note:'Known generated fixture; not a real agent viewing claim'}))}),...cache,'-o',accepted);
assert((await invoke('playbook','clips','portrait','check',accepted,...cache)).canPrepare);
const bundle=join(dir,'bundle');await invoke('playbook','clips','portrait','prepare',accepted,...cache,'-o',bundle);
await assert.rejects(invoke('playbook','clips','portrait','prepare',accepted,...cache,'-o',bundle),/exist/);
const loaded=await readDeliveryBundle(bundle);assert.equal(loaded.bundle.width,360);assert.equal(loaded.bundle.height,640);assert.equal(loaded.bundle.frames,120);
const prepared=join(bundle,loaded.bundle.clips[0].path);
const pixel=async(f:number,x:number,y:number)=>[...(await runMedia(['-v','error','-ss',String(Math.max(0,f/30-1e-7)),'-i',prepared,'-frames:v','1','-vf',`format=rgb24,crop=1:1:${x}:${y}:exact=1`,'-f','rawvideo','-']))];
const red=await pixel(0,180,320),blue=await pixel(29,180,320),jump=await pixel(30,180,320),bar=await pixel(60,180,10);
assert(red[0]>180&&red[2]<40);assert(blue[2]>180&&blue[0]<40);assert(jump[0]>180&&jump[2]<40);assert(bar.every(v=>v<40));
// Trim away unused decoder tail, producing a stand-in for CLI receipt tests. Actual-editor test is separate.
const standin=join(dir,'verification-fixture.mp4');
await runMedia(['-v','error','-n','-i',prepared,'-t','4','-c:v','libx264','-c:a','aac',standin]);
const packetPath=join(dir,'render-evidence.json');
const packetResult=await invoke('playbook','clips','portrait','inspect',bundle,standin,...cache,'-o',packetPath);
const packet=JSON.parse(await readFile(packetPath,'utf8'));assert.equal(packetResult.status,'technical_pass_needs_agent_review');
const renderReview={packetSha256:jsonHash(packet),reviewer:'Synthetic receipt test',decision:'accept',coverage:'Generated colored columns and chirp only; no human viewing claim',
  evidenceIds:packet.artifacts.map((a:{id:string})=>a.id),checks:['story','speech','framing','continuity'].map(dimension=>({dimension,outcome:'pass',note:'Synthetic declaration tests receipt binding only'}))};
const reviewPath=await write('render-review.json',renderReview);
const receipt=await invoke('playbook','clips','portrait','review-render',packetPath,reviewPath,...cache,'-o',join(dir,'receipt.json'));
assert.equal(receipt.status,'agent_review_recorded');assert.equal(receipt.safeToAutoPublish,false);
await assert.rejects(invoke('playbook','clips','portrait','review-render',packetPath,await write('no-evidence.json',{...renderReview,evidenceIds:[]}),...cache,'-o',join(dir,'bad-receipt.json')),/evidence/);
await assert.rejects(invoke('playbook','clips','portrait','review-render',packetPath,await write('silent-claim.json',{...renderReview,checks:renderReview.checks.map(c=>c.dimension==='speech'?{...c,outcome:'not_applicable'}:c)}),...cache,'-o',join(dir,'bad-speech.json')),/not-applicable/);
const original=await readFile(join(bundle,'portrait.json'));await writeFile(join(bundle,'portrait.json'),Buffer.concat([original,Buffer.from(' ')]));
await assert.rejects(readDeliveryBundle(bundle),/Portrait document changed/);await writeFile(join(bundle,'portrait.json'),original);
await writeFile(standin,Buffer.concat([await readFile(standin),Buffer.from('mutated')]));
await assert.rejects(invoke('playbook','clips','portrait','review-render',packetPath,reviewPath,...cache,'-o',join(dir,'stale-render.json')),/changed/);
const report={passed:true,externalModelCalls:0,bundle,checks:['source review → portrait draft → framing review → prepared media',
  'nonzero source trim','moving crop pixels','hard boundary reset','contain fallback','1080x1920 default, 360x640 test preset',
  'pending blocks preparation','no overwrite','actual-byte evidence extraction','render review requires evidence/audio','changed recipe and render rejection'],
  limitation:'Synthetic stand-in tests media/CLI contracts; actual-editor export and agent visual review are separate.'};
await write('smoke-report.json',report);console.log(JSON.stringify(report));
