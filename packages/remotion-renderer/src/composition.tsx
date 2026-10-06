import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {AbsoluteFill,Composition,Img,OffthreadVideo,Sequence,staticFile,useCurrentFrame,useDelayRender,useVideoConfig} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {worldScene,exposureTimes,drawBlockV2,drawSceneCaptions} from '@scene-drawing';
import type {RemotionPayload} from './payload.ts';
import type {SceneLayer} from '../../editing-playbook/src/scene-motion.ts';
import {paperPixels} from './paper.ts';
import {ChannelSceneView} from './channel';

type Shot=RemotionPayload['shots'][number];

function CanvasBlock({data,shot,layers,captions=false}:{data:RemotionPayload;shot?:Shot;layers?:SceneLayer[];captions?:boolean}) {
  const frame=useCurrentFrame(),canvas=useRef<HTMLCanvasElement>(null),{delayRender,continueRender,cancelRender}=useDelayRender();
  const [handle]=useState(()=>delayRender('Wait for local fonts and canvas paint'));
  const surfaces=useMemo(()=>[new OffscreenCanvas(data.width,data.height),new OffscreenCanvas(data.width,data.height)], [data.width,data.height]);
  useLayoutEffect(()=>{
    let active=true;
    const draw=()=>{
      if(!active)return;
      try{
        const ctx=canvas.current!.getContext('2d')!;
        if(captions){ctx.clearRect(0,0,data.width,data.height);drawSceneCaptions(ctx,frame/30,data);}
        else drawBlockV2(ctx,surfaces[0],surfaces[1],layers!,frame/30/(shot!.end-shot!.start),shot,data.width,data.height);
        continueRender(handle);
      }catch(e){cancelRender(e as Error);}
    };
    if(document.fonts.status==='loaded')draw();else document.fonts.ready.then(draw,e=>cancelRender(e));
    return ()=>{active=false;};
  },[frame,data,shot,layers,captions,surfaces,handle,continueRender,cancelRender]);
  return <canvas ref={canvas} width={data.width} height={data.height} style={{position:'absolute',inset:0}}/>;
}

function MediaLayer({data,shot,layer}:{data:RemotionPayload;shot:Shot;layer:SceneLayer}) {
  const frame=useCurrentFrame(),t=frame/30/(shot.end-shot.start),W=data.width,H=data.height;
  const samples=exposureTimes(t,shot.end-shot.start,layer.motionBlur);
  return <AbsoluteFill style={{isolation:'isolate',pointerEvents:'none'}}>{samples.map((sample,index)=>{
    const p=worldScene(layer,sample,shot.template.groups??[],W,H),w=p.width*W,h=p.height*H;
    const style:CSSProperties={position:'absolute',left:p.x*W-w/2,top:p.y*H-h/2,width:w,height:h,opacity:p.opacity/samples.length,
      transformOrigin:'50% 50%',transform:`rotate(${p.rotation}deg) skewX(${Math.atan(p.skewX)*180/Math.PI}deg)`,
      filter:`blur(${p.blur}px) drop-shadow(0px ${layer.shadow*.3}px ${layer.shadow}px #000000AA)`,mixBlendMode:samples.length>1?'plus-lighter':'normal'};
    const mask=layer.mask,clipPath=mask?(mask.kind==='ellipse'?'ellipse(50% 50% at 50% 50%)':`polygon(${mask.points.map(v=>`${v[0]*100}% ${v[1]*100}%`).join(',')})`):undefined;
    const inner:CSSProperties={width:'100%',height:'100%',objectFit:'fill',display:'block',clipPath,
      maskImage:p.reveal<1?`linear-gradient(to right,black ${p.reveal*100}%,transparent ${p.reveal*100}%)`:undefined};
    const src=staticFile(shot.paths[layer.id]);
    return <div key={index} style={style}>{layer.kind==='video'?<OffthreadVideo src={src} muted style={inner}/>:<Img src={src} style={inner}/>}</div>;
  })}</AbsoluteFill>;
}

function ShotView({data,shot}:{data:RemotionPayload;shot:Shot}) {
  const blocks=useMemo(()=>{
    const out:{layers:SceneLayer[];media:boolean}[]=[];
    for(const layer of shot.template.layers){
      const media=layer.kind==='image'||layer.kind==='video',last=out.at(-1);
      if(!media&&last&&!last.media)last.layers.push(layer);else out.push({layers:[layer],media});
    }return out;
  },[shot]);
  if(shot.template.channel)return <ChannelSceneView scene={shot.template.channel} paths={shot.paths}/>;
  return <AbsoluteFill style={{backgroundColor:shot.template.background,overflow:'hidden'}}>{shot.template.surface&&<PaperSurface data={data} shot={shot}/>} {blocks.map((b,i)=>b.media
    ?<MediaLayer key={i} data={data} shot={shot} layer={b.layers[0]}/>
    :<CanvasBlock key={i} data={data} shot={shot} layers={b.layers}/>)}{shot.template.finish&&<Finish data={data} shot={shot}/>}</AbsoluteFill>;
}

/** Background-only material: never grunge over camera, captures or captions. */
function PaperSurface({data,shot}:{data:RemotionPayload;shot:Shot}){
  const canvas=useRef<HTMLCanvasElement>(null),surface=shot.template.surface!;
  const W=Math.ceil(data.width/2),H=Math.ceil(data.height/2);
  const pixels=useMemo(()=>paperPixels(W,H,{color:shot.template.background,seed:surface.seed,strength:surface.strength}),[W,H,surface,shot.template.background]);
  useLayoutEffect(()=>{const ctx=canvas.current!.getContext('2d')!;const picture=ctx.createImageData(W,H);picture.data.set(pixels);ctx.putImageData(picture,0,0);},[pixels,W,H]);
  return <AbsoluteFill style={{pointerEvents:'none'}}><canvas ref={canvas} width={W} height={H}
    style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>
    <AbsoluteFill style={{background:'radial-gradient(ellipse at 38% 24%,transparent 35%,rgba(0,0,0,.28) 100%)'}}/></AbsoluteFill>;
}

/** Small seeded film grain: stable at arbitrary seeks, independent of render concurrency. */
function Finish({data,shot}:{data:RemotionPayload;shot:Shot}){
  const frame=useCurrentFrame(),canvas=useRef<HTMLCanvasElement>(null),finish=shot.template.finish!;
  useLayoutEffect(()=>{
    const c=canvas.current!,ctx=c.getContext('2d')!,pixels=ctx.createImageData(c.width,c.height);
    let seed=(finish.seed^Math.imul(frame+1,2654435761))>>>0;
    for(let i=0;i<pixels.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=seed>>>24;
      pixels.data[i]=v;pixels.data[i+1]=v;pixels.data[i+2]=v;pixels.data[i+3]=Math.round(finish.grain*255);}
    ctx.putImageData(pixels,0,0);
  },[frame,finish]);
  return <AbsoluteFill style={{pointerEvents:'none'}}><canvas ref={canvas} width={Math.ceil(data.width/2)} height={Math.ceil(data.height/2)}
    style={{position:'absolute',inset:0,width:'100%',height:'100%',mixBlendMode:'soft-light'}}/>
    <AbsoluteFill style={{background:`radial-gradient(ellipse at 50% 42%,transparent 22%,rgba(0,0,0,${finish.vignette}) 100%)`}}/></AbsoluteFill>;
}

export function Scene({data}:{data?:RemotionPayload}) {
  const {fps}=useVideoConfig();
  if(!data)throw Error('A prepared scene payload is required');
  return <AbsoluteFill style={{backgroundColor:'#101010',overflow:'hidden'}}>{data.shots.map(shot=>
    <Sequence key={shot.id} name={shot.id} from={Math.round(shot.start*fps)} durationInFrames={Math.round(shot.end*fps)-Math.round(shot.start*fps)} premountFor={fps}>
      <ShotView data={data} shot={shot}/>
    </Sequence>)}{data.recipe.caption.visible!==false&&<CanvasBlock data={data} captions/>}</AbsoluteFill>;
}

// Props are supplied by the sealed local job; no arbitrary composition code is loaded from recipes.
const defaultProps:{data?:RemotionPayload}={};
const metadata:CalculateMetadataFunction<{data?:RemotionPayload}>=({props})=>{
  if(!props.data)throw Error('A prepared scene payload is required');
  return {durationInFrames:Math.round(props.data.duration*30),width:props.data.width,height:props.data.height};
};
export const Root=()=> <Composition id="EditorScene" component={Scene} defaultProps={defaultProps} durationInFrames={1} fps={30} width={1080} height={1920}
  calculateMetadata={metadata}/>;
