// Generated-fixture integration only. Never a claim of real-device or human editorial review.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMedia, readDeliveryBundle } from '../src/delivery.ts';
import { portraitHash } from '../src/portrait.ts';
import { jsonHash } from '../src/clips.ts';

if(process.argv.length!==5)throw new Error('Usage: mobile-cli-smoke.ts LEGACY-SMOKE-DIRECTORY NEW-OUTPUT-DIRECTORY LOCAL-FONT.ttf');
const legacy=resolve(process.argv[2]),dir=resolve(process.argv[3]);await mkdir(dir);
for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY_FILE','OPENAI_API_KEY'])delete process.env[key];
const cli=fileURLToPath(new URL('../../../apps/cli/dist/index.js',import.meta.url));
const invoke=async(...args:string[])=>JSON.parse((await runMedia([cli,...args],{binary:process.execPath,limit:8000000})).toString());
const write=async(name:string,value:unknown)=>{const path=join(dir,name);await writeFile(path,JSON.stringify(value,null,2),{flag:'wx'});return path;};
const cache=['--cache-dir',join(legacy,'cache')],base=join(legacy,'accepted.json'),captions=join(dir,'source.srt'),font=join(dir,'source-font.ttf');
const text='1\n00:00:01,800 --> 00:00:02,800\nOpening boundary\n\n2\n00:00:02,800 --> 00:00:03,800\nMobile captions\n\n3\n00:00:05,800 --> 00:00:07,000\nClosing boundary\n';
await writeFile(captions,text,{flag:'wx'});await writeFile(font,await readFile(resolve(process.argv[4])),{flag:'wx'});
const mobile=join(dir,'mobile.json');
await assert.rejects(invoke('playbook','clips','portrait','mobile',base,'--captions',captions,...cache,'-o',join(dir,'missing-font.json')),/font/);
await assert.rejects(invoke('playbook','clips','portrait','mobile',base,'--captions',captions,'--font',font,'--font-family','Not This Font',...cache,'-o',join(dir,'wrong-family.json')),/family/);
const imported=await invoke('playbook','clips','portrait','mobile',base,'--captions',captions,'--font',font,...cache,'-o',mobile);
assert(imported.warnings.length);assert.equal(imported.canPrepare,false);assert.equal(imported.externalModelCalls,0);
const doc=JSON.parse(await readFile(mobile,'utf8'));assert.equal(doc.schemaVersion,2);assert.equal(doc.review,null);
assert.equal(doc.mobile.captions.cues[0].startFrame,0);assert.equal(doc.mobile.captions.cues.at(-1).endFrame,121);
await assert.rejects(invoke('playbook','clips','portrait','prepare',mobile,...cache,'-o',join(dir,'unreviewed')),/review/);
const framing={recipeSha256:portraitHash(doc),reviewer:'Synthetic mobile contract',decision:'accept',
  checks:['subject','context','motion','captions','placement'].map(dimension=>({dimension,outcome:'pass',note:'Fixture assertion only; not human viewing'}))};
await assert.rejects(invoke('playbook','clips','portrait','review',mobile,await write('old-framing.json',{...framing,checks:framing.checks.slice(0,3)}),...cache,'-o',join(dir,'wrong-review.json')));
const accepted=join(dir,'accepted-mobile.json');
await invoke('playbook','clips','portrait','review',mobile,await write('framing.json',framing),...cache,'-o',accepted);
assert((await invoke('playbook','clips','portrait','check',accepted,...cache)).canPrepare);
await writeFile(captions,text+'\n');
await assert.rejects(invoke('playbook','clips','portrait','prepare',accepted,...cache,'-o',join(dir,'changed-caption')),/asset changed/);
await writeFile(captions,text);
const fontBytes=await readFile(font);await writeFile(font,Buffer.concat([fontBytes,Buffer.from('changed')]));
await assert.rejects(invoke('playbook','clips','portrait','prepare',accepted,...cache,'-o',join(dir,'changed-font')),/asset changed/);
await writeFile(font,fontBytes);
const bundle=join(dir,'bundle');await invoke('playbook','clips','portrait','prepare',accepted,...cache,'-o',bundle);
const loaded=await readDeliveryBundle(bundle),prepared=join(bundle,loaded.bundle.clips[0].path);
assert.equal(loaded.bundle.width,360);assert.equal(loaded.bundle.frames,121);
const pixels=async(seconds:number)=>runMedia(['-v','error','-ss',String(seconds),'-i',prepared,'-frames:v','1','-vf','format=rgb24','-f','rawvideo','-']);
const white=(image:Buffer)=>{let count=0;for(let i=0;i<image.length;i+=3)if(image[i]>190&&image[i+1]>190&&image[i+2]>190)count++;return count;};
assert(white(await pixels(.5))>30,'Imported caption must actually render, not just appear in metadata');
assert(white(await pixels(2.7))<10,'Caption must disappear during an uncued interval');
const assPath=join(bundle,'mobile-assets','captions.ass'),ass=await readFile(assPath);
await writeFile(assPath,Buffer.concat([ass,Buffer.from('\n;changed')]));await assert.rejects(readDeliveryBundle(bundle),/caption rendering changed/);await writeFile(assPath,ass);
// Original external assets are no longer required to validate a frozen prepared bundle.
await writeFile(captions,text+'\n');await readDeliveryBundle(bundle);await writeFile(captions,text);
const standin=join(dir,'verification-fixture.mp4');
await runMedia(['-v','error','-n','-i',prepared,'-t',String(121/30),'-frames:v','121','-c:v','libx264','-c:a','aac',standin]);
const packetPath=join(dir,'render-evidence.json');
await invoke('playbook','clips','portrait','inspect',bundle,standin,...cache,'-o',packetPath);
const packet=JSON.parse(await readFile(packetPath,'utf8'));assert.equal(packet.schemaVersion,2);
assert.equal(packet.mobile.width,360);assert.equal(packet.mobile.height,640);assert(packet.mobile.frames.length);
assert(packet.sampleFrames.includes(24));assert(packet.sampleFrames.includes(114));
const review={packetSha256:jsonHash(packet),reviewer:'Synthetic mobile receipt test',decision:'accept',coverage:'Generated fixture; no human viewing or real-device claim',
  evidenceIds:[...packet.artifacts.map((a:{id:string})=>a.id),packet.mobile.preview.id,packet.mobile.frames[0].id],
  checks:['story','speech','framing','continuity','readability','captions','placement'].map(dimension=>({dimension,outcome:'pass',note:'Generated contract assertion only'}))};
const reviewPath=await write('render-review.json',review);
const receipt=await invoke('playbook','clips','portrait','review-render',packetPath,reviewPath,...cache,'-o',join(dir,'receipt.json'));
assert.equal(receipt.status,'agent_review_recorded');assert.equal(receipt.safeToAutoPublish,false);assert.equal(receipt.phoneReview.width,360);
// A new packet/review cannot self-certify arbitrary files using their genuine hashes.
const captionFileHash=doc.mobile.captions.source.sha256;
const fakeMobile={...packet.mobile,preview:{...packet.mobile.preview,path:captions,sha256:captionFileHash},
  frames:packet.mobile.frames.map((f:{id:string;frame:number;path:string;sha256:string})=>({...f,path:captions,sha256:captionFileHash}))};
const fakePacket={...packet,mobile:fakeMobile};
await assert.rejects(invoke('playbook','clips','portrait','review-render',await write('fabricated-packet.json',fakePacket),
  await write('fabricated-review.json',{...review,packetSha256:jsonHash(fakePacket)}),...cache,'-o',join(dir,'fabricated-receipt.json')),/provenance/);
// Even a locally fabricated registry record cannot make a subtitle/text file a video or PNG.
for(const mode of ['motion','frames']) {
  const {recordSha256:discarded,...evidence}=mode==='motion'?fakeMobile:{...fakeMobile,preview:packet.mobile.preview};void discarded;
  const record={schemaVersion:1,kind:'portrait-mobile-inspection-record',sourceVideoPath:packet.videoPath,recipeSha256:packet.recipeSha256,evidence};
  const recordSha256=jsonHash(record);
  await writeFile(join(bundle,'mobile-inspections',`${recordSha256}.json`),JSON.stringify(record,null,2),{flag:'wx'});
  const fabricated={...packet,mobile:{...evidence,recordSha256}};
  await assert.rejects(invoke('playbook','clips','portrait','review-render',await write(`non-media-${mode}-packet.json`,fabricated),
    await write(`non-media-${mode}-review.json`,{...review,packetSha256:jsonHash(fabricated)}),...cache,'-o',join(dir,`non-media-${mode}-receipt.json`)),/Phone-motion|Phone-frame|Media process/);
}
await assert.rejects(invoke('playbook','clips','portrait','review-render',packetPath,await write('no-phone.json',{...review,evidenceIds:packet.artifacts.map((a:{id:string})=>a.id)}),...cache,'-o',join(dir,'no-phone-receipt.json')),/phone-motion/);
await assert.rejects(invoke('playbook','clips','portrait','review-render',packetPath,await write('no-captions-review.json',{...review,checks:review.checks.map(c=>c.dimension==='captions'?{...c,outcome:'not_applicable'}:c)}),...cache,'-o',join(dir,'bad-caption-review.json')),/not-applicable/);
const changed={...packet,mobile:{...packet.mobile,profileSha256:'a'.repeat(64)}};
await assert.rejects(invoke('playbook','clips','portrait','review-render',await write('changed-profile-packet.json',changed),await write('changed-profile-review.json',{...review,packetSha256:jsonHash(changed)}),...cache,'-o',join(dir,'bad-profile-receipt.json')),/profile/);
const phonePath=packet.mobile.frames[0].path,phone=await readFile(phonePath);
await writeFile(phonePath,Buffer.concat([phone,Buffer.from('changed')]));
await assert.rejects(invoke('playbook','clips','portrait','review-render',packetPath,reviewPath,...cache,'-o',join(dir,'changed-evidence-receipt.json')),/Phone-size evidence changed/);
await writeFile(phonePath,phone);
const profileOnly=join(dir,'profile-only.json');
await invoke('playbook','clips','portrait','mobile',base,...cache,'-o',profileOnly);
assert.equal(JSON.parse(await readFile(profileOnly,'utf8')).mobile.captions,null);
const report={passed:true,externalModelCalls:0,bundle,checks:['V1 opt-in upgrade','no paid transcription','explicit matching local font','source-relative clipping','boundary warnings','five framing checks',
  'caption and font drift blocks preparation','caption pixels and timed disappearance','prepared ASS tamper rejection','standalone frozen assets','caption-aware render comparison',
  '360x640 clean motion preview and guided frames','seven render checks','phone evidence required','not-applicable caption rejection','profile/evidence drift rejection'],
  limitation:'Synthetic FFmpeg stand-in validates backend/CLI contracts, not an actual desktop-editor export, human editorial approval, or real-phone viewing.'};
await write('smoke-report.json',report);console.log(JSON.stringify(report));
