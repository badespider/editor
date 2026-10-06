import React from 'react';
import {Interactive,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {Backdrop,Binding,C,Check,ease,ExampleLabel,TornPaper,type SceneProps} from './shared';
type PlannerProps={moving?:boolean;style?:React.CSSProperties};
const Planner=({moving=false,style}:PlannerProps)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 const move=moving?interpolate(frame,[2.6*fps,3.5*fps],[0,1],ease):0;
 const solved=move>.97;
 return <TornPaper style={{width:690,height:650,...style}}>
  <Binding/><div style={{position:'absolute',left:40,top:40,fontSize:57,fontWeight:700,letterSpacing:-2}}>MONDAY</div><div style={{position:'absolute',left:42,right:42,top:119,height:2,background:'#102738'}}/>
  <div style={{position:'absolute',left:39,top:166,fontSize:29,color:'#526e7b'}}>10 AM</div><div style={{position:'absolute',left:39,top:406,fontSize:29,color:'#526e7b'}}>6 PM</div><div style={{position:'absolute',left:39,top:512,fontSize:29,color:'#526e7b'}}>7 PM</div>
  <div style={{position:'absolute',left:152,top:167,width:478,height:291,background:'repeating-linear-gradient(135deg,#cfdbdd 0px,#cfdbdd 7px,#c6d3d6 7px,#c6d3d6 9px)',borderLeft:'4px solid #869ca8'}}/><div style={{position:'absolute',left:185,top:185,fontSize:37,fontWeight:700,color:'#567180'}}>AT WORK</div><div style={{position:'absolute',left:154,right:60,top:502,height:2,background:'#bdcdd0'}}/>
  <div style={{position:'absolute',left:177,top:246+move*263,width:435,height:102,rotate:solved?'0deg':'-2deg',background:C.cyan,boxShadow:'4px 8px 14px #14314130',border:'1px solid #1d829840',padding:'14px 22px'}}>
   <div style={{fontSize:28,fontWeight:700,letterSpacing:2}}>STUDY</div><div style={{fontSize:34,fontWeight:700,marginTop:2}}>{solved?'7–8 PM':'11 AM–12 PM'}</div>
  </div>
 </TornPaper>;
};
export const Comparison=({style}:SceneProps)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Backdrop style={style}>
  <Interactive.Div name="Comparison title" premountFor={fps} style={{position:'absolute',left:139,top:105,fontSize:97,fontWeight:700,letterSpacing:-4}}>THEN CHECK THE FIT.</Interactive.Div>
  <Interactive.Div name="First version — retained" premountFor={fps} style={{position:'absolute',left:185,top:330,width:690,height:650,scale:.84,transformOrigin:'top left',rotate:'-2deg'}}><Planner/></Interactive.Div>
  <Interactive.Div name="Baseline label" premountFor={fps} style={{position:'absolute',left:184,top:258,fontSize:32,letterSpacing:2,color:'#b6c6ce'}}>THE FIRST DRAFT</Interactive.Div>
  <Interactive.Div name="Conflict note" from={.5*fps} premountFor={fps} style={{position:'absolute',left:184,top:919,fontSize:41,color:C.white}}>11 AM? You're at work.</Interactive.Div>
  <Interactive.Div name="Revised planner — new state" from={1.1*fps} premountFor={fps} style={{position:'absolute',left:1030,top:291,width:690,height:650,rotate:interpolate(frame,[1.1*fps,1.7*fps],['7deg','1deg'],ease),translate:interpolate(frame,[1.1*fps,1.7*fps],['180px 75px','0px 0px'],ease),opacity:interpolate(frame,[1.1*fps,1.3*fps],[0,1],ease)}}><Planner moving/></Interactive.Div>
  <Interactive.Div name="Revised label" from={1.1*fps} premountFor={fps} style={{position:'absolute',left:1028,top:219,fontSize:32,letterSpacing:2,color:C.cyan}}>AFTER CHECKING YOUR HOURS</Interactive.Div>
  <Interactive.Div name="Before to after connector" from={1.6*fps} premountFor={fps} style={{position:'absolute',left:820,top:630,width:160,height:60}}><svg width="160" height="60" viewBox="0 0 160 60" fill="none"><Interactive.Path name="Comparison connector" d="M3 30H148M124 6 150 30 124 54" stroke={C.cyan} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={interpolate(frame,[1.6*fps,2.1*fps],[1,0],ease)}/></svg></Interactive.Div>
  <Interactive.Div name="Result check" from={4.7*fps} premountFor={fps} style={{position:'absolute',left:1735,top:789}}><Check size={80}/></Interactive.Div>
  <Interactive.Div name="Result meaning" from={4.8*fps} premountFor={fps} style={{position:'absolute',left:1056,top:969,fontSize:35,fontWeight:700,color:C.cyan}}>A slot you can actually use.</Interactive.Div>
  <ExampleLabel/>
 </Backdrop>;
};
