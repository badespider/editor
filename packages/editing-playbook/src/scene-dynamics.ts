import { z } from 'zod';

const unit = z.number().finite().min(0).max(1);
export const sceneCurveSchema = z.union([
  z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'hold', 'bounce']),
  z.object({ kind: z.literal('bezier'), x1: unit, y1: z.number().finite().min(-2).max(3), x2: unit, y2: z.number().finite().min(-2).max(3) }).strict(),
  z.object({ kind: z.literal('spring'), damping: z.number().finite().min(2).max(20), cycles: z.number().finite().min(.5).max(6) }).strict(),
]);
const property = z.enum(['x','y','width','height','rotation','opacity','blur','skewX','reveal']);
export const propertyTimingSchema = z.partialRecord(property, z.object({ start: unit, end: unit, easing: sceneCurveSchema.optional() }).strict()
  .refine(v => v.end > v.start, 'Property timing must have positive duration'));
export const scenePathSchema = z.object({ x1: z.number().finite().min(-4).max(4), y1: z.number().finite().min(-4).max(4),
  x2: z.number().finite().min(-4).max(4), y2: z.number().finite().min(-4).max(4) }).strict();
export type SceneCurve = z.infer<typeof sceneCurveSchema>;
type Pose = { x:number;y:number;width:number;height:number;rotation:number;opacity:number;blur:number;skewX:number;reveal:number };
type Key = { at:number;pose:Partial<Pose>;easing:SceneCurve;propertyTiming?:z.infer<typeof propertyTimingSchema>;path?:z.infer<typeof scenePathSchema> };

/** Deterministic typed implementation, parity-tested against the fixed compositor runtime. */
export function precisionEase(t:number,e:SceneCurve):number {
  t=Math.max(0,Math.min(1,t)); if(t===0||t===1)return t;
  if(typeof e==='object') {
    if(e.kind==='spring')return (1-Math.exp(-e.damping*t)*Math.cos(2*Math.PI*e.cycles*t))/(1-Math.exp(-e.damping)*Math.cos(2*Math.PI*e.cycles));
    const cubic=(u:number,a:number,b:number)=>3*(1-u)**2*u*a+3*(1-u)*u*u*b+u**3;
    let lo=0,hi=1;for(let n=0;n<28;n++){const m=(lo+hi)/2;if(cubic(m,e.x1,e.x2)<t)lo=m;else hi=m;}
    return cubic((lo+hi)/2,e.y1,e.y2);
  }
  if(e==='hold')return 0;
  if(e==='easeOut')return 1-(1-t)**3;if(e==='easeIn')return t**3;
  if(e==='easeInOut')return t<.5?4*t**3:1-(-2*t+2)**3/2;
  if(e==='bounce'){const n=7.5625,d=2.75;if(t<1/d)return n*t*t;if(t<2/d){t-=1.5/d;return n*t*t+.75;}if(t<2.5/d){t-=2.25/d;return n*t*t+.9375;}t-=2.625/d;return n*t*t+.984375;}
  return t;
}
export function precisionPose(layer:{pose:Pose;keys:Key[]},time:number):Pose {
  let pose={...layer.pose},previous:Key={at:0,pose:{},easing:'linear'};
  for(const key of layer.keys){const next={...pose,...key.pose};
    if(time<key.at){const u=(time-previous.at)/(key.at-previous.at),out={...pose};
      for(const property of Object.keys(pose) as (keyof Pose)[]){const timing=previous.propertyTiming?.[property];
        const f=precisionEase(timing?(u-timing.start)/(timing.end-timing.start):u,timing?.easing??previous.easing);
        out[property]=pose[property]+(next[property]-pose[property])*f;}
      if(previous.path){const f=precisionEase(u,previous.easing),q=previous.path;
        out.x=(1-f)**3*pose.x+3*(1-f)**2*f*q.x1+3*(1-f)*f*f*q.x2+f**3*next.x;
        out.y=(1-f)**3*pose.y+3*(1-f)**2*f*q.y1+3*(1-f)*f*f*q.y2+f**3*next.y;}
      // Overshoot is meaningful for position/scale, but never negative dimensions,
      // alpha outside [0,1], or an invalid blur/reveal interval.
      out.width=Math.max(.0001,out.width);out.height=Math.max(.0001,out.height);
      out.opacity=Math.max(0,Math.min(1,out.opacity));out.reveal=Math.max(0,Math.min(1,out.reveal));out.blur=Math.max(0,Math.min(40,out.blur));
      return out;
    }pose=next;previous=key;
  }return pose;
}

export { precisionMotionRuntime } from './scene-precision-runtime.ts';
