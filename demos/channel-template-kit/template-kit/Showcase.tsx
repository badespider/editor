import React from 'react';
import {Series,useVideoConfig} from 'remotion';
import {PaperNotes} from './PaperNotes';
import {BoldType} from './BoldType';
import {Blueprint} from './Blueprint';
import {SideBySide} from './SideBySide';
import {FocusDemo} from './FocusDemo';

export const FiveWays=()=>{
 const {fps}=useVideoConfig();
 return <Series>
  <Series.Sequence name="01 / Paper Notes — personal example" durationInFrames={8*fps} premountFor={fps}>
   <PaperNotes premountFor={fps} headline="START WITH" emphasis="YOUR DAY." noteTitle="One useful task." constraint="I get home at 7 PM. I have one free hour." action="Plan that hour first." takeaway="The best first project is already in your life."/>
  </Series.Sequence>
  <Series.Sequence name="02 / Bold Type — a sharp reframe" durationInFrames={7*fps} premountFor={fps}>
   <BoldType premountFor={fps} oldIdea="MORE TOOLS." newIdea="BETTER QUESTIONS." support="Start with the problem. Then choose the tool."/>
  </Series.Sequence>
  <Series.Sequence name="03 / Blueprint — how it works" durationInFrames={8*fps} premountFor={fps}>
   <Blueprint premountFor={fps} title="BUILD A SMALL FEEDBACK LOOP." stepOne="Define the task" stepTwo="Try one version" stepThree="Check the result" takeaway="Repeat the loop. Keep what actually helps."/>
  </Series.Sequence>
  <Series.Sequence name="04 / Side-by-Side — evaluate the difference" durationInFrames={8*fps} premountFor={fps}>
   <SideBySide premountFor={fps} title="SAME TOOL. DIFFERENT BRIEF." leftTitle="A vague request" rightTitle="A useful brief" leftTask="“Make me a study plan.”" rightTask="“Plan one hour of practice.”" leftContext={'No schedule. No subject.\nNo clear target.'} rightContext={'After 7 PM. Networking.\nOne practice lab.'} takeaway="Specific context makes the answer easier to judge."/>
  </Series.Sequence>
  <Series.Sequence name="05 / Focus Demo — show exactly where to look" durationInFrames={8*fps} premountFor={fps}>
   <FocusDemo premountFor={fps} title="DON’T SKIP THE CHECK." takeaway="A confident answer still needs a source." screenshotSrc="" focusX={428} focusY={579} focusWidth={1300} focusHeight={116}/>
  </Series.Sequence>
 </Series>;
};
