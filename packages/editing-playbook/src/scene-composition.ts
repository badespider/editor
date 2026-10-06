import { scenePoseAt, type SceneAdaptation } from './scene-motion.ts';
import { layeredComposition } from './scene-layered.ts';
import { precisionMotionRuntime } from './scene-dynamics.ts';

// Fixed drawing implementation. Recipe text is serialized as inert JSON, never executable source.
export const sceneDrawingRuntime = `
function easeScene(t,e){t=Math.max(0,Math.min(1,t));return e==='hold'?(t<1?0:1):e==='easeOut'?1-(1-t)**3:e==='easeIn'?t**3:e==='easeInOut'?(t<.5?4*t**3:1-(-2*t+2)**3/2):t;}
function poseScene(l,t){let p={...l.pose},at=0,e='linear';for(const k of l.keys){const n={...p,...k.pose};if(t<k.at){const f=easeScene((t-at)/(k.at-at),e);return Object.fromEntries(Object.keys(p).map(x=>[x,p[x]+(n[x]-p[x])*f]));}p=n;at=k.at;e=k.easing;}return p;}
function drawSceneLayer(ctx,l,t,W,H){const p=poseScene(l,t),w=p.width*W,h=p.height*H;
 ctx.save();ctx.globalAlpha=p.opacity;ctx.translate(p.x*W,p.y*H);ctx.rotate(p.rotation*Math.PI/180);ctx.transform(1,0,p.skewX,1,0,0);
 ctx.filter=p.blur?'blur('+p.blur+'px)':'none';ctx.shadowColor='#000000';ctx.shadowBlur=l.shadow;
 ctx.beginPath();ctx.rect(-w/2,-h/2,w*p.reveal,h);ctx.clip();ctx.fillStyle=l.fill;ctx.strokeStyle=l.stroke;ctx.lineWidth=l.strokeWidth;
 if(l.kind==='text'){const f=l.font;let size=Math.min(W,H)*f.size;ctx.font=(f.italic?'italic ':'')+f.weight+' '+size+'px "'+f.family+'"';
  const ratio=Math.min(1,w/Math.max(1,ctx.measureText(l.text).width),h/(size*1.25));size*=ratio;
  ctx.font=(f.italic?'italic ':'')+f.weight+' '+size+'px "'+f.family+'"';ctx.fillStyle=f.color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(l.text,0,0);
 }else{if(l.kind==='gradient'){const g=ctx.createLinearGradient(0,-h/2,0,h/2);g.addColorStop(0,l.fill+'00');g.addColorStop(1,l.fill);ctx.fillStyle=g;}ctx.beginPath();if(l.kind==='ellipse')ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
  else if(l.kind==='hexagon'){for(let i=0;i<6;i++){const a=i*Math.PI/3;const x=Math.cos(a)*w/2,y=Math.sin(a)*h/2;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();}
  else ctx.rect(-w/2,-h/2,w,h);ctx.fill();if(l.strokeWidth)ctx.stroke();}ctx.restore();}
function drawSceneCaptions(ctx,t,data){const {recipe,input}=data,W=input.width,H=input.height,s=recipe.caption;
 for(const c of input.captions){if(t<c.start||t>=c.end)continue;const b=c.box||s.box;const groups=[];
  for(const cw of c.words){const word=input.transcript.words.find(w=>w.id===cw.wordId);const row=groups[cw.row]||(groups[cw.row]=[]);row.push({...cw,word});}
  let base=Math.min(W,H)*s.font.size;
  const measure=()=>groups.map(row=>{const words=row.map(cw=>{const size=base*cw.scale;const font=(cw.italic??s.font.italic?'italic ':'')+(cw.weight||s.font.weight)+' '+size+'px "'+s.font.family+'"';ctx.font=font;
    const label=s.uppercase?cw.word.text.toUpperCase():cw.word.text;return {...cw,font,size,label,width:ctx.measureText(label).width};});
    return {words,width:words.reduce((n,w)=>n+w.width,0)+Math.max(0,words.length-1)*base*.23,height:Math.max(...words.map(w=>w.size))*s.lineGap};});
  let rows=measure();const factor=Math.min(1,b.width*W/Math.max(...rows.map(r=>r.width)),b.height*H/rows.reduce((n,r)=>n+r.height,0));
  base*=factor;if(base<Math.min(W,H)*s.minFontSize)throw Error('Caption cannot fit at minimum readable size: '+c.id);rows=measure();const total=rows.reduce((n,r)=>n+r.height,0);let y=(b.y+b.height/2)*H-total/2;
  for(const row of rows){let x=(b.x+b.width/2)*W-row.width/2;for(const w of row.words){const since=t-(w.word.start-input.audio.start);
    if(since>=0){const f=s.entrySeconds?easeScene(since/s.entrySeconds,'easeOut'):1;
      ctx.save();ctx.font=w.font;ctx.textBaseline='middle';ctx.textAlign='left';ctx.fillStyle=w.color||s.font.color;ctx.globalAlpha=f;
      ctx.filter=s.blur*(1-f)>.01?'blur('+(s.blur*(1-f))+'px)':'none';ctx.shadowColor='#000000';ctx.shadowBlur=s.shadow;
      ctx.fillText(w.label,x,y+row.height/2+s.lift*H*(1-f));ctx.restore();}x+=w.width+base*.23;}y+=row.height;}
 }}
`;

/** Opt-in title glyph aspect; ordinary sealed compositions retain their original bytes. */
export function condensedTitles(runtime:string){
  return runtime.replace('w/Math.max(1,ctx.measureText(l.text).width),h/(size*1.25));setFont();',
    'w/Math.max(1,ctx.measureText(l.text).width*(f.horizontalScale||1)),h/(size*1.25));setFont();ctx.scale(f.horizontalScale||1,1);');
}
/** Opt-in panels; preserve generated legacy composition bytes when unused. */
export function roundedPanels(runtime:string){
  return runtime.replaceAll('else ctx.rect(-w/2,-h/2,w,h);',
    'else if(l.cornerRadius)ctx.roundRect(-w/2,-h/2,w,h,Math.min(w,h)*l.cornerRadius);else ctx.rect(-w/2,-h/2,w,h);');
}
export function sceneComposition(adaptation: SceneAdaptation, prepared: { audio: string; media: Record<string, string> }) {
  if(adaptation.recipe.templates.some(t=>t.finish||t.surface||t.channel))return 'throw new Error("This recipe uses Remotion-only finishing, paper surfaces or native channel scenes. Render with --renderer remotion; effects must not be silently dropped.");\n';
  if (adaptation.recipe.compositor === 'layered-v2') {
    let runtime = sceneDrawingRuntime
      .replace('ctx.font=font;', "ctx.font=font;ctx.letterSpacing=(size*(s.font.tracking||0))+'px';")
      .replace("ctx.save();ctx.font=w.font;", "ctx.save();ctx.font=w.font;ctx.letterSpacing=(w.size*(s.font.tracking||0))+'px';if(w.size<Math.min(W,H)*s.minFontSize)throw Error('Caption word below minimum readable size: '+c.id);")
      .replace('ctx.fillText(w.label,x,y+row.height/2+s.lift*H*(1-f));', "if(s.strokeWidth){ctx.lineWidth=s.strokeWidth;ctx.strokeStyle=s.stroke||'#000000';ctx.lineJoin='round';ctx.strokeText(w.label,x,y+row.height/2+s.lift*H*(1-f));}ctx.fillText(w.label,x,y+row.height/2+s.lift*H*(1-f));");
    if (adaptation.recipe.templates.some(t => [...t.layers, ...(t.groups ?? [])].some(l => l.keys.some(k => typeof k.easing !== 'string' || k.easing === 'bounce' || k.path || k.propertyTiming))))
      runtime = runtime.replace(/function easeScene[^\n]+\nfunction poseScene[^\n]+/, precisionMotionRuntime);
    if(adaptation.recipe.caption.visible===false)runtime=runtime.replace('const {recipe,input}=data,W=input.width,H=input.height,s=recipe.caption;','const {recipe,input}=data,W=input.width,H=input.height,s=recipe.caption;if(s.visible===false)return;');
    let code=layeredComposition(adaptation, prepared, runtime);
    if(adaptation.recipe.templates.some(t=>t.layers.some(l=>l.cornerRadius)))code=roundedPanels(code);
    return adaptation.recipe.templates.some(t=>t.layers.some(l=>l.font?.horizontalScale!==undefined))?condensedTitles(code):code;
  }
  const { width, height } = adaptation.input;
  const media = adaptation.input.shots.flatMap(shot => {
    const template = adaptation.recipe.templates.find(t => t.id === shot.templateId)!;
    return template.layers.filter(l => l.kind === 'video' || l.kind === 'image').map(layer => {
      const path = prepared.media[`${shot.id}/${layer.slot}`];
      if (!path) throw Error('Missing prepared layer');
      const duration = shot.end - shot.start;
      const tracks: Record<string, { time: number; value: number }[]> = { x: [], y: [], width: [], height: [], rotation: [], opacity: [] };
      for (let frame = 0; frame <= Math.round(duration * 30); frame++) {
        const time = frame / 30, p = scenePoseAt(layer, time / duration);
        const values = { x: (p.x - p.width / 2) * width, y: (p.y - p.height / 2) * height, width: p.width * width,
          height: p.height * height, rotation: p.rotation, opacity: p.opacity };
        // Media blur/skew/reveal require another supported compositor, not a silent approximation.
        if (p.blur || p.skewX || p.reveal !== 1) throw Error('Media blur/skew/masks are not supported by scene V1; use drawn layers or an explicitly prepared asset');
        for (const k of Object.keys(values)) tracks[k].push({ time, value: values[k as keyof typeof values] });
      }
      return { id: `${shot.id}-${layer.id}`, kind: layer.kind, path: path.replaceAll('\\', '/'), start: shot.start, end: shot.end, tracks };
    });
  });
  const data = JSON.stringify({ ...adaptation, prepared: { audio: prepared.audio.replaceAll('\\', '/') }, media });
  return `import {createEffect} from 'solid-js';
import {useTicker} from '@diffusionstudio/jsx';
const data=${data};
${sceneDrawingRuntime}
export default function SceneMotion(){const {time}=useTicker();const W=data.input.width,H=data.input.height;
 return <rect scene="scene-motion" name="Reference scene motion DRAFT" width={W} height={H} end={data.duration} fill="#101010">
  <audio name="Continuous original narration" src={data.prepared.audio} start={0} end={data.duration}/>
  {data.input.shots.map(shot=><rect name={shot.id+' background'} start={shot.start} end={shot.end} width={W} height={H}
    fill={data.recipe.templates.find(t=>t.id===shot.templateId).background}/>)}
  {data.media.map(m=>m.kind==='video'?<video name={m.id} src={m.path} start={m.start} end={m.end} sourceIn={0} sourceOut={m.end-m.start} muted={true} objectFit="fill" {...m.tracks}/>
    :<image name={m.id} src={m.path} start={m.start} end={m.end} objectFit="fill" {...m.tracks}/>)}
  <surface name="Recipe layers and aligned words" width={W} height={H} start={0} end={data.duration} ref={canvas=>{const ctx=canvas.getContext('2d');createEffect(()=>{
    const t=time();ctx.clearRect(0,0,W,H);for(const shot of data.input.shots){if(t<shot.start||t>=shot.end)continue;
      const template=data.recipe.templates.find(s=>s.id===shot.templateId);for(const l of template.layers)if(l.kind!=='video'&&l.kind!=='image')drawSceneLayer(ctx,l,(t-shot.start)/(shot.end-shot.start),W,H);}
    drawSceneCaptions(ctx,t,data);
  });}}/>
 </rect>;}
`;
}
