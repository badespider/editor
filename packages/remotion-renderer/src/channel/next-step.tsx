import {Interactive,useCurrentFrame,useVideoConfig} from 'remotion';
import {C,Enter,Eyebrow,progress,Rule,SceneFrame,Title,type SceneProps} from './shared';
function NextStepInner({scene,style}:SceneProps){
  const f=useCurrentFrame(),{fps}=useVideoConfig();
  if(scene.section.kind!=='next-step')throw Error('Next step section required');
  const p=scene.layout==='portrait';
  return <SceneFrame scene={scene} style={style}>
    <div style={{position:'absolute',left:p?86:96,top:p?260:241,width:p?864:1040}}>
      <Eyebrow>YOUR NEXT STEP</Eyebrow>
      <Enter at={.05} style={{marginTop:46}}><Title portrait={p} style={{fontSize:p?104:124,maxHeight:400,lineHeight:1.03,letterSpacing:-5}}>{scene.section.action}</Title></Enter>
      <Rule at={.28} width={136} style={{marginTop:46}}/>
      {scene.section.pdf&&<Enter at={.5} style={{marginTop:40,fontSize:p?35:37,lineHeight:1.2,color:C.cyan}}>Download: {scene.section.pdf.label}</Enter>}
    </div>
    <Enter at={.15} style={{position:'absolute',left:p?300:1368,top:p?1014:375,width:p?352:340,height:p?246:262,borderRadius:18,border:`1px solid ${C.line}`,
      background:C.paper,boxShadow:'0 22px 70px #00000035',rotate:'-3deg'}}>
      <svg width="100%" height="100%" viewBox="0 0 340 262" fill="none">
        <rect x="28" y="27" width="284" height="208" rx="9" stroke={C.line}/>
        <rect x="68" y="78" width="76" height="76" rx="10" fill="#193B49" stroke={C.cyan} strokeWidth="2"/>
        <path d="m87 114 15 16 31-35" stroke={C.cyan} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress(f,fps,.55,.5)}/>
        <path d="M174 95h90M174 121h60M70 187h194" stroke={C.muted} strokeWidth="3" strokeLinecap="round" opacity=".5"/>
      </svg>
    </Enter>
  </SceneFrame>;
}
export const NextStep=Interactive.withSchema({Component:NextStepInner,componentName:'<ChannelNextStep>',schema:{'scene.brand':{type:'text-content',default:'YOUR CHANNEL',description:'Channel name'}},wrapInSequence:true});
