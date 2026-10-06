import {Interactive} from 'remotion';
import {Camera,Enter,Eyebrow,Rule,SceneFrame,Title,type SceneProps} from './shared';
function HookInner({scene,paths,style}:SceneProps){
  if(scene.section.kind!=='hook')throw Error('Hook section required');
  const p=scene.layout==='portrait';
  return <SceneFrame scene={scene} style={style}>
    <Camera scene={scene} paths={paths}/>
    <div style={{position:'absolute',left:p?86:96,top:p?883:267,width:p?864:850}}>
      <Eyebrow>THE STARTING POINT</Eyebrow>
      <Enter at={.03} style={{marginTop:p?36:48}}><Title portrait={p} style={{fontSize:p?96:122,maxHeight:390,lineHeight:1.03,letterSpacing:-5}}>{scene.section.headline}</Title></Enter>
      <Rule at={.22} width={130} style={{marginTop:38}}/>
    </div>
  </SceneFrame>;
}
export const Hook=Interactive.withSchema({Component:HookInner,componentName:'<ChannelHook>',schema:{'scene.brand':{type:'text-content',default:'YOUR CHANNEL',description:'Channel name'}},wrapInSequence:true});
