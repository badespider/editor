import React from 'react';
import {Interactive, interpolate, useCurrentFrame, useVideoConfig, type InteractivitySchema} from 'remotion';
import {Canvas, Grain, Marker, DemoLabel, motion, fit, type VisualProps} from './shared';

type Props=VisualProps & {title:string;leftTitle:string;rightTitle:string;leftTask:string;rightTask:string;leftContext:string;rightContext:string;takeaway:string;sectionLabel?:string;fieldOne?:string;fieldTwo?:string};
const SideBySideInner=({title,leftTitle,rightTitle,leftTask,rightTask,leftContext,rightContext,takeaway,sectionLabel='04 / SIDE-BY-SIDE',fieldOne='REQUEST',fieldTwo='CONTEXT',style}:Props)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Canvas style={style}>
  <div style={{position:'absolute',left:960,top:0,width:960,height:1080,background:'#102d3d'}}/><Grain/>
  {sectionLabel&&<Marker>{sectionLabel}</Marker>}
  <Interactive.Div name="The question" premountFor={fps} style={{position:'absolute',left:130,top:151,fontSize:fit(title,26,96),fontWeight:700,letterSpacing:-3,opacity:interpolate(frame,[0,.35*fps],[0,1],motion)}}>{title}</Interactive.Div>
  <Interactive.Div name="Comparison divider" premountFor={fps} style={{position:'absolute',left:959,top:321,width:2,height:505,background:'#5c8a99',transformOrigin:'top',scale:interpolate(frame,[.3*fps,.9*fps],['1 0','1 1'],motion)}}/>
  <Interactive.Div name="Baseline column" premountFor={fps} style={{position:'absolute',left:130,top:335,width:695,opacity:interpolate(frame,[.4*fps,.9*fps],[0,1],motion)}}>
   <div style={{fontSize:23,color:'#9db3c3',letterSpacing:3}}>BEFORE</div>
   <div style={{fontSize:fit(leftTitle,17,68),fontWeight:700,marginTop:18,letterSpacing:-1}}>{leftTitle}</div>
   <div style={{height:2,background:'#385361',marginTop:34}}/>
   <div style={{fontSize:23,color:'#9db3c3',letterSpacing:2,marginTop:34}}>{fieldOne}</div>
   <div style={{fontSize:46,lineHeight:1.25,marginTop:15}}>{leftTask}</div>
   <div style={{fontSize:23,color:'#9db3c3',letterSpacing:2,marginTop:44}}>{fieldTwo}</div>
   <div style={{fontSize:42,lineHeight:1.25,marginTop:15,color:'#9db3c3',whiteSpace:'pre-line'}}>{leftContext}</div>
  </Interactive.Div>
  <Interactive.Div name="Alternative column — keep baseline visible" premountFor={fps} style={{position:'absolute',left:1085,top:335,width:695,opacity:interpolate(frame,[1.9*fps,2.45*fps],[0,1],motion),translate:interpolate(frame,[1.9*fps,2.6*fps],['40px 0px','0px 0px'],motion)}}>
   <div style={{fontSize:23,color:'#54e0e8',letterSpacing:3}}>AFTER</div>
   <div style={{fontSize:fit(rightTitle,17,68),fontWeight:700,marginTop:18,letterSpacing:-1,color:'#54e0e8'}}>{rightTitle}</div>
   <div style={{height:2,background:'#54e0e8',marginTop:34}}/>
   <div style={{fontSize:23,color:'#9db3c3',letterSpacing:2,marginTop:34}}>{fieldOne}</div>
   <div style={{fontSize:46,lineHeight:1.25,marginTop:15}}>{rightTask}</div>
   <div style={{fontSize:23,color:'#9db3c3',letterSpacing:2,marginTop:44}}>{fieldTwo}</div>
   <div style={{fontSize:42,lineHeight:1.25,marginTop:15,whiteSpace:'pre-line'}}>{rightContext}</div>
  </Interactive.Div>
  <Interactive.Div name="Comparison conclusion" premountFor={fps} style={{position:'absolute',left:130,bottom:116,fontSize:43,fontWeight:700,color:'#54e0e8',opacity:interpolate(frame,[5*fps,5.5*fps],[0,1],motion)}}>{takeaway}</Interactive.Div>
  <DemoLabel/>
 </Canvas>;
};
const schema={
 sectionLabel:{type:'text-content',default:'04 / SIDE-BY-SIDE',description:'Section label (empty hides it)'},
 fieldOne:{type:'text-content',default:'REQUEST',description:'First comparison field'},
 fieldTwo:{type:'text-content',default:'CONTEXT',description:'Second comparison field'},
 title:{type:'text-content',default:'SAME TOOL. DIFFERENT BRIEF.',description:'Comparison headline'},
 leftTitle:{type:'text-content',default:'A vague request',description:'Baseline heading'},
 rightTitle:{type:'text-content',default:'A useful brief',description:'Alternative heading'},
 leftTask:{type:'text-content',default:'“Make me a study plan.”',description:'Baseline task (50 characters max)'},
 rightTask:{type:'text-content',default:'“Plan one hour of practice.”',description:'Alternative task (50 characters max)'},
 leftContext:{type:'text-content',default:'No schedule. No subject.\nNo clear target.',description:'Baseline context'},
 rightContext:{type:'text-content',default:'After 7 PM. Networking.\nOne practice lab.',description:'Alternative context'},
 takeaway:{type:'text-content',default:'Specific context makes the answer easier to judge.',description:'Closing lesson'},
} as const satisfies InteractivitySchema;
export const SideBySide=Interactive.withSchema({Component:SideBySideInner,componentName:'<SideBySide>',schema,wrapInSequence:true});
