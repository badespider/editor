import React from 'react';
import {Composition, Folder, registerRoot, Series, useVideoConfig} from 'remotion';
import {Opening} from './story-proof/Opening';
import {Context} from './story-proof/Context';
import {Comparison} from './story-proof/Comparison';
import {Closing} from './story-proof/Closing';
import {FiveWays} from './template-kit/Showcase';
import {PaperNotes} from './template-kit/PaperNotes';
import {BoldType} from './template-kit/BoldType';
import {Blueprint} from './template-kit/Blueprint';
import {SideBySide} from './template-kit/SideBySide';
import {FocusDemo} from './template-kit/FocusDemo';
import {TemplateOverview} from './template-kit/Overview';

export const StoryProof=()=>{const {fps}=useVideoConfig();return <Series>
 <Series.Sequence name="A request without context" durationInFrames={3.6*fps} premountFor={fps}><Opening/></Series.Sequence>
 <Series.Sequence name="The useful missing information" durationInFrames={4.4*fps} premountFor={fps}><Context/></Series.Sequence>
 <Series.Sequence name="Keep the baseline; show the correction" durationInFrames={7*fps} premountFor={fps}><Comparison/></Series.Sequence>
 <Series.Sequence name="One clear next step" durationInFrames={3*fps} premountFor={fps}><Closing/></Series.Sequence>
</Series>;};
const Root=()=> <>
 <Composition id="Five-Ways-One-Brand" component={FiveWays} width={1920} height={1080} fps={30} durationInFrames={1170}/>
 <Composition id="Template-Overview" component={TemplateOverview} width={1920} height={1080} fps={30} durationInFrames={240}/>
 <Folder name="Five-Templates">
  <Composition id="01-Paper-Notes" component={PaperNotes} width={1920} height={1080} fps={30} durationInFrames={240} defaultProps={{headline:'START WITH',emphasis:'YOUR DAY.',noteTitle:'One useful task.',constraint:'I get home at 7 PM. I have one free hour.',action:'Plan that hour first.',takeaway:'The best first project is already in your life.'}}/>
  <Composition id="02-Bold-Type" component={BoldType} width={1920} height={1080} fps={30} durationInFrames={210} defaultProps={{oldIdea:'MORE TOOLS.',newIdea:'BETTER QUESTIONS.',support:'Start with the problem. Then choose the tool.'}}/>
  <Composition id="03-Blueprint" component={Blueprint} width={1920} height={1080} fps={30} durationInFrames={240} defaultProps={{title:'BUILD A SMALL FEEDBACK LOOP.',stepOne:'Define the task',stepTwo:'Try one version',stepThree:'Check the result',takeaway:'Repeat the loop. Keep what actually helps.'}}/>
  <Composition id="04-Side-by-Side" component={SideBySide} width={1920} height={1080} fps={30} durationInFrames={240} defaultProps={{title:'SAME TOOL. DIFFERENT BRIEF.',leftTitle:'A vague request',rightTitle:'A useful brief',leftTask:'“Make me a study plan.”',rightTask:'“Plan one hour of practice.”',leftContext:'No schedule. No subject.\nNo clear target.',rightContext:'After 7 PM. Networking.\nOne practice lab.',takeaway:'Specific context makes the answer easier to judge.'}}/>
  <Composition id="05-Focus-Demo" component={FocusDemo} width={1920} height={1080} fps={30} durationInFrames={240} defaultProps={{title:'DON’T SKIP THE CHECK.',takeaway:'A confident answer still needs a source.',screenshotSrc:'',focusX:428,focusY:579,focusWidth:1300,focusHeight:116}}/>
 </Folder>
 <Composition id="One-Useful-Task" component={StoryProof} width={1920} height={1080} fps={30} durationInFrames={540}/>
 <Folder name="Editable-scenes">
  <Composition id="The-Request" component={Opening} width={1920} height={1080} fps={30} durationInFrames={108}/>
  <Composition id="Add-Context" component={Context} width={1920} height={1080} fps={30} durationInFrames={132}/>
  <Composition id="Check-The-Plan" component={Comparison} width={1920} height={1080} fps={30} durationInFrames={210}/>
  <Composition id="The-Takeaway" component={Closing} width={1920} height={1080} fps={30} durationInFrames={90}/>
 </Folder>
</>;
registerRoot(Root);
