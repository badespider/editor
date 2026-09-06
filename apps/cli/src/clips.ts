import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { Command } from 'commander';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import { clipBriefSchema, clipCandidateSchema, clipCollectionSchema, clipReviewSchema } from '@diffusionstudio/editing-playbook';
import type { ClipCollection } from '@diffusionstudio/editing-playbook';
import { checkClips, clipToPlan, contextRange, jsonHash, mapOriginalRanges, proposeClips, recordClipReview } from '@diffusionstudio/editing-playbook/clips';
import { readDeliveryBundle } from '@diffusionstudio/editing-playbook/delivery';
import { fingerprint } from '@diffusionstudio/editing-playbook/node';
import { registerPortraitCommands } from './portrait';

type Options = { cacheDir?: string; output: string; goal?: string; audience?: string; count?: string;
  minDuration?: string; maxDuration?: string; contextSeconds?: string; transcriptId?: string; deliveryBundle?: string; deliveryReview?: string };
const print = (value: unknown) => console.log(JSON.stringify(value,null,2));
export async function readJson(path:string) {
  const info=await stat(path); if(!info.isFile() || info.size>8_000_000)throw new Error('JSON input must be a local file at most 8 MB');
  return JSON.parse(await readFile(path,'utf8')) as unknown;
}
export async function writeJson(path:string,value:unknown) {
  await mkdir(dirname(resolve(path)),{recursive:true});
  await writeFile(resolve(path),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
export async function loadSource(id:string,cacheDir?:string) {
  const context=await new AgentEvidenceService(cacheDir).read(id);
  const source=await stat(context.source.path);
  if(!source.isFile() || source.size!==context.source.bytes || source.mtimeMs!==context.source.mtimeMs ||
    await fingerprint(context.source.path,AbortSignal.timeout(600000))!==context.source.sha256)throw new Error('Source changed; prepare a new evidence session');
  return context;
}
const receiptSchema=z.object({ kind:z.literal('editor-render-review'),sha256:z.string(),technicalPass:z.literal(true),
  bundleIdentity:z.object({planSha256:z.string(),compositionSha256:z.string(),manifestSha256:z.string()}) });
export async function deliveryFor(collection:ClipCollection) {
  if(!collection.delivery)return null;
  const {bundle}=await readDeliveryBundle(collection.delivery.bundleDirectory);
  if(await fingerprint(collection.delivery.receiptPath)!==collection.delivery.receiptSha256)throw new Error('Delivery review changed');
  const receipt=receiptSchema.parse(await readJson(collection.delivery.receiptPath));
  if(receipt.sha256!==collection.source.sha256 || receipt.bundleIdentity.planSha256!==bundle.planSha256 ||
    receipt.bundleIdentity.compositionSha256!==bundle.compositionSha256 || receipt.bundleIdentity.manifestSha256!==jsonHash(bundle))throw new Error('Delivery review does not bind this inspected export to this bundle');
  return bundle;
}
export async function loadCollection(path:string,options:Options) {
  const collection=clipCollectionSchema.parse(await readJson(resolve(path)));
  const context=await loadSource(collection.source.sessionId,options.cacheDir);
  // The same source must be checked even if an edited JSON points at a different path.
  const report=checkClips(collection,context), bundle=await deliveryFor(collection);
  return {collection,context,report,bundle};
}
function safe<A extends unknown[]>(action:(...args:A)=>Promise<void>) {
  return async(...args:A)=>{try{await action(...args);}catch(error){console.error((error as Error).message);process.exitCode=1;}};
}
export function registerClipCommands(playbook:Command) {
  const clips=playbook.command('clips').description('Agent-directed short-clip candidates, source/context review and plan export. Local; no additional AI or publishing.');
  registerPortraitCommands(clips);
  clips.command('workflow').description('Discover the clipping workflow and strict JSON schemas')
    .action(()=>print({version:1,provider:'agent',instructions:'reference/clips.md',
      commands:['media understand <video>','media inspect <session> ...','media observe <session> observations.json',
        'playbook clips propose <session> --goal <goal> -o candidates.json',
        'playbook clips check candidates.json', 'playbook clips review candidates.json review.json -o reviewed.json',
        'playbook clips plan reviewed.json <candidate-id> -o plan.json',
        'playbook prepare plan.json -o bundle', 'playbook deliver bundle -o short.mp4',
        'playbook clips portrait workflow'],
      schemas:{brief:z.toJSONSchema(clipBriefSchema),candidate:z.toJSONSchema(clipCandidateSchema),collection:z.toJSONSchema(clipCollectionSchema),review:z.toJSONSchema(clipReviewSchema)},
      constraints:['Proposals are boundary hints, not verified complete moments. The calling agent must inspect and author the narrative.',
        'Original-moment selection preserves sound. For mobile clips use clips portrait: reviewed shot-aware crops/pans, not automatic subject detection. No ASR/caption/model install.',
        'All clip times are relative to the inspected long-form export, not its original recordings.',
        'Source review does not certify a new render. No automatic publication.'],externalModelCalls:0}));
  clips.command('propose').argument('<session-id>').requiredOption('--goal <text>')
    .requiredOption('-o, --output <candidates.json>','new candidate file')
    .option('--cache-dir <directory>').option('--audience <text>').option('--count <number>','candidate target, not a guarantee','3')
    .option('--min-duration <seconds>','minimum selected duration','30').option('--max-duration <seconds>','maximum selected duration, <=120','90')
    .option('--context-seconds <seconds>','surrounding context on each side','8').option('--transcript-id <id>','choose one transcript version; no implicit merging')
    .option('--delivery-bundle <directory>','optional existing prepared long-form bundle')
    .option('--delivery-review <review.json>','matching current technical render receipt, required with --delivery-bundle')
    .action(safe(async(id:string,options:Options)=>{
      if(!!options.deliveryBundle!==!!options.deliveryReview)throw new Error('Supply --delivery-bundle and --delivery-review together');
      const context=await loadSource(id,options.cacheDir);
      const result=proposeClips(context,{goal:options.goal,audience:options.audience,count:Number(options.count),
        minDuration:Number(options.minDuration),maxDuration:Number(options.maxDuration),contextSeconds:Number(options.contextSeconds)},options.transcriptId);
      if(options.deliveryBundle) {
        result.collection.delivery={bundleDirectory:await realpath(options.deliveryBundle),receiptPath:await realpath(options.deliveryReview!),receiptSha256:await fingerprint(options.deliveryReview!)};
        const bundle=await deliveryFor(result.collection);
        for(const c of result.collection.candidates)mapOriginalRanges(bundle!,c.range);
      }
      await writeJson(options.output,result.collection);
      print({...result,path:resolve(options.output),originalMapping:result.collection.delivery?'delivery_receipt_linked':'unavailable; all ranges refer only to the inspected source'});
    }));
  clips.command('check').argument('<candidates.json>').option('--cache-dir <directory>')
    .description('Recheck source hashes, evidence, review binding, boundaries, context and duplicates; pending is not an error')
    .action(safe(async(path:string,options:Options)=>{
      const {collection,context,report,bundle}=await loadCollection(path,options);
      print({...report,originalMapping:bundle?'delivery_receipt_linked':'unavailable',
        candidates:collection.candidates.map(c=>{
          const range=contextRange(c,collection.brief,context.source.duration);
          return {id:c.id,range:c.range,originalSpans:bundle?mapOriginalRanges(bundle,c.range):null,
            inspectArgs:['media','inspect',context.id,'--start',String(range.start),'--end',String(range.end),'--count','12',
              ...(range.end-range.start<=120?['--clip']:[]),...(context.audio.hasTrack?['--audio']:[]),...(options.cacheDir?['--cache-dir',resolve(options.cacheDir)]:[])]};
        })});
      if(report.results.some(r=>r.errors.length))process.exitCode=1;
    }));
  clips.command('review').argument('<candidates.json>').argument('<review.json>').requiredOption('-o, --output <reviewed.json>','new file preserving earlier decisions')
    .option('--cache-dir <directory>').description('Record an agent/user-authored source review for the exact candidate hash')
    .action(safe(async(path:string,review:string,options:Options)=>{
      const {collection,context}=await loadCollection(path,options);
      const updated=recordClipReview(collection,context,await readJson(review));
      await writeJson(options.output,updated); print({path:resolve(options.output),...checkClips(updated,context)});
    }));
  clips.command('plan').argument('<reviewed.json>').argument('<candidate-id>').requiredOption('-o, --output <plan.json>','new plan and .clip.json sidecar')
    .option('--cache-dir <directory>').description('Export one reviewed original-moment candidate to the existing cut-only delivery workflow')
    .action(safe(async(path:string,id:string,options:Options)=>{
      const {collection,context,report,bundle}=await loadCollection(path,options), plan=clipToPlan(collection,context,id);
      const candidate=collection.candidates.find(c=>c.id===id)!;
      const sidecar=resolve(options.output)+'.clip.json';
      // Check both names before writing; exclusive writes still handle concurrent creation.
      for(const target of [resolve(options.output),sidecar]) {
        try{await stat(target);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')continue;throw error;}
        throw new Error(`Output already exists: ${target}`);
      }
      await writeJson(options.output,plan);
      await writeJson(sidecar,{kind:'clip-plan-provenance',source:collection.source,candidate,
        originalMapping:bundle?'delivery_receipt_linked':'unavailable',originalSpans:bundle?mapOriginalRanges(bundle,candidate.range):null,
        sourceReview:report.results.find(r=>r.id===id),renderReviewRequired:true,externalModelCalls:0,safeToAutoPublish:false});
      print({path:resolve(options.output),provenance:sidecar,status:'plan_ready_for_preparation',renderReviewRequired:true,externalModelCalls:0});
    }));
}
