// Synthetic state-machine regression. Fixture findings are NOT claims of viewing/listening.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprint } from '../src/preview.ts';
import { styleDimensions } from '../src/scene-motion.ts';

const repository=fileURLToPath(new URL('../../../',import.meta.url)),cli=join(repository,'apps/cli/dist/index.js');
const root=await mkdtemp(join(tmpdir(),'scene-smoke-')),cache=join(root,'evidence'),job=join(root,'job');
const env={...process.env,GEMINI_API_KEY:'',GOOGLE_API_KEY:'',OPENAI_API_KEY:''};
const call=(...args:string[])=>JSON.parse(execFileSync(process.execPath,[cli,...args],{cwd:repository,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024**2}));
const run=(...args:string[])=>call('playbook','motion','scene',...args);
const fails=(...args:string[])=>assert.notEqual(spawnSync(process.execPath,[cli,'playbook','motion','scene',...args],{cwd:repository,env,encoding:'utf8',timeout:60000}).status,0);
const json=async(name:string,data:unknown)=>{const p=join(root,name);await writeFile(p,JSON.stringify(data),{flag:'wx'});return p;};
const source=join(root,'source.mp4');
execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-n','-f','lavfi','-i','testsrc2=s=320x480:r=30000/1001:d=3',
 '-f','lavfi','-i','sine=frequency=440:duration=3','-c:v','libx264','-c:a','aac','-output_ts_offset','3','-shortest',source],{env});
const session=call('media','understand',source,'--overview-count','1','--cache-dir',cache);
const sessionId=session.id??session.sessionId;
const sequence=call('media','reference','extract',sessionId,'--start','0','--end','.2','--cache-dir',cache);
const hash=await fingerprint(source),font={family:'Arial',size:.06,weight:800,color:'#FFFFFF',italic:false};
const pose={x:.5,y:.5,width:1,height:1,rotation:0,opacity:1,blur:0,skewX:0,reveal:1};
const recipe={schemaVersion:1,kind:'scene-motion-recipe',style:{name:'SYNTHETIC REGRESSION; no real viewing',
 references:[{id:'fixture',cache,sessionId,sequenceId:sequence.id,sequenceSha256:sequence.sequenceSha256,inspectedFrames:[0,1,2,3,4,5]}],
 criteria:styleDimensions.map(d=>({id:d,dimension:d,essential:true,requirement:'Injected synthetic '+d,evidence:[{referenceId:'fixture',frames:[0,1]}]})),avoid:[],uncertainties:['Synthetic fixture only']},
 templates:[{id:'picture',background:'#111111',layers:[{id:'video',kind:'video',slot:'main',pose,keys:[],fill:'#FFFFFF',stroke:'#FFFFFF',strokeWidth:0,shadow:0}]}],
 caption:{font,box:{x:.1,y:.65,width:.8,height:.2},minFontSize:.025,lineGap:1.2,entrySeconds:.08,lift:.01,blur:2,uppercase:true,shadow:4}};
const input={width:320,height:480,fps:30,assets:[{id:'a',path:source,sha256:hash,kind:'video',provenance:'Synthetic local fixture',permission:'original'}],
 audio:{assetId:'a',start:0,end:2},transcript:{sourceSha256:hash,provenance:'Synthetic, not real speech',verification:'unverified',words:[{id:'w1',text:'Test',start:.1,end:.5},{id:'w2',text:'words',start:.8,end:1.5}]},
 shots:[{id:'one',templateId:'picture',start:0,end:2,purpose:'Synthetic',criteria:[...styleDimensions],framing:{rationale:'Synthetic',evidence:['test fixture'],protectedRegions:[]},bindings:[{slot:'main',assetId:'a',sourceIn:0}]}],
 captions:[{id:'words',start:0,end:2,words:[{wordId:'w1',row:0,scale:1},{wordId:'w2',row:1,scale:1.5}]}]};
const rp=await json('recipe.json',recipe),ip=await json('input.json',input);
const distorted=structuredClone(input);distorted.width=480;fails('start',rp,await json('distorted.json',distorted),'-o',join(root,'distorted-job'));
assert.equal(run('workflow').externalModelCalls,0);assert.equal(run('start',rp,ip,'-o',job,'--max-corrections','1').stage,'needs_render');fails('start',rp,ip,'-o',job);
// A non-frame-aligned source trim must not leave a one-frame hole in the editor.
const offsetInput=structuredClone(input);offsetInput.shots[0].bindings[0].sourceIn=.18;
const offsetJob=join(root,'offset-job');
assert.equal(run('start',rp,await json('offset-input.json',offsetInput),'-o',offsetJob).stage,'needs_render');
const preparedProbe=JSON.parse(execFileSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-select_streams','v:0',
 '-show_entries','stream=start_time,nb_frames,duration','-of','json',join(offsetJob,'revision-0','one-main.mp4')],{env,encoding:'utf8'})).streams[0];
assert.equal(Number(preparedProbe.nb_frames),60,'Prepared picture must cover every requested output frame');
assert.equal(Number(preparedProbe.start_time),0,'Prepared picture must begin at output time zero');
assert.equal(Number(preparedProbe.duration),2);
// V2 still-image crops keep source integrity and freeze correctly sized assets.
const still=join(root,'still.png');
execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-n','-i',source,'-frames:v','1',still],{env});
const richRecipe=structuredClone(recipe) as any,richInput=structuredClone(input) as any;
richRecipe.compositor='layered-v2';
richRecipe.templates[0].layers.unshift({id:'behind',kind:'rect',pose,keys:[],fill:'#0000FF',stroke:'#FFFFFF',strokeWidth:0,shadow:0});
richRecipe.templates[0].layers.push({id:'photo',kind:'image',slot:'photo',pose:{...pose,width:.5,height:1/3},keys:[],fill:'#FFFFFF',stroke:'#FFFFFF',strokeWidth:0,shadow:5,mask:{kind:'ellipse'}});
richInput.assets.push({id:'still',path:still,sha256:await fingerprint(still),kind:'image',provenance:'Synthetic native frame fixture',permission:'original'});
richInput.shots[0].bindings.push({slot:'photo',assetId:'still',sourceIn:0,crop:{x:.1,y:.1,width:.5,height:1/3}});
const richJob=join(root,'rich-job');
assert.equal(run('start',await json('rich-recipe.json',richRecipe),await json('rich-input.json',richInput),'-o',richJob).stage,'needs_render');
const stillProbe=JSON.parse(execFileSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',join(richJob,'revision-0','one-photo.png')],{env,encoding:'utf8'})).streams[0];
assert.equal(stillProbe.width,160);assert.equal(stillProbe.height,160);
assert.equal(await fingerprint(still),richInput.assets[1].sha256);
// Deliberately synthetic placeholder: test inspection/review state, NOT the actual scene render.
const placeholder=join(root,'placeholder.mp4');
execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-n','-i',join(job,'revision-0','one-main.mp4'),
 '-i',join(job,'revision-0','narration.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-t','2',placeholder],{env});
const render=async(i:number)=>{await copyFile(placeholder,join(job,`revision-${i}`,'preview_DRAFT.mp4'));return run('inspect',job);};
const preview=await render(0);
const makeReview=(p:any)=>({revisionSha256:p.revisionSha256,renderSha256:p.renderSha256,inspectionSha256:p.inspectionSha256,
 reviewer:'SYNTHETIC injected state transitions; not actual perception',inspectedEvidenceIds:p.evidence.filter((e:any)=>e.kind==='frame').map((e:any)=>e.id),
 criteria:styleDimensions.map((d,i)=>({criterionId:d,status:i===0?'fail':'unknown',note:'Synthetic fixture finding',renderEvidenceIds:[p.evidence.find((e:any)=>e.role==='render'&&e.kind==='frame').id],referenceEvidenceIds:['ref-fixture-0']})),
 checks:['readability','continuity','speech_sync','audio'].map(kind=>({kind,status:'unknown',note:'Not inspected; synthetic fixture',renderEvidenceIds:[],referenceEvidenceIds:[]}))});
const reviewPath=await json('review.json',makeReview(preview)),reviewed=run('review',job,reviewPath);assert.equal(reviewed.stage,'needs_correction');assert.equal(reviewed.review.styleMatch,'mismatch');
const correction={revisionSha256:reviewed.revisionSha256,reviewSha256:reviewed.reviewSha256,reason:'Synthetic correction',recipe:structuredClone(recipe),input};
fails('correct',job,await json('noop.json',correction));
correction.recipe.caption.font.size=.07;const cp=await json('correction.json',correction);
const weakened=structuredClone(correction);weakened.recipe.style.criteria[0].requirement='Weakened';fails('correct',job,await json('weakened.json',weakened));
assert.equal(run('correct',job,cp).stage,'needs_render');fails('correct',job,cp);fails('review',job,reviewPath);
const next=await render(1);const stopped=run('review',job,await json('review1.json',makeReview(next)));assert.equal(stopped.stage,'correction_limit');
const over={...correction,revisionSha256:stopped.revisionSha256,reviewSha256:stopped.reviewSha256};fails('correct',job,await json('over.json',over));
assert.equal(await fingerprint(source),hash);
// Failed integrity checks remain diagnostic, never trigger another export.
const prepared=join(job,'revision-1','one-main.mp4');await writeFile(prepared,Buffer.from('tamper synthetic prepared media'));fails('inspect',job);
const inputBad=structuredClone(input);inputBad.assets[0].sha256='b'.repeat(64);inputBad.transcript.sourceSha256='b'.repeat(64);
fails('start',rp,await json('bad-source.json',inputBad),'-o',join(root,'bad-job'));
console.log(JSON.stringify({passed:true,root,actualEditorRenders:0,fixtureNotPerception:true,externalModelCalls:0},null,2));
