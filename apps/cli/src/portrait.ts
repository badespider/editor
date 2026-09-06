import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Command } from 'commander';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import { portraitDocumentSchema, portraitReviewSchema, portraitRenderReviewSchema, portraitSampleFrames } from '@diffusionstudio/editing-playbook';
import { draftPortrait, checkPortrait, recordPortraitReview, portraitHash } from '@diffusionstudio/editing-playbook/portrait';
import { clipToPlan, jsonHash } from '@diffusionstudio/editing-playbook/clips';
import { prepareDelivery, probePortraitSource, readDeliveryBundle } from '@diffusionstudio/editing-playbook/delivery';
import { verifyDelivery } from '@diffusionstudio/editing-playbook/review';
import { fingerprint } from '@diffusionstudio/editing-playbook/node';
import { deliveryFor, loadCollection, loadSource, readJson, writeJson } from './clips';

const print = (value: unknown) => console.log(JSON.stringify(value,null,2));
const safe = <A extends unknown[]>(fn:(...args:A)=>Promise<void>) => async(...args:A) => {
  try { await fn(...args); } catch(error) { console.error((error as Error).message); process.exitCode=1; }
};
type Options = {output:string;cacheDir?:string};
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const packetSchema=z.object({
  schemaVersion:z.literal(1),kind:z.literal('portrait-render-evidence'),bundleDirectory:z.string(),videoPath:z.string(),
  videoSha256:hash,recipeSha256:hash,sessionId:hash,manifestSha256:hash,technicalPass:z.literal(true),
  sampleFrames:z.array(z.number().int().nonnegative()).min(1).max(512),audioRequired:z.boolean(),
  artifacts:z.array(z.object({id:z.string(),path:z.string(),sha256:hash,kind:z.enum(['frame','audio','clip']),start:z.number(),end:z.number()}).strict()).max(1024),
  contactSheets:z.array(z.object({path:z.string(),sha256:hash,frameIds:z.array(z.string()).max(48)}).strict()).max(16).optional(),
  reviewRequired:z.literal(true),externalModelCalls:z.literal(0),
}).strict();

async function loadPortrait(path:string,options:Options) {
  const doc=portraitDocumentSchema.parse(await readJson(path));
  const context=await loadSource(doc.collection.source.sessionId,options.cacheDir);
  const geometry=await probePortraitSource(context.source.path);
  // Includes optional original-source receipt validation, not just the portrait snapshot.
  await deliveryFor(doc.collection);
  const ids=new Set(doc.recipe.shots.flatMap(s=>s.evidenceIds));
  for(const a of context.inspections.flatMap(i=>i.artifacts).filter(a=>ids.has(a.id))) {
    if (!(await stat(a.path)).isFile()) throw new Error('Cited framing evidence is unavailable');
  }
  return {doc,context,geometry,check:checkPortrait(doc,context,geometry)};
}
export function registerPortraitCommands(clips:Command) {
  const portrait=clips.command('portrait').description('Agent-directed mobile framing, preparation and actual-render review; no additional AI');
  portrait.command('workflow').action(()=>print({version:1,provider:'agent',instructions:'reference/portrait.md',
    commands:['playbook clips portrait init reviewed.json clip-1 -o portrait.json',
      'playbook clips portrait check portrait.json',
      'playbook clips portrait review portrait.json framing-review.json -o reviewed-portrait.json',
      'playbook clips portrait prepare reviewed-portrait.json -o bundle',
      'playbook deliver bundle -o short.mp4',
      'playbook clips portrait inspect bundle short.mp4 -o render-evidence.json',
      'playbook clips portrait review-render render-evidence.json render-review.json -o reviewed-render.json'],
    schemas:{document:z.toJSONSchema(portraitDocumentSchema),framingReview:z.toJSONSchema(portraitReviewSchema),
      renderReview:z.toJSONSchema(portraitRenderReviewSchema),renderPacket:z.toJSONSchema(packetSchema)},
    constraints:['Source review precedes portrait work. Centered draft is not a subject-detection result.',
      'Agent authors shot boundaries and normalized centers from inspected source frames. Linear pans never cross shot boundaries.',
      'Preparation bakes framing into media; delivery renders one scene in a new project.',
      'Render evidence must actually be opened. A technical pass does not record audiovisual review.',
      'No automatic captions, tracking model, API calls, uploads or publishing.'],externalModelCalls:0}));
  portrait.command('init').argument('<reviewed-candidates.json>').argument('<candidate-id>')
    .requiredOption('-o, --output <portrait.json>').option('--cache-dir <directory>')
    .action(safe(async(path:string,id:string,options:Options)=>{
      const {collection,context}=await loadCollection(path,options);
      const geometry=await probePortraitSource(context.source.path);
      const doc=draftPortrait(collection,context,id,geometry);
      await writeJson(options.output,doc);
      print({path:resolve(options.output),...checkPortrait(doc,context,geometry)});
    }));
  portrait.command('check').argument('<portrait.json>').option('--cache-dir <directory>')
    .action(safe(async(path:string,options:Options)=>{
      const {doc,check}=await loadPortrait(path,options);
      print({...check,inspectArgs:Array.from({length:Math.ceil(check.sourceTimes.length/48)},(_,i)=>
        ['media','inspect',doc.collection.source.sessionId,'--times',...check.sourceTimes.slice(i*48,(i+1)*48).map(t=>String(Math.max(0,t-1e-7))),
          '--native',...(options.cacheDir?['--cache-dir',resolve(options.cacheDir)]:[])])});
      if(check.errors.length)process.exitCode=1;
    }));
  portrait.command('review').argument('<portrait.json>').argument('<review.json>')
    .requiredOption('-o, --output <reviewed-portrait.json>').option('--cache-dir <directory>')
    .action(safe(async(path:string,review:string,options:Options)=>{
      const {doc,context,geometry}=await loadPortrait(path,options);
      const updated=recordPortraitReview(doc,context,geometry,await readJson(review));
      await writeJson(options.output,updated);print({path:resolve(options.output),...checkPortrait(updated,context,geometry)});
    }));
  portrait.command('prepare').argument('<reviewed-portrait.json>')
    .requiredOption('-o, --output <bundle-directory>').option('--cache-dir <directory>')
    .action(safe(async(path:string,options:Options)=>{
      const {doc,context,check}=await loadPortrait(path,options);
      if(!check.canPrepare)throw new Error([...check.errors,...check.needs].join('; '));
      const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);
      try { print(await prepareDelivery(clipToPlan(doc.collection,context,doc.candidateId),{output:options.output,baseDirectory:process.cwd(),
        portrait:doc,settings:{name:doc.collection.candidates.find(c=>c.id===doc.candidateId)!.title,maxDuration:120},
        signal:controller.signal,onProgress:m=>console.error(m)})); }
      finally { process.removeListener('SIGINT',abort); }
    }));
  portrait.command('inspect').argument('<bundle-directory>').argument('<video.mp4>')
    .requiredOption('-o, --output <render-evidence.json>').option('--cache-dir <directory>')
    .description('Reverify the actual export and extract boundary/pan/audio evidence; does not claim inspection')
    .action(safe(async(directory:string,video:string,options:Options)=>{
      // Refuse duplicate packet paths before expensive verification/extraction.
      try { await stat(resolve(options.output)); throw new Error('Output already exists'); }
      catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error; }
      const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);
      try {
        const {root,bundle}=await readDeliveryBundle(directory,controller.signal);
        if(!bundle.portrait)throw new Error('Expected a prepared portrait bundle');
        const doc=portraitDocumentSchema.parse(await readJson(resolve(root,'portrait.json')));
        const report=await verifyDelivery(root,video,{signal:controller.signal,onProgress:m=>console.error(m)});
        if(!report.technicalPass)throw new Error(`Render failed technical checks: ${report.errors.join('; ')}`);
        const service=new AgentEvidenceService(options.cacheDir);
        const session=await service.open({path:report.path,goal:`Review portrait ${bundle.portrait.recipeSha256}`,maxDuration:121,overviewCount:6},controller.signal);
        const sampleFrames=portraitSampleFrames(doc.recipe);
        const artifacts=[],contactSheets=[];
        for(let i=0;i<sampleFrames.length;i+=48) {
          const result=await service.inspect(session.id,{times:sampleFrames.slice(i,i+48).map(f=>Math.max(0,f/30-1e-7)),native:true},controller.signal);
          artifacts.push(...result.artifacts);
          if(result.contactSheet) contactSheets.push({path:result.contactSheet,sha256:await fingerprint(result.contactSheet,controller.signal),frameIds:result.contactSheetOrder ?? []});
        }
        const sound=await service.inspect(session.id,{start:0,end:bundle.duration,count:1,audio:true},controller.signal);
        artifacts.push(...sound.artifacts);
        const packet=packetSchema.parse({schemaVersion:1,kind:'portrait-render-evidence',bundleDirectory:root,videoPath:report.path,
          videoSha256:report.sha256,recipeSha256:portraitHash(doc),sessionId:session.id,manifestSha256:jsonHash(bundle),technicalPass:true,
          sampleFrames,audioRequired:!session.audio.digitalSilence,contactSheets,
          artifacts:await Promise.all(artifacts.map(async a=>({id:a.id,path:a.path,kind:a.kind,start:a.start,end:a.end,sha256:await fingerprint(a.path,controller.signal)}))),
          reviewRequired:true,externalModelCalls:0});
        await writeJson(options.output,packet);
        print({path:resolve(options.output),packetSha256:jsonHash(packet),status:'technical_pass_needs_agent_review',...packet});
      } finally { process.removeListener('SIGINT',abort); }
    }));
  portrait.command('review-render').argument('<render-evidence.json>').argument('<review.json>')
    .requiredOption('-o, --output <reviewed-render.json>').option('--cache-dir <directory>')
    .description('Record attributed editorial review bound to the exact rendered bytes, recipe and evidence')
    .action(safe(async(packetPath:string,reviewPath:string,options:Options)=>{
      const packet=packetSchema.parse(await readJson(packetPath)),review=portraitRenderReviewSchema.parse(await readJson(reviewPath));
      if(review.packetSha256!==jsonHash(packet))throw new Error('Render review packet changed');
      const {root,bundle}=await readDeliveryBundle(packet.bundleDirectory);
      const doc=portraitDocumentSchema.parse(await readJson(resolve(root,'portrait.json')));
      if(!bundle.portrait || bundle.portrait.recipeSha256!==packet.recipeSha256 || jsonHash(bundle)!==packet.manifestSha256 ||
        await fingerprint(packet.videoPath)!==packet.videoSha256 || JSON.stringify(portraitSampleFrames(doc.recipe))!==JSON.stringify(packet.sampleFrames)) throw new Error('Render/bundle/recipe changed; inspect the new render');
      const session=await loadSource(packet.sessionId,options.cacheDir);
      if(session.source.sha256!==packet.videoSha256 || session.source.path!==packet.videoPath || packet.audioRequired===session.audio.digitalSilence)throw new Error('Evidence session does not match rendered media');
      const known=session.inspections.flatMap(i=>i.artifacts);
      for(const a of packet.artifacts) {
        if(!known.some(b=>b.id===a.id&&b.path===a.path&&b.kind===a.kind&&b.start===a.start&&b.end===a.end) || await fingerprint(a.path)!==a.sha256)throw new Error('Rendered evidence changed or is unavailable');
      }
      for(const sheet of packet.contactSheets ?? []) {
        if(!session.inspections.some(i=>i.contactSheet===sheet.path&&JSON.stringify(i.contactSheetOrder ?? [])===JSON.stringify(sheet.frameIds)) ||
          sheet.frameIds.some(id=>!packet.artifacts.some(a=>a.id===id&&a.kind==='frame')) || await fingerprint(sheet.path)!==sheet.sha256)throw new Error('Rendered contact sheet changed or is unavailable');
      }
      if(new Set(review.checks.map(c=>c.dimension)).size!==4)throw new Error('Each render review dimension must appear once');
      if(review.evidenceIds.some(id=>!packet.artifacts.some(a=>a.id===id)))throw new Error('Unknown rendered evidence');
      if(review.decision==='accept') {
        if(review.checks.some(c=>c.outcome==='fail'||c.outcome==='not_applicable'&&(c.dimension!=='speech'||packet.audioRequired)))throw new Error('Failed or inappropriate not-applicable review cannot be accepted');
        const cited=packet.artifacts.filter(a=>review.evidenceIds.includes(a.id));
        for(const f of packet.sampleFrames)if(!cited.some(a=>a.kind==='frame'&&Math.abs(a.start-f/30)<=1/30+.001))throw new Error('Review must cite rendered evidence covering every boundary/pan sample');
        if(packet.audioRequired&&!cited.some(a=>a.kind==='audio'&&a.start===0&&a.end>=bundle.duration-.001))throw new Error('Audible output needs a full-range audio evidence citation');
      }
      const receipt={kind:'portrait-editorial-review',status:review.decision==='accept'?'agent_review_recorded':'rejected',
        videoPath:packet.videoPath,videoSha256:packet.videoSha256,recipeSha256:packet.recipeSha256,packetSha256:jsonHash(packet),review,
        safeToAutoPublish:false,externalModelCalls:0,limitation:'Attributed review declaration, not authenticated proof of continuous audiovisual viewing.'};
      await writeJson(options.output,receipt);print({path:resolve(options.output),...receipt});
    }));
}
