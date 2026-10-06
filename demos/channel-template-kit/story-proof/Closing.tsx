import React from 'react';
import {Interactive,interpolate,useCurrentFrame,useVideoConfig} from 'remotion';
import {Backdrop,C,Check,ease,type SceneProps} from './shared';
export const Closing=({style}:SceneProps)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Backdrop style={style}>
  <Interactive.Div name="Give context" premountFor={fps} style={{position:'absolute',left:144,top:297,fontSize:153,fontWeight:700,letterSpacing:-7,lineHeight:1,translate:interpolate(frame,[0,.32*fps],['0px 35px','0px 0px'],ease)}}>GIVE CONTEXT.</Interactive.Div>
  <Interactive.Div name="Check the result" from={.5*fps} premountFor={fps} style={{position:'absolute',left:144,top:474,fontSize:153,fontWeight:700,letterSpacing:-7,lineHeight:1,color:C.cyan}}>THEN CHECK.</Interactive.Div>
  <Interactive.Div name="Closing checkmark" from={.9*fps} premountFor={fps} style={{position:'absolute',left:1530,top:430}}><Check size={180}/></Interactive.Div>
  <Interactive.Div name="Simple next action" from={1.2*fps} premountFor={fps} style={{position:'absolute',left:153,top:740,fontSize:47,color:'#b5c6cf'}}>Start with one task you already do.</Interactive.Div>
 </Backdrop>;
};
