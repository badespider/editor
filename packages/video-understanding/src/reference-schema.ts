import { z } from 'zod';

export const referenceId = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().finite().nonnegative();
const index = z.number().int().min(0).max(1799);
const text = z.string().trim().min(1).max(4000);
export const referenceRequestSchema = z.object({
  start: time, end: time,
  maxFrames: z.number().int().min(1).max(1800).default(600),
  maxDecodedMiB: z.number().int().min(1).max(4096).default(1024),
}).strict().refine(r => r.end > r.start && r.end-r.start <= 30, 'Choose a positive range of at most 30 seconds');
export const referencePageSchema = z.object({
  from: index.default(0), count: z.number().int().min(1).max(48).default(24),
}).strict();
export const referenceBreakdownSchema = z.object({
  sequenceSha256: referenceId, author: text,
  inspectedFrames: z.array(index).min(1).max(1800),
  elements: z.array(z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), label: text,
    observation: text, inference: z.string().max(4000), uncertainty: z.string().max(4000),
    phases: z.array(z.object({label:text, startFrame:index, endFrame:index}).strict()).min(1).max(32),
    // Agent-authored hypotheses, not recovered original animation parameters.
    keyframes: z.array(z.object({frame:index, x:z.number().finite().optional(), y:z.number().finite().optional(),
      scale:z.number().positive().finite().optional(), rotationDegrees:z.number().finite().optional(),
      opacity:z.number().min(0).max(1).optional(), note:text,
    }).strict()).max(100),
  }).strict()).min(1).max(32),
}).strict();
export type ReferenceRequest = z.input<typeof referenceRequestSchema>;
export type FrameStamp = {index:number; pts:number; time:number; durationTicks:number|null};
const changeSchema=z.object({meanAbsoluteDifference:z.number().min(0).max(1),changedFraction:z.number().min(0).max(1),
  changedBounds:z.object({x:time,y:time,width:time,height:time}).strict().nullable()}).strict();
export const referencePayloadSchema=z.object({
  schemaVersion:z.literal(1),kind:z.literal('agent-reference-sequence'),id:referenceId,sessionId:referenceId,
  source:z.object({path:text,sha256:referenceId,bytes:z.number().int().positive(),mtimeMs:z.number().finite(),
    width:z.number().int().positive(),height:z.number().int().positive(),startTime:z.number().finite(),duration:z.number().positive()}).strict(),
  request:referenceRequestSchema,timeBase:z.object({numerator:z.number().int().positive(),denominator:z.number().int().positive()}).strict(),
  frames:z.array(z.object({index,pts:z.number().int().safe(),time:time,durationTicks:z.number().int().nonnegative().nullable(),
    id:text,path:z.string().regex(/^frames\/frame-\d{6}\.png$/),sha256:referenceId,bytes:z.number().int().positive(),
    change:changeSchema.nullable()}).strict()).min(1).max(1800),
  grid:z.object({path:z.literal('change-grid.gray'),sha256:referenceId,width:z.literal(96),height:z.literal(54)}).strict(),
  viewer:z.literal('viewer.html'),externalModelCalls:z.literal(0),safeToAutoEdit:z.literal(false),
  limitations:z.array(text).min(1).max(16),
}).strict();
export const referenceManifestSchema=referencePayloadSchema.extend({sequenceSha256:referenceId});
export type ReferenceManifest=z.infer<typeof referenceManifestSchema>;

/** Decode integer PTS, never infer frame times from average FPS or rounded pts_time. */
export function parseReferenceStamps(log:string, origin:number, start:number, end:number) {
  const bases=[...log.matchAll(/config in time_base:\s*(\d+)\/(\d+)/g)].map(m=>[Number(m[1]),Number(m[2])]);
  if(!bases.length||bases.some(b=>b[0]<=0||b[1]<=0||b[0]!==bases[0][0]||b[1]!==bases[0][1]))throw Error('Missing or changing decoded time base');
  const [num,den]=bases[0],frames:FrameStamp[]=[];
  for(const line of log.split(/\r?\n/)) {
    const m=/\bn:\s*(\d+)\s+pts:\s*(-?\d+)\s+pts_time:/.exec(line);if(!m)continue;
    const index=Number(m[1]),pts=Number(m[2]),duration=/\bduration:\s*(\d+)/.exec(line);
    const time=pts*num/den-origin;
    if(!Number.isSafeInteger(pts)||index!==frames.length||!Number.isFinite(time)||time<start-1e-7||time>=end+1e-7||
      (frames.length&&pts<frames.at(-1)!.pts))throw Error('Invalid, out-of-range or nonmonotonic decoded frame timestamps');
    frames.push({index,pts,time,durationTicks:duration?Number(duration[1]):null});
  }
  if(!frames.length)throw Error('No decoded frames in the requested range');
  return {timeBase:{numerator:num,denominator:den},frames};
}

export function checkReferenceBudget(width:number,height:number,frames:number,request:z.output<typeof referenceRequestSchema>) {
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width*height>34_000_000)throw Error('Unsupported source geometry');
  if(frames>request.maxFrames)throw Error(`Frame budget exceeded (${frames} > ${request.maxFrames}); shorten the range or explicitly raise --max-frames`);
  // Conservative RGB PNG allowance, including headers/compression overhead. Never silently resize.
  const allowance=(width*height*3*1.02+65536)*frames;
  if(allowance>request.maxDecodedMiB*1024**2)throw Error('Native-resolution pixel/storage budget exceeded; shorten the range or explicitly raise --max-decoded-mib');
  return allowance;
}

/** Whole-picture change only. Camera movement, lighting and compression also cause change. */
export function frameChange(previous:Uint8Array,current:Uint8Array,width=96,height=54) {
  if(previous.length!==width*height||current.length!==previous.length)throw Error('Change grid size mismatch');
  let sum=0,count=0,left=width,right=-1,top=height,bottom=-1;
  for(let i=0;i<current.length;i++) {
    const delta=Math.abs(current[i]-previous[i]);sum+=delta;
    if(delta>=20){count++;const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  }
  return {meanAbsoluteDifference:sum/(255*current.length),changedFraction:count/current.length,
    changedBounds:count?{x:left/width,y:top/height,width:(right-left+1)/width,height:(bottom-top+1)/height}:null};
}

export function validateBreakdown(input:unknown,sequenceSha256:string,frames:FrameStamp[]) {
  const report=referenceBreakdownSchema.parse(input);
  if(report.sequenceSha256!==sequenceSha256)throw Error('Breakdown is bound to a different frame sequence');
  const seen=new Set(report.inspectedFrames);
  if(seen.size!==report.inspectedFrames.length||[...seen].some(n=>!frames[n]))throw Error('Invalid or duplicate inspected frame index');
  if(new Set(report.elements.map(e=>e.id)).size!==report.elements.length)throw Error('Duplicate element ID');
  for(const element of report.elements) {
    for(const p of element.phases)if(p.endFrame<p.startFrame||!seen.has(p.startFrame)||!seen.has(p.endFrame))throw Error('Phase endpoints must cite inspected frames in order');
    let prior=-1;
    for(const k of element.keyframes){if(!seen.has(k.frame)||k.frame<=prior)throw Error('Keyframes must cite inspected frames in ascending order');prior=k.frame;}
  }
  return {...report,status:'agent_reported' as const,safeToAutoEdit:false as const,
    coverage:{inspectedFrames:seen.size,totalFrames:frames.length,allFramesReported:seen.size===frames.length},
    timing:report.elements.map(e=>({id:e.id,phases:e.phases.map(p=>({...p,start:frames[p.startFrame].time,end:frames[p.endFrame].time})),
      segments:e.keyframes.slice(1).map((k,i)=>{
        const prior=e.keyframes[i],seconds=frames[k.frame].time-frames[prior.frame].time;
        const delta:Record<string,number>={},perSecond:Record<string,number|null>={};
        for(const key of ['x','y','scale','rotationDegrees','opacity'] as const){
          if(k[key]!==undefined&&prior[key]!==undefined){delta[key]=k[key]!-prior[key]!;perSecond[key]=seconds>0?delta[key]/seconds:null;}
        }
        return {fromFrame:prior.frame,toFrame:k.frame,seconds,delta,perSecond,basis:'derived_from_agent_keyframes_not_automatic_tracking'};
      })})),
    limitation:'Authored observation and motion hypotheses, not independent verification, recovered project layers, or an approved reusable skill.'};
}
