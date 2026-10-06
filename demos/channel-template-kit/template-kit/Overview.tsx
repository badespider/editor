import React, {type ReactNode} from 'react';
import {Freeze} from 'remotion';
import {Canvas} from './shared';
import {PaperNotes} from './PaperNotes';
import {BoldType} from './BoldType';
import {Blueprint} from './Blueprint';
import {SideBySide} from './SideBySide';
import {FocusDemo} from './FocusDemo';

const Sample=({x,y,label,children}:{x:number;y:number;label:string;children:ReactNode})=><div style={{position:'absolute',left:x,top:y,width:560,height:365}}>
 <div style={{width:560,height:315,border:'1px solid #355468',overflow:'hidden',position:'relative'}}>
  <div style={{position:'absolute',left:0,top:0,width:1920,height:1080,scale:560/1920,transformOrigin:'top left'}}><Freeze frame={180}>{children}</Freeze></div>
 </div>
 <div style={{fontSize:29,marginTop:17,letterSpacing:.5}}>{label}</div>
</div>;

export const TemplateOverview=()=> <Canvas>
 <div style={{position:'absolute',left:80,top:52,fontSize:48,fontWeight:700,letterSpacing:-1}}>FIVE WAYS. <span style={{color:'#54e0e8'}}>ONE BRAND.</span></div>
 <Sample x={80} y={150} label="01 / Paper Notes — personal examples"><PaperNotes headline="START WITH" emphasis="YOUR DAY." noteTitle="One useful task." constraint="I get home at 7 PM. I have one free hour." action="Plan that hour first." takeaway="The best first project is already in your life."/></Sample>
 <Sample x={680} y={150} label="02 / Bold Type — hooks & reframes"><BoldType oldIdea="MORE TOOLS." newIdea="BETTER QUESTIONS." support="Start with the problem. Then choose the tool."/></Sample>
 <Sample x={1280} y={150} label="03 / Blueprint — explain a process"><Blueprint title="BUILD A SMALL FEEDBACK LOOP." stepOne="Define the task" stepTwo="Try one version" stepThree="Check the result" takeaway="Repeat the loop. Keep what actually helps."/></Sample>
 <Sample x={80} y={594} label="04 / Side-by-Side — compare options"><SideBySide title="SAME TOOL. DIFFERENT BRIEF." leftTitle="A vague request" rightTitle="A useful brief" leftTask="“Make me a study plan.”" rightTask="“Plan one hour of practice.”" leftContext={'No schedule. No subject.\nNo clear target.'} rightContext={'After 7 PM. Networking.\nOne practice lab.'} takeaway="Specific context makes the answer easier to judge."/></Sample>
 <Sample x={680} y={594} label="05 / Focus Demo — direct attention"><FocusDemo title="DON’T SKIP THE CHECK." takeaway="A confident answer still needs a source." screenshotSrc="" focusX={428} focusY={579} focusWidth={1300} focusHeight={116}/></Sample>
 <div style={{position:'absolute',left:1320,top:616,width:460}}>
  <div style={{fontSize:60,fontWeight:700,lineHeight:1.1,letterSpacing:-2}}>SAME VOICE.<br/><span style={{color:'#54e0e8'}}>NEW RHYTHM.</span></div>
  <div style={{fontSize:32,lineHeight:1.4,marginTop:31,color:'#9db3c3'}}>Choose the visual that helps the story. You don’t need all five in every video.</div>
 </div>
 <div style={{position:'absolute',left:80,bottom:40,fontSize:22,color:'#9db3c3',letterSpacing:2}}>EDITABLE 16:9 TEMPLATES · SILENT DESIGN PREVIEW</div>
</Canvas>;
