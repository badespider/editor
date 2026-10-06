import {Interactive,useCurrentFrame,useVideoConfig} from 'remotion';
import {C,Enter,Heading,Icon,progress,SceneFrame,type SceneProps} from './shared';
function RoadmapInner({scene,style}:SceneProps){
  const f=useCurrentFrame(),{fps}=useVideoConfig();
  if(scene.section.kind!=='roadmap')throw Error('Roadmap section required');
  const p=scene.layout==='portrait',steps=scene.section.steps;
  return <SceneFrame scene={scene} style={style}><Heading portrait={p}>{scene.section.headline}</Heading>
    {steps.map((s,i)=>{const active=progress(f,fps,s.activateAt),x=p?86:96+i*596,y=p?430+i*278:396;
      const width=p?864:536,height=p?232:408;
      return <div key={i}>
        {i<2&&<div style={{position:'absolute',left:p?132:x+width,top:p?y+height:y+63,width:p?3:60,height:p?46:3,background:C.line}}>
          <div style={{width:'100%',height:'100%',background:C.cyan,transformOrigin:p?'top':'left',scale:p?`1 ${progress(f,fps,steps[i+1].activateAt,.55)}`:`${progress(f,fps,steps[i+1].activateAt,.55)} 1`}}/>
        </div>}
        <Enter at={i*.1} style={{position:'absolute',left:x,top:y,width,height,borderRadius:14,background:C.paper,border:`1px solid ${C.line}`,boxShadow:'0 18px 38px #00000024'}}>
          <div style={{position:'absolute',inset:-1,borderRadius:14,border:`2px solid ${C.cyan}`,opacity:active*.8,background:`rgba(87,220,236,${active*.035})`}}/>
          <div style={{position:'absolute',left:28,top:30,width:68,height:68,borderRadius:36,background:active>.5?C.cyan:'#263E4F',color:active>.5?C.navy:C.muted,
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:27,fontWeight:700}}>{String(i+1).padStart(2,'0')}</div>
          {!p&&<div style={{position:'absolute',right:32,top:35,opacity:.4+active*.6}}><Icon kind={i}/></div>}
          <div style={{position:'absolute',left:p?132:34,top:p?37:154,right:28}}>
            <div data-text-box style={{fontSize:p?51:58,fontWeight:700,letterSpacing:-2}}>{s.title}</div>
            <div data-text-box style={{marginTop:20,fontSize:p?33:32,lineHeight:1.25,color:C.muted}}>{s.detail}</div>
          </div>
          <div style={{position:'absolute',bottom:p?20:25,left:p?132:34,right:34,height:2,background:C.line}}><div style={{height:2,width:`${active*100}%`,background:C.cyan}}/></div>
        </Enter>
      </div>;})}
  </SceneFrame>;
}
export const Roadmap=Interactive.withSchema({Component:RoadmapInner,componentName:'<ChannelRoadmap>',schema:{'scene.brand':{type:'text-content',default:'YOUR CHANNEL',description:'Channel name'}},wrapInSequence:true});
