import React, {type CSSProperties, type ReactNode} from 'react';
import {AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
export const C={navy:'#081725',ink:'#102738',cyan:'#54e0e8',white:'#f3f5f3',muted:'#a0b4c2'};
export const ease={extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.22,1,.36,1)} as const;
export type SceneProps={style?:CSSProperties};
export const Material=({light=false}:{light?:boolean})=><AbsoluteFill style={{pointerEvents:'none',overflow:'hidden'}}>
  <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1920 1080">
    <defs><filter id={light?'paper-fiber':'navy-fiber'} x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".64" numOctaves="3" seed="62" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>
    <rect width="1920" height="1080" filter={light?'url(#paper-fiber)':'url(#navy-fiber)'} opacity={light?.13:.065} style={{mixBlendMode:light?'multiply':'soft-light'}}/>
    {!light&&<><path d="M-50 750 1980 260" stroke="#b6dce9" strokeOpacity=".022" strokeWidth="2"/><path d="M1200-10 950 1100" stroke="#000" strokeOpacity=".16" strokeWidth="4"/></>}
  </svg>
</AbsoluteFill>;
export const Backdrop=({children,style}:{children:ReactNode;style?:CSSProperties})=><AbsoluteFill style={{fontFamily:'Arial',color:C.white,background:C.navy,overflow:'hidden',...style}}>
  <AbsoluteFill style={{background:'radial-gradient(ellipse at 70% 35%,#143248 0%,#0b1d2c 42%,#061421 100%)'}}/><Material/>{children}
</AbsoluteFill>;
export const TornPaper=({children,style}:{children?:ReactNode;style?:CSSProperties})=><div style={{position:'absolute',background:C.white,color:C.ink,boxShadow:'0 28px 55px #0006',...style}}>
  <div style={{position:'absolute',inset:0,background:'linear-gradient(116deg,#fff8,transparent 48%,#b3c3c42b 49%,#fff3 50%,transparent 65%)'}}/><Material light/>
  <svg width="100%" height="20" preserveAspectRatio="none" viewBox="0 0 800 20" style={{position:'absolute',left:0,bottom:-17}}><path d="M0 0H800V7L786 11 772 5 756 13 739 9 719 16 690 10 672 18 653 9 629 15 608 7 583 13 560 10 537 17 511 7 480 14 455 10 431 17 402 7 376 13 350 10 322 16 301 8 272 14 246 9 215 16 185 10 157 16 128 8 107 15 80 9 59 16 38 9 16 15 0 8Z" fill="#f3f5f3"/></svg>{children}
</div>;
// Repeated binding rings are one decorative template.
export const Binding=()=> <>{[0,1,2,3,4,5].map(i=><div key={i} style={{position:'absolute',top:-16,left:65+i*85,width:13,height:39,borderRadius:8,background:'linear-gradient(90deg,#576979,#d0dade 42%,#516776)',boxShadow:'3px 5px 3px #0004'}}/>)}</>;
export const Arrow=({progress=1,style}:{progress?:number;style?:CSSProperties})=><svg width="270" height="135" viewBox="0 0 270 135" style={style} fill="none">
  <Interactive.Path name="Drawn relationship" d="M8 110C70 105 51 24 126 35C161 40 188 63 250 24M221 22L251 23 245 57" pathLength="1" stroke={C.cyan} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={1-progress}/>
</svg>;
export const ExampleLabel=()=> <div style={{position:'absolute',left:145,bottom:42,fontSize:23,letterSpacing:2,color:'#b4c6cf'}}>ILLUSTRATIVE EXAMPLE</div>;
export const Check=({size=90}:{size?:number})=>{const frame=useCurrentFrame();const {fps}=useVideoConfig();return <svg width={size} height={size} viewBox="0 0 100 100" fill="none"><path d="M17 52 40 73 84 24" pathLength="1" stroke={C.cyan} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={interpolate(frame,[0,.4*fps],[1,0],ease)}/></svg>;};
