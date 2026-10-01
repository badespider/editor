import { z } from 'zod';
import { adaptScene, resolveSceneTemplate, scenePoseAt, type SceneLayer } from './scene-motion.ts';
import { preflightScene } from './scene-quality.ts';

export const sceneLayoutOptionsSchema=z.object({ minFontSize:z.number().finite().min(.02).max(.1).default(.04),
  maxLines:z.number().int().min(1).max(4).default(2), margin:z.number().finite().min(.02).max(.15).default(.05),
  lineGap:z.number().finite().min(1).max(1.6).default(1.1),
  layerIds:z.array(z.string().min(1).max(80)).max(48).optional(),
}).strict();
type Box={x:number;y:number;width:number;height:number};
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
/** Bounded deterministic title reflow. Geometry constraints precede real Canvas glyph fitting. */
export function reflowSceneLayout(rawRecipe:unknown,rawInput:unknown,rawOptions:unknown={}){
  const a=adaptScene(rawRecipe,rawInput),options=sceneLayoutOptionsSchema.parse(rawOptions),{width:W,height:H}=a.input;
  if(a.recipe.compositor!=='layered-v2')throw Error('Precision layout requires layered-v2');
  const changes:{shotId:string;layerId:string;dx:number;dy:number;maxLines:number}[]=[],unresolved:{shotId:string;layerId:string;reason:string}[]=[];
  const templates:typeof a.recipe.templates=[];
  for(const [index,shot] of a.input.shots.entries()){
    const original=a.recipe.templates.find(t=>t.id===shot.templateId)!,template=structuredClone(original);
    template.id=`layout-${index}`;templates.push(template);shot.templateId=template.id;
    const forbidden:Box[]=[...shot.framing.protectedRegions,...a.input.captions.filter(c=>c.start<shot.end&&c.end>shot.start).map(c=>c.box??a.recipe.caption.box)];
    const selected=template.layers.filter(l=>l.kind==='text'&&(options.layerIds?options.layerIds.includes(l.id):(l.font!.size>=.03)));
    for(const layer of template.layers.filter(l=>l.kind==='text'&&!selected.includes(l)))for(const p of [layer.pose,...layer.keys.map(k=>({...layer.pose,...k.pose}))])
      if(p.opacity>.1)forbidden.push({x:p.x-p.width/2,y:p.y-p.height/2,width:p.width,height:p.height});
    for(const layer of selected){
      if(layer.group){unresolved.push({shotId:shot.id,layerId:layer.id,reason:'Grouped text needs an explicit group-aware layout; left unchanged.'});continue;}
      const before=structuredClone(layer),minHeight=options.minFontSize*Math.min(W,H)/H*options.maxLines*options.lineGap*1.25;
      layer.font!.size=Math.max(options.minFontSize,layer.font!.size);
      layer.textLayout={maxLines:options.maxLines,minFontSize:options.minFontSize,lineGap:options.lineGap};
      const reshape=(pose:Partial<SceneLayer['pose']>)=>{if(pose.width!==undefined)pose.width=Math.min(pose.width,1-options.margin*2);
        if(pose.height!==undefined)pose.height=Math.max(pose.height,minHeight);};
      reshape(layer.pose);for(const k of layer.keys)reshape(k.pose);
      const resolved=resolveSceneTemplate(template,shot,a.input).layers.find(l=>l.id===layer.id)!;
      const samples=Array.from({length:Math.round((shot.end-shot.start)*30)},(_,f)=>scenePoseAt(resolved,f/30/(shot.end-shot.start))).filter(p=>p.opacity>.1&&p.reveal>.1);
      const envelopes=(dx:number,dy:number)=>samples.map(p=>{const r=p.rotation*Math.PI/180,w=Math.abs(Math.cos(r))*p.width+Math.abs(Math.sin(r))*p.height*H/W,h=Math.abs(Math.sin(r))*p.width*W/H+Math.abs(Math.cos(r))*p.height;
        return {x:p.x+dx-w/2,y:p.y+dy-h/2,width:w,height:h};});
      const candidates=[{dx:0,dy:0}];
      for(let y=options.margin;y<=1-options.margin;y+=.025)candidates.push({dx:.5-layer.pose.x,dy:y-layer.pose.y});
      candidates.sort((p,q)=>Math.hypot(p.dx,p.dy)-Math.hypot(q.dx,q.dy));
      const chosen=candidates.find(c=>envelopes(c.dx,c.dy).every(b=>b.x>=options.margin&&b.y>=options.margin&&b.x+b.width<=1-options.margin&&b.y+b.height<=1-options.margin&&!forbidden.some(p=>overlaps(b,p))));
      if(!chosen){Object.assign(layer,before);delete layer.textLayout;if(before.textLayout)layer.textLayout=before.textLayout;
        unresolved.push({shotId:shot.id,layerId:layer.id,reason:'No safe readable title placement; inspect and author a different layout.'});continue;}
      const shift=(p:Partial<SceneLayer['pose']>)=>{if(p.x!==undefined)p.x+=chosen.dx;if(p.y!==undefined)p.y+=chosen.dy;};
      shift(layer.pose);for(const key of layer.keys){shift(key.pose);if(key.path){key.path.x1+=chosen.dx;key.path.x2+=chosen.dx;key.path.y1+=chosen.dy;key.path.y2+=chosen.dy;}}
      forbidden.push(...envelopes(chosen.dx,chosen.dy));changes.push({shotId:shot.id,layerId:layer.id,...chosen,maxLines:options.maxLines});
    }
  }
  if(options.layerIds?.some(id=>!a.recipe.templates.some(t=>t.layers.some(l=>l.id===id&&l.kind==='text'))))throw Error('Unknown/non-text layout layer ID');
  a.recipe.templates=templates;
  const result=adaptScene(a.recipe,a.input);
  return {recipe:result.recipe,input:result.input,report:{changes,unresolved,status:unresolved.length?'needs_layout_decision':'geometry_ready_for_glyph_and_render_checks',
    limitation:'Uses conservative boxes and supplied protected regions. Actual font metrics are checked by the renderer; no automatic subject detection.',safeToAutoPublish:false},preflight:preflightScene(result)};
}
