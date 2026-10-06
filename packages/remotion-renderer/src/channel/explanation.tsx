import {Interactive,useCurrentFrame,useVideoConfig} from 'remotion';
import {C,Camera,Enter,Heading,progress,SceneFrame,type SceneProps} from './shared';
function ExplanationInner({scene,paths,style}:SceneProps){
  const f=useCurrentFrame(),{fps}=useVideoConfig();
  if(scene.section.kind!=='explanation')throw Error('Explanation section required');
  const p=scene.layout==='portrait';
  const left=p?86:762,top=p?808:366,width=p?864:1062;
  return <SceneFrame scene={scene} style={style}><Heading portrait={p}>{scene.section.headline}</Heading><Camera scene={scene} paths={paths}/>
    <div style={{position:'absolute',left,top,width,height:p?474:460}}>
      {scene.section.nodes.map((label,i)=>{
        const result=i===2,w=result?width:Math.floor((width-76)/2),x=i===1?(width+76)/2:0,y=result?(p?265:269):0;
        return <Enter key={i} at={i===2?1.35:.2+i*.35} style={{position:'absolute',left:x,top:y,width:w,height:result?(p?170:174):174,
          boxSizing:'border-box',padding:'28px 30px',border:`1px solid ${result?C.cyan:C.line}`,borderRadius:12,
          background:result?'#153D4B':C.paper,boxShadow:'0 14px 34px #00000024'}}>
          <div style={{fontSize:18,letterSpacing:2,color:result?C.cyan:C.muted,fontWeight:700}}>{result?'OUTPUT':`INPUT 0${i+1}`}</div>
          <div data-text-box style={{fontSize:p?39:46,letterSpacing:-1,fontWeight:700,marginTop:17}}>{label}</div>
          {result&&<svg width="36" height="36" viewBox="0 0 40 40" style={{position:'absolute',right:28,top:30}}><path d="m8 21 8 8 16-18" fill="none" stroke={C.cyan} strokeWidth="2.5" strokeDasharray="50" strokeDashoffset={50*(1-progress(f,fps,1.65,.4))}/></svg>}
        </Enter>;
      })}
      <div style={{position:'absolute',left:width/2-18,top:62,fontSize:43,color:C.cyan,opacity:progress(f,fps,.4)}}>+</div>
      <svg width={width} height="98" viewBox={`0 0 ${width} 98`} style={{position:'absolute',top:174,left:0}} fill="none" stroke={C.cyan} strokeWidth="2">
        <path d={`M${width*.22} 0V40Q${width*.22} 48 ${width*.22+8} 48H${width*.78-8}Q${width*.78} 48 ${width*.78} 40V0M${width/2} 48V88m-7-8 7 8 7-8`}
          pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress(f,fps,.85,.65)}/>
      </svg>
    </div>
  </SceneFrame>;
}
export const Explanation=Interactive.withSchema({Component:ExplanationInner,componentName:'<ChannelExplanation>',schema:{'scene.brand':{type:'text-content',default:'YOUR CHANNEL',description:'Channel name'}},wrapInSequence:true});
