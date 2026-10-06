import React from 'react';
import {Interactive,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {Backdrop,Binding,C,ease,ExampleLabel,TornPaper,type SceneProps} from './shared';
export const Opening=({style}:SceneProps)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Backdrop style={style}>
  <Interactive.Div name="Calendar object" premountFor={fps} style={{position:'absolute',left:1245,top:460,width:600,height:710,rotate:interpolate(frame,[0,3.6*fps],['12deg','6deg'],ease),translate:interpolate(frame,[0,.8*fps],['70px 140px','0px 0px'],ease)}}>
   <TornPaper style={{inset:0}}><Binding/><div style={{position:'absolute',top:56,left:52,fontSize:26,letterSpacing:6}}>YOUR WEEK</div><div style={{position:'absolute',top:112,left:48,fontSize:90,fontWeight:700,letterSpacing:-5}}>MONDAY</div><div style={{position:'absolute',left:48,right:48,top:245,height:2,background:'#294554'}}/>
    {[0,1,2,3,4].map(i=><div key={i} style={{position:'absolute',left:48,right:48,top:330+i*78,height:2,background:'#b7c5c9'}}/>)}
    <div style={{position:'absolute',left:160,top:276,fontSize:230,fontWeight:700,color:'#bacbd0',rotate:'-7deg'}}>?</div>
   </TornPaper>
  </Interactive.Div>
  <Interactive.Div name="Opening phrase — grouped release" premountFor={fps} style={{position:'absolute',left:135,top:212,width:1640,translate:interpolate(frame,[3.2*fps,3.6*fps],['0px 0px','-1940px 0px'],ease)}}>
   <Interactive.Div name="Make me" premountFor={fps} style={{fontSize:168,lineHeight:.98,fontWeight:700,letterSpacing:-8,opacity:interpolate(frame,[0,.12*fps],[0,1],ease)}}>MAKE ME</Interactive.Div>
   <Interactive.Div name="A schedule" from={.2*fps} premountFor={fps} style={{position:'absolute',top:180,fontSize:168,lineHeight:.98,fontWeight:700,letterSpacing:-8,color:C.cyan}}>A SCHEDULE.</Interactive.Div>
   <Interactive.Div name="The problem" from={1.3*fps} premountFor={fps} style={{position:'absolute',top:439,fontSize:53,lineHeight:1.2,color:'#d2dee3'}}>A simple request.<br/>A missing piece.</Interactive.Div>
  </Interactive.Div>
  <ExampleLabel/>
 </Backdrop>;
};
