import { constants } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sceneComposition } from './scene-composition.ts';
import { motionDigest, resolveSceneTemplate, type SceneAdaptation } from './scene-motion.ts';
import { exists, readSeal, save } from './motion-workflow.ts';
import { fingerprint } from './preview.ts';
import { runMedia } from './media-process.ts';

type Prepared = { audio: string; media: Record<string,string> };
export type SceneSegment = { shotId: string; key: string; frames: number; width: number; height: number; code: string };
export type SegmentRenderer = (request: { directory: string; output: string; segment: SceneSegment }) => Promise<unknown>;

/** Project one shot onto its own clock without clipping an overlapping caption:
 * words revealed before the cut must still be visible after it. */
export function sceneSegments(adaptation: SceneAdaptation, prepared: Prepared, hashes: Record<string,string>, rendererId: string): SceneSegment[] {
  if (!rendererId.trim()) throw Error('A renderer fingerprint is required');
  return adaptation.input.shots.map(shot => {
    const a = structuredClone(adaptation), offset = shot.start, duration = (Math.round(shot.end*30)-Math.round(offset*30))/30;
    const template = resolveSceneTemplate(a.recipe.templates.find(t=>t.id===shot.templateId)!,shot,a.input);
    a.recipe.templates = [template];
    a.input.captions = a.input.captions.filter(c=>c.start<shot.end && c.end>offset).map(c=>({...c,start:c.start-offset,end:c.end-offset}));
    const neededWords = new Set(a.input.captions.flatMap(c=>c.words.map(w=>w.wordId)));
    a.input.transcript.words = a.input.transcript.words.filter(w=>neededWords.has(w.id));
    a.input.shots = [{...shot,start:0,end:duration,cues:undefined}];
    a.input.audio = {...a.input.audio,start:a.input.audio.start+offset,end:a.input.audio.start+shot.end};
    const usedAssets = new Set(shot.bindings.map(b=>b.assetId));
    a.input.assets = a.input.assets.filter(asset=>usedAssets.has(asset.id));
    // These fields describe the whole job, not this shot's rendered pixels.
    a.previewSamples=[]; a.warnings=[]; a.duration=duration;
    const media = Object.fromEntries(shot.bindings.map(b=>{const k=`${shot.id}/${b.slot}`;return [k,prepared.media[k]];}));
    const canonical = Object.fromEntries(Object.entries(media).map(([key,path])=>{
      if(!path || !hashes[path])throw Error('Missing prepared media hash');return [key,`content-${hashes[path]}`];
    }));
    const canonicalAdaptation = structuredClone(a);
    canonicalAdaptation.input.assets.forEach(asset=>{asset.path=`source-${asset.sha256}`;});
    const key = motionDigest({version:1,rendererId,codec:'avc-12000000-30fps-video-only',
      code:sceneComposition(canonicalAdaptation,{audio:'continuous-audio-assembled-once',media:canonical})});
    return {shotId:shot.id,key,frames:Math.round(duration*30),width:a.input.width,height:a.input.height,
      code:sceneComposition(a,{audio:prepared.audio,media})};
  });
}

export async function verifySceneSegment(path: string, segment: Pick<SceneSegment,'frames'|'width'|'height'>, signal?: AbortSignal) {
  await runMedia(['-v','error','-xerror','-nostdin','-protocol_whitelist','file,pipe','-i',path,'-f','null','-'],{signal});
  const data=JSON.parse((await runMedia(['-v','error','-select_streams','v:0','-count_frames','-show_entries',
    'stream=codec_name,width,height,nb_read_frames,avg_frame_rate,start_time,duration,pix_fmt,time_base,profile,level','-of','json',path],
    {binary:process.env.FFPROBE_PATH||'ffprobe',signal})).toString()).streams?.[0];
  const technicalPass=!!data && data.codec_name==='h264' && data.width===segment.width && data.height===segment.height &&
    Number(data.nb_read_frames)===segment.frames && data.avg_frame_rate==='30/1' && Number(data.start_time)===0 &&
    Math.abs(Number(data.duration)-segment.frames/30)<.002;
  return {technicalPass,sha256:await fingerprint(path,signal),stream:data};
}

/** Job-local immutable cache. Receipts appear only after a real checked render.
 * Interrupted attempts are retained, never retried/overwritten automatically. */
export async function renderSceneSegments(options: { root: string; directory: string; segments: SceneSegment[]; audio: string;
  duration: number; render: SegmentRenderer; verify: (path:string)=>Promise<{technicalPass:boolean;sha256:string}>;
  signal?: AbortSignal; onProgress?: (message:string)=>void }) {
  const {root,directory,segments,signal}=options, cache=join(root,'scene-cache');
  await mkdir(cache,{recursive:true});
  const assembly=join(directory,'assembly');await mkdir(assembly);
  const report: {shotId:string;key:string;reused:boolean;frames:number;sha256:string}[]=[];
  let signature: string | undefined;
  for(const [i,s] of segments.entries()) {
    signal?.throwIfAborted();
    const folder=join(cache,s.key),output=join(folder,'preview_DRAFT.mp4'),receipt=join(folder,'receipt.json');
    let reused=false,expectedSha:string|undefined;
    if(await exists(receipt)) {
      const sealed=await readSeal<{key:string;sha256:string}>(receipt);
      if(sealed.value.key!==s.key || await fingerprint(output,signal)!==sealed.value.sha256)throw Error('Cached scene changed; retain diagnostics and use an explicit full render on a new authorized revision');
      expectedSha=sealed.value.sha256;
      reused=true;
    } else {
      await mkdir(folder); // An interrupted entry is an error, not an implicit retry.
      await writeFile(join(folder,'edit.tsx'),s.code,{flag:'wx'});
      await save(join(folder,'attempt.json'),{key:s.key,shotId:s.shotId});
      options.onProgress?.(`Rendering scene ${i+1}/${segments.length}: ${s.shotId}`);
      await options.render({directory:folder,output,segment:s});
    }
    const check=await verifySceneSegment(output,s,signal);
    if(expectedSha && check.sha256!==expectedSha)throw Error('Cached scene changed during verification');
    if(!check.technicalPass)throw Error(`Cached/rendered scene failed technical checks: ${s.shotId}`);
    const stream=check.stream;
    const current=motionDigest([stream.codec_name,stream.width,stream.height,stream.pix_fmt,stream.time_base,stream.profile,stream.level]);
    if(signature && current!==signature)throw Error('Scene codec parameters differ; cannot safely join cached scenes');
    signature=current;
    if(!reused)await save(receipt,{key:s.key,sha256:check.sha256});
    else options.onProgress?.(`Reusing checked scene ${i+1}/${segments.length}: ${s.shotId}`);
    const filename=`part-${String(i).padStart(2,'0')}.mp4`;
    await copyFile(output,join(assembly,filename),constants.COPYFILE_EXCL);
    if(await fingerprint(join(assembly,filename),signal)!==check.sha256)throw Error('Scene changed while copying for assembly');
    report.push({shotId:s.shotId,key:s.key,reused,frames:s.frames,sha256:check.sha256});
  }
  const list=join(assembly,'parts.txt');
  await writeFile(list,segments.map((_,i)=>`file 'part-${String(i).padStart(2,'0')}.mp4'`).join('\n')+'\n',{flag:'wx'});
  const assembled=join(assembly,'assembled_DRAFT.mp4');
  // Picture is stream-copied. Narration is encoded ONCE from the continuous
  // prepared WAV, avoiding AAC priming/silence gaps at each scene boundary.
  await runMedia(['-v','error','-nostdin','-n','-f','concat','-safe','1','-i',list,'-i',options.audio,
    '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
    '-t',String(options.duration),'-movflags','+faststart',assembled],{signal});
  const review=await options.verify(assembled);
  if(!review.technicalPass)throw Error('Assembled preview failed technical checks; partial output retained');
  // Recheck inputs after assembly; a changed cache is never silently trusted.
  for(const r of report)if(await fingerprint(join(cache,r.key,'preview_DRAFT.mp4'),signal)!==r.sha256)throw Error('Cached scene changed during assembly');
  const output=join(directory,'preview_DRAFT.mp4');
  await copyFile(assembled,output,constants.COPYFILE_EXCL);
  const result={status:'technical_pass_needs_visual_review',output,sha256:review.sha256,segments:report,
    renderedScenes:report.filter(r=>!r.reused).length,reusedScenes:report.filter(r=>r.reused).length,
    renderedFrames:report.filter(r=>!r.reused).reduce((n,r)=>n+r.frames,0),totalFrames:segments.reduce((n,s)=>n+s.frames,0),
    reviewRequired:true,safeToAutoPublish:false,externalModelCalls:0};
  await save(join(directory,'scene-render.json'),result);
  return result;
}
