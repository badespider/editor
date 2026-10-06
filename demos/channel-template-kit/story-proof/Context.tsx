import React from 'react';
import {Interactive,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {Arrow,Backdrop,C,ease,ExampleLabel,TornPaper,type SceneProps} from './shared';
export const Context=({style}:SceneProps)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Backdrop style={style}>
  <Interactive.Div name="Context heading" premountFor={fps} style={{position:'absolute',left:140,top:150,fontSize:114,fontWeight:700,lineHeight:.98,letterSpacing:-5}}>GIVE IT<br/><span style={{color:C.cyan}}>YOUR DAY.</span></Interactive.Div>
  <Interactive.Div name="First constraint" from={.4*fps} premountFor={fps} style={{position:'absolute',left:148,top:465,fontSize:55,lineHeight:1.2}}><span style={{color:C.cyan,fontWeight:700}}>01</span><span style={{paddingLeft:30}}>Work: 10 AM–6 PM</span></Interactive.Div>
  <Interactive.Div name="Second constraint" from={1.2*fps} premountFor={fps} style={{position:'absolute',left:148,top:570,fontSize:55,lineHeight:1.2}}><span style={{color:C.cyan,fontWeight:700}}>02</span><span style={{paddingLeft:30}}>Study: one hour</span></Interactive.Div>
  <Interactive.Div name="Third constraint" from={2*fps} premountFor={fps} style={{position:'absolute',left:148,top:675,fontSize:55,lineHeight:1.2}}><span style={{color:C.cyan,fontWeight:700}}>03</span><span style={{paddingLeft:30}}>Free after 7 PM</span></Interactive.Div>
  <Interactive.Div name="Expanded prompt — concrete input" premountFor={fps} style={{position:'absolute',left:1050,top:205,width:720,height:610,rotate:interpolate(frame,[0,.6*fps],['8deg','3deg'],ease),translate:interpolate(frame,[0,.6*fps],['130px 40px','0px 0px'],ease)}}>
   <TornPaper style={{inset:0}}>
    <div style={{position:'absolute',top:-20,left:245,width:190,height:50,rotate:'-4deg',background:'#76bcc697',boxShadow:'0 2px 2px #0001'}}/>
    <div style={{position:'absolute',left:52,top:58,fontSize:28,letterSpacing:3,color:'#617783'}}>EXAMPLE INPUT</div>
    <div style={{position:'absolute',left:52,top:135,fontSize:54,fontWeight:700,lineHeight:1.12,letterSpacing:-1.5}}>Plan one hour<br/>of study on Monday.</div>
    <Interactive.Div name="Work context added" from={.7*fps} premountFor={fps} style={{position:'absolute',left:52,top:307,fontSize:43,lineHeight:1.4}}>I work <b>10 AM–6 PM.</b></Interactive.Div>
    <Interactive.Div name="Available time added" from={2.2*fps} premountFor={fps} style={{position:'absolute',left:52,top:400,fontSize:43,lineHeight:1.3}}>I'm free after <b>7 PM.</b></Interactive.Div>
   </TornPaper>
  </Interactive.Div>
  <Arrow progress={interpolate(frame,[2.6*fps,3.2*fps],[0,1],ease)} style={{position:'absolute',left:775,top:744,rotate:'-10deg'}}/>
  <ExampleLabel/>
 </Backdrop>;
};
