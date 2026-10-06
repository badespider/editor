import React, {type CSSProperties, type ReactNode, useId} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

export const brand = {navy:'#081725', white:'#f3f5f3', cyan:'#54e0e8', muted:'#9db3c3'};
export const motion = {extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.bezier(.22,1,.36,1)} as const;
export type VisualProps = {style?:CSSProperties};

// Static grain is deterministic and does not flicker at a paused frame.
export const Grain=({light=false}:{light?:boolean})=>{
  const id=useId().replace(/:/g,'');
  return <svg width="100%" height="100%" style={{position:'absolute',inset:0,pointerEvents:'none',opacity:light?.09:.055}}>
    <defs><filter id={id}><feTurbulence baseFrequency=".68" numOctaves="2" seed="17" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter></defs>
    <rect width="100%" height="100%" filter={`url(#${id})`}/>
  </svg>;
};

export const Canvas=({children,style}:{children:ReactNode;style?:CSSProperties})=><AbsoluteFill style={{background:'#081725',color:'#f3f5f3',fontFamily:'Arial',overflow:'hidden',...style}}>{children}</AbsoluteFill>;

export const Marker=({children}:{children:ReactNode})=><div style={{position:'absolute',left:130,top:74,fontSize:25,letterSpacing:3,color:'#9db3c3',display:'flex',alignItems:'center',gap:18}}><div style={{width:30,height:3,background:'#54e0e8'}}/>{children}</div>;

// A small demo-only label distinguishes invented examples from recordings/results.
export const DemoLabel=()=> <div style={{position:'absolute',right:130,bottom:44,fontSize:21,letterSpacing:1.5,color:'#9db3c3'}}>ILLUSTRATIVE EXAMPLE</div>;

export const Footer=({children}:{children:ReactNode})=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <div style={{position:'absolute',left:130,bottom:104,fontSize:37,color:'#9db3c3',opacity:interpolate(frame,[5.1*fps,5.55*fps],[0,1],motion)}}>{children}</div>;
};

// The fit limit is deliberately conservative; a script editor should still shorten copy.
export const fit=(text:string,max:number,base:number)=>Math.min(base,base*max/Math.max(max,text.length));
