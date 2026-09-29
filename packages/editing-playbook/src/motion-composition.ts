import type { MotionAdaptation } from './motion-schema.ts';

/** Fixed, seek-safe renderer code. Reference text and agent reports never become executable source. */
export const motionRuntime = `
const clamp = n => Math.max(0, Math.min(1, n));
// Match the editor's CSS cubic-Bezier named presets, including native/canvas switches.
const ease = (t, name) => {
  t=clamp(t); if(name==='linear'||t===0||t===1)return t;
  const x1=name==='easeOut'?0:.42,x2=name==='easeIn'?1:.58;
  const bez=(u,a,b)=>3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*b+u*u*u;
  let lo=0,hi=1;for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(bez(mid,x1,x2)<t)lo=mid;else hi=mid;}
  return bez((lo+hi)/2,0,1);
};
function stateAt(t, card, line, settings) {
  const local=t-card.start-line*card.staggerSeconds;
  if(local<0 || t>=card.end) return null;
  const incoming=ease(local/card.entrySeconds, settings.easing);
  const outgoing=ease((t-(card.end-card.exitSeconds))/card.exitSeconds, settings.easing);
  const value=(key,rest)=>settings.entry[key]+(rest-settings.entry[key])*incoming+(settings.exit[key]-rest)*outgoing;
  return {dx:value('dx',0),dy:value('dy',0),scale:value('scale',1),rotation:value('rotation',0),
    opacity:clamp(value('opacity',1)),blur:settings.blurPx*((1-incoming)+outgoing)};
}
`;

export function motionComposition(adaptation: MotionAdaptation, basePath: string) {
  const settings = adaptation.recipe.settings, { width, height } = adaptation.input;
  const data = JSON.stringify({ settings, cards: adaptation.cards, width, height, duration: adaptation.duration, source: basePath.replaceAll('\\', '/') });
  // Native tracks stay editable in the timeline. Canvas is used for blur/scaling which
  // cannot currently be represented as native text font-size keyframes.
  const canvas = adaptation.renderer === 'canvas';
  const header = `${canvas ? 'import { createEffect } from "solid-js";\nimport { useTicker } from "@diffusionstudio/jsx";\n' : ''}const data=${data};\n`;
  const native = `
function tracks(card,line) {
  const s=data.settings, delay=line*card.staggerSeconds, duration=card.end-card.start-delay;
  const keys=(a,b,c)=>[{time:0,value:a,easing:s.easing},{time:card.entrySeconds,value:b},
    {time:duration-card.exitSeconds,value:b,easing:s.easing},{time:duration,value:c}];
  return {offsetX:keys(s.entry.dx*data.width,0,s.exit.dx*data.width),
    offsetY:keys(s.entry.dy*data.height,0,s.exit.dy*data.height),
    rotation:keys(s.entry.rotation,0,s.exit.rotation),opacity:keys(s.entry.opacity,1,s.exit.opacity)};
}
export default function Motion(){return <rect scene="motion-preview" name="Caption motion DRAFT" width={data.width} height={data.height} end={data.duration} fill="#18212b">
  <video name="Original picture and audio" src={data.source} start={0} end={data.duration} sourceIn={0} sourceOut={data.duration} objectFit="contain"/>
  {data.cards.map(card=>card.lines.map((line,i)=><text name={card.id+" line "+i} start={card.start+i*card.staggerSeconds} end={card.end}
    x={card.box.x*data.width} y={card.box.y*data.height+(card.box.height*data.height-card.lines.length*card.fontSize*1.25)/2+i*card.fontSize*1.25}
    width={card.box.width*data.width} height={card.fontSize*1.25} fontSize={card.fontSize}
    fontFamily={data.settings.fontFamily} fontWeight={data.settings.fontWeight} fill={data.settings.color}
    textAlign="center" textBaseline="middle" {...tracks(card,i)}>{line}</text>))}
</rect>;}
`;
  const surface = `${motionRuntime}
export default function Motion(){const {time}=useTicker(); return <rect scene="motion-preview" name="Caption motion DRAFT" width={data.width} height={data.height} end={data.duration} fill="#18212b">
  <video name="Original picture and audio" src={data.source} start={0} end={data.duration} sourceIn={0} sourceOut={data.duration} objectFit="contain"/>
  <surface name="Recipe-driven captions (edit recipe to change glyph animation)" width={data.width} height={data.height} start={0} end={data.duration}
    ref={canvas=>{const ctx=canvas.getContext('2d'); createEffect(()=>{
      ctx.clearRect(0,0,data.width,data.height); const t=time(),s=data.settings;
      for(const card of data.cards) card.lines.forEach((line,i)=>{
        const v=stateAt(t,card,i,s); if(!v)return;
        const lineHeight=card.fontSize*1.25;
        ctx.save(); ctx.translate((card.box.x+card.box.width/2+v.dx)*data.width,
          (card.box.y+card.box.height/2+v.dy)*data.height+(i-(card.lines.length-1)/2)*lineHeight);
        ctx.rotate(v.rotation*Math.PI/180); ctx.scale(v.scale,v.scale);
        ctx.font=s.fontWeight+' '+card.fontSize+'px "'+s.fontFamily+'"';
        ctx.textAlign='center';ctx.textBaseline='middle';ctx.globalAlpha=v.opacity;
        ctx.filter=v.blur>.01?'blur('+v.blur+'px)':'none';ctx.fillStyle=s.color;
        ctx.fillText(line,0,0,card.box.width*data.width);ctx.restore();
      });
    });}} />
</rect>;}
`;
  return '// Generated from a source-bound motion recipe. Edit the recipe, then regenerate and review.\n' + header + (canvas ? surface : native);
}
