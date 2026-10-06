import React from 'react';
import {Interactive, interpolate, useCurrentFrame, useVideoConfig, type InteractivitySchema} from 'remotion';
import {Canvas, Marker, Footer, motion, fit, type VisualProps} from './shared';

type Props=VisualProps & {title:string;stepOne:string;stepTwo:string;stepThree:string;takeaway:string;sectionLabel?:string};
const BlueprintInner=({title,stepOne,stepTwo,stepThree,takeaway,sectionLabel='03 / BLUEPRINT',style}:Props)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Canvas style={style}>
  <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(#6fdce10a 1px,transparent 1px),linear-gradient(90deg,#6fdce10a 1px,transparent 1px)',backgroundSize:'64px 64px'}}/>
  <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 50% 55%,transparent 25%,#081725 90%)'}}/>
  {sectionLabel&&<Marker>{sectionLabel}</Marker>}
  <Interactive.Div name="Process headline" premountFor={fps} style={{position:'absolute',left:130,top:150,width:1620,fontSize:fit(title,25,99),letterSpacing:-3,fontWeight:700,opacity:interpolate(frame,[0,.4*fps],[0,1],motion)}}>{title}</Interactive.Div>
  <svg width={1920} height={1080} style={{position:'absolute',inset:0}} fill="none">
   <Interactive.Path name="Return to the task with what you learned" d="M1527 804V820Q1527 840 1507 840H408Q388 840 388 820V804M377 817 388 804 399 817" stroke="#527782" strokeWidth={2} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame,[4.8*fps,5.5*fps],[1,0],motion)}/>
   <path d="M493 566H720Q765 566 765 520V490Q765 448 810 448H884M1096 448H1160Q1205 448 1205 490V520Q1205 566 1250 566H1421" stroke="#244451" strokeWidth={3}/>
   <Interactive.Path name="First connection" d="M493 566H720Q765 566 765 520V490Q765 448 810 448H884" stroke="#54e0e8" strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame,[1.3*fps,2*fps],[1,0],motion)}/>
   <Interactive.Path name="Second connection" d="M1096 448H1160Q1205 448 1205 490V520Q1205 566 1250 566H1421" stroke="#54e0e8" strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame,[3.1*fps,3.8*fps],[1,0],motion)}/>
   <path d="M851 433 883 448 851 463M1388 551 1420 566 1388 581" stroke="#54e0e8" strokeWidth={3}/>
  </svg>
  <Interactive.Div name="Step one — define" premountFor={fps} style={{position:'absolute',left:282,top:460,width:212,height:212,border:'2px solid #54e0e8',borderRadius:'50%',background:'#0b2534',opacity:interpolate(frame,[.3*fps,.65*fps],[0,1],motion),scale:interpolate(frame,[.3*fps,.85*fps],[.9,1],motion)}}>
   <svg width={212} height={212} viewBox="0 0 212 212" fill="none"><path d="M72 53H119L146 80V156H72Z" stroke="#f3f5f3" strokeWidth={4}/><path d="M119 53V80H146M88 102H130M88 119H130M88 136H113" stroke="#54e0e8" strokeWidth={4}/></svg>
  </Interactive.Div>
  <Interactive.Div name="Step one label" premountFor={fps} style={{position:'absolute',left:160,top:696,width:460,textAlign:'center',opacity:interpolate(frame,[.6*fps,1*fps],[0,1],motion)}}><span style={{fontSize:23,letterSpacing:2,color:'#54e0e8'}}>01</span><div style={{fontSize:fit(stepOne,16,47),fontWeight:700,marginTop:8}}>{stepOne}</div></Interactive.Div>
  <Interactive.Div name="Step two — run" premountFor={fps} style={{position:'absolute',left:884,top:342,width:212,height:212,border:'2px solid #54e0e8',borderRadius:'50%',background:'#0b2534',opacity:interpolate(frame,[1.9*fps,2.2*fps],[0,1],motion),scale:interpolate(frame,[1.9*fps,2.55*fps],[.9,1],motion)}}>
   <svg width={212} height={212} viewBox="0 0 212 212" fill="none"><path d="M57 130 87 83 111 117 151 69M127 69H152V94" stroke="#54e0e8" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"/><path d="M52 52V157H162" stroke="#f3f5f3" strokeWidth={3}/></svg>
  </Interactive.Div>
  <Interactive.Div name="Step two label" premountFor={fps} style={{position:'absolute',left:760,top:578,width:460,textAlign:'center',opacity:interpolate(frame,[2.2*fps,2.6*fps],[0,1],motion)}}><span style={{fontSize:23,letterSpacing:2,color:'#54e0e8'}}>02</span><div style={{fontSize:fit(stepTwo,16,47),fontWeight:700,marginTop:8}}>{stepTwo}</div></Interactive.Div>
  <Interactive.Div name="Step three — check" premountFor={fps} style={{position:'absolute',left:1421,top:460,width:212,height:212,border:'2px solid #54e0e8',borderRadius:'50%',background:'#54e0e8',opacity:interpolate(frame,[3.7*fps,4*fps],[0,1],motion),scale:interpolate(frame,[3.7*fps,4.35*fps],[.9,1],motion)}}>
   <svg width={212} height={212} viewBox="0 0 212 212" fill="none"><Interactive.Path name="Verification check" d="M61 105 91 136 153 72" stroke="#081725" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame,[4.1*fps,4.65*fps],[1,0],motion)}/></svg>
  </Interactive.Div>
  <Interactive.Div name="Step three label" premountFor={fps} style={{position:'absolute',left:1295,top:696,width:460,textAlign:'center',opacity:interpolate(frame,[4*fps,4.4*fps],[0,1],motion)}}><span style={{fontSize:23,letterSpacing:2,color:'#54e0e8'}}>03</span><div style={{fontSize:fit(stepThree,16,47),fontWeight:700,marginTop:8}}>{stepThree}</div></Interactive.Div>
  <Footer>{takeaway}</Footer>
  <Interactive.Div name="Loop label" premountFor={fps} style={{position:'absolute',left:835,top:824,width:250,textAlign:'center',background:'#081725',fontSize:22,letterSpacing:2,color:'#9db3c3',opacity:interpolate(frame,[5.2*fps,5.6*fps],[0,1],motion)}}>REFINE + REPEAT</Interactive.Div>
 </Canvas>;
};
const schema={
 sectionLabel:{type:'text-content',default:'03 / BLUEPRINT',description:'Section label (empty hides it)'},
 title:{type:'text-content',default:'BUILD A SMALL FEEDBACK LOOP.',description:'Process title'},
 stepOne:{type:'text-content',default:'Define the task',description:'Step one (16 characters preferred)'},
 stepTwo:{type:'text-content',default:'Try one version',description:'Step two'},
 stepThree:{type:'text-content',default:'Check the result',description:'Step three'},
 takeaway:{type:'text-content',default:'Repeat the loop. Keep what actually helps.',description:'Takeaway'},
} as const satisfies InteractivitySchema;
export const Blueprint=Interactive.withSchema({Component:BlueprintInner,componentName:'<Blueprint>',schema,wrapInSequence:true});
