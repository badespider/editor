import React from 'react';
import {Interactive, interpolate, useCurrentFrame, useVideoConfig, type InteractivitySchema} from 'remotion';
import {Canvas, Grain, Marker, motion, fit, type VisualProps} from './shared';

type Props=VisualProps & {oldIdea:string;newIdea:string;support:string;sectionLabel?:string};
const BoldTypeInner=({oldIdea,newIdea,support,sectionLabel='02 / BOLD TYPE',style}:Props)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Canvas style={style}>
  <Grain/>{sectionLabel&&<Marker>{sectionLabel}</Marker>}
  <Interactive.Div name="The assumption" premountFor={fps} style={{position:'absolute',left:130,top:222,width:1660,fontSize:fit(oldIdea,17,155),fontWeight:700,letterSpacing:-6,lineHeight:1,translate:interpolate(frame,[0,.5*fps],['0px 90px','0px 0px'],motion),opacity:interpolate(frame,[0,.4*fps,1.7*fps,2.2*fps],[0,1,1,.36],motion)}}>{oldIdea}</Interactive.Div>
  <Interactive.Div name="Strike the assumption" premountFor={fps} style={{position:'absolute',left:120,top:306,width:Math.min(1660,oldIdea.length*fit(oldIdea,17,155)*.64),height:11,background:'#54e0e8',rotate:'-2deg',transformOrigin:'left',scale:interpolate(frame,[1.2*fps,1.65*fps],['0 1','1 1'],motion)}}/>
  <div style={{position:'absolute',left:124,top:444,width:1680,height:213,overflow:'hidden'}}>
   <Interactive.Div name="The reframe" premountFor={fps} style={{fontSize:fit(newIdea,17,155),fontWeight:700,letterSpacing:-6,lineHeight:1.15,color:'#54e0e8',translate:interpolate(frame,[2*fps,2.7*fps],['0px 230px','0px 0px'],motion)}}>{newIdea}</Interactive.Div>
  </div>
  <Interactive.Div name="One supporting sentence" premountFor={fps} style={{position:'absolute',left:137,top:737,width:1440,fontSize:49,color:'#f3f5f3',opacity:interpolate(frame,[3.3*fps,3.8*fps],[0,1],motion),translate:interpolate(frame,[3.3*fps,3.8*fps],['0px 20px','0px 0px'],motion)}}>{support}</Interactive.Div>
  <Interactive.Div name="Closing emphasis rule" premountFor={fps} style={{position:'absolute',left:137,top:851,height:3,width:118,background:'#54e0e8',transformOrigin:'left',scale:interpolate(frame,[3.8*fps,4.4*fps],['0 1','1 1'],motion)}}/>
  <div style={{position:'absolute',right:130,bottom:70,fontSize:25,letterSpacing:3,color:'#9db3c3'}}>LESS NOISE. MORE INTENT.</div>
 </Canvas>;
};
const schema={
 sectionLabel:{type:'text-content',default:'02 / BOLD TYPE',description:'Section label (empty hides it)'},
 oldIdea:{type:'text-content',default:'MORE TOOLS.',description:'Assumption / contrast (short phrase)'},
 newIdea:{type:'text-content',default:'BETTER QUESTIONS.',description:'Reframe (17 characters preferred)'},
 support:{type:'text-content',default:'Start with the problem. Then choose the tool.',description:'Supporting sentence'},
} as const satisfies InteractivitySchema;
export const BoldType=Interactive.withSchema({Component:BoldTypeInner,componentName:'<BoldType>',schema,wrapInSequence:true});
