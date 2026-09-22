// Local synthetic CLI contract regression. No external services or real storytelling claims.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMedia } from '../src/delivery.ts';
import { candidateHash } from '../src/clips.ts';
import { clipCollectionSchema } from '../src/clip-schema.ts';

const dir=resolve(process.argv[2]); await mkdir(dir);
for(const key of ['GEMINI_API_KEY','GOOGLE_API_KEY','GEMINI_API_KEY_FILE','OPENAI_API_KEY'])delete process.env[key];
const cli=fileURLToPath(new URL('../../../apps/cli/dist/index.js',import.meta.url));
const invoke=async(...args:string[])=>JSON.parse((await runMedia([cli,...args],{binary:process.execPath})).toString());
const cache=['--cache-dir',join(dir,'cache')];
const write=async(name:string,data:unknown)=>{const path=join(dir,name);await writeFile(path,JSON.stringify(data,null,2),{flag:'wx'});return path;};
const video=join(dir,'synthetic.mp4');
await runMedia(['-v','error','-n','-f','lavfi','-i','testsrc2=s=320x180:r=30:d=10','-f','lavfi','-i',
  'aevalsrc=0.1*sin(2*PI*(300*t+17*t*t)):s=48000:d=10','-c:v','libx264','-c:a','aac',video]);
const workflow=await invoke('playbook','clips','workflow');assert.equal(workflow.externalModelCalls,0);assert(workflow.schemas.review.properties.candidateSha256);
assert.equal(workflow.proposalStrategies.default,'balanced');
const session=await invoke('media','understand',video,...cache,'--overview-count','3');
const noEvidence=await invoke('playbook','clips','propose',session.sessionId,...cache,'--goal','Find fixture events','--min-duration','2','--max-duration','3','-o',join(dir,'empty.json'));
assert.equal(noEvidence.proposed,0);assert.equal(noEvidence.status,'needs_inspection');assert.equal(noEvidence.diagnostics.query.status,'no_evidence');
const inspected=await invoke('media','inspect',session.sessionId,...cache,'--start','0','--end','10','--count','5','--audio','--clip');
const artifact=inspected.artifacts.find((a:{kind:string})=>a.kind==='clip');
const observation=await write('observations.json',{sourceSha256:session.source.sha256,author:'Synthetic contract fixture',observations:[1,4,7].map((start,i)=>({id:`event-${i}`,start,end:start+1,
  observation:`Known generated test pattern ${i}; not a claim about user footage`,modalities:['visual'],evidenceIds:[artifact.id]}))});
await invoke('media','observe',session.sessionId,observation,...cache);
const proposalPath=join(dir,'candidates.json');
const proposals=await invoke('playbook','clips','propose',session.sessionId,...cache,'--goal','generated test pattern','--min-duration','2','--max-duration','3','--context-seconds','1','-o',proposalPath);
assert.equal(proposals.proposed,3);assert.equal(proposals.strategy,'balanced');assert.equal(proposals.diagnostics.candidates.length,3);
assert.equal(Object.hasOwn(proposals.collection,'diagnostics'),false);
const legacy=await invoke('playbook','clips','propose',session.sessionId,...cache,'--goal','generated test pattern','--min-duration','2','--max-duration','3',
  '--context-seconds','1','--strategy','legacy','-o',join(dir,'legacy-candidates.json'));
assert.equal(legacy.strategy,'legacy');assert.equal(legacy.diagnostics,null);assert.equal(legacy.proposed,3);
await assert.rejects(invoke('playbook','clips','propose',session.sessionId,...cache,'--goal','fixture','--strategy','unknown','-o',join(dir,'invalid-strategy.json')),/Allowed choices|invalid|balanced/);
await assert.rejects(invoke('playbook','clips','plan',proposalPath,'clip-1',...cache,'-o',join(dir,'not-approved.json')),/needs review/);
const authored=clipCollectionSchema.parse(proposals.collection);
for(const [i,c] of authored.candidates.entries()) {
  c.title=`Synthetic clip ${i+1}`;c.narrative.whyStandalone='Contract test only, not a completed creative evaluation';
  assert.equal(c.seed.type,'observation');
  for(const role of ['promise','setup','action','payoff'] as const)c.narrative[role]={statement:`Known fixture ${role}`,observationIds:[c.seed.id]};
}
let current=await write('authored.json',authored);
for(const candidate of authored.candidates) {
  const packet=clipCollectionSchema.parse(JSON.parse(await readFile(current,'utf8')));
  const c=packet.candidates.find(c=>c.id===candidate.id)!;
  const review=await write(`${c.id}-review.json`,{candidateId:c.id,candidateSha256:candidateHash(packet,c),reviewer:'Synthetic contract fixture; not a human viewing claim',decision:'accept',evidenceIds:[artifact.id],
    checks:['story','speech','boundaries','framing','context'].map(dimension=>({dimension,outcome:'pass',note:'Generated fixture declaration for command-path testing'}))});
  const output=join(dir,`${c.id}-reviewed.json`);
  await invoke('playbook','clips','review',current,review,...cache,'-o',output);current=output;
}
const checked=await invoke('playbook','clips','check',current,...cache);assert(checked.results.every((r:{canCreatePlan:boolean})=>r.canCreatePlan));
for(const candidate of authored.candidates) {
  const output=join(dir,`${candidate.id}-plan.json`);
  await invoke('playbook','clips','plan',current,candidate.id,...cache,'-o',output);
  assert.equal((await invoke('playbook','check',output)).technicalPass,true);
  await assert.rejects(invoke('playbook','clips','plan',current,candidate.id,...cache,'-o',output),/already exists/);
}
const settings=await write('settings.json',{width:320,height:180});
await invoke('playbook','prepare',join(dir,'clip-1-plan.json'),'-o',join(dir,'short-bundle'),'--settings',settings);
const changed=clipCollectionSchema.parse(JSON.parse(await readFile(current,'utf8')));changed.candidates[0].title+=' changed';
await assert.rejects(invoke('playbook','clips','plan',await write('stale.json',changed),'clip-1',...cache,'-o',join(dir,'stale-plan.json')),/stale/);
const linkedChecks:string[]=[];
if(process.argv[3] && process.argv[4]) {
  // Optional read-only fixture: a prior actual-editor export, freshly verified against its bundle.
  const bundle=resolve(process.argv[3]),render=resolve(process.argv[4]),receiptPath=join(dir,'long-form-review.json');
  const receipt=await invoke('playbook','verify',bundle,render,'-o',receiptPath);
  assert(receipt.bundleIdentity);
  const rendered=await invoke('media','understand',render,...cache,'--overview-count','2');
  const view=await invoke('media','inspect',rendered.sessionId,...cache,'--start','0','--end','3','--count','2','--clip');
  const record=await write('render-observation.json',{sourceSha256:rendered.source.sha256,author:'Synthetic provenance fixture',observations:[{id:'render-fixture',start:.5,end:1.5,
    observation:'Previously generated render fixture',modalities:['visual'],evidenceIds:[view.artifacts.find((a:{kind:string})=>a.kind==='clip').id]}]});
  await invoke('media','observe',rendered.sessionId,record,...cache);
  const linked=join(dir,'linked-candidates.json');
  await invoke('playbook','clips','propose',rendered.sessionId,...cache,'--goal','fixture','--count','1','--min-duration','1','--max-duration','2','-o',linked,
    '--delivery-bundle',bundle,'--delivery-review',receiptPath);
  const linkCheck=await invoke('playbook','clips','check',linked,...cache);assert.equal(linkCheck.originalMapping,'delivery_receipt_linked');assert(linkCheck.candidates[0].originalSpans.length);
  const wrong=await write('wrong-receipt.json',{...receipt,sha256:'0'.repeat(64)});
  await assert.rejects(invoke('playbook','clips','propose',rendered.sessionId,...cache,'--goal','fixture','--min-duration','1','--max-duration','2','-o',join(dir,'wrong-link.json'),
    '--delivery-bundle',bundle,'--delivery-review',wrong),/does not bind/);
  await writeFile(receiptPath,JSON.stringify({...receipt,bundleIdentity:{...receipt.bundleIdentity,planSha256:'0'.repeat(64)}}));
  await assert.rejects(invoke('playbook','clips','check',linked,...cache),/review changed/);
  linkedChecks.push('actual-export receipt/source/bundle binding','original source mapping','wrong export and changed receipt rejected');
}
await writeFile(video,Buffer.concat([await readFile(video),Buffer.from('changed fixture')]));
await assert.rejects(invoke('playbook','clips','check',current,...cache),/Source changed/);
const report={passed:true,externalModelCalls:0,checks:['workflow schemas','empty evidence produces no highlights','three distinct proposals','pending blocks plan',
  'balanced diagnostics outside strict collection','explicit legacy baseline','invalid strategy rejected',
  'recorded review and plan export across processes','no overwrite','prepared clip bundle','stale review','changed source',...linkedChecks],
  limitation:'Synthetic contract checks do not establish actual storytelling quality or human audiovisual review'};
await write('smoke-report.json',report);console.log(JSON.stringify(report));
