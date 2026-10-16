/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Rect, Text } from "./elements";
import { educationFrames, educationNumber, eduTime } from "./education-core";
import type { Keyframe, Time } from "./types";

export type AssembleTitleProps = Readonly<{
  text: string; subtitle?: string;
  x?: number; y?: number; width?: number; height?: number;
  start?: Time; end?: Time; duration?: Time;
  /** Total title assembly interval, including the last glyph's movement. */
  revealDuration?: Time; glyphDuration?: Time; subtitleDelay?: Time; minHold?: Time;
  fontFamily?: string; fontSize?: number; fontWeight?: number; color?: string;
  subtitleColor?: string; scatter?: number; blur?: boolean; animate?: boolean;
  key?: string; name?: string;
}>;
type Box = Readonly<{x: number; y: number; width: number; height: number}>;
export type AssembledGlyph = Readonly<Box & {character: string; onset: number; offsetX: number; offsetY: number; scale: number}>;
export type AssembleTitleLayout = Readonly<{
  x: number; y: number; width: number; height: number; startFrame: number; frames: number; endFrame: number;
  text: string; subtitle?: string; fontFamily: string; fontSize: number; fontWeight: number;
  color: string; subtitleColor: string; animate: boolean; blur: boolean;
  revealFrames: number; glyphFrames: number; subtitleFrame: number; settledFrame: number; holdFrames: number;
  subtitleBox: Box; glyphs: readonly AssembledGlyph[]; measurement: "native" | "conservative";
}>;
function literal(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || !/^[\x20-\x7e]+$/.test(value)) throw new TypeError(`${label} needs 1..${max} printable ASCII characters on one line`);
  return value.trim();
}
function color(value: string, label: string): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`${label} must be #RRGGBB`);
  return value;
}
function widths(text: string, font: number, family: string, weight: number): {advances: number[]; measurement: "native" | "conservative"} {
  const Canvas = (globalThis as typeof globalThis & {OffscreenCanvas?: new (w: number, h: number) => {getContext(kind: "2d"): {font: string; measureText(text: string): {width: number}} | null}}).OffscreenCanvas;
  let ctx: {font: string; measureText(text: string): {width: number}} | null = null;
  try {ctx = Canvas ? new Canvas(1, 1).getContext("2d") : null;} catch { /* Headless callers use the conservative fit contract. */ }
  if (ctx) {
    ctx.font = `${weight} ${font}px ${family}`;
    const advances = Array.from({length: text.length + 1}, (_, i) => ctx!.measureText(text.slice(0, i)).width);
    if (advances.every(Number.isFinite) && advances.every((value, i) => i === 0 || value > advances[i-1])) return {advances, measurement: "native"};
  }
  const advances = [0];
  for (const character of text) advances.push(advances[advances.length-1] + font * (character === " " ? .4 : .85));
  return {advances, measurement: "conservative"};
}

/** Pure layout and native local-clock schedule, independent of prior seeks. */
export function getAssembleTitleLayout(props: AssembleTitleProps): AssembleTitleLayout {
  if (!props || typeof props !== "object" || Array.isArray(props)) throw new TypeError("AssembleTitle needs an object");
  const allowed = ["text","subtitle","x","y","width","height","start","end","duration","revealDuration","glyphDuration","subtitleDelay","minHold","fontFamily","fontSize","fontWeight","color","subtitleColor","scatter","blur","animate","key","name"];
  for (const field of Object.keys(props)) if (!allowed.includes(field)) throw new TypeError(`Unknown AssembleTitle field: ${field}`);
  if (props.end !== undefined && props.duration !== undefined) throw new TypeError("Use AssembleTitle.end or duration, not both");
  for (const field of ["blur","animate"] as const) if (props[field] !== undefined && typeof props[field] !== "boolean") throw new TypeError(`${field} must be boolean`);
  if (props.key !== undefined) literal(props.key,"key",120);
  if (props.name !== undefined) literal(props.name,"name",160);
  const text = literal(props.text,"AssembleTitle.text",48), subtitle = props.subtitle === undefined ? undefined : literal(props.subtitle,"AssembleTitle.subtitle",96);
  const width = educationNumber(props.width ?? 1600,"width",160,4096), height = educationNumber(props.height ?? 400,"height",120,4096);
  if (width*height > 8_388_608) throw new RangeError("AssembleTitle box exceeds 8 megapixels");
  const x = educationNumber(props.x ?? 0,"x"), y = educationNumber(props.y ?? 0,"y"), startFrame = educationFrames(props.start ?? 0,"start");
  const frames = props.end === undefined ? educationFrames(props.duration ?? 6,"duration",true) : educationFrames(props.end,"end")-startFrame;
  if (frames<1 || startFrame+frames>108000) throw new RangeError("AssembleTitle needs a positive lifetime within 108000 frames");
  const fontFamily = literal(props.fontFamily ?? "Arial","fontFamily",120), fontWeight = educationNumber(props.fontWeight ?? 700,"fontWeight",100,900);
  if (!Number.isInteger(fontWeight) || fontWeight%100) throw new RangeError("fontWeight must be a hundred from 100 through 900");
  const fontSize = educationNumber(props.fontSize ?? Math.min(96,height*.22,width/(text.length*.9)),"fontSize",8,256);
  const measured = widths(text,fontSize,fontFamily,fontWeight), total = measured.advances.at(-1)!;
  const pad = Math.max(12,fontSize*.28), rowHeight = fontSize*1.5;
  if (total+pad*2>width || rowHeight+pad*2>height) throw new RangeError("Title exceeds its box; enlarge it or reduce fontSize");
  const subtitleFont = fontSize*.34, subtitleBox = Object.freeze({x:pad,y:height*.72,width:width-pad*2,height:subtitleFont*1.5});
  if (subtitle && (subtitleBox.y+subtitleBox.height>height-pad || subtitle.length*subtitleFont*.85>subtitleBox.width)) throw new RangeError("Subtitle exceeds its single-line budget; shorten it or enlarge the box");
  const revealFrames = educationFrames(props.revealDuration ?? 1.2,"revealDuration",true), glyphFrames = educationFrames(props.glyphDuration ?? .4,"glyphDuration",true);
  if (glyphFrames>revealFrames) throw new RangeError("glyphDuration must fit revealDuration");
  const subtitleFrame = revealFrames+educationFrames(props.subtitleDelay ?? "3f","subtitleDelay");
  const settledFrame = subtitle ? subtitleFrame+6 : revealFrames, holdFrames = educationFrames(props.minHold ?? 2,"minHold",true);
  if (settledFrame+holdFrames>frames) throw new RangeError("Assembly, subtitle entrance and final reading hold must fit the lifetime");
  const scatter = educationNumber(props.scatter ?? .5,"scatter",0,1), animate = props.animate !== false;
  const visibleCount = text.replace(/ /g,"").length;
  let index = 0;
  const glyphs = Array.from(text).flatMap((character, i) => {
    if (character === " ") return [];
    const j = index++, advance = measured.advances[i+1]-measured.advances[i], glyphWidth=advance+fontSize*.16;
    return [Object.freeze({character,x:(width-total)/2+measured.advances[i]-fontSize*.08,y:height*.34-rowHeight/2,width:glyphWidth,height:rowHeight,
      onset:visibleCount<=1?0:Math.round(j*(revealFrames-glyphFrames)/(visibleCount-1)),
      offsetX:((j%5)-2)*fontSize*.12*scatter, offsetY:(j%2?1:-1)*fontSize*.38*scatter,scale:.86+(j%3)*.04})];
  });
  return Object.freeze({x,y,width,height,startFrame,frames,endFrame:startFrame+frames,text,subtitle,fontFamily,fontSize,fontWeight,
    color:color(props.color ?? "#F6F0E4","color"),subtitleColor:color(props.subtitleColor ?? "#BAC7D6","subtitleColor"),animate,blur:props.blur !== false,
    revealFrames,glyphFrames,subtitleFrame,settledFrame,holdFrames,subtitleBox,glyphs:Object.freeze(glyphs),measurement:measured.measurement});
}

/** Separate native text glyphs gather into a fixed title; native blur resolves with them. */
export function AssembleTitle(props: AssembleTitleProps): JSX.Element {
  const data=createMemo(()=>getAssembleTitleLayout(props),undefined,{equals:(a,b)=>JSON.stringify(a)===JSON.stringify(b)});
  return Rect({get key(){return props.key;},get name(){return props.name ?? "AssembleTitle";},get x(){return data().x;},get y(){return data().y;},get width(){return data().width;},get height(){return data().height;},get start(){return eduTime(data().startFrame);},get end(){return eduTime(data().endFrame);},clipToBox:true,
    get children(){const d=data(); const move=(value:number):number|Keyframe<number>[]=>!d.animate?0:[{time:"0f",value,easing:"easeOut"},{time:eduTime(d.glyphFrames),value:0}];
      return [
        ...d.glyphs.map((g,i)=>Text({name:`Assembly glyph ${i+1}`,x:g.x,y:g.y,width:g.width,height:g.height,start:eduTime(d.animate?g.onset:0),end:eduTime(d.frames),fontFamily:d.fontFamily,fontSize:d.fontSize,fontWeight:d.fontWeight,fill:d.color,textAlign:"center",textBaseline:"middle",offsetX:move(g.offsetX),offsetY:move(g.offsetY),
          scale:!d.animate?1:[{time:"0f",value:g.scale,easing:"easeOut"},{time:eduTime(d.glyphFrames),value:1}],
          opacity:!d.animate?1:[{time:"0f",value:0,easing:"easeOut"},{time:eduTime(d.glyphFrames),value:1}],
          animations:d.animate&&d.blur?[{type:"blur",phase:"in",duration:eduTime(d.glyphFrames)}]:[],children:g.character})),
        ...(d.subtitle?[Text({name:"Assembly subtitle",...d.subtitleBox,start:eduTime(d.subtitleFrame),end:eduTime(d.frames),fontFamily:d.fontFamily,fontSize:d.fontSize*.34,fontWeight:400,fill:d.subtitleColor,textAlign:"center",textBaseline:"middle",opacity:!d.animate?1:[{time:"0f",value:0},{time:"6f",value:1}],children:d.subtitle})]:[]),
      ];},
  });
}
