import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Option, type Command } from 'commander';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import { portraitDocumentSchema, portraitFramingReviewSchema, portraitRenderReviewSchema, portraitRenderReviewV1Schema,
  portraitRenderReviewV2Schema, portraitOutputSampleFrames, mobileInspectionSchema, mobileProfileSchema, mobileOutputSchema } from '@diffusionstudio/editing-playbook';
import { draftPortrait, draftMobilePortrait, checkPortrait, recordPortraitReview, portraitHash } from '@diffusionstudio/editing-playbook/portrait';
import { importMobileOutput, loadMobileAssets } from '@diffusionstudio/editing-playbook/mobile-node';
import { createMobileInspection, verifyMobileInspection } from '@diffusionstudio/editing-playbook/mobile-inspection';
import { clipToPlan, jsonHash } from '@diffusionstudio/editing-playbook/clips';
import { prepareDelivery, probePortraitSource, readDeliveryBundle } from '@diffusionstudio/editing-playbook/delivery';
import { verifyDelivery } from '@diffusionstudio/editing-playbook/review';
import { checkPortraitDraft, exportPortraitDraft } from '@diffusionstudio/editing-playbook/portrait-draft';
import { fingerprint } from '@diffusionstudio/editing-playbook/node';
import { deliveryFor, loadCollection, loadSource, readJson, writeJson } from './clips';

const print = (value: unknown) => console.log(JSON.stringify(value,null,2));
const safe = <A extends unknown[]>(fn:(...args:A)=>Promise<void>) => async(...args:A) => {
  try { await fn(...args); } catch(error) { console.error((error as Error).message); process.exitCode=1; }
};
type Options = {output:string;cacheDir?:string};
type MobileOptions = Options & {profile?:string;captions?:string;font?:string;fontFamily?:string;timebase?:'source'|'clip';withoutCaptions?:boolean};
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const packetV1Schema=z.object({
  schemaVersion:z.literal(1),kind:z.literal('portrait-render-evidence'),bundleDirectory:z.string(),videoPath:z.string(),
  videoSha256:hash,recipeSha256:hash,sessionId:hash,manifestSha256:hash,technicalPass:z.literal(true),
  sampleFrames:z.array(z.number().int().nonnegative()).min(1).max(512),audioRequired:z.boolean(),
  artifacts:z.array(z.object({id:z.string(),path:z.string(),sha256:hash,kind:z.enum(['frame','audio','clip']),start:z.number(),end:z.number()}).strict()).max(2400),
  contactSheets:z.array(z.object({path:z.string(),sha256:hash,frameIds:z.array(z.string()).max(48)}).strict()).max(32).optional(),
  reviewRequired:z.literal(true),externalModelCalls:z.literal(0),
}).strict();
const packetV2Schema=packetV1Schema.extend({schemaVersion:z.literal(2),
  sampleFrames:z.array(z.number().int().nonnegative()).min(1).max(1200),mobile:mobileInspectionSchema}).strict();
const packetSchema=z.discriminatedUnion('schemaVersion',[packetV1Schema,packetV2Schema]);

async function loadPortrait(path:string,options:Options,checkAssets=true) {
  const doc=portraitDocumentSchema.parse(await readJson(path));
  const context=await loadSource(doc.collection.source.sessionId,options.cacheDir);
  const geometry=await probePortraitSource(context.source.path);
  // Includes optional original-source receipt validation, not just the portrait snapshot.
  await deliveryFor(doc.collection);
  const ids=new Set(doc.recipe.shots.flatMap(s=>s.evidenceIds));
  for(const a of context.inspections.flatMap(i=>i.artifacts).filter(a=>ids.has(a.id))) {
    if (!(await stat(a.path)).isFile()) throw new Error('Cited framing evidence is unavailable');
  }
  if(checkAssets && doc.schemaVersion===2)await loadMobileAssets(doc.mobile,doc.recipe,false);
  return {doc,context,geometry,check:checkPortrait(doc,context,geometry)};
}
export function registerPortraitCommands(clips:Command) {
  const portrait=clips.command('portrait').description('Agent-directed mobile framing, imported captions and actual-render review; no additional AI');
  portrait.command('workflow').action(()=>print({version:2,provider:'agent',instructions:'reference/portrait.md',
    commands:['playbook clips portrait draft-export candidates.json clip-1 --recipe recipe.json --acknowledge-unreviewed -o clip_DRAFT.mp4',
      'playbook clips portrait init reviewed.json clip-1 -o portrait.json',
      'playbook clips portrait mobile portrait.json --captions transcript.srt --font font.ttf -o mobile.json',
      'playbook clips portrait check mobile.json',
      'playbook clips portrait review mobile.json framing-review.json -o reviewed-portrait.json',
      'playbook clips portrait prepare reviewed-portrait.json -o bundle',
      'playbook deliver bundle -o short.mp4',
      'playbook clips portrait inspect bundle short.mp4 -o render-evidence.json',
      'playbook clips portrait review-render render-evidence.json render-review.json -o reviewed-render.json'],
    schemas:{document:z.toJSONSchema(portraitDocumentSchema),framingReview:z.toJSONSchema(portraitFramingReviewSchema),
      mobile:z.toJSONSchema(mobileOutputSchema),placementProfile:z.toJSONSchema(mobileProfileSchema),
      renderReview:z.toJSONSchema(portraitRenderReviewSchema),renderPacket:z.toJSONSchema(packetSchema)},
    constraints:['Reviewed delivery requires source approval. Explicit draft-export creates a separately labelled, unapproved local preview; it cannot produce an approval or delivery bundle.',
      'Centered framing is not a subject-detection result.',
      'Agent authors shot boundaries and normalized centers from inspected source frames. Linear pans never cross shot boundaries.',
      'Mobile is an explicit V2 opt-in. V1 documents retain their original workflow; mobile changes clear framing approval.',
      'SRT/VTT import uses source timestamps by default; --timebase clip is explicit. A fingerprinted local font is required.',
      'The generic mobile profile is editable editorial guidance, not official TikTok/Reels/Shorts safe-zone geometry.',
      'Preparation bakes reviewed captions and framing into the same reference. Missing libass fails instead of dropping captions.',
      'V2 render review requires readability, captions and placement checks plus clean phone-motion and guided phone-frame evidence.',
      'No automatic transcription, tracking model, API calls, uploads or publishing.'],externalModelCalls:0}));
  portrait.command('draft-export').argument('<candidates.json>').argument('<candidate-id>')
    .requiredOption('--recipe <recipe.json>','explicit numeric portrait framing recipe')
    .requiredOption('-o, --output <clip_DRAFT.mp4>').option('--cache-dir <directory>')
    .option('--acknowledge-unreviewed','explicitly authorize a draft with unresolved review needs')
    .option('--captions <subtitles.srt|subtitles.vtt>','optional imported draft captions; no transcription')
    .option('--font <font.ttf|font.otf>').option('--profile <profile.json>')
    .addOption(new Option('--timebase <origin>','caption timestamp origin').choices(['source','clip']))
    .description('Render an UNREVIEWED local portrait draft; never approve or bypass the normal delivery gates')
    .action(safe(async(path:string,id:string,options:MobileOptions & {recipe:string;acknowledgeUnreviewed?:boolean})=>{
      if(!options.acknowledgeUnreviewed)throw new Error('Explicit --acknowledge-unreviewed is required');
      const {collection,context}=await loadCollection(path,options);
      const geometry=await probePortraitSource(context.source.path);
      const checked=checkPortraitDraft(collection,context,id,await readJson(options.recipe),geometry);
      const imported=await importMobileOutput({captions:options.captions,font:options.font,timebase:options.timebase,
        profile:options.profile?await readJson(options.profile):undefined,...checked.candidate.range,...checked.recipe});
      const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);
      try {print(await exportPortraitDraft(collection,context,id,checked.recipe,{output:options.output,
        acknowledgeUnreviewed:true,mobile:imported.mobile,warnings:imported.warnings,signal:controller.signal}));}
      finally {process.removeListener('SIGINT',abort);}
    }));
  portrait.command('init').argument('<reviewed-candidates.json>').argument('<candidate-id>')
    .requiredOption('-o, --output <portrait.json>').option('--cache-dir <directory>')
    .action(safe(async(path:string,id:string,options:Options)=>{
      const {collection,context}=await loadCollection(path,options);
      const geometry=await probePortraitSource(context.source.path);
      const doc=draftPortrait(collection,context,id,geometry);
      await writeJson(options.output,doc);
      print({path:resolve(options.output),...checkPortrait(doc,context,geometry)});
    }));
  portrait.command('mobile').argument('<portrait.json>')
    .requiredOption('-o, --output <mobile-portrait.json>').option('--cache-dir <directory>')
    .option('--profile <profile.json>','versioned editable safe-area profile; not a platform certification')
    .option('--captions <subtitles.srt|subtitles.vtt>','import plain-text local captions, never transcribe')
    .option('--font <font.ttf|font.otf>','explicit local standalone font, copied and fingerprinted')
    .option('--font-family <family>','must match a family in the supplied font; defaults to its detected family')
    .addOption(new Option('--timebase <origin>','caption timestamps: original source or selected clip').choices(['source','clip']))
    .option('--without-captions','explicitly remove captions from an existing mobile draft')
    .description('Opt into phone-size review and optionally imported captions; always resets framing approval')
    .action(safe(async(path:string,options:MobileOptions)=>{
      if(options.withoutCaptions&&(options.captions||options.font||options.fontFamily||options.timebase))throw new Error('--without-captions cannot be combined with caption import options');
      if(!options.captions&&(options.font||options.fontFamily||options.timebase))throw new Error('Font/timebase options require --captions');
      const {doc,context,geometry}=await loadPortrait(path,options,false);
      const candidate=doc.collection.candidates.find(c=>c.id===doc.candidateId)!;
      const profile=options.profile?await readJson(options.profile):doc.schemaVersion===2?doc.mobile.profile:undefined;
      const imported=doc.schemaVersion===2&&!options.captions&&!options.withoutCaptions?
        {mobile:mobileOutputSchema.parse({...doc.mobile,profile}),warnings:['Existing captions retained; inspect the changed placement profile.']}:
        await importMobileOutput({profile,captions:options.captions,font:options.font,fontFamily:options.fontFamily,timebase:options.timebase,
          start:candidate.range.start,end:candidate.range.end,...doc.recipe});
      const updated=draftMobilePortrait(doc,imported.mobile);
      await writeJson(options.output,updated);
      print({path:resolve(options.output),warnings:imported.warnings,...checkPortrait(updated,context,geometry)});
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
    .description('Reverify the export, extract caption/boundary/audio evidence and V2 phone-size previews; never auto-approve')
    .action(safe(async(directory:string,video:string,options:Options)=>{
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
        const sampleFrames=portraitOutputSampleFrames(doc);
        const artifacts=[],contactSheets=[];
        for(let i=0;i<sampleFrames.length;i+=48) {
          const result=await service.inspect(session.id,{times:sampleFrames.slice(i,i+48).map(f=>Math.max(0,f/30-1e-7)),native:true},controller.signal);
          artifacts.push(...result.artifacts);
          if(result.contactSheet)contactSheets.push({path:result.contactSheet,sha256:await fingerprint(result.contactSheet,controller.signal),frameIds:result.contactSheetOrder??[]});
        }
        // FFprobe duration can round a fractional-frame endpoint down by a microsecond.
        const sound=await service.inspect(session.id,{start:0,end:Math.min(bundle.duration,session.source.duration),count:1,audio:true},controller.signal);
        artifacts.push(...sound.artifacts);
        const mobile=doc.schemaVersion===2?await createMobileInspection(doc,report.path,report.sha256,resolve(`${options.output}.mobile`),root,controller.signal):undefined;
        const packet=packetSchema.parse({schemaVersion:doc.schemaVersion,kind:'portrait-render-evidence',bundleDirectory:root,videoPath:report.path,
          videoSha256:report.sha256,recipeSha256:portraitHash(doc),sessionId:session.id,manifestSha256:jsonHash(bundle),technicalPass:true,
          sampleFrames,audioRequired:!session.audio.digitalSilence,contactSheets,...(mobile?{mobile}:{}),
          artifacts:await Promise.all(artifacts.map(async a=>({id:a.id,path:a.path,kind:a.kind,start:a.start,end:a.end,sha256:await fingerprint(a.path,controller.signal)}))),
          reviewRequired:true,externalModelCalls:0});
        await writeJson(options.output,packet);
        print({path:resolve(options.output),packetSha256:jsonHash(packet),status:'technical_pass_needs_agent_review',...packet});
      } finally { process.removeListener('SIGINT',abort); }
    }));
  portrait.command('review-render').argument('<render-evidence.json>').argument('<review.json>')
    .requiredOption('-o, --output <reviewed-render.json>').option('--cache-dir <directory>')
    .description('Record editorial review bound to exact rendered bytes, phone-size evidence and the reviewed recipe')
    .action(safe(async(packetPath:string,reviewPath:string,options:Options)=>{
      const packet=packetSchema.parse(await readJson(packetPath));
      const {root,bundle}=await readDeliveryBundle(packet.bundleDirectory);
      const doc=portraitDocumentSchema.parse(await readJson(resolve(root,'portrait.json')));
      const review=(doc.schemaVersion===2?portraitRenderReviewV2Schema:portraitRenderReviewV1Schema).parse(await readJson(reviewPath));
      if(review.packetSha256!==jsonHash(packet))throw new Error('Render review packet changed');
      if(!bundle.portrait||packet.schemaVersion!==doc.schemaVersion||bundle.portrait.recipeSha256!==packet.recipeSha256||jsonHash(bundle)!==packet.manifestSha256||
        await fingerprint(packet.videoPath)!==packet.videoSha256||JSON.stringify(portraitOutputSampleFrames(doc))!==JSON.stringify(packet.sampleFrames))throw new Error('Render/bundle/recipe changed; inspect the new render');
      const session=await loadSource(packet.sessionId,options.cacheDir);
      if(session.source.sha256!==packet.videoSha256||session.source.path!==packet.videoPath||packet.audioRequired===session.audio.digitalSilence)throw new Error('Evidence session does not match rendered media');
      const known=session.inspections.flatMap(i=>i.artifacts);
      for(const a of packet.artifacts) {
        if(!known.some(b=>b.id===a.id&&b.path===a.path&&b.kind===a.kind&&b.start===a.start&&b.end===a.end)||await fingerprint(a.path)!==a.sha256)throw new Error('Rendered evidence changed or is unavailable');
      }
      for(const sheet of packet.contactSheets??[]) {
        if(!session.inspections.some(i=>i.contactSheet===sheet.path&&JSON.stringify(i.contactSheetOrder??[])===JSON.stringify(sheet.frameIds))||
          sheet.frameIds.some(id=>!packet.artifacts.some(a=>a.id===id&&a.kind==='frame'))||await fingerprint(sheet.path)!==sheet.sha256)throw new Error('Rendered contact sheet changed or is unavailable');
      }
      const mobile=packet.schemaVersion===2?await verifyMobileInspection(doc,packet.mobile,packet.videoPath,packet.videoSha256,root):undefined;
      if(new Set(review.checks.map(c=>c.dimension)).size!==(doc.schemaVersion===2?7:4))throw new Error('Each render review dimension must appear once');
      const knownIds=new Set([...packet.artifacts.map(a=>a.id),...(mobile?[mobile.preview.id,...mobile.frames.map(f=>f.id)]:[])]);
      if(review.evidenceIds.some(id=>!knownIds.has(id)))throw new Error('Unknown rendered evidence');
      if(review.decision==='accept') {
        const optionalChecks=new Set<string>([...(!packet.audioRequired?['speech']:[]),...(doc.schemaVersion===2&&!doc.mobile.captions?['captions']:[])]);
        if(review.checks.some(c=>c.outcome==='fail'||c.outcome==='not_applicable'&&!optionalChecks.has(c.dimension)))throw new Error('Failed or inappropriate not-applicable review cannot be accepted');
        const cited=packet.artifacts.filter(a=>review.evidenceIds.includes(a.id));
        for(const f of packet.sampleFrames)if(!cited.some(a=>a.kind==='frame'&&Math.abs(a.start-f/30)<=1/30+.001))throw new Error('Review must cite rendered evidence covering every boundary/pan/caption sample');
        if(packet.audioRequired&&!cited.some(a=>a.kind==='audio'&&a.start===0&&a.end>=bundle.duration-.001))throw new Error('Audible output needs a full-range audio evidence citation');
        if(mobile&&(!review.evidenceIds.includes(mobile.preview.id)||!mobile.frames.some(f=>review.evidenceIds.includes(f.id))))throw new Error('Mobile acceptance requires the full phone-motion preview and guided phone-frame evidence');
      }
      const receipt={kind:'portrait-editorial-review',status:review.decision==='accept'?'agent_review_recorded':'rejected',
        videoPath:packet.videoPath,videoSha256:packet.videoSha256,recipeSha256:packet.recipeSha256,packetSha256:jsonHash(packet),review,
        ...(mobile?{phoneReview:{width:mobile.width,height:mobile.height,profileSha256:mobile.profileSha256,previewSha256:mobile.preview.sha256}}:{}),
        safeToAutoPublish:false,externalModelCalls:0,limitation:'Attributed review declaration, not authenticated proof of continuous audiovisual viewing or real-device testing.'};
      await writeJson(options.output,receipt);print({path:resolve(options.output),...receipt});
    }));
}
