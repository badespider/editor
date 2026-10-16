/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { z } from "zod";
import { getMotionMoment, motionMoments } from "./motion-catalog.ts";
import { getMotionContentExample, resolveMotionContent } from "./motion-content.ts";

const finite = z.number().finite();
const key = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/);
const time = finite.min(0).max(120);
const box = z.object({x:finite.min(0),y:finite.min(0),width:finite.min(32).max(1920),height:finite.min(32).max(1920)}).strict();
const instance = z.object({
  key,presetId:z.string().min(1).max(80),start:time,end:time,
  box,fontSize:finite.min(8).max(128).optional(),content:z.record(z.string(),z.unknown()).optional(),
}).strict();
/** A mix is data only. Its ordered instances use curated native component adapters. */
export const motionMixSchema = z.object({
  schemaVersion:z.literal(1),format:z.enum(["landscape","portrait"]),duration:time.positive(),
  theme:z.enum(["paper","dark"]).optional(),motion:z.enum(["full","reduced"]).optional(),
  fontFamily:z.string().trim().min(1).max(120).regex(/^[^\u0000-\u001f\u007f]+$/).optional(),
  sceneKey:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/).optional(),instances:z.array(instance).min(1).max(24),
}).strict();
export type MotionMixInput = z.input<typeof motionMixSchema>;
export type MotionMixInstance = MotionMixInput["instances"][number];

function frame(value:number):number { return Math.round(value*30); }
function freeze<T>(value:T):T {
  if(value && typeof value==="object"){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
}

function normalize(input:unknown){
  const parsed=motionMixSchema.parse(input),durationFrames=frame(parsed.duration);
  if(durationFrames<1)throw new RangeError("Mix duration must occupy at least one canonical frame");
  const canvas=parsed.format==="portrait"?{width:1080,height:1920,fps:30}:{width:1920,height:1080,fps:30};
  const seen=new Set<string>();
  const instances=parsed.instances.map((item,index)=>{
    if(seen.has(item.key))throw new RangeError(`Duplicate mix instance key: ${item.key}`);
    seen.add(item.key);
    const descriptor=getMotionMoment(item.presetId);
    if(!descriptor.mixable)throw new RangeError(`${descriptor.id} has no native mix adapter; choose a mixable catalog entry`);
    if(!descriptor.formats.includes(parsed.format))throw new RangeError(`${descriptor.id} does not support ${parsed.format}`);
    const startFrames=frame(item.start),endFrames=frame(item.end);
    if(endFrames<=startFrames || endFrames>durationFrames)throw new RangeError(`${item.key} must have a positive lifetime inside the mix`);
    if(item.box.x+item.box.width>canvas.width || item.box.y+item.box.height>canvas.height)throw new RangeError(`${item.key} box must fit inside the ${parsed.format} canvas`);
    if((descriptor.id==="chart-bars" || descriptor.id==="metric-card") && (item.box.width<480 || item.box.height<480))throw new RangeError(`${item.key} data graphic requires width and height at least 480`);
    const content=resolveMotionContent([descriptor.id],item.content===undefined?undefined:{[descriptor.id]:item.content})[descriptor.id];
    if(descriptor.id==="counter-reveal"){
      const values=content.values as readonly (string|number)[];
      const intervals=(content.stepDurations as readonly number[]|undefined)??Array.from({length:values.length-1},()=>content.stepDuration as number|undefined??.2);
      const hold=frame(content.minHold as number|undefined??1);
      const reveal=parsed.motion!=="reduced" && values.length>1?frame(content.revealDuration as number|undefined??4/30):0;
      if(intervals.reduce((sum,value)=>sum+frame(value),0)+reveal+hold>endFrames-startFrames)throw new RangeError(`${item.key} counter steps and final hold do not fit its lifetime`);
      const columns=Math.max(...values.map(value=>String(value).length)),gap=content.cellGap as number|undefined??0;
      const aligned=values.map(value=>String(value).padStart(columns," "));
      let runs=0;
      for(let row=0;row<aligned.length;row++)for(let column=0;column<columns;column++)if(aligned[row][column]!==" " && (row===0 || aligned[row][column]!==aligned[row-1][column]))runs++;
      if(runs>512)throw new RangeError(`${item.key} exceeds 512 editable counter glyph runs`);
      const cellWidth=(item.box.width-gap*(columns-1))/columns,rowHeight=content.rowHeight as number|undefined??item.box.height*.5;
      if(cellWidth<16 || rowHeight>item.box.height)throw new RangeError(`${item.key} counter cells and row must fit their clipping box`);
      const fitFont=Math.min(cellWidth/(1.2*(content.glyphScaleX as number|undefined??1)),rowHeight/(1.4*(content.glyphScaleY as number|undefined??1)),2048);
      const font=content.fontSize as number|undefined??item.fontSize??fitFont;
      if(font<8 || font>fitFont+.000001)throw new RangeError(`${item.key} counter font exceeds its conservative cell budget`);
      if(content.echo && typeof content.echo==="object"){
        const echo=content.echo as {offsetX?:number;offsetY?:number};
        if(Math.abs(echo.offsetX??0)>item.box.width || Math.abs(echo.offsetY??0)>item.box.height)throw new RangeError(`${item.key} echo offset exceeds its box dimensions`);
      }
    }
    return {...item,presetId:descriptor.id,start:startFrames/30,end:endFrames/30,content,presetVersion:descriptor.version,stackIndex:index};
  });
  return {schemaVersion:1 as const,format:parsed.format,canvas,duration:durationFrames/30,theme:parsed.theme??"paper",motion:parsed.motion??"full",
    fontFamily:parsed.fontFamily??"Arial",sceneKey:parsed.sceneKey??"native-motion-mix",instances};
}

/** Describes the exact bounded native composition. No app, model, source upload or code runs. */
export function buildMotionMixBrief(input:unknown){
  const normalized=normalize(input);
  return freeze({...normalized,kind:"editor-native-motion-mix" as const,mountable:true as const,externalCalls:0 as const,
    stackOrder:"instances are drawn bottom to top in array order" as const,
    instructions:["reference/motion-recipes.md","reference/jsx/counter-reveal.md","reference/motion-catalog.md"],
    skillReadArgs:["editor-motion-recipes","editor-motion-graphics","editor-review"].map(id=>["playbook","skill",id]),
    limitations:["Boxes clip their native component; overlapping foreground layers can obscure earlier content.",
      "Supplied numbers, sources and claims remain caller-authored; schema validation does not verify them.",
      "Render, inspect at delivery size, and check offset/reverse seeks and reload before delivery."]});
}
export type MotionMixBrief=ReturnType<typeof buildMotionMixBrief>;

/** Compile trusted catalog adapters around JSON data; caller wording never becomes code. */
export function buildMotionMixModule(input:unknown):string {
  const brief=buildMotionMixBrief(input);
  const data=JSON.stringify(brief);
  return `import { Rect, CounterReveal, Backdrop, SourceCard, DataBars, MetricCard, PRESENTATION_THEMES } from "dapi-host:@diffusionstudio/jsx";
const data = ${data};
export const motionMixManifest = data;
export default function Project() {
 const base=data.theme==="dark"?PRESENTATION_THEMES.education.technical:PRESENTATION_THEMES.education.classroom;
 const theme={...base,fontFamily:data.fontFamily};
 const docTheme={background:theme.background,surface:theme.surface,text:theme.text,muted:theme.muted,accent:theme.accent,fontFamily:theme.fontFamily};
 const nodes=data.instances.map(item=>{
  const c=item.content, duration=item.end-item.start;
  const props={x:0,y:0,width:item.box.width,height:item.box.height,start:"0f",end:Math.round(duration*30)+"f",theme,animate:data.motion!=="reduced",fontSize:item.fontSize??24};
  let child;
  if(item.presetId==="counter-reveal"){
   const counter={x:0,y:0,width:item.box.width,height:item.box.height,start:props.start,end:props.end,animate:props.animate,...c,key:item.key+"-counter",name:item.key+" / Counter reveal",fontFamily:data.fontFamily};
   if(item.fontSize!==undefined && c.fontSize===undefined)counter.fontSize=item.fontSize;
   if(c.fontSize===undefined && item.fontSize===undefined)delete counter.fontSize;
   child=CounterReveal(counter);
  } else if(item.presetId.startsWith("background-"))child=Backdrop({...props,...c,kind:item.presetId.slice(11)});
  else if(item.presetId==="overlay-source")child=SourceCard({...props,...c,theme:docTheme});
  else if(item.presetId==="chart-bars")child=DataBars({...props,...c});
  else if(item.presetId==="metric-card")child=MetricCard({...props,...c});
  else throw new Error("No curated mix adapter for "+item.presetId);
  return Rect({key:item.key,name:"Mix / "+item.key,x:item.box.x,y:item.box.y,width:item.box.width,height:item.box.height,start:Math.round(item.start*30)+"f",end:Math.round(item.end*30)+"f",clipToBox:true,children:child});
 });
 return Rect({name:"Native motion recipe mix",scene:data.sceneKey,width:data.canvas.width,height:data.canvas.height,start:"0f",end:Math.round(data.duration*30)+"f",fill:theme.background,children:nodes});
}
`;
}

/** Fresh, original example values. It demonstrates composition, not a real measured history. */
export function getMotionMixExample(format:"landscape"|"portrait"="landscape"):MotionMixInput {
  if(format!=="landscape" && format!=="portrait")throw new TypeError("Choose landscape or portrait");
  const portrait=format==="portrait",width=portrait?1080:1920,height=portrait?1920:1080;
  return {
    schemaVersion:1,format,duration:8,theme:"paper",motion:"full",fontFamily:"Arial",
    instances:[
      {key:"foundation",presetId:"background-grid",start:0,end:8,box:{x:0,y:0,width,height},content:{seed:7,spacing:96,strength:.07}},
      {key:"year",presetId:"counter-reveal",start:0,end:8,box:portrait?{x:72,y:120,width:936,height:500}:{x:96,y:80,width:1728,height:360},content:getMotionContentExample("counter-reveal")},
      {key:"comparison",presetId:"chart-bars",start:1,end:8,box:portrait?{x:72,y:650,width:936,height:760}:{x:96,y:500,width:1056,height:480},fontSize:24,
        content:{title:"Illustrative comparison",data:[{label:"Before",value:20},{label:"After",value:70}],valueDomain:[0,100],baseline:0,unit:"units",disclosure:{kind:"illustrative",text:"Authored sample data"}}},
      {key:"context",presetId:"overlay-source",start:2,end:8,box:portrait?{x:72,y:1450,width:936,height:400}:{x:1248,y:540,width:576,height:420},fontSize:20,
        content:{title:"Pattern, then remix",source:"Original editable example",detail:"Change values, boxes, colors and timing."}},
    ],
  };
}

/** Discovery uses the existing registry; this is not a separately maintained preset catalog. */
export function mixableMotionMoments(){ return motionMoments.filter(item=>item.mixable); }
