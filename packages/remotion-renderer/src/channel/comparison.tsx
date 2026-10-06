import {Interactive} from 'remotion';
import {C,Enter,Heading,Icon,SceneFrame,type SceneProps} from './shared';
function ComparisonInner({scene,style}:SceneProps){
  if(scene.section.kind!=='comparison')throw Error('Comparison section required');
  const p=scene.layout==='portrait',count=scene.section.options.length,width=p?864:(1728-28*(count-1))/count;
  return <SceneFrame scene={scene} style={style}><Heading portrait={p}>{scene.section.headline}</Heading>
    {scene.section.options.map((option,i)=><Enter key={i} at={.08+i*.14} style={{position:'absolute',left:p?86:96+i*(width+28),top:p?409+i*294:342,
      width,height:p?268:536,boxSizing:'border-box',border:`1px solid ${C.line}`,borderRadius:14,background:C.paper,boxShadow:'0 18px 40px #00000025',padding:p?'25px 30px':'30px 34px'}}>
      <div style={{display:'flex',alignItems:'center',gap:18}}><Icon kind={i} size={p?43:52}/><div data-text-box style={{fontSize:p?38:39,fontWeight:700,letterSpacing:-1}}>{option.name}</div></div>
      <div style={{height:1,background:C.line,marginTop:p?17:24,marginBottom:p?18:26}}/>
      {[['Skills',option.skills],['Work involved',option.work],['First project',option.firstProject]].map(([label,value],j)=><div key={label}
        style={{display:p?'flex':'block',gap:12,marginTop:j?(p?12:24):0,alignItems:'baseline'}}>
        <div style={{fontSize:p?24:18,color:C.muted,letterSpacing:p?0:2,width:p?216:undefined,flexShrink:0}}>{p?label:label.toUpperCase()}</div>
        <div data-text-box style={{fontSize:p?29:33,lineHeight:1.2,color:j===2?C.cyan:C.white,marginTop:p?0:9}}>{value}</div>
      </div>)}
    </Enter>)}
  </SceneFrame>;
}
export const Comparison=Interactive.withSchema({Component:ComparisonInner,componentName:'<ChannelComparison>',schema:{'scene.brand':{type:'text-content',default:'YOUR CHANNEL',description:'Channel name'}},wrapInSequence:true});
