import {Composition,Folder} from 'remotion';
import type {RemotionPayload} from '../payload';
import {Hook,Roadmap,Explanation,Demonstration,Comparison,NextStep} from './index';

/** Register the exact scene references used by the main composition for Studio editing. */
export function ChannelConnectedScenes({data}:{data:RemotionPayload}){
  const byKind=(kind:string)=>{
    const shot=data.shots.find(s=>s.template.channel?.section.kind===kind);
    if(!shot?.template.channel)throw Error('Connected scene demo requires all six section kinds');
    return {scene:shot.template.channel,paths:shot.paths};
  };
  return <Folder name="Channel-scenes">
    <Composition id="Channel-Hook" component={Hook} width={data.width} height={data.height} fps={data.fps} durationInFrames={180} defaultProps={byKind('hook')}/>
    <Composition id="Channel-Roadmap" component={Roadmap} width={data.width} height={data.height} fps={data.fps} durationInFrames={270} defaultProps={byKind('roadmap')}/>
    <Composition id="Channel-Explanation" component={Explanation} width={data.width} height={data.height} fps={data.fps} durationInFrames={210} defaultProps={byKind('explanation')}/>
    <Composition id="Channel-Demonstration" component={Demonstration} width={data.width} height={data.height} fps={data.fps} durationInFrames={240} defaultProps={byKind('demonstration')}/>
    <Composition id="Channel-Comparison" component={Comparison} width={data.width} height={data.height} fps={data.fps} durationInFrames={270} defaultProps={byKind('comparison')}/>
    <Composition id="Channel-Next-Step" component={NextStep} width={data.width} height={data.height} fps={data.fps} durationInFrames={180} defaultProps={byKind('next-step')}/>
  </Folder>;
}
