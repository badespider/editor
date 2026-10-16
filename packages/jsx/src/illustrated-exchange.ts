/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Group, Path, Text } from "./elements";
import { educationFrames, educationNumber, eduTime } from "./education-core";
import type { Animatable, Keyframe, Time } from "./types";
import type { VectorPathCommand } from "./vector-path";

type BoxProps = Readonly<{key?:string;name?:string;x?:number;y?:number;width?:number;height?:number;start?:Time;end?:Time;duration?:Time}>;
export type IllustratedPersonProps = BoxProps & Readonly<{
  appearance?:"ponytail"|"short"; facing?:"left"|"right";
  outlineColor?:string; clothingColor?:string; hairColor?:string; skinColor?:string;
  gestureStart?:Time; gestureDuration?:Time; animate?:boolean;
}>;
export type MoneyNoteProps = BoxProps & Readonly<{label?:string;color?:string;outlineColor?:string;fontFamily?:string}>;
export type GoodsBoxProps = BoxProps & Readonly<{label?:string;color?:string;outlineColor?:string;fontFamily?:string}>;
export type ExchangeDiagramProps = BoxProps & Readonly<{
  spentLabel?:string;earnedLabel?:string;moneyLabel?:string;goodsLabel?:string;
  /** Cycle holds objects between participants; handoff ends each object at its recipient. */
  presentation?:"cycle"|"handoff";
  transferStart?:Time;transferDuration?:Time;labelDelay?:Time;minHold?:Time;animate?:boolean;
  outlineColor?:string;clothingColor?:string;hairColor?:string;skinColor?:string;
  moneyColor?:string;goodsColor?:string;textColor?:string;fontFamily?:string;
}>;
type Box = Readonly<{x:number;y:number;width:number;height:number;startFrame:number;endFrame:number;frames:number}>;
export type ExchangeDiagramLayout = Box & Readonly<{
  transferFrame:number;transferFrames:number;labelFrame:number;holdFrames:number;animate:boolean;
  presentation:"cycle"|"handoff";
  spentLabel:string;earnedLabel:string;moneyLabel:string;goodsLabel:string;
  outlineColor:string;clothingColor:string;hairColor:string;skinColor:string;
  moneyColor:string;goodsColor:string;textColor:string;fontFamily:string;
}>;
const M=(x:number,y:number):VectorPathCommand=>({op:"M",x,y});
const L=(x:number,y:number):VectorPathCommand=>({op:"L",x,y});
const Q=(cx:number,cy:number,x:number,y:number):VectorPathCommand=>({op:"Q",cx,cy,x,y});
const C=(c1x:number,c1y:number,c2x:number,c2y:number,x:number,y:number):VectorPathCommand=>({op:"C",c1x,c1y,c2x,c2y,x,y});
const Z=():VectorPathCommand=>({op:"Z"});
function text(value:unknown,label:string,max:number):string {
  if(typeof value!=="string" || !value.trim() || value.length>max || /[\u0000-\u001f\u007f]/.test(value))throw new TypeError(`${label} needs 1..${max} single-line characters`);
  return value.trim();
}
function color(value:unknown,label:string):string {
  if(typeof value!=="string" || !/^#[\da-f]{6}$/i.test(value))throw new TypeError(`${label} must be a #RRGGBB color`);
  return value;
}
function checkKeys(props:object,allowed:readonly string[],label:string):void {
  if(!props || typeof props!=="object" || Array.isArray(props))throw new TypeError(`${label} props must be an object`);
  for(const key of Object.keys(props))if(!allowed.includes(key))throw new TypeError(`Unknown ${label} field: ${key}`);
}
const boxKeys=["key","name","x","y","width","height","start","end","duration"];
function box(props:BoxProps,label:string,width:number,height:number):Box {
  if(props.end!==undefined && props.duration!==undefined)throw new TypeError(`Use ${label}.end or duration, not both`);
  if(props.key!==undefined)text(props.key,`${label}.key`,120);
  if(props.name!==undefined)text(props.name,`${label}.name`,160);
  const startFrame=educationFrames(props.start??0,`${label}.start`);
  const frames=props.end===undefined?educationFrames(props.duration??7,`${label}.duration`,true):educationFrames(props.end,`${label}.end`)-startFrame;
  if(frames<1 || startFrame+frames>108000)throw new RangeError(`${label} needs a positive lifetime within 108000 frames`);
  const w=educationNumber(props.width??width,`${label}.width`,32,4096),h=educationNumber(props.height??height,`${label}.height`,32,4096);
  if(w*h>8_388_608)throw new RangeError(`${label} box exceeds 8 megapixels`);
  return Object.freeze({x:educationNumber(props.x??0,`${label}.x`),y:educationNumber(props.y??0,`${label}.y`),width:w,height:h,startFrame,endFrame:startFrame+frames,frames});
}
function outline(name:string,commands:VectorPathCommand[],frames:number,strokeColor:string,fill?:string,strokeWidth=3):JSX.Element {
  // A control-point envelope conservatively contains every Bezier segment.
  // Translate commands into this actual local box so selection and culling
  // follow the mark, including negative elbow coordinates and large arrows.
  const xs:number[]=[],ys:number[]=[];
  for(const command of commands){
    if(command.op!=="Z"){xs.push(command.x);ys.push(command.y);}
    if(command.op==="Q"){xs.push(command.cx);ys.push(command.cy);}
    if(command.op==="C"){xs.push(command.c1x,command.c2x);ys.push(command.c1y,command.c2y);}
  }
  const padding=strokeWidth/2+.5,x=Math.min(...xs)-padding,y=Math.min(...ys)-padding;
  const width=Math.max(...xs)-x+padding,height=Math.max(...ys)-y+padding;
  const normalized=commands.map((command):VectorPathCommand=>{
    switch(command.op){
      case "Z":return {op:"Z"};
      case "M":case "L":return {...command,x:command.x-x,y:command.y-y};
      case "Q":return {...command,cx:command.cx-x,cy:command.cy-y,x:command.x-x,y:command.y-y};
      case "C":return {...command,c1x:command.c1x-x,c1y:command.c1y-y,c2x:command.c2x-x,c2y:command.c2y-y,x:command.x-x,y:command.y-y};
    }
  });
  return Path({name,x,y,width,height,commands:normalized,fillEnabled:fill!==undefined,fill:fill??"#000000",strokeColor,strokeWidth,strokeCap:"round",strokeJoin:"round",start:"0f",end:eduTime(frames)});
}
/** Fixed logical coordinates keep pivots stable when individual path bounds change. */
function fitGroup(props:BoxProps,d:Box,nativeWidth:number,nativeHeight:number,children:()=>JSX.Element[]):JSX.Element {
  const scale=Math.min(d.width/nativeWidth,d.height/nativeHeight);
  return Group({key:props.key,name:props.name,x:d.x,y:d.y,width:d.width,height:d.height,start:eduTime(d.startFrame),end:eduTime(d.endFrame),children:Group({name:"Illustration coordinates",x:(d.width-nativeWidth*scale)/2,y:(d.height-nativeHeight*scale)/2,width:nativeWidth,height:nativeHeight,anchorX:0,anchorY:0,scale,start:"0f",end:eduTime(d.frames),get children(){return children();}})});
}
function gesture(from:number,to:number,start:number,duration:number,animate:boolean):Animatable<number> {
  if(!animate)return to;
  const points:Keyframe<number>[]=[{time:"0f",value:from},{time:eduTime(start),value:from,easing:"easeInOut"},{time:eduTime(start+duration),value:to}];
  return points.filter((point,index,all)=>index===0 || point.time!==all[index-1].time);
}

/** Original line-art person. Shoulder and elbow groups remain separate native nodes. */
export function IllustratedPerson(props:IllustratedPersonProps):JSX.Element {
  const data=createMemo(()=>{
    checkKeys(props,[...boxKeys,"appearance","facing","outlineColor","clothingColor","hairColor","skinColor","gestureStart","gestureDuration","animate"],"IllustratedPerson");
    const d=box(props,"IllustratedPerson",270,420),appearance=props.appearance??"short",facing=props.facing??"left";
    if(appearance!=="short" && appearance!=="ponytail")throw new TypeError("IllustratedPerson.appearance must be ponytail or short");
    if(facing!=="left" && facing!=="right")throw new TypeError("IllustratedPerson.facing must be left or right");
    if(props.animate!==undefined && typeof props.animate!=="boolean")throw new TypeError("IllustratedPerson.animate must be boolean");
    const gestureFrame=educationFrames(props.gestureStart??.5,"gestureStart"),gestureFrames=educationFrames(props.gestureDuration??1.2,"gestureDuration",true);
    if(gestureFrame+gestureFrames>=d.frames)throw new RangeError("Person gesture must settle before the last frame");
    return {...d,appearance,facing,gestureFrame,gestureFrames,animate:props.animate!==false,outline:color(props.outlineColor??"#363B32","outlineColor"),clothing:color(props.clothingColor??"#C6C9B5","clothingColor"),hair:color(props.hairColor??"#C0C3AF","hairColor"),skin:color(props.skinColor??"#FBFBEA","skinColor")};
  });
  const d=data();
  return fitGroup({...props,name:props.name??"Illustrated person"},d,270,420,()=>{
    const part=(name:string,commands:VectorPathCommand[],fill?:string,width=3)=>outline(name,commands,d.frames,d.outline,fill,width);
    const nodes:JSX.Element[]=[];
    // Rear hair is created before the face; every mark is editable path data.
    if(d.appearance==="ponytail")nodes.push(part("Ponytail",[M(101,33),C(80,15,77,55,82,83),Q(80,92,91,90),L(106,82),Z()],d.hair));
    nodes.push(part("Hair silhouette",[M(102,74),C(85,56,94,14,116,10),C(142,1,169,26,164,54),Q(160,66,154,72),Z()],d.hair));
    nodes.push(part("Face",[M(106,35),C(111,44,125,38,139,31),Q(149,27,155,39),C(161,55,153,80,138,84),C(119,89,105,65,106,35),Z()],d.skin,2.7));
    nodes.push(part("Nose mark",d.facing==="right"?[M(151,57),L(148,60)]:[M(111,57),L(114,60)],undefined,1.5));
    const torso=d.appearance==="ponytail"?[M(99,102),Q(128,89,155,103),Q(170,128,157,166),Q(164,208,164,245),Q(132,265,91,245),Q(90,204,101,166),Q(111,137,99,102),Z()]:[M(99,103),Q(128,88,159,103),L(163,174),Q(130,181,93,173),Z()];
    nodes.push(part(d.appearance==="ponytail"?"Dress":"Vest",torso,d.clothing));
    nodes.push(part("Collar",d.appearance==="ponytail"?[M(117,97),Q(122,120,142,111),L(144,98)]:[M(107,99),L(119,128),Q(137,115,145,98)],d.skin,2.7));
    nodes.push(part("Waist seam",[M(101,166),Q(128,177,158,167)],undefined,2.7));
    for(const y of [132,149])nodes.push(part(`Button ${y}`,[M(145,y),C(139,y-5,138,y+5,143,y+5),C(148,y+6,150,y-2,145,y),Z()],d.outline,1));
    nodes.push(part("Left leg",[M(92,d.appearance==="ponytail"?245:173),L(91,410),L(82,416),L(93,416)],undefined,2.8));
    nodes.push(part("Right leg",[M(164,d.appearance==="ponytail"?245:174),L(163,410),L(172,416),L(162,416)],undefined,2.8));
    const inwardRight=d.facing==="right";
    // Separate upper arm and forearm clocks inherit the person clock exactly once.
    const right=Group({name:"Right shoulder pivot",x:159,y:103,width:80,height:62,anchorX:0,anchorY:0,rotation:inwardRight?gesture(25,0,d.gestureFrame,d.gestureFrames,d.animate):0,start:"0f",end:eduTime(d.frames),get children(){return inwardRight?[
      part("Right upper arm",[M(0,0),C(27,8,50,37,80,35)],undefined,3),
      Group({name:"Right elbow pivot",x:80,y:35,width:65,height:40,anchorX:0,anchorY:0,rotation:gesture(25,0,d.gestureFrame,d.gestureFrames,d.animate),start:"0f",end:eduTime(d.frames),get children(){return part("Right forearm and hand",[M(0,0),C(22,1,44,-30,65,-35)],undefined,2.7);}}),
    ]:[part("Right resting arm",[M(0,0),C(34,18,36,95,25,137)],undefined,2.7)];}});
    const left=Group({name:"Left shoulder pivot",x:19,y:103,width:80,height:62,anchorX:1,anchorY:0,rotation:!inwardRight?gesture(-25,0,d.gestureFrame,d.gestureFrames,d.animate):0,start:"0f",end:eduTime(d.frames),get children(){return !inwardRight?[
      part("Left upper arm",[M(80,0),C(53,8,30,37,0,35)],undefined,3),
      Group({name:"Left elbow pivot",x:-65,y:35,width:65,height:40,anchorX:1,anchorY:0,rotation:gesture(-25,0,d.gestureFrame,d.gestureFrames,d.animate),start:"0f",end:eduTime(d.frames),get children(){return part("Left forearm and hand",[M(65,0),C(43,1,21,-30,0,-35)],undefined,2.7);}}),
    ]:[part("Left resting arm",[M(80,0),C(40,18,33,95,53,137)],undefined,2.7)];}});
    nodes.push(left,right);return nodes;
  });
}

/** Three separately editable banknotes and their caller-supplied symbol. */
export function MoneyNote(props:MoneyNoteProps):JSX.Element {
  checkKeys(props,[...boxKeys,"label","color","outlineColor","fontFamily"],"MoneyNote");
  const d=box(props,"MoneyNote",100,78),fill=color(props.color??"#89D761","MoneyNote.color"),stroke=color(props.outlineColor??"#363B32","MoneyNote.outlineColor"),label=text(props.label??"$","MoneyNote.label",8),font=text(props.fontFamily??"Arial","MoneyNote.fontFamily",120);
  return fitGroup({...props,name:props.name??"Money note stack"},d,100,78,()=>{
    const nodes:JSX.Element[]=[];
    for(const [index,offset] of [14,7,0].entries())nodes.push(outline(`Banknote ${3-index}`,[M(4,40+offset),Q(35,12+offset,68,3+offset),L(96,27+offset),Q(62,39+offset,35,66+offset),Z()],d.frames,stroke,fill,2.5));
    nodes.push(Text({name:"Money symbol",x:36,y:16,width:39,height:39,rotation:-27,fontFamily:font,fontSize:Math.min(26,39/(Array.from(label).length*.8)),fontWeight:700,fill:stroke,textAlign:"center",textBaseline:"middle",start:"0f",end:eduTime(d.frames),children:label}));
    return nodes;
  });
}

/** Top, front and side are distinct native paths rather than a flattened image. */
export function GoodsBox(props:GoodsBoxProps):JSX.Element {
  checkKeys(props,[...boxKeys,"label","color","outlineColor","fontFamily"],"GoodsBox");
  const d=box(props,"GoodsBox",100,90),fill=color(props.color??"#DEB887","GoodsBox.color"),stroke=color(props.outlineColor??"#363B32","GoodsBox.outlineColor"),label=props.label===undefined?undefined:text(props.label,"GoodsBox.label",12),font=text(props.fontFamily??"Arial","GoodsBox.fontFamily",120);
  return fitGroup({...props,name:props.name??"Goods parcel"},d,100,90,()=>{
    const nodes=[outline("Parcel front",[M(5,20),L(58,26),L(58,85),L(7,75),Z()],d.frames,stroke,fill,2.7),outline("Parcel side",[M(58,26),L(96,15),L(95,71),L(58,85),Z()],d.frames,stroke,fill,2.7),outline("Parcel top",[M(5,20),L(47,8),L(96,15),L(58,26),Z()],d.frames,stroke,fill,2.7)];
    if(label)nodes.push(Text({name:"Parcel label",x:10,y:39,width:44,height:25,fontFamily:font,fontSize:Math.min(12,40/(Array.from(label).length*.8)),fill:stroke,textAlign:"center",textBaseline:"middle",start:"0f",end:eduTime(d.frames),children:label}));
    return nodes;
  });
}

/** Pure, bounded timing/layout data shared by native rendering and recipe validation. */
export function getExchangeDiagramLayout(props:ExchangeDiagramProps):ExchangeDiagramLayout {
  checkKeys(props,[...boxKeys,"spentLabel","earnedLabel","moneyLabel","goodsLabel","presentation","transferStart","transferDuration","labelDelay","minHold","animate","outlineColor","clothingColor","hairColor","skinColor","moneyColor","goodsColor","textColor","fontFamily"],"ExchangeDiagram");
  const d=box(props,"ExchangeDiagram",1000,600);
  if(d.width<360 || d.height<240)throw new RangeError("ExchangeDiagram needs width at least 360 and height at least 240");
  if(props.animate!==undefined && typeof props.animate!=="boolean")throw new TypeError("ExchangeDiagram.animate must be boolean");
  const presentation=props.presentation??"cycle";
  if(presentation!=="cycle" && presentation!=="handoff")throw new TypeError("ExchangeDiagram.presentation must be cycle or handoff");
  const transferFrame=educationFrames(props.transferStart??.5,"transferStart"),transferFrames=educationFrames(props.transferDuration??3.5,"transferDuration",true),labelFrame=educationFrames(props.labelDelay??4.1,"labelDelay"),holdFrames=educationFrames(props.minHold??1,"minHold",true);
  if(transferFrames<4)throw new RangeError("ExchangeDiagram.transferDuration needs at least four frames");
  if(labelFrame<transferFrame+transferFrames)throw new RangeError("Exchange labels follow the completed transfer");
  if(Math.max(transferFrame+transferFrames,labelFrame+6)+holdFrames>d.frames)throw new RangeError("Exchange transfer, labels and final reading hold must fit the lifetime");
  return Object.freeze({...d,presentation,transferFrame,transferFrames,labelFrame,holdFrames,animate:props.animate!==false,spentLabel:text(props.spentLabel??"SPENT","spentLabel",18),earnedLabel:text(props.earnedLabel??"EARNED","earnedLabel",18),moneyLabel:text(props.moneyLabel??"$","moneyLabel",8),goodsLabel:props.goodsLabel===undefined?"":text(props.goodsLabel,"goodsLabel",12),outlineColor:color(props.outlineColor??"#363B32","outlineColor"),clothingColor:color(props.clothingColor??"#C6C9B5","clothingColor"),hairColor:color(props.hairColor??"#C0C3AF","hairColor"),skinColor:color(props.skinColor??"#FBFBEA","skinColor"),moneyColor:color(props.moneyColor??"#89D761","moneyColor"),goodsColor:color(props.goodsColor??"#DEB887","goodsColor"),textColor:color(props.textColor??props.outlineColor??"#363B32","textColor"),fontFamily:text(props.fontFamily??"Arial","fontFamily",120)});
}
function flight(values:readonly number[],d:ExchangeDiagramLayout):Animatable<number> {
  if(!d.animate)return values[values.length-1];
  const times=[0,d.transferFrame,d.transferFrame+Math.round(d.transferFrames*.28),d.transferFrame+Math.round(d.transferFrames*.65),d.transferFrame+d.transferFrames];
  const all=times.map((time,index)=>({time:eduTime(time),value:values[index],easing:"easeInOut" as const}));
  return all.filter((point,index)=>index===0 || point.time!==all[index-1].time);
}
/** Money-for-goods exchange, composed entirely of editable native paths, text and groups. */
export function ExchangeDiagram(props:ExchangeDiagramProps):JSX.Element {
  const data=createMemo(()=>getExchangeDiagramLayout(props));
  const d=data();
  return fitGroup({...props,name:props.name??"Editable money exchange"},d,1000,600,()=>{
    const actor={width:170,height:265,start:"0f" as const,end:eduTime(d.frames),outlineColor:d.outlineColor,clothingColor:d.clothingColor,hairColor:d.hairColor,skinColor:d.skinColor,gestureStart:eduTime(d.transferFrame),gestureDuration:eduTime(Math.max(1,Math.round(d.transferFrames*.35))),animate:d.animate};
    const people=[IllustratedPerson({...actor,name:"Payer / articulated person",x:285,y:170,appearance:"ponytail",facing:"right"}),IllustratedPerson({...actor,name:"Seller / articulated person",x:565,y:170,appearance:"short",facing:"left"})];
    const cycle=d.presentation==="cycle";
    const money=Group({name:"Money transfer arc",x:flight(cycle?[435,435,445,485,485]:[435,435,445,535,568],d),y:flight(cycle?[227,227,139,85,85]:[227,227,139,115,225],d),rotation:flight(cycle?[-12,-12,-7,0,0]:[-12,-12,-7,22,7],d),width:54,height:43,anchorX:.5,anchorY:.5,start:"0f",end:eduTime(d.frames),get children(){return MoneyNote({name:"Editable money stack",width:54,height:43,start:"0f",end:eduTime(d.frames),label:d.moneyLabel,color:d.moneyColor,outlineColor:d.outlineColor,fontFamily:d.fontFamily});}});
    const goods=Group({name:"Goods transfer arc",x:flight(cycle?[555,555,555,500,485]:[555,555,555,493,430],d),y:flight(cycle?[228,228,138,173,200]:[228,228,138,165,226],d),rotation:flight([0,0,-3,2,0],d),width:53,height:48,anchorX:.5,anchorY:.5,start:"0f",end:eduTime(d.frames),get children(){return GoodsBox({name:"Editable goods parcel",width:53,height:48,start:"0f",end:eduTime(d.frames),color:d.goodsColor,outlineColor:d.outlineColor,fontFamily:d.fontFamily,...(d.goodsLabel?{label:d.goodsLabel}:{})});}});
    const labels=Group({name:"Exchange explanation labels",width:1000,height:600,start:eduTime(d.labelFrame),end:eduTime(d.frames),opacity:d.animate?[{time:"0f",value:0},{time:"6f",value:1}]:1,get children(){const frames=d.frames-d.labelFrame;return [
      Text({name:"Spent label",x:cycle?320:350,y:90,width:128,height:35,fontFamily:d.fontFamily,fontSize:Math.min(26,128/(Array.from(d.spentLabel).length*.75)),fontWeight:400,fill:d.textColor,textAlign:"center",start:"0f",end:eduTime(frames),children:d.spentLabel}),
      Text({name:"Earned label",x:cycle?595:555,y:90,width:150,height:35,fontFamily:d.fontFamily,fontSize:Math.min(26,150/(Array.from(d.earnedLabel).length*.75)),fontWeight:400,fill:d.textColor,textAlign:"center",start:"0f",end:eduTime(frames),children:d.earnedLabel}),
      outline("Spent curved arrow",cycle?[M(446,109),L(477,109),M(470,105),L(478,109),L(470,113)]:[M(414,127),Q(430,151,482,145),M(477,140),L(485,145),L(478,149)],frames,d.outlineColor,undefined,1.5),
      outline("Earned curved arrow",cycle?[M(603,109),L(553,109),M(560,105),L(552,109),L(560,113)]:[M(622,127),Q(620,159,575,185),M(576,177),L(573,187),L(582,183)],frames,d.outlineColor,undefined,1.5),
      ...(cycle?[
        outline("Clockwise money to goods arrow",[M(536,130),Q(563,170,537,210),M(537,202),L(536,212),L(544,207)],frames,d.outlineColor,undefined,1.4),
        outline("Clockwise goods to money arrow",[M(481,209),Q(459,173,482,136),M(474,141),L(483,134),L(484,144)],frames,d.outlineColor,undefined,1.4),
      ]:[]),
    ];}});
    return [...people,money,goods,labels];
  });
}
