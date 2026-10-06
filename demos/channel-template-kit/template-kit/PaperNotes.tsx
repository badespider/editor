import React from 'react';
import {Interactive, interpolate, useCurrentFrame, useVideoConfig, type InteractivitySchema} from 'remotion';
import {Canvas, Grain, Marker, DemoLabel, motion, fit, type VisualProps} from './shared';

type Props=VisualProps & {headline:string;emphasis:string;noteTitle:string;constraint:string;action:string;takeaway:string;sectionLabel?:string};
const PaperNotesInner=({headline,emphasis,noteTitle,constraint,action,takeaway,sectionLabel='01 / PAPER NOTES',style}:Props)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 return <Canvas style={style}>
  <div style={{position:'absolute',inset:0,background:'radial-gradient(ellipse at 78% 45%,#18374a,#081725 68%)'}}/><Grain/>
  {sectionLabel&&<Marker>{sectionLabel}</Marker>}
  <Interactive.Div name="Editorial headline" premountFor={fps} style={{position:'absolute',left:130,top:215,width:890,fontWeight:700,lineHeight:.99,letterSpacing:-5,translate:interpolate(frame,[0,.55*fps],['0px 35px','0px 0px'],motion),opacity:interpolate(frame,[0,.4*fps],[0,1],motion)}}>
   <div style={{fontSize:fit(headline,12,136)}}>{headline}</div>
   <div style={{fontSize:fit(emphasis,12,136),color:'#54e0e8',marginTop:12}}>{emphasis}</div>
  </Interactive.Div>
  <Interactive.Div name="The small practical action" premountFor={fps} style={{position:'absolute',left:138,top:574,width:685,fontSize:47,lineHeight:1.3,opacity:interpolate(frame,[1*fps,1.45*fps],[0,1],motion)}}>{takeaway}</Interactive.Div>
  <Interactive.Div name="Physical note" premountFor={fps} style={{position:'absolute',left:1080,top:191,width:620,height:635,background:'#f3f5f3',color:'#102738',rotate:interpolate(frame,[.4*fps,1.15*fps],['8deg','3deg'],motion),translate:interpolate(frame,[.4*fps,1.15*fps],['90px 110px','0px 0px'],motion),opacity:interpolate(frame,[.4*fps,.7*fps],[0,1],motion),boxShadow:'-12px 35px 80px #0007'}}>
   <Grain light/>
   <div style={{position:'absolute',inset:0,background:'linear-gradient(115deg,transparent 47%,#b3bdc22b 48%,#fff9 49%,transparent 51%)'}}/>
   <div style={{position:'absolute',width:185,height:52,background:'#c1d3d6aa',top:-24,left:218,rotate:'-7deg',borderLeft:'2px dashed #b6cbd088',borderRight:'2px dashed #b6cbd088'}}/>
   <div style={{position:'absolute',left:50,top:61,fontSize:23,letterSpacing:3}}>A NOTE TO MYSELF</div>
   <div style={{position:'absolute',left:50,top:122,width:520,fontSize:fit(noteTitle,14,62),fontWeight:700,lineHeight:1.1}}>{noteTitle}</div>
   <div style={{position:'absolute',left:50,right:50,top:234,height:2,background:'#82999d66'}}/>
   <Interactive.Div name="Real-world constraint" premountFor={fps} style={{position:'absolute',left:50,top:275,width:520,fontSize:41,lineHeight:1.3,opacity:interpolate(frame,[1.5*fps,1.9*fps],[0,1],motion)}}>{constraint}</Interactive.Div>
   <Interactive.Div name="Marked action" premountFor={fps} style={{position:'absolute',left:40,top:418,width:530,rotate:'-1deg',opacity:interpolate(frame,[2.4*fps,2.7*fps],[0,1],motion)}}>
    <div style={{position:'absolute',inset:'-8px -8px',background:'#54e0e8',transformOrigin:'left',scale:interpolate(frame,[2.6*fps,3.2*fps],['0 1','1 1'],motion)}}/>
    <div style={{position:'relative',fontSize:fit(action,24,42),fontWeight:700,padding:16}}>{action}</div>
   </Interactive.Div>
   <div style={{position:'absolute',left:50,bottom:42,fontSize:23,letterSpacing:2,color:'#57717d'}}>START SMALL. MAKE IT REAL.</div>
  </Interactive.Div>
  <Interactive.Svg name="Personal annotation" premountFor={fps} width={430} height={210} viewBox="0 0 430 210" style={{position:'absolute',left:760,top:672}}>
   <Interactive.Path name="Connect the lesson to the note" d="M12 165C90 165 120 37 208 61C279 80 320 107 394 20M355 17L395 20 389 61" fill="none" stroke="#54e0e8" strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame,[3.5*fps,4.2*fps],[1,0],motion)}/>
  </Interactive.Svg>
  <DemoLabel/>
 </Canvas>;
};
const schema={
 sectionLabel:{type:'text-content',default:'01 / PAPER NOTES',description:'Section label (empty hides it)'},
 headline:{type:'text-content',default:'START WITH',description:'Headline — 12 characters preferred'},
 emphasis:{type:'text-content',default:'YOUR DAY.',description:'Emphasis — 12 characters preferred'},
 noteTitle:{type:'text-content',default:'One useful task.',description:'Note heading'},
 constraint:{type:'text-content',default:'I get home at 7 PM.\nI have one free hour.',description:'Context / constraint'},
 action:{type:'text-content',default:'Plan that hour first.',description:'Highlighted action'},
 takeaway:{type:'text-content',default:'The best first project is already in your life.',description:'Supporting thought'},
} as const satisfies InteractivitySchema;
export const PaperNotes=Interactive.withSchema({Component:PaperNotesInner,componentName:'<PaperNotes>',schema,wrapInSequence:true});
