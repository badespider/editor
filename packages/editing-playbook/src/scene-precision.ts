import { z } from 'zod';
import { createHash } from 'node:crypto';
import { runMedia } from './media-process.ts';
import { fingerprint } from './preview.ts';
import { sceneWorldPose } from './scene-quality.ts';
import { resolveSceneTemplate, motionDigest, type SceneAdaptation } from './scene-motion.ts';
import type { PixelTrack } from '../../video-understanding/src/reference-tracking.ts';

const unit=z.number().finite().min(0).max(1);
export const sceneMeasurementSchema=z.object({targets:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),shotId:z.string().min(1).max(80),layerId:z.string().min(1).max(80),
  start:z.number().finite().nonnegative(),end:z.number().finite().positive(),seedTime:z.number().finite().nonnegative(),
  box:z.object({x:unit,y:unit,width:unit.positive(),height:unit.positive()}).strict().refine(b=>b.x+b.width<=1&&b.y+b.height<=1),
  positionTolerancePixels:z.number().finite().positive().max(100).default(8),scaleTolerance:z.number().finite().positive().max(.5).default(.08),
  rotationToleranceDegrees:z.number().finite().positive().max(30).default(6),
}).strict().refine(t=>t.end>t.start&&t.end-t.start<=4&&t.seedTime>=t.start&&t.seedTime<t.end,'Use a <=4-second in-range seed')).min(1).max(3)}).strict();
type Target=z.infer<typeof sceneMeasurementSchema>['targets'][number];

/** Compare measured motion to planned motion, aligned only at the explicit seed.
 * Initial placement cannot be diagnosed from a seed-relative measurement. */
export function compareTrackedMotion(a:SceneAdaptation,target:Target,measurements:PixelTrack[]){
  const shot=a.input.shots.find(s=>s.id===target.shotId);
  if(!shot||target.start<shot.start||target.end>shot.end)throw Error('Measurement range must stay within its selected shot');
  const template=resolveSceneTemplate(a.recipe.templates.find(t=>t.id===shot.templateId)!,shot,a.input),layer=template.layers.find(l=>l.id===target.layerId);
  if(!layer)throw Error('Unknown measurement layer');
  const valid=measurements.filter((m):m is PixelTrack&{x:number;y:number;scale:number;rotationDegrees:number}=>m.x!==null&&m.y!==null&&m.scale!==null&&m.rotationDegrees!==null&&(m.status==='candidate'||m.status==='seed'));
  const seed=valid.find(m=>m.status==='seed');if(!seed)throw Error('Missing observed seed');
  const pose=(time:number)=>sceneWorldPose(layer,(time-shot.start)/(shot.end-shot.start),template.groups,a.input.width,a.input.height);
  const initial=pose(seed.time);
  // Transform the seed's local offset too: it need not be the layer center.
  const displacement=(p:ReturnType<typeof pose>,s:ReturnType<typeof pose>)=>{
    const r=-s.rotation*Math.PI/180,dx=(seed.x-s.x)*a.input.width,dy=(seed.y-s.y)*a.input.height;
    const x=(dx*Math.cos(r)-dy*Math.sin(r))*p.width/s.width,y=(dx*Math.sin(r)+dy*Math.cos(r))*p.height/s.height,q=p.rotation*Math.PI/180;
    return {x:p.x+(x*Math.cos(q)-y*Math.sin(q))/a.input.width-seed.x,y:p.y+(x*Math.sin(q)+y*Math.cos(q))/a.input.height-seed.y};
  };
  const errors=valid.map(m=>{const p=pose(m.time),d=displacement(p,initial);
    return {frame:m.frame,time:m.time,score:m.score,
      positionPixels:Math.hypot((m.x-seed.x-d.x)*a.input.width,(m.y-seed.y-d.y)*a.input.height),
      scaleError:Math.abs(m.scale-p.width/initial.width),rotationDegrees:Math.abs(m.rotationDegrees-(p.rotation-initial.rotation))};});
  const rms=(lag:number)=>{const s=pose(seed.time-lag/30);return Math.sqrt(valid.reduce((sum,m)=>{const d=displacement(pose(m.time-lag/30),s);return sum+((m.x-seed.x-d.x)*a.input.width)**2+((m.y-seed.y-d.y)*a.input.height)**2;},0)/Math.max(1,valid.length));};
  const lags=Array.from({length:7},(_,i)=>({frames:i-3,rms:rms(i-3)})).sort((a,b)=>a.rms-b.rms||Math.abs(a.frames)-Math.abs(b.frames));
  const zero=rms(0),lag=valid.length>=8&&zero>2&&lags[0].rms<zero*.7?lags[0]:null;
  const flagged=errors.filter(e=>e.positionPixels>target.positionTolerancePixels||e.scaleError>target.scaleTolerance||e.rotationDegrees>target.rotationToleranceDegrees);
  return {target,coverage:valid.length/measurements.length,seedRelative:true,errors,positionRmsPixels:zero,possibleLagFrames:lag?.frames??null,
    flaggedFrames:flagged.map(e=>e.frame),status:valid.length<measurements.length?'incomplete_track_needs_inspection':flagged.length?'motion_difference_needs_inspection':'within_requested_tolerances',
    safeToAutoPublish:false,limitation:'Patch tracking is fallible; initial position/font size/opacity are not verified. Lag is a local hypothesis, not a recovered edit. Inspect pixels before a bounded correction.'};
}

export const goldenRequestSchema=z.object({frames:z.array(z.number().int().nonnegative()).min(1).max(24),width:z.number().int().min(64).max(320).default(160)}).strict();
const goldenSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('scene-visual-baseline'),inputSha256:z.string().regex(/^[a-f0-9]{64}$/),recipeSha256:z.string().regex(/^[a-f0-9]{64}$/),
  sourceSha256:z.string().regex(/^[a-f0-9]{64}$/),width:z.number().int().min(1).max(320),height:z.number().int().min(1).max(2560),
  nativeWidth:z.number().int().positive(),nativeHeight:z.number().int().positive(),frames:z.array(z.number().int().nonnegative()).min(1).max(24),
  pixelsBase64:z.string().max(4*1024**2),pixelSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const bytesHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Only for same-input regression, never pixel-matching unrelated new footage. */
export async function captureSceneGolden(path:string,a:SceneAdaptation,raw:unknown,signal?:AbortSignal){
  const request=goldenRequestSchema.parse(raw),frames=[...new Set(request.frames)].sort((a,b)=>a-b),width=request.width,height=Math.max(1,Math.round(width*a.input.height/a.input.width));
  if(frames.some(f=>f>=Math.round(a.duration*30)))throw Error('Golden frame is outside render');
  if(height>2560||frames.length*width*height*3>2.75*1024**2)throw Error('Golden exceeds the 4 MiB JSON budget; select fewer frames or a smaller width');
  const before=await fingerprint(path,signal);
  const pixels=await runMedia(['-v','error','-nostdin','-i',path,'-an','-vf',`select='${frames.map(f=>`eq(n,${f})`).join('+')}',scale=${width}:${height}:flags=area,format=rgb24`,
    '-fps_mode','passthrough','-frames:v',String(frames.length),'-f','rawvideo','-'],{signal,limit:frames.length*width*height*3+1024});
  if(pixels.length!==frames.length*width*height*3||await fingerprint(path,signal)!==before)throw Error('Golden capture count/source changed');
  return {schemaVersion:1 as const,kind:'scene-visual-baseline' as const,inputSha256:motionDigest(a.input),recipeSha256:motionDigest(a.recipe),sourceSha256:before,
    width,height,nativeWidth:a.input.width,nativeHeight:a.input.height,frames,pixelsBase64:pixels.toString('base64'),pixelSha256:bytesHash(pixels)};
}
export function compareSceneGoldens(reference:unknown,candidate:unknown,tolerance=1){
  const a=goldenSchema.parse(reference),b=goldenSchema.parse(candidate);
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>20)throw Error('Use a bounded 0–20 RGB tolerance');
  if(a.inputSha256!==b.inputSha256||a.nativeWidth!==b.nativeWidth||a.nativeHeight!==b.nativeHeight||a.width!==b.width||a.height!==b.height||JSON.stringify(a.frames)!==JSON.stringify(b.frames))throw Error('Golden comparisons require the same source/input, dimensions and selected frames');
  const left=Buffer.from(a.pixelsBase64,'base64'),right=Buffer.from(b.pixelsBase64,'base64'),stride=a.width*a.height*3;
  if(left.length!==a.frames.length*stride||right.length!==left.length||bytesHash(left)!==a.pixelSha256||bytesHash(right)!==b.pixelSha256)throw Error('Golden pixel fingerprint changed');
  const differences=a.frames.map((frame,i)=>{let error=0;for(let p=0;p<stride;p++)error+=Math.abs(left[i*stride+p]-right[i*stride+p]);return {frame,meanRgbDifference:error/stride};});
  return {status:differences.some(f=>f.meanRgbDifference>tolerance)?'visual_change_requires_review':'within_regression_tolerance',differences,tolerance,
    referenceSha256:a.sourceSha256,candidateSha256:b.sourceSha256,recipeChanged:a.recipeSha256!==b.recipeSha256,safeToAutoPublish:false,
    limitation:'Sampled, downscaled same-input regression only. Small details and between-sample changes still need native/dense inspection; differences are not a quality score.'};
}
