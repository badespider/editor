// Local synthetic integration; no real-media review or approval is fabricated.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMedia } from '../src/media-process.ts';
import { probe } from '../src/preview.ts';

const dir=resolve(process.argv[2]),font=resolve(process.argv[3]);await mkdir(dir);
for(const k of ['GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY_FILE','OPENAI_API_KEY'])delete process.env[k];
const cli=fileURLToPath(new URL('../../../apps/cli/dist/index.js',import.meta.url));
const invoke=async(...args:string[])=>JSON.parse((await runMedia([cli,...args],{binary:process.execPath,limit:8000000})).toString());
const write=async(name:string,value:unknown)=>{const path=join(dir,name);await writeFile(path,JSON.stringify(value,null,2),{flag:'wx'});return path;};
const cache=['--cache-dir',join(dir,'cache')],video=join(dir,'fixture.mp4');
await runMedia(['-v','error','-n','-f','lavfi','-i','color=red:s=320x180:r=30:d=8,drawbox=x=107:y=0:w=106:h=180:color=green:t=fill,drawbox=x=213:y=0:w=107:h=180:color=blue:t=fill',
  '-f','lavfi','-i','aevalsrc=0.1*sin(2*PI*(300*t+17*t*t)):s=48000:d=8','-c:v','libx264','-c:a','aac',video]);
const opened=await invoke('media','understand',video,...cache,'--overview-count','2');
const inspected=await invoke('media','inspect',opened.sessionId,...cache,'--start','0','--end','8','--count','2','--clip');
const artifact=inspected.artifacts.find((a:{kind:string})=>a.kind==='clip');
await invoke('media','observe',opened.sessionId,await write('observations.json',{sourceSha256:opened.source.sha256,author:'Synthetic test',observations:[{id:'event',start:3,end:4,
  observation:'Generated test columns',modalities:['visual'],evidenceIds:[artifact.id]}]}),...cache);
const proposed=await invoke('playbook','clips','propose',opened.sessionId,...cache,'--goal','columns','--count','1','--min-duration','2','--max-duration','6','--context-seconds','1','-o',join(dir,'proposed.json'));
const collection=proposed.collection,candidate=collection.candidates[0];candidate.range={start:2,end:6+1/30};
const collectionPath=await write('candidates.json',collection),before=await readFile(collectionPath,'utf8');
const base={reason:'Known synthetic colors, not a human viewing claim',evidenceIds:[artifact.id]};
const recipe=await write('recipe.json',{sourceWidth:320,sourceHeight:180,width:360,height:640,fps:30,frames:121,shots:[
  {...base,startFrame:0,endFrame:30,mode:'cover',keyframes:[{frame:0,x:.18,y:.5},{frame:29,x:.82,y:.5}]},
  {...base,startFrame:30,endFrame:60,mode:'cover',keyframes:[{frame:30,x:.18,y:.5}]},
  {...base,startFrame:60,endFrame:121,mode:'contain',keyframes:[]}]});
const captions=join(dir,'captions.srt');await writeFile(captions,'1\n00:00:02,500 --> 00:00:03,500\nDRAFT TEST\n',{flag:'wx'});
const output=join(dir,'fixture_DRAFT.mp4');
const args=['playbook','clips','portrait','draft-export',collectionPath,candidate.id,...cache,'--recipe',recipe,'--captions',captions,'--font',font,'-o',output];
await assert.rejects(invoke(...args),/acknowledge/);
const rendered=await invoke(...args,'--acknowledge-unreviewed');
assert.equal(rendered.status,'unreviewed_draft');assert.equal(rendered.safeToAutoPublish,false);assert.equal(rendered.decodePassed,true);
assert(rendered.needs.length);assert.equal(rendered.recipe.frames,121);assert.equal(rendered.mobile.captions.cues[0].startFrame,15);
assert.equal(await readFile(collectionPath,'utf8'),before);
const info=await probe(output);assert.equal(info.width,360);assert.equal(info.height,640);assert(info.hasAudio);assert(Math.abs(info.duration-121/30)<.034);
const pixel=async(f:number,x:number,y:number)=>[...(await runMedia(['-v','error','-ss',String(Math.max(0,f/30-1e-7)),'-i',output,'-frames:v','1','-vf',`format=rgb24,crop=1:1:${x}:${y}:exact=1`,'-f','rawvideo','-']))];
const red=await pixel(0,180,320),blue=await pixel(29,180,320),jump=await pixel(30,180,320),bar=await pixel(60,180,10);
assert(red[0]>180&&red[2]<40);assert(blue[2]>180&&blue[0]<40);assert(jump[0]>180&&jump[2]<40);assert(bar.every(v=>v<40));
// White caption glyph pixels exist within the configured bottom safe area.
const pixels=await runMedia(['-v','error','-ss','0.75','-i',output,'-frames:v','1','-vf','format=rgb24,crop=280:100:20:410','-f','rawvideo','-']);
let white=0;for(let i=0;i<pixels.length;i+=3)if(pixels[i]>200&&pixels[i+1]>200&&pixels[i+2]>200)white++;
assert(white>20,'caption glyphs should be burned in');
await assert.rejects(invoke(...args,'--acknowledge-unreviewed'),/already exists/);
await assert.rejects(invoke('playbook','clips','portrait','init',collectionPath,candidate.id,...cache,'-o',join(dir,'blocked.json')),/review/);
const report={passed:true,externalModelCalls:0,checks:['acknowledgement required','unreviewed status retained','no mutation of candidates','source-time captions','pan, cut and contain pixels','visible caption glyphs','fractional-frame duration and audio','full decode','no overwrite','approved path still blocked'],output};
await write('smoke-report.json',report);console.log(JSON.stringify(report));
