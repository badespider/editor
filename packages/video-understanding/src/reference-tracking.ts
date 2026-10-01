import { z } from 'zod';
const unit=z.number().finite().min(0).max(1);
export const referenceTrackRequestSchema=z.object({seedFrame:z.number().int().nonnegative(),
  from:z.number().int().nonnegative(),count:z.number().int().min(2).max(120),
  box:z.object({x:unit,y:unit,width:unit.positive(),height:unit.positive()}).strict().refine(b=>b.x+b.width<=1&&b.y+b.height<=1,'Seed box must fit picture'),
  searchRadius:z.number().int().min(2).max(48).default(16),minScore:z.number().finite().min(.5).max(.99).default(.75),
  ambiguityMargin:z.number().finite().min(.001).max(.2).default(.015),
  scaleStep:z.number().finite().min(0).max(.15).default(.04),rotationStep:z.number().finite().min(0).max(12).default(3),
}).strict().refine(r=>r.seedFrame>=r.from&&r.seedFrame<r.from+r.count,'Seed frame must be within requested range');
export type TrackRequest=z.infer<typeof referenceTrackRequestSchema>;
export type PixelTrack={frame:number;time:number;x:number|null;y:number|null;scale:number|null;rotationDegrees:number|null;score:number|null;
  status:'seed'|'candidate'|'uncertain'|'lost'};

/** Bounded seeded similarity matching. No object semantics, opacity or camera recovery. */
export function trackGrayFrames(pixels:Uint8Array,width:number,height:number,stamps:{index:number;time:number}[],raw:unknown){
  const request=referenceTrackRequestSchema.parse(raw),size=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||width>480||height>480||pixels.length!==size*stamps.length||stamps.length!==request.count)throw Error('Tracking dimensions/frame budget mismatch');
  if(stamps.some((s,i)=>s.index!==request.from+i||!Number.isFinite(s.time)||(i>0&&s.time<stamps[i-1].time)))throw Error('Tracking needs ordered native timestamps');
  const seedIndex=request.seedFrame-request.from,b=request.box,seed={x:(b.x+b.width/2)*width,y:(b.y+b.height/2)*height,scale:1,rotation:0};
  if(b.width*width<8||b.height*height<8)throw Error('Seed patch is too small at tracking resolution');
  const points=Array.from({length:144},(_,i)=>({x:((i%12+.5)/12-.5)*b.width*width,y:((Math.floor(i/12)+.5)/12-.5)*b.height*height}));
  const sample=(frame:number,x:number,y:number)=>{
    if(x<0||y<0||x>=width-1||y>=height-1)return NaN;
    const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy,at=frame*size+iy*width;
    return (pixels[at+ix]*(1-dx)+pixels[at+ix+1]*dx)*(1-dy)+(pixels[at+width+ix]*(1-dx)+pixels[at+width+ix+1]*dx)*dy;
  };
  const reference=points.map(p=>sample(seedIndex,seed.x+p.x,seed.y+p.y));
  const mean=reference.reduce((a,b)=>a+b,0)/reference.length,centered=reference.map(v=>v-mean),norm=centered.reduce((a,b)=>a+b*b,0);
  if(!Number.isFinite(norm)||norm/reference.length<25)throw Error('Seed patch lacks texture/contrast; select distinctive visible pixels');
  type Candidate=typeof seed&{score:number};
  const score=(frame:number,c:typeof seed)=>{
    const r=c.rotation*Math.PI/180,cos=Math.cos(r)*c.scale,sin=Math.sin(r)*c.scale;let sum=0,squares=0,cross=0;
    for(let i=0;i<points.length;i++){const p=points[i],v=sample(frame,c.x+p.x*cos-p.y*sin,c.y+p.x*sin+p.y*cos);if(!Number.isFinite(v))return -1;
      sum+=v;squares+=v*v;cross+=centered[i]*v;}
    const variance=squares-sum*sum/points.length;if(variance<25*points.length)return -1;
    return cross/Math.sqrt(norm*variance);
  };
  const results:PixelTrack[]=stamps.map(s=>({frame:s.index,time:s.time,x:null,y:null,scale:null,rotationDegrees:null,score:null,status:'lost'}));
  results[seedIndex]={frame:request.seedFrame,time:stamps[seedIndex].time,x:seed.x/width,y:seed.y/height,scale:1,rotationDegrees:0,score:1,status:'seed'};
  for(const direction of [-1,1]){
    let prior=seed;
    for(let frame=seedIndex+direction;frame>=0&&frame<stamps.length;frame+=direction){
      const coarse:Candidate[]=[],step=Math.max(1,Math.ceil(request.searchRadius/8));
      const scales=request.scaleStep?[1-request.scaleStep,1,1+request.scaleStep]:[1],rotations=request.rotationStep?[-request.rotationStep,0,request.rotationStep]:[0];
      for(let dy=-request.searchRadius;dy<=request.searchRadius;dy+=step)for(let dx=-request.searchRadius;dx<=request.searchRadius;dx+=step)
        for(const scale of scales)for(const angle of rotations){const c={x:prior.x+dx,y:prior.y+dy,scale:prior.scale*scale,rotation:prior.rotation+angle};
          if(c.scale<.4||c.scale>2.5||Math.abs(c.rotation)>90)continue;coarse.push({...c,score:score(frame,c)});}
      // Always include the exact previous transform (odd radii can miss dx=0).
      coarse.push({...prior,score:score(frame,prior)});coarse.sort((a,b)=>b.score-a.score);
      let best=coarse[0];
      for(const peak of coarse.slice(0,3))for(let dy=-step;dy<=step;dy++)for(let dx=-step;dx<=step;dx++){const c={...peak,x:peak.x+dx,y:peak.y+dy},s=score(frame,c);if(s>best.score)best={...c,score:s};}
      const alternative=coarse.find(c=>Math.hypot(c.x-best.x,c.y-best.y)>Math.max(4,Math.min(b.width*width,b.height*height)*.35));
      const reliable=best.score>=request.minScore&&(!alternative||best.score-alternative.score>=request.ambiguityMargin);
      if(!reliable){results[frame]={...results[frame],score:best.score,status:'uncertain'};break;}
      results[frame]={frame:stamps[frame].index,time:stamps[frame].time,x:best.x/width,y:best.y/height,scale:best.scale,rotationDegrees:best.rotation,score:best.score,status:'candidate'};
      prior=best;
    }
  }
  return {request,measurements:results,candidateFrames:results.filter(r=>r.status==='candidate'||r.status==='seed').length,
    status:'measurements_require_visual_confirmation',externalModelCalls:0,safeToAutoEdit:false,
    limitations:['Seeded 2D grayscale patch similarity, not semantic tracking or calibrated confidence. Score is normalized correlation, not probability.',
      'Texture, repeated objects, occlusion, blur, lighting and camera motion can invalidate matches. Uncertain tracking stops in that direction; no invented continuation.',
      'Translation/scale/rotation are relative to the chosen seed patch. No font identification, hidden-layer recovery, opacity measurement or automatic keyframe promotion.']};
}
