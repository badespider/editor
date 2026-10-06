import {useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {AbsoluteFill,Easing,interpolate,OffthreadVideo,staticFile,useCurrentFrame,useVideoConfig,useDelayRender} from 'remotion';
import {channelMediaBoxes,type ChannelScene,type ChannelBox} from '../../../editing-playbook/src/channel-contract.ts';

export type SceneProps={scene:ChannelScene;paths?:Record<string,string>;style?:CSSProperties};
export const C={navy:'#081827',paper:'#102537',panel:'#142D40',line:'#355164',white:'#F5F8FA',muted:'#AFC3D0',cyan:'#57DCEC'};
export const font='Arial';
export const ease={extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.22,1,.36,1)} as const;
export function progress(frame:number,fps:number,at=0,seconds=.45){return interpolate(frame,[at*fps,(at+seconds)*fps],[0,1],ease);}
export function pixelBox(b:ChannelBox):CSSProperties{return {position:'absolute',left:b.x,top:b.y,width:b.width,height:b.height};}
export function Enter({children,at=0,style={}}:{children:ReactNode;at?:number;style?:CSSProperties}){
  const frame=useCurrentFrame(),{fps}=useVideoConfig();
  return <div style={{...style,opacity:interpolate(frame,[at*fps,(at+.36)*fps],[0,1],ease),
    translate:`0 ${interpolate(frame,[at*fps,(at+.5)*fps],[22,0],ease)}px`}}>{children}</div>;
}
export function Icon({kind,size=54,color=C.cyan}:{kind:number;size?:number;color?:string}){
  return <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    {kind%3===0?<><rect x="12" y="10" width="40" height="44" rx="5"/><path d="m21 26 5 5 11-12M22 41h19"/></>
      :kind%3===1?<><rect x="6" y="23" width="15" height="18" rx="3"/><rect x="43" y="23" width="15" height="18" rx="3"/><path d="M21 32h22m-7-6 7 6-7 6M32 7v7m0 36v7"/></>
      :<><path d="m23 17-16 15 16 15m18-30 16 15-16 15M36 10 28 54"/></>}
  </svg>;
}
export function Paper(){return <AbsoluteFill style={{background:C.navy}}>
  <AbsoluteFill style={{background:'linear-gradient(118deg,#142F42 0%,#0B2030 37%,#081827 68%)'}}/>
  <svg viewBox="0 0 1920 1080" preserveAspectRatio="none" width="100%" height="100%" style={{position:'absolute',inset:0}}>
    <defs>
      <filter id="editorial-paper-grain"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="37" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
      <linearGradient id="fold-a"><stop stopColor="#D6EEF5" stopOpacity=".045"/><stop offset=".48" stopColor="#000" stopOpacity=".055"/><stop offset=".5" stopColor="#D6EEF5" stopOpacity=".075"/><stop offset="1" stopColor="#000" stopOpacity="0"/></linearGradient>
      <linearGradient id="fold-b" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#000" stopOpacity=".14"/><stop offset=".54" stopColor="#D6EEF5" stopOpacity=".028"/><stop offset="1" stopColor="#000" stopOpacity="0"/></linearGradient>
    </defs>
    <path d="M1110-100 1500-100 920 1200 670 1200Z" fill="url(#fold-a)"/>
    <path d="M-100 420 2000 890 2000 1100-100 1100Z" fill="url(#fold-b)"/>
    <path d="M-40 640 1960 180" stroke="#C5E6F2" strokeOpacity=".035"/>
    <rect width="1920" height="1080" filter="url(#editorial-paper-grain)" opacity=".048" style={{mixBlendMode:'soft-light'}}/>
  </svg>
</AbsoluteFill>;}
export function Eyebrow({children,style={}}:{children:ReactNode;style?:CSSProperties}){return <div style={{fontSize:23,fontWeight:700,letterSpacing:3,color:C.cyan,lineHeight:1.2,...style}}>{children}</div>;}
export function Title({children,portrait=false,style={}}:{children:string;portrait?:boolean;style?:CSSProperties}){
  const ref=useRef<HTMLHeadingElement>(null),{delayRender,continueRender,cancelRender}=useDelayRender();
  const [handle]=useState(()=>delayRender('Fit native channel title'));
  const size=Number(style.fontSize??(portrait?76:82)),limit=Number(style.maxHeight??(portrait?130:160));
  useLayoutEffect(()=>{
    let active=true;
    document.fonts.ready.then(()=>{
      if(!active)return;
      try{
        const el=ref.current!;let px=size;el.style.fontSize=px+'px';
        while(px>48&&(el.scrollHeight>limit+1||el.scrollWidth>el.clientWidth+1)){px-=2;el.style.fontSize=px+'px';}
        if(el.scrollHeight>limit+1||el.scrollWidth>el.clientWidth+1)throw Error('Channel headline cannot fit readably: shorten the copy');
        continueRender(handle);
      }catch(e){cancelRender(e as Error);}
    },e=>cancelRender(e));return()=>{active=false;};
  },[children,size,limit,handle,continueRender,cancelRender]);
  return <h1 ref={ref} data-text-box style={{margin:0,fontWeight:700,fontSize:size,lineHeight:1.06,letterSpacing:-3,
    color:C.white,overflowWrap:'anywhere',maxHeight:limit,...style}}>{children}</h1>;
}
export function Heading({children,portrait}:{children:string;portrait:boolean}){return <Enter at={.05} style={{position:'absolute',left:portrait?86:96,top:portrait?208:165,width:portrait?864:1530}}>
  <Title portrait={portrait}>{children}</Title>
</Enter>;}
export function Rule({at=0,width=110,style={}}:{at?:number;width?:number;style?:CSSProperties}){
  const f=useCurrentFrame(),{fps}=useVideoConfig();return <div style={{height:3,width,background:C.cyan,transformOrigin:'left',
    scale:`${progress(f,fps,at,.45)} 1`,...style}}/>;
}
export function Camera({scene,paths,small=false}:{scene:ChannelScene;paths?:Record<string,string>;small?:boolean}){
  const box=channelMediaBoxes(scene.layout,scene.section.kind).camera!;
  return <div data-slot="camera" style={{...pixelBox(box),background:'#102636',border:`1px solid ${C.line}`,borderRadius:16,
    boxShadow:'0 22px 65px #00000035',overflow:'hidden'}}>
    {scene.mode==='footage'?<OffthreadVideo src={staticFile(paths!.camera)} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<>
      <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 65% 20%,#264758 0%,#102838 48%,#0B1D2C 95%)'}}/>
      <svg viewBox="0 0 600 580" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{position:'absolute',opacity:.8}}>
        <path d="M-10 588C10 411 136 390 228 373L245 329C183 277 176 154 216 112 250 78 310 70 347 100 400 143 399 263 349 320L366 373C475 388 567 454 610 588Z" fill="#254353" stroke="#527181" strokeWidth="1.5"/>
        <path d="M229 375Q293 444 368 375M207 194Q270 210 359 175" fill="none" stroke="#6D8896" strokeOpacity=".4" strokeWidth="1.5"/>
        <path d="M40 145V105h40M520 105h40v40M40 435v40h40M520 475h40v-40" fill="none" stroke="#93AFBA" strokeOpacity=".4" strokeWidth="1.5"/>
        <path d="M292 260h16m-8-8v16" stroke="#57DCEC" strokeOpacity=".55"/>
      </svg>
      <div style={{position:'absolute',left:small?18:30,top:small?16:28,display:'flex',gap:10,alignItems:'center',fontSize:small?17:21,fontWeight:700,letterSpacing:2,color:C.muted}}>
        <div style={{width:7,height:7,background:C.cyan,borderRadius:9}}/>{small?'CAMERA SLOT':'YOUR CAMERA GOES HERE'}
      </div>
      {!small&&<div style={{position:'absolute',bottom:26,left:30,fontSize:21,color:C.muted}}>Presenter placeholder · no footage yet</div>}
    </>}
  </div>;
}
export function Phrase({scene}:{scene:ChannelScene}){
  const p=scene.layout==='portrait',text=scene.section.keyPhrase;
  if(!text)return null;
  return <Enter at={.4} style={{position:'absolute',left:p?86:96,top:p?1380:948,width:p?864:1728,display:'flex',alignItems:'center',gap:20}}>
    <div style={{width:34,height:2,background:C.cyan,flexShrink:0}}/><div data-text-box style={{fontSize:p?30:31,lineHeight:1.2,color:C.muted}}>{text}</div>
  </Enter>;
}
export function SceneFrame({scene,children,style}:{scene:ChannelScene;children:ReactNode;style?:CSSProperties}){
  const portrait=scene.layout==='portrait',f=useCurrentFrame(),{fps}=useVideoConfig();
  const labels={'hook':'START HERE','roadmap':'THE ROADMAP','explanation':'THE IDEA','demonstration':'IN PRACTICE','comparison':'YOUR OPTIONS','next-step':'TAKE ACTION'};
  return <AbsoluteFill style={{fontFamily:font,color:C.white,overflow:'hidden',...style}}>
    <Paper/>
    <div style={{position:'absolute',left:portrait?86:96,top:portrait?113:61,right:portrait?130:96,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{display:'flex',alignItems:'center',gap:18,fontSize:portrait?24:23,letterSpacing:2,fontWeight:700}}>
        <svg width="31" height="26" viewBox="0 0 31 26" fill={C.cyan}><rect y="17" width="6" height="9"/><rect x="11" y="9" width="6" height="17"/><rect x="22" width="6" height="26"/></svg>{scene.brand.toUpperCase()}
      </div>
      <span style={{color:C.muted,fontSize:portrait?22:21,letterSpacing:2}}>{String(scene.index+1).padStart(2,'0')} / {String(scene.count).padStart(2,'0')}</span>
    </div>
    {children}
    <Phrase scene={scene}/>
    {portrait&&scene.mode==='layout-demo'&&scene.section.demoCaption&&<div style={{position:'absolute',left:86,top:1530,width:864,
      padding:'28px 14px',boxSizing:'border-box',borderRadius:12,background:'#06131FEF',textAlign:'center',boxShadow:'0 10px 24px #00000020'}}>
      {scene.section.demoCaption.map((line,i)=><div data-text-box key={i} style={{fontSize:line.length>32?39:49,lineHeight:1.2,fontWeight:700,whiteSpace:'nowrap'}}>{line}</div>)}
    </div>}
    <div style={{position:'absolute',left:portrait?86:96,right:portrait?130:96,bottom:portrait?124:32,fontSize:portrait?19:17,letterSpacing:2,color:C.muted,
      display:'flex',justifyContent:'space-between'}}><span>{scene.mode==='layout-demo'?'DESIGN DEMO · NO FOOTAGE':labels[scene.section.kind]}</span><span>{portrait?'9:16':'16:9'}</span></div>
    <div style={{position:'absolute',bottom:portrait?166:64,left:portrait?86:96,width:portrait?864:1728,height:1,background:C.line}}>
      <div style={{width:`${100*(scene.index+Math.max(0,Math.min(1,f/(fps*scene.section.duration))))/scene.count}%`,height:2,background:C.cyan}}/>
    </div>
  </AbsoluteFill>;
}
