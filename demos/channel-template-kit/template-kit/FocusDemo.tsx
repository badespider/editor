import React from 'react';
import {CanvasImage, Interactive, interpolate, staticFile, useCurrentFrame, useVideoConfig, type InteractivitySchema} from 'remotion';
import {Canvas, Marker, DemoLabel, motion, fit, type VisualProps} from './shared';

type Props=VisualProps & {title:string;takeaway:string;screenshotSrc:string;focusX:number;focusY:number;focusWidth:number;focusHeight:number;sectionLabel?:string};
const FocusDemoInner=({title,takeaway,screenshotSrc,focusX,focusY,focusWidth,focusHeight,sectionLabel='05 / FOCUS DEMO',style}:Props)=>{
 const frame=useCurrentFrame();const {fps}=useVideoConfig();
 const checked=frame>=3.85*fps;
 return <Canvas style={style}>
  {sectionLabel&&<Marker>{sectionLabel}</Marker>}
  <Interactive.Div name="Demonstration title" premountFor={fps} style={{position:'absolute',left:130,top:149,width:1660,fontSize:fit(title,27,95),fontWeight:700,letterSpacing:-3,opacity:interpolate(frame,[0,.4*fps],[0,1],motion)}}>{title}</Interactive.Div>
  <Interactive.Div name="Screen stage" premountFor={fps} style={{position:'absolute',left:130,top:302,width:1660,height:586,background:'#132a3b',border:'1px solid #355468',boxShadow:'0 24px 90px #0005',overflow:'hidden',opacity:interpolate(frame,[.2*fps,.6*fps],[0,1],motion),translate:interpolate(frame,[.2*fps,.8*fps],['0px 28px','0px 0px'],motion)}}>
   {screenshotSrc?<CanvasImage name="Your actual screenshot" src={/^(https?:|data:|blob:)/.test(screenshotSrc)?screenshotSrc:staticFile(screenshotSrc.replace(/^\//,''))} premountFor={fps} style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<>
    <div style={{height:75,borderBottom:'1px solid #355468',display:'flex',alignItems:'center',paddingLeft:30,fontSize:25,letterSpacing:2,color:'#9db3c3'}}>WORKSPACE <span style={{marginLeft:42,color:'#f3f5f3',fontSize:29,letterSpacing:0}}>My first project</span><span style={{marginLeft:'auto',marginRight:35,fontSize:21}}>DEMO INTERFACE</span></div>
    <div style={{position:'absolute',left:0,top:76,width:252,bottom:0,background:'#0d2131',borderRight:'1px solid #355468',padding:30,boxSizing:'border-box'}}>
     <div style={{fontSize:22,color:'#9db3c3',letterSpacing:2,marginTop:12}}>PROJECT</div>
     <div style={{fontSize:29,marginTop:34}}>Overview</div><div style={{fontSize:29,marginTop:33,color:'#54e0e8'}}>Review</div><div style={{fontSize:29,marginTop:33}}>Files</div>
     <div style={{position:'absolute',left:30,bottom:35,fontSize:22,color:'#9db3c3'}}>Draft → Review</div>
    </div>
    <div style={{position:'absolute',left:310,top:106,fontSize:26,color:'#9db3c3',letterSpacing:2}}>BEFORE YOU USE THE ANSWER</div>
    <div style={{position:'absolute',left:309,top:162,width:1270,height:95,borderBottom:'1px solid #355468',display:'flex',alignItems:'center',gap:27,fontSize:41}}><div style={{width:35,height:35,border:'2px solid #8ba8b7',display:'grid',placeItems:'center',fontSize:28,color:'#9db3c3'}}>✓</div>Read the draft<span style={{marginLeft:'auto',fontSize:25,color:'#9db3c3'}}>Done</span></div>
    <div style={{position:'absolute',left:309,top:289,width:1270,height:95,borderBottom:'1px solid #355468',display:'flex',alignItems:'center',gap:27,fontSize:41}}>
     <div style={{width:35,height:35,border:'2px solid #54e0e8',background:checked?'#54e0e8':'transparent',position:'relative'}}><svg width={35} height={35} viewBox="0 0 35 35" style={{position:'absolute',inset:0}}><path d="M7 17 14 24 29 9" fill="none" stroke="#081725" strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={interpolate(frame,[3.85*fps,4.1*fps],[1,0],motion)}/></svg></div>
     Check the source<span style={{marginLeft:'auto',fontSize:25,color:'#54e0e8'}}>{checked?'Checked':'Needs review'}</span>
    </div>
    <div style={{position:'absolute',left:309,top:416,width:1270,height:95,display:'flex',alignItems:'center',gap:27,fontSize:41}}><div style={{width:35,height:35,border:'2px solid #8ba8b7'}}/>Test one example<span style={{marginLeft:'auto',fontSize:25,color:'#9db3c3'}}>Next</span></div>
   </>}
  </Interactive.Div>
  <Interactive.Div name="Isolate the relevant part" premountFor={fps} style={{position:'absolute',left:130,top:302,width:1660,height:586,overflow:'hidden',opacity:interpolate(frame,[1.5*fps,2.2*fps,5.8*fps,6.4*fps],[0,1,1,0],motion)}}>
   <div style={{position:'absolute',left:focusX-130,top:focusY-302,width:focusWidth,height:focusHeight,boxShadow:'0 0 0 2400px #030e1abc'}}/>
  </Interactive.Div>
  <Interactive.Div name="Focus frame" premountFor={fps} style={{position:'absolute',left:focusX,top:focusY,width:interpolate(frame,[1.75*fps,2.35*fps],[0,focusWidth],motion),height:focusHeight,border:'3px solid #54e0e8',boxSizing:'border-box',opacity:interpolate(frame,[1.75*fps,2.25*fps,5.8*fps,6.4*fps],[0,1,1,0],motion)}}/>
  {!screenshotSrc&&<Interactive.Div name="Demonstration cursor" premountFor={fps} style={{position:'absolute',left:0,top:0,translate:interpolate(frame,[2.35*fps,3.45*fps,4.4*fps,5.4*fps],['1550px 843px','459px 633px','459px 633px','1580px 816px'],motion),opacity:interpolate(frame,[2.35*fps,2.55*fps,5.3*fps,5.7*fps],[0,1,1,0],motion),scale:interpolate(frame,[3.6*fps,3.75*fps,3.9*fps],[1,.82,1],motion),transformOrigin:'0 0'}}>
   <svg width={44} height={56} viewBox="0 0 44 56"><path d="M3 3 38 31 22 33 15 48Z" fill="#f3f5f3" stroke="#081725" strokeWidth={3} strokeLinejoin="round"/></svg>
  </Interactive.Div>}
  <Interactive.Div name="Practical next step" premountFor={fps} style={{position:'absolute',left:130,bottom:92,fontSize:41,color:'#54e0e8',opacity:interpolate(frame,[4.5*fps,5*fps],[0,1],motion)}}>{takeaway}</Interactive.Div>
  {!screenshotSrc&&<DemoLabel/>}
 </Canvas>;
};
const schema={
 sectionLabel:{type:'text-content',default:'05 / FOCUS DEMO',description:'Section label (empty hides it)'},
 title:{type:'text-content',default:'DON’T SKIP THE CHECK.',description:'Walkthrough headline'},
 takeaway:{type:'text-content',default:'A confident answer still needs a source.',description:'Closing annotation'},
 screenshotSrc:{type:'asset',assetType:'image',default:'',description:'Actual screenshot (blank = labelled demo interface)'},
 focusX:{type:'number',default:428,min:130,max:1750,hiddenFromList:false,description:'Focus left (composition pixels)'},
 focusY:{type:'number',default:579,min:302,max:850,hiddenFromList:false,description:'Focus top (composition pixels)'},
 focusWidth:{type:'number',default:1300,min:40,max:1660,hiddenFromList:false,description:'Focus width'},
 focusHeight:{type:'number',default:116,min:40,max:586,hiddenFromList:false,description:'Focus height'},
} as const satisfies InteractivitySchema;
export const FocusDemo=Interactive.withSchema({Component:FocusDemoInner,componentName:'<FocusDemo>',schema,wrapInSequence:true});
