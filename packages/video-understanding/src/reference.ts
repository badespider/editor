import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,stat,readdir,realpath} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {AgentEvidenceService} from './agent.ts';
import {fingerprint} from './media.ts';
import {referenceProcess} from './reference-process.ts';
import {referenceViewer} from './reference-viewer.ts';
import { referenceTrackRequestSchema, trackGrayFrames } from './reference-tracking.ts';
export { referenceTrackRequestSchema, trackGrayFrames } from './reference-tracking.ts';
import {referenceId,referenceRequestSchema,referencePageSchema,referencePayloadSchema,referenceManifestSchema,
  parseReferenceStamps,checkReferenceBudget,frameChange,validateBreakdown} from './reference-schema.ts';
import type {ReferenceRequest,ReferenceManifest} from './reference-schema.ts';
import {draftReferenceDesign,validateReferenceDesign} from './reference-design.ts';
import {styleSourcesSchema, referenceStyleRequestSchema, draftStyleGuide, validateStyleGuide} from './reference-style.ts';
import {pixelComparisonSchema,compareRGB} from './reference-pixels.ts';
export {pixelComparisonSchema} from './reference-pixels.ts';
export {referenceDesignSchema,designCategories,validateReferenceDesign,portableDesign} from './reference-design.ts';

const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const ffmpeg=()=>process.env.FFMPEG_PATH||'ffmpeg',ffprobe=()=>process.env.FFPROBE_PATH||'ffprobe';
const bounded=(signal?:AbortSignal)=>AbortSignal.any([AbortSignal.timeout(300000),...(signal?[signal]:[])]);
async function json(path:string){const info=await stat(path);if(!info.isFile()||info.size>4*1024**2)throw Error('Reference JSON exceeds 4 MiB');return JSON.parse(await readFile(path,'utf8'));}
const writeJSON=(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n',{flag:'wx'});

/** Source-bound dense evidence, deliberately separate from sparse-overview artifact budgets. */
export class ReferenceAnalysisService {
  readonly agent:AgentEvidenceService;
  async pixels(sessionId:string,id:string,candidateSession:string,candidateId:string,input:unknown,cancellation?:AbortSignal){
    const request=pixelComparisonSchema.parse(input),signal=bounded(cancellation);
    const a=await this.load(sessionId,id),b=await this.load(candidateSession,candidateId);
    if(a.manifest.source.width!==b.manifest.source.width||a.manifest.source.height!==b.manifest.source.height)throw Error('Native comparison requires identical dimensions; no silent resizing');
    const fa=a.manifest.frames[request.referenceFrame],fb=b.manifest.frames[request.candidateFrame];
    if(!fa||!fb)throw Error('Comparison frame is outside the sequence');
    const region=request.region??{x:0,y:0,width:a.manifest.source.width,height:a.manifest.source.height};
    if(region.x+region.width>a.manifest.source.width||region.y+region.height>a.manifest.source.height)throw Error('Comparison region exceeds picture');
    const pa=await this.file(a.root,fa.path,fa.sha256,signal),pb=await this.file(b.root,fb.path,fb.sha256,signal);
    const crop=`format=rgb24,crop=${region.width}:${region.height}:${region.x}:${region.y}`;
    const decode=async(path:string)=>(await referenceProcess(ffmpeg(),['-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',path,'-vf',crop,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],signal,region.width*region.height*3+1024)).stdout;
    const [ra,rb]=await Promise.all([decode(pa),decode(pb)]);
    if(ra.length!==region.width*region.height*3||rb.length!==ra.length)throw Error('Unexpected native RGB geometry');
    const result={schemaVersion:1,kind:'native-pixel-diagnostic',reference:{sequenceSha256:a.manifest.sequenceSha256,frame:fa.index,time:fa.time,sha256:fa.sha256},
      candidate:{sequenceSha256:b.manifest.sequenceSha256,frame:fb.index,time:fb.time,sha256:fb.sha256},request,region,metrics:compareRGB(ra,rb),
      limitations:['Explicit caller-selected temporal correspondence and region; not automatic alignment.','RGB display conversion only; compression, different words/footage/fonts affect this diagnostic.','No similarity percentage, perceptual judgment, motion verdict or fidelity approval.'],safeToAutoEdit:false};
    const sha=digest(result),root=join(a.root,`pixels-${sha}`);
    try{
      const stored=await json(join(root,'comparison.json'));
      if(stored.sha256!==sha||digest(stored.result)!==sha)throw Error('Pixel diagnostic changed');
      for(const artifact of stored.artifacts)await this.file(root,artifact.kind+'.png',artifact.sha256,signal);
      return {...result,sha256:sha,artifacts:stored.artifacts};
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    await mkdir(root);
    const outputs=[];
    for(const [name,filter] of [['overlay','blend=all_expr=(A+B)/2'],['difference','blend=all_mode=difference']] as const){
      const path=join(root,`${name}.png`);
      await referenceProcess(ffmpeg(),['-v','error','-nostdin','-n','-protocol_whitelist','file,pipe','-i',pa,'-protocol_whitelist','file,pipe','-i',pb,
          '-filter_complex',`[0:v]${crop}[a];[1:v]${crop}[b];[a][b]${filter},format=rgb24`,'-frames:v','1',path],signal);
      outputs.push({kind:name,path,sha256:(await fingerprint(path,signal)).sha256});
    }
    await writeJSON(join(root,'comparison.json'),{result,sha256:sha,artifacts:outputs});
    return {...result,sha256:sha,artifacts:outputs};
  }
  constructor(cacheDirectory?:string){this.agent=new AgentEvidenceService(cacheDirectory);}
  private root(sessionId:string,id:string){return join(this.agent.directory,referenceId.parse(sessionId),'references',referenceId.parse(id));}
  private async source(sessionId:string) {
    const session=await this.agent.read(referenceId.parse(sessionId)),current=await stat(session.source.path);
    if(!current.isFile()||current.size!==session.source.bytes||current.mtimeMs!==session.source.mtimeMs)throw Error('Source changed; open a new evidence session');
    return session;
  }
  private async file(root:string,path:string,sha256:string,signal?:AbortSignal) {
    const actual=await realpath(join(root,path)),base=await realpath(root);
    if(!actual.startsWith(base+sep))throw Error('Reference artifact escapes its sequence directory');
    if((await fingerprint(actual,signal)).sha256!==sha256)throw Error('Reference artifact changed; regenerate in a new cache');
    return actual;
  }
  private async load(sessionId:string,id:string) {
    const session=await this.source(sessionId),root=this.root(sessionId,id);
    const manifest=referenceManifestSchema.parse(await json(join(root,'sequence.json'))),{sequenceSha256,...payload}=manifest;
    if(digest(payload)!==sequenceSha256||manifest.id!==id||manifest.sessionId!==sessionId||manifest.source.sha256!==session.source.sha256||
      id!==digest({version:1,sourceSha256:session.source.sha256,request:manifest.request}))throw Error('Reference manifest binding changed');
    const {source,request,timeBase,frames}=manifest;
    checkReferenceBudget(source.width,source.height,frames.length,request);
    for(const [i,f] of frames.entries())if(f.index!==i||f.id!==`${id}-f${i}`||f.path!==`frames/frame-${String(i).padStart(6,'0')}.png`||
      Math.abs(f.time-(f.pts*timeBase.numerator/timeBase.denominator-source.startTime))>1e-7||f.time<request.start-1e-7||f.time>=request.end+1e-7||
      (i&&f.pts<frames[i-1].pts))throw Error('Invalid reference frame mapping');
    return {manifest,root};
  }
  private summary(manifest:ReferenceManifest,root:string,cached:boolean) {
    return {id:manifest.id,sessionId:manifest.sessionId,sequenceSha256:manifest.sequenceSha256,manifestPath:join(root,'sequence.json'),
      viewerPath:join(root,manifest.viewer),range:manifest.request,frameCount:manifest.frames.length,width:manifest.source.width,height:manifest.source.height,
      timeBase:manifest.timeBase,cached,externalModelCalls:0,safeToAutoEdit:false,
      next:{command:'media reference page',sessionId:manifest.sessionId,sequenceId:manifest.id,from:0,count:24},
      breakdownTemplate:{sequenceSha256:manifest.sequenceSha256,author:'',inspectedFrames:[],elements:[]},limitations:manifest.limitations};
  }
  async extract(sessionId:string,input:ReferenceRequest,cancellation?:AbortSignal) {
    const request=referenceRequestSchema.parse(input),signal=bounded(cancellation);signal.throwIfAborted();
    const session=await this.source(sessionId),source=session.source;
    if(request.end>source.duration||source.duration>7200||source.bytes>16*1024**3)throw Error('Reference range/source exceeds supported bounds');
    const id=digest({version:1,sourceSha256:source.sha256,request}),root=this.root(sessionId,id);
    try {
      await stat(join(root,'sequence.json'));
      const loaded=await this.load(sessionId,id);
      for(const f of loaded.manifest.frames)await this.file(root,f.path,f.sha256,signal);
      await this.file(root,loaded.manifest.grid.path,loaded.manifest.grid.sha256,signal);
      return this.summary(loaded.manifest,root,true);
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    // Existing incomplete requests are not reused or overwritten.
    try{await stat(root);throw Error('Reference extraction is running or incomplete; use a new cache/range and inspect the retained diagnostic files');}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if((await fingerprint(source.path,signal)).sha256!==source.sha256)throw Error('Source bytes changed');
    const probe=JSON.parse((await referenceProcess(ffprobe(),['-v','error','-select_streams','v:0','-show_streams','-of','json',source.path],signal)).stdout.toString());
    const stream=probe.streams?.[0];
    if(!stream||stream.width!==source.width||stream.height!==source.height)throw Error('Source geometry changed');
    if(stream.sample_aspect_ratio&&!['1:1','0:1','N/A'].includes(stream.sample_aspect_ratio))throw Error('Reference V1 requires square pixels; no silent aspect-ratio conversion');
    if((stream.side_data_list??[]).some((s:{rotation?:number;displaymatrix?:string})=>s.displaymatrix||s.rotation))throw Error('Reference V1 requires unrotated source pixels; display-matrix transforms are not silently applied');
    if(['smpte2084','arib-std-b67'].includes(stream.color_transfer))throw Error('HDR reference requires an explicit color-managed conversion; no silent tone mapping');
    const parts=/^(\d+)\/(\d+)$/.exec(stream.time_base??''),originPts=Number(stream.start_pts);
    if(!parts||!Number.isSafeInteger(originPts))throw Error('Reference needs an exact source start PTS and time base');
    const numerator=Number(parts[1]),denominator=Number(parts[2]);
    if(numerator<=0||denominator<=0)throw Error('Invalid source time base');
    const origin=originPts*numerator/denominator;
    const absoluteStart=origin+request.start,absoluteEnd=origin+request.end;
    // trim's duration syntax rounds to ticks; that can erase a sub-tick interval
    // surrounding a real frame. Integer [ceil(start), ceil(end)) is explicit.
    const ceilTick=(t:number)=>{const ticks=originPts+t*denominator/numerator,nearest=Math.round(ticks);return Math.abs(ticks-nearest)<1e-7?nearest:Math.ceil(ticks);};
    const startPts=ceilTick(request.start),endPts=ceilTick(request.end);
    if(!Number.isSafeInteger(startPts)||!Number.isSafeInteger(endPts))throw Error('Reference range exceeds safe PTS precision');
    const seek=Math.max(0,absoluteStart-source.containerStartTime-1);
    const inputArgs=['-hide_banner','-nostdin','-n','-threads','2','-copyts','-ss',String(seek),
      '-t',String(absoluteEnd-source.containerStartTime-seek+1),'-noautorotate','-protocol_whitelist','file,pipe','-i',source.path,'-map','0:v:0','-an'];
    const filter=`trim=start_pts=${startPts}:end_pts=${endPts},showinfo`;
    const decoded=(log:string)=>{
      const result=parseReferenceStamps(log,origin,request.start,request.end);
      if(result.timeBase.numerator!==numerator||result.timeBase.denominator!==denominator)throw Error('Decoded time base differs from source; no implicit timestamp conversion');
      const dimensions=[...log.matchAll(/\bn:\s*\d+\s+pts:[^\r\n]*?\bs:(\d+)x(\d+)/g)];
      if(dimensions.length!==result.frames.length||dimensions.some(m=>Number(m[1])!==source.width||Number(m[2])!==source.height))throw Error('Changing or unexpected native frame geometry');
      return result;
    };
    // Metadata-only preflight bounds storage before native PNG extraction.
    const scanned=await referenceProcess(ffmpeg(),[...inputArgs,'-vf',filter,'-frames:v',String(request.maxFrames+1),'-fps_mode','passthrough','-f','null','-'],signal,4*1024**2);
    const stamps=decoded(scanned.stderr);
    const allowance=checkReferenceBudget(source.width,source.height,stamps.frames.length,request);
    await mkdir(join(this.agent.directory,sessionId,'references'),{recursive:true});await mkdir(root);
    try {
      await mkdir(join(root,'frames'));
      await writeJSON(join(root,'request.json'),{sessionId,sourceSha256:source.sha256,request,estimatedMaximumBytes:allowance});
      const rendered=await referenceProcess(ffmpeg(),[...inputArgs,'-vf',`${filter},format=rgb24`,'-fps_mode','passthrough',
        '-threads:v','1','-c:v','png','-start_number','0',join(root,'frames','frame-%06d.png')],signal,4*1024**2);
      const actual=decoded(rendered.stderr);
      if(digest(stamps)!==digest(actual))throw Error('Decoded timestamps changed between preflight and extraction');
      if((await readdir(join(root,'frames'))).length!==stamps.frames.length)throw Error('Frame count mismatch; no complete sequence was recorded');
      const grids=(await referenceProcess(ffmpeg(),['-v','error','-nostdin','-threads','2','-framerate','1','-start_number','0',
        '-i',join(root,'frames','frame-%06d.png'),'-vf','scale=96:54:flags=area,format=gray','-fps_mode','passthrough','-frames:v',String(stamps.frames.length),
        '-threads:v','1','-f','rawvideo','-'],signal)).stdout;
      const gridSize=96*54;if(grids.length!==stamps.frames.length*gridSize)throw Error('Change-grid count mismatch');
      await writeFile(join(root,'change-grid.gray'),grids,{flag:'wx'});
      const frames=[];let total=grids.length;
      for(const f of stamps.frames){
        const path=`frames/frame-${String(f.index).padStart(6,'0')}.png`,file=join(root,path),hash=await fingerprint(file,signal);
        // PNG IHDR gives actual geometry without decoding every image a second time.
        const bytes=await readFile(file);
        if(bytes.length<24||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==source.width||bytes.readUInt32BE(20)!==source.height)throw Error('Native PNG geometry changed');
        total+=hash.bytes;if(total>request.maxDecodedMiB*1024**2)throw Error('Actual artifact storage budget exceeded');
        const change=f.index?frameChange(grids.subarray((f.index-1)*gridSize,f.index*gridSize),grids.subarray(f.index*gridSize,(f.index+1)*gridSize)):null;
        frames.push({...f,id:`${id}-f${f.index}`,path,sha256:hash.sha256,bytes:hash.bytes,change});
      }
      await this.source(sessionId);
      const payload=referencePayloadSchema.parse({schemaVersion:1,kind:'agent-reference-sequence',id,sessionId,
        source:{path:source.path,sha256:source.sha256,bytes:source.bytes,mtimeMs:source.mtimeMs,width:source.width!,height:source.height!,startTime:origin,duration:source.duration},
        request,timeBase:stamps.timeBase,frames,grid:{path:'change-grid.gray',sha256:createHash('sha256').update(grids).digest('hex'),width:96,height:54},viewer:'viewer.html',
        externalModelCalls:0,safeToAutoEdit:false,limitations:[
          'Every decoded video frame with PTS in [start,end) is retained. Indices are local to this range, not original global frame numbers.',
          'Native dimensions; RGB24 PNG is a display conversion, not original compressed bytes, exact color grading, HDR, alpha or project layers.',
          'Change scores use a coarse 96x54 grayscale grid. They are not object tracking, scene semantics, position/scale/rotation/opacity measurements or proof of a cut.',
          'An unchanged image still occupies its original time. No CFR conversion, frame deduplication or interpolation is applied.',
          'Extraction is not inspection. The agent must open the images and report actual coverage; no audio is included.',
          'No original easing curve, masks, layers or authoring software can be recovered with certainty from rendered frames alone.',
          'Local evidence is private but not encrypted. No uploads or external model calls; the calling agent may use its own image service.'
        ]});
      const manifest={...payload,sequenceSha256:digest(payload)};
      await writeFile(join(root,'viewer.html'),referenceViewer({frames:manifest.frames,start:request.start,end:request.end,width:source.width!,height:source.height!}),{flag:'wx'});
      // Written last; partial folders never masquerade as complete evidence.
      await writeJSON(join(root,'sequence.json'),manifest);
      return this.summary(manifest,root,false);
    }catch(error){await writeJSON(join(root,'failure.json'),{status:'incomplete',error:(error as Error).message}).catch(()=>{});throw error;}
  }
  async track(sessionId:string,id:string,input:unknown,cancellation?:AbortSignal){
    const request=referenceTrackRequestSchema.parse(input),signal=bounded(cancellation),{manifest,root}=await this.load(sessionId,id);
    const frames=manifest.frames.slice(request.from,request.from+request.count);
    if(frames.length!==request.count)throw Error('Tracking range exceeds sequence');
    for(const frame of frames)await this.file(root,frame.path,frame.sha256,signal);
    const factor=Math.min(1,480/manifest.source.width,480/manifest.source.height),width=Math.floor(manifest.source.width*factor),height=Math.floor(manifest.source.height*factor);
    const pixels=(await referenceProcess(ffmpeg(),['-v','error','-nostdin','-threads','2','-framerate','1','-start_number',String(request.from),
      '-i',join(root,'frames','frame-%06d.png'),'-vf',`scale=${width}:${height}:flags=area,format=gray`,'-frames:v',String(request.count),'-threads:v','1','-f','rawvideo','-'],signal,32*1024**2)).stdout;
    const result=trackGrayFrames(pixels,width,height,frames,request);
    for(const frame of frames)await this.file(root,frame.path,frame.sha256,signal);
    const value={schemaVersion:1,kind:'reference-pixel-track',sessionId,sequenceId:id,sequenceSha256:manifest.sequenceSha256,sourceSha256:manifest.source.sha256,
      nativeWidth:manifest.source.width,nativeHeight:manifest.source.height,trackingWidth:width,trackingHeight:height,...result};
    return {...value,sha256:digest(value)};
  }
  async page(sessionId:string,id:string,input:unknown={},cancellation?:AbortSignal) {
    const request=referencePageSchema.parse(input),signal=bounded(cancellation),{manifest,root}=await this.load(sessionId,id);
    const frames=manifest.frames.slice(request.from,request.from+request.count);if(!frames.length)throw Error('Page starts after the final frame');
    const artifacts=[];for(const f of frames)artifacts.push({...f,path:await this.file(root,f.path,f.sha256,signal)});
    const pageId=`page-${request.from}-${frames.length}`,sheet=join(root,`${pageId}.png`),record=join(root,`${pageId}.json`);
    try{const saved=await json(record);if(saved.sequenceSha256!==manifest.sequenceSha256)throw Error('Page binding changed');await this.file(root,`${pageId}.png`,saved.sha256,signal);}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      await referenceProcess(ffmpeg(),['-v','error','-nostdin','-n','-threads','2','-framerate','1','-start_number',String(request.from),'-i',join(root,'frames','frame-%06d.png'),
        '-vf',`scale=320:240:force_original_aspect_ratio=decrease,pad=320:240:(ow-iw)/2:(oh-ih)/2,tile=${Math.min(4,frames.length)}x${Math.ceil(frames.length/4)}:nb_frames=${frames.length}:padding=4:margin=4`,
        '-frames:v','1','-threads:v','1','-update','1',sheet],signal);
      await writeJSON(record,{sequenceSha256:manifest.sequenceSha256,sha256:(await fingerprint(sheet,signal)).sha256});
    }
    return {id,sessionId,sequenceSha256:manifest.sequenceSha256,frameCount:manifest.frames.length,artifacts,contactSheet:sheet,
      contactSheetOrder:frames.map(f=>({id:f.id,index:f.index,time:f.time})),previousFrom:request.from?Math.max(0,request.from-request.count):null,
      nextFrom:request.from+frames.length<manifest.frames.length?request.from+frames.length:null,
      inspected:false,safeToAutoEdit:false,externalModelCalls:0};
  }
  /** Read the validated source-bound manifest for recipe consumers, not arbitrary filesystem paths. */
  async sequence(sessionId:string,id:string) {
    return (await this.load(sessionId,id)).manifest;
  }
  async designTemplate(sessionId:string,id:string){return draftReferenceDesign(await this.sequence(sessionId,id));}
  private async styleScenes(input:unknown, cancellation?:AbortSignal){
    const sources=styleSourcesSchema.parse(input),signal=bounded(cancellation),scenes=[];
    const ranges:{source:string;start:number;end:number}[]=[];
    for(const source of sources){
      const {manifest,root}=await this.load(source.sessionId,source.sequenceId);
      if(ranges.some(r=>r.source===manifest.source.sha256&&r.start<manifest.request.end&&manifest.request.start<r.end))
        throw Error('Style scenes must use distinct nonoverlapping source ranges');
      ranges.push({source:manifest.source.sha256,start:manifest.request.start,end:manifest.request.end});
      const record=await json(join(root,`design-${source.designSha256}.json`));
      const analysis=validateReferenceDesign(record.value,manifest);
      if(record.sha256!==source.designSha256||digest(analysis)!==source.designSha256)throw Error('Sealed reference design changed');
      for(const frame of manifest.frames)await this.file(root,frame.path,frame.sha256,signal);
      scenes.push({id:source.id,role:source.role,analysis});
    }
    return scenes;
  }
  async styleTemplate(input:unknown,cancellation?:AbortSignal){return draftStyleGuide(await this.styleScenes(input,cancellation));}
  async style(input:unknown,cancellation?:AbortSignal){
    const request=referenceStyleRequestSchema.parse(input),scenes=await this.styleScenes(request.sources,cancellation);
    const value=validateStyleGuide(request.guide,scenes),sha256=digest(value),path=join(this.agent.directory,`style-${sha256}.json`);
    const record={value,sha256,status:'agent_reported',externalModelCalls:0,safeToAutoEdit:false};
    try{await writeJSON(path,record);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const prior=await json(path);if(digest(prior.value)!==sha256)throw Error('Stored style changed');}
    return {...record,path};
  }
  async design(sessionId:string,id:string,input:unknown,cancellation?:AbortSignal){
    const {manifest,root}=await this.load(sessionId,id),value=validateReferenceDesign(input,manifest),signal=bounded(cancellation);
    for(const frame of manifest.frames)await this.file(root,frame.path,frame.sha256,signal);
    const sha256=digest(value),path=join(root,`design-${sha256}.json`),record={value,sha256,status:'agent_reported',externalModelCalls:0,safeToAutoEdit:false};
    try{await writeJSON(path,record);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const prior=await json(path);if(digest(prior.value)!==sha256)throw Error('Stored design changed');}
    return {...record,path};
  }
  async annotate(sessionId:string,id:string,input:unknown,cancellation?:AbortSignal) {
    const signal=bounded(cancellation),{manifest,root}=await this.load(sessionId,id),report=validateBreakdown(input,manifest.sequenceSha256,manifest.frames);
    for(const i of report.inspectedFrames){const f=manifest.frames[i];await this.file(root,f.path,f.sha256,signal);}
    const reportId=digest(report),path=join(root,`breakdown-${reportId}.json`);
    await writeJSON(path,{...report,sessionId,sequenceId:id,externalModelCalls:0});return {...report,path};
  }
  async compare(sessionId:string,id:string,otherSessionId:string,otherId:string,options:{offsetSeconds?:number;from?:number;count?:number}={},cancellation?:AbortSignal) {
    const offsetSeconds=options.offsetSeconds??0,page=referencePageSchema.parse({from:options.from,count:options.count});
    if(!Number.isFinite(offsetSeconds)||Math.abs(offsetSeconds)>30)throw Error('Comparison offset must be within -30..30 seconds');
    const signal=bounded(cancellation),a=await this.load(sessionId,id),b=await this.load(otherSessionId,otherId);
    if(a.manifest.source.width*b.manifest.source.height!==b.manifest.source.width*a.manifest.source.height)throw Error('Comparison requires matching picture aspect ratios');
    const gridA=await readFile(await this.file(a.root,a.manifest.grid.path,a.manifest.grid.sha256,signal));
    const gridB=await readFile(await this.file(b.root,b.manifest.grid.path,b.manifest.grid.sha256,signal));
    const size=96*54;if(gridA.length!==a.manifest.frames.length*size||gridB.length!==b.manifest.frames.length*size)throw Error('Comparison grid length changed');
    const selected=a.manifest.frames.slice(page.from,page.from+page.count);if(!selected.length)throw Error('Comparison page starts after the final frame');
    const pairs=[];let j=-1;
    for(const frame of selected){
      const target=frame.time-a.manifest.request.start+b.manifest.request.start+offsetSeconds;
      while(j+1<b.manifest.frames.length&&b.manifest.frames[j+1].time<=target+1e-7)j++;
      if(j<0||target<b.manifest.request.start||target>=b.manifest.request.end){pairs.push({referenceFrame:frame.index,targetTime:target,candidateFrame:null});continue;}
      const candidate=b.manifest.frames[j];
      const pathA=await this.file(a.root,frame.path,frame.sha256,signal),pathB=await this.file(b.root,candidate.path,candidate.sha256,signal);
      pairs.push({referenceFrame:frame.index,candidateFrame:j,targetTime:target,candidateTime:candidate.time,
        paths:[pathA,pathB],meanAbsoluteDifference:frameChange(gridA.subarray(frame.index*size,(frame.index+1)*size),gridB.subarray(j*size,(j+1)*size)).meanAbsoluteDifference});
    }
    return {kind:'reference-frame-comparison',referenceSha256:a.manifest.sequenceSha256,candidateSha256:b.manifest.sequenceSha256,
      offsetSeconds,alignment:'Requested-range relative time; latest candidate frame at/before each reference timestamp. No invented interpolated frames.',
      pairs,referenceFrameCount:a.manifest.frames.length,nextFrom:page.from+selected.length<a.manifest.frames.length?page.from+selected.length:null,
      status:'measurements_only',safeToAutoEdit:false,externalModelCalls:0,
      limitation:'Coarse grayscale pixel differences are not perceptual quality, semantic equivalence, motion-curve recovery, or approval. Inspect native pairs and timing.'};
  }
}
