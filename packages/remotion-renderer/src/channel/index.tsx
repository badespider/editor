import {useVideoConfig} from 'remotion';
import type {SceneProps} from './shared';
import {Hook} from './hook';
import {Roadmap} from './roadmap';
import {Explanation} from './explanation';
import {Demonstration} from './demonstration';
import {Comparison} from './comparison';
import {NextStep} from './next-step';
export {Hook,Roadmap,Explanation,Demonstration,Comparison,NextStep};
/** Intentionally data-controlled template instances, each backed by a connected scene. */
export function ChannelSceneView(props:SceneProps){
  const {fps}=useVideoConfig();
  switch(props.scene.section.kind){
    case 'hook':return <Hook {...props} premountFor={fps}/>;
    case 'roadmap':return <Roadmap {...props} premountFor={fps}/>;
    case 'explanation':return <Explanation {...props} premountFor={fps}/>;
    case 'demonstration':return <Demonstration {...props} premountFor={fps}/>;
    case 'comparison':return <Comparison {...props} premountFor={fps}/>;
    case 'next-step':return <NextStep {...props} premountFor={fps}/>;
  }
}
