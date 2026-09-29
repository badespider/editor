import { resolveSceneTemplate, type SceneAdaptation } from './scene-motion.ts';

/** Deterministic, source-clock-driven implementation shared by preview and export. */
export const layeredRuntime = `
function worldScene(l,t,groups,W,H){const p=poseScene(l,t);if(!l.group)return p;const g=poseScene(groups.find(g=>g.id===l.group),t),r=g.rotation*Math.PI/180;
 const dx=(p.x-.5)*W*g.width,dy=(p.y-.5)*H*g.width;
 return {...p,x:(g.x*W+dx*Math.cos(r)-dy*Math.sin(r))/W,y:(g.y*H+dx*Math.sin(r)+dy*Math.cos(r))/H,
 width:p.width*g.width,height:p.height*g.width,rotation:p.rotation+g.rotation,opacity:p.opacity*g.opacity};}
function exposureTimes(t,duration,blur){if(!blur)return [t];return Array.from({length:blur.samples},(_,i)=>Math.max(0,Math.min(1,t-((i+.5)/blur.samples)*blur.shutter/(30*duration))));}
function maskPath(ctx,mask,w,h){ctx.beginPath();if(mask.kind==='ellipse')ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);
 else{mask.points.forEach(([x,y],i)=>i?ctx.lineTo((x-.5)*w,(y-.5)*h):ctx.moveTo((x-.5)*w,(y-.5)*h));ctx.closePath();}}
function drawLayerV2(ctx,l,p,W,H){const w=p.width*W,h=p.height*H;if(p.opacity<=0||p.reveal<=0)return;
 ctx.save();ctx.globalAlpha=p.opacity;ctx.translate(p.x*W,p.y*H);ctx.rotate(p.rotation*Math.PI/180);ctx.transform(1,0,p.skewX,1,0,0);
 if(l.mask){maskPath(ctx,l.mask,w,h);ctx.clip();}if(p.reveal<1){ctx.beginPath();ctx.rect(-w/2,-h/2,w*p.reveal,h);ctx.clip();}
 ctx.filter=p.blur?'blur('+p.blur+'px)':'none';ctx.shadowColor='#000000AA';ctx.shadowBlur=l.shadow;ctx.shadowOffsetY=l.shadow*.3;
 ctx.fillStyle=l.fill;ctx.strokeStyle=l.stroke;ctx.lineWidth=l.strokeWidth;ctx.lineJoin='round';
 if(l.kind==='text'){const f=l.font;let size=Math.min(W,H)*f.size;const setFont=()=>{ctx.font=(f.italic?'italic ':'')+f.weight+' '+size+'px "'+f.family+'"';ctx.letterSpacing=(size*(f.tracking||0))+'px';};setFont();
  size*=Math.min(1,w/Math.max(1,ctx.measureText(l.text).width),h/(size*1.25));setFont();ctx.fillStyle=f.color;ctx.textAlign='center';ctx.textBaseline='middle';
  if(l.strokeWidth)ctx.strokeText(l.text,0,0);ctx.fillText(l.text,0,0);
 }else{if(l.kind==='gradient'){const g=ctx.createLinearGradient(0,-h/2,0,h/2);g.addColorStop(0,l.fill+'00');g.addColorStop(1,l.fill);ctx.fillStyle=g;}
  ctx.beginPath();if(l.kind==='ellipse')ctx.ellipse(0,0,w/2,h/2,0,0,Math.PI*2);else if(l.kind==='hexagon'){for(let i=0;i<6;i++){const a=i*Math.PI/3;i?ctx.lineTo(Math.cos(a)*w/2,Math.sin(a)*h/2):ctx.moveTo(Math.cos(a)*w/2,Math.sin(a)*h/2);}ctx.closePath();}
  else ctx.rect(-w/2,-h/2,w,h);ctx.fill();if(l.strokeWidth)ctx.stroke();}ctx.restore();}
function drawBlockV2(ctx,sample,accum,layers,t,shot,W,H){const d=shot.end-shot.start;ctx.clearRect(0,0,W,H);
 for(const l of layers){const times=exposureTimes(t,d,l.motionBlur);
  if(times.length===1){drawLayerV2(ctx,l,worldScene(l,t,shot.template.groups||[],W,H),W,H);continue;}
  const a=accum.getContext('2d'),s=sample.getContext('2d');a.clearRect(0,0,W,H);a.save();a.globalCompositeOperation='lighter';a.globalAlpha=1/times.length;
  for(const st of times){s.clearRect(0,0,W,H);drawLayerV2(s,l,worldScene(l,st,shot.template.groups||[],W,H),W,H);a.drawImage(sample,0,0);}a.restore();ctx.drawImage(accum,0,0);
 }}
function imagePoseStyle(l,t,shot,W,H,alpha){const p=worldScene(l,t,shot.template.groups||[],W,H),w=p.width*W,h=p.height*H;
 return {position:'absolute',left:(p.x*W-w/2)+'px',top:(p.y*H-h/2)+'px',width:w+'px',height:h+'px',opacity:p.opacity*alpha,
 'transform-origin':'50% 50%',transform:'rotate('+p.rotation+'deg) skewX('+Math.atan(p.skewX)*180/Math.PI+'deg)',
 filter:'blur('+p.blur+'px) drop-shadow(0px '+l.shadow*.3+'px '+l.shadow+'px #000000AA)',
 'mix-blend-mode':alpha<1?'plus-lighter':'normal'};}
function imageMaskStyle(l,t,shot,W,H){const p=worldScene(l,t,shot.template.groups||[],W,H);const m=l.mask;
 const clip=m?(m.kind==='ellipse'?'ellipse(50% 50% at 50% 50%)':'polygon('+m.points.map(v=>(v[0]*100)+'% '+(v[1]*100)+'%').join(',')+')'):'none';
 return {width:'100%',height:'100%','object-fit':'fill','clip-path':clip,'mask-image':p.reveal<1?'linear-gradient(to right,black '+p.reveal*100+'%,transparent '+p.reveal*100+'%)':'none'};}
`;

export function layeredComposition(adaptation: SceneAdaptation, prepared: { audio: string; media: Record<string, string> }, drawingRuntime: string) {
  const { width: W, height: H } = adaptation.input;
  const shots = adaptation.input.shots.map(shot => {
    const template = resolveSceneTemplate(adaptation.recipe.templates.find(t => t.id === shot.templateId)!, shot, adaptation.input);
    const blocks: { kind: string; layers: typeof template.layers; path?: string }[] = [];
    for (const layer of template.layers) {
      if (layer.kind === 'image' || layer.kind === 'video') {
        const path = prepared.media[`${shot.id}/${layer.slot}`]; if (!path) throw Error('Missing prepared layer');
        blocks.push({ kind: layer.kind, layers: [layer], path: path.replaceAll('\\', '/') });
      } else {
        const last = blocks.at(-1);
        if (last?.kind === 'draw') last.layers.push(layer); else blocks.push({ kind: 'draw', layers: [layer] });
      }
    }
    return { ...shot, template, blocks };
  });
  const data = JSON.stringify({ ...adaptation, prepared: { audio: prepared.audio.replaceAll('\\', '/') }, shots });
  // Still images are host-resolved <img> assets: the editor waits for decoding on
  // mount/export. No unmanaged asynchronous Image() loading or network fetches.
  return `import {createEffect} from 'solid-js';
import {useTicker} from '@diffusionstudio/jsx';
const data=${data};
${drawingRuntime}
${layeredRuntime}
export default function SceneLayered(){const {time}=useTicker();const W=${W},H=${H};
 const videoTracks=(l,shot)=>{const out={x:[],y:[],width:[],height:[],rotation:[],opacity:[]},d=shot.end-shot.start;
  for(let f=0;f<=Math.round(d*30);f++){const p=worldScene(l,f/30/d,shot.template.groups||[],W,H),v={x:(p.x-p.width/2)*W,y:(p.y-p.height/2)*H,width:p.width*W,height:p.height*H,rotation:p.rotation,opacity:p.opacity};
   for(const key of Object.keys(v))out[key].push({time:f/30,value:v[key]});}return out;};
 return <rect scene="scene-motion" name="Layered reference scene DRAFT" width={W} height={H} end={data.duration} fill="#101010">
 <audio name="Continuous original narration" src={data.prepared.audio} start={0} end={data.duration}/>
 {data.shots.map(shot=><>
  <rect name={shot.id+' background'} start={shot.start} end={shot.end} width={W} height={H} fill={shot.template.background}/>
  {shot.blocks.map((block,index)=>{const l=block.layers[0],local=()=>Math.max(0,Math.min(1,(time()-shot.start)/(shot.end-shot.start)));
   if(block.kind==='video')return <video name={shot.id+' '+l.id} src={block.path} start={shot.start} end={shot.end} sourceIn={0} sourceOut={shot.end-shot.start} muted={true} objectFit="fill" {...videoTracks(l,shot)}/>;
   if(block.kind==='image')return <html name={shot.id+' '+l.id} width={W} height={H} start={shot.start} end={shot.end}>
    <div style={{position:'relative',width:W+'px',height:H+'px',isolation:'isolate',overflow:'visible'}}>
     {Array.from({length:l.motionBlur?.samples||1},(_,i)=>{const st=()=>exposureTimes(local(),shot.end-shot.start,l.motionBlur)[i];return <div style={imagePoseStyle(l,st(),shot,W,H,1/(l.motionBlur?.samples||1))}>
      <img src={block.path} style={imageMaskStyle(l,st(),shot,W,H)}/></div>;})}
    </div></html>;
   return <surface name={shot.id+' layers '+index} width={W} height={H} start={shot.start} end={shot.end} ref={canvas=>{
    const ctx=canvas.getContext('2d'),blur=block.layers.some(l=>l.motionBlur),sample=blur?new OffscreenCanvas(W,H):null,accum=blur?new OffscreenCanvas(W,H):null;
    createEffect(()=>{const t=time();if(t<shot.start||t>=shot.end){ctx.clearRect(0,0,W,H);return;}drawBlockV2(ctx,sample,accum,block.layers,local(),shot,W,H);});}}/>;
  })}
 </>)}
 <surface name="Source-aligned typography" width={W} height={H} start={0} end={data.duration} ref={canvas=>{const ctx=canvas.getContext('2d');createEffect(()=>{const t=time();ctx.clearRect(0,0,W,H);drawSceneCaptions(ctx,t,data);});}}/>
 </rect>;}
`;
}
