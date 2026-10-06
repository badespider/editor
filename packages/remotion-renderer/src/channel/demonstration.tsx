import {Interactive,OffthreadVideo,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';
import {channelMediaBoxes} from '../../../editing-playbook/src/channel-contract.ts';
import {C,Camera,Enter,Heading,pixelBox,progress,SceneFrame,type SceneProps} from './shared';
function DemonstrationInner({scene,paths,style}:SceneProps){
  const f=useCurrentFrame(),{fps}=useVideoConfig();
  if(scene.section.kind!=='demonstration')throw Error('Demonstration section required');
  const p=scene.layout==='portrait',section=scene.section,b=channelMediaBoxes(scene.layout,section.kind).screen!;
  const active=progress(f,fps,section.highlightAt,.4),h=section.highlight;
  const aspect=scene.mode==='layout-demo'?b.width/b.height:scene.screenAspectRatio;
  const w=Math.min(b.width,b.height*aspect),height=w/aspect;
  const focus={x:b.x+(b.width-w)/2+h.x*w,y:b.y+(b.height-height)/2+h.y*height,width:h.width*w,height:h.height*height};
  return <SceneFrame scene={scene} style={style}><Heading portrait={p}>{section.headline}</Heading>
    <div data-slot="screen" style={{...pixelBox(b),borderRadius:14,border:`1px solid ${C.line}`,background:'#0C1C29',overflow:'hidden',boxShadow:'0 25px 70px #00000035'}}>
      {scene.mode==='footage'?<OffthreadVideo src={staticFile(paths!.screen)} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<>
        <div style={{height:64,borderBottom:`1px solid ${C.line}`,display:'flex',alignItems:'center',padding:'0 30px',gap:10,background:'#193344'}}>
          {[0,1,2].map(i=><span key={i} style={{height:8,width:8,borderRadius:10,background:'#668392'}}/>)}
          <span style={{marginLeft:24,color:C.muted,fontSize:p?19:20,letterSpacing:2}}>SAMPLE WORKSPACE · REPLACE WITH CAPTURE</span>
        </div>
        <div style={{position:'absolute',left:p?42:h.x*b.width,right:p?42:80,top:p?114:101}}>
          <div style={{fontSize:p?42:43,fontWeight:700,letterSpacing:-1}}>Make it specific.</div>
          <div style={{fontSize:p?27:26,color:C.muted,marginTop:10}}>A simple example, not a real app recording.</div>
        </div>
        {['01    Choose one useful task','02    Add your own context','03    Review the answer'].map((line,i)=><Enter key={i} at={.18+i*.13}
          style={{position:'absolute',left:`${h.x*100}%`,top:`${(h.y+(i-1)*.17)*100}%`,width:`${h.width*100}%`,height:`${h.height*100}%`,
            padding:p?'0 26px':'0 34px',boxSizing:'border-box',display:'flex',alignItems:'center',borderRadius:7,
            background:i===1?'#23404D':'#162D3D',color:i===1?C.white:C.muted,fontSize:p?29:31}}>{line}</Enter>)}
      </>}
    </div>
    <div style={{...pixelBox(focus),border:`3px solid ${C.cyan}`,boxSizing:'border-box',borderRadius:8,opacity:active,
      boxShadow:`0 0 0 7px rgba(87,220,236,${active*.1})`}}/>
    <Enter at={section.highlightAt+.1} style={{position:'absolute',left:p?86:100,top:p?1266:912,width:p?550:1120,color:C.cyan,fontSize:p?34:30,lineHeight:1.18,
      display:'flex',gap:18,alignItems:'center'}}><span style={{fontSize:38}}>↳</span><span data-text-box>{section.focusLabel}</span></Enter>
    <Camera scene={scene} paths={paths} small/>
  </SceneFrame>;
}
export const Demonstration=Interactive.withSchema({Component:DemonstrationInner,componentName:'<ChannelDemonstration>',schema:{'scene.brand':{type:'text-content',default:'YOUR CHANNEL',description:'Channel name'}},wrapInSequence:true});
