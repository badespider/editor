import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { steps } from "animejs";
import { Backdrop, PanelLayout, StoryBeatCard, KineticText, getBackdropPattern, getPanelLayout, validateKineticText } from "../src/creative-primitives";
import { Text } from "../src/elements";
import { renderProject } from "../src/renderer";
import { parseTime } from "../src/time";
import type { ProjectDocument, ProjectTick } from "../src/document";
import type { Keyframe } from "../src/types";

type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(component: () => JSX.Element) {
  const stage: Node = {tag: "stage", props: {}, children: []};
  const [tick, setTick] = createSignal<ProjectTick>({time: 0, frame: 0, delta: 0, playing: false});
  const count = {created: 0};
  const document: ProjectDocument<Node> = {
    stage, tick, createElement(tag){count.created++; return {tag, props: {}, children: []};},
    createTextNode(text){count.created++; return {tag: "#text", props: {text}, children: []};},
    replaceText(node,text){node.props.text=text;}, isTextNode: node => node.tag === "#text",
    setProperty(node,key,value){if(node.tag === "Text" && key === "color")throw new Error("Text requires fill"); node.props[key]=value;},
    insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},
    removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node)+1],
  };
  return {stage, count, dispose: renderProject(component, document), setTime(time: number){setTick({time,frame:Math.floor(time*30),delta:time-tick().time,playing:false});}};
}
function all(node: Node): Node[] {return [node,...node.children.flatMap(all)];}
function named(node: Node, name: string): Node {const found=all(node).find(node=>node.props.name===name);assert.ok(found,name);return found;}
function content(node: Node): string {return node.tag === "#text" ? node.props.text : node.children.map(content).join("");}
function dynamic(component: (...args:any[])=>JSX.Element, props:unknown){return ()=>Reflect.apply(component,undefined,[props]);}
function checkBounds(root: Node) {
  for (const node of root.children.filter(node=>["Rect","Text","Group"].includes(node.tag))) {
    for (const key of ["x","y","width","height"]) assert.ok(Number.isFinite(node.props[key]),`${node.props.name} ${key}`);
    assert.ok(node.props.x>=0&&node.props.y>=0&&node.props.width>0&&node.props.height>0,node.props.name);
    assert.ok(node.props.x+node.props.width<=root.props.width+.0001,node.props.name);
    assert.ok(node.props.y+node.props.height<=root.props.height+.0001,node.props.name);
  }
}

test("all four primitives mount editable native entities in authored landscape and portrait boxes",()=>{
  for(const portrait of [false,true]) {
    const box=portrait?{x:72,y:120,width:936,height:1640,fontSize:44}:{x:96,y:96,width:1728,height:888,fontSize:32};
    const instances=[
      ()=>Backdrop({...box,kind:"grid",duration:6}),
      ()=>PanelLayout({...box,direction:portrait?"stack":"columns",duration:6,first:b=>Text({...b,fill:"#FFFFFF",children:"Context"}),second:b=>Text({...b,fill:"#FFFFFF",children:"Detail"})}),
      ()=>StoryBeatCard({...box,title:"Start with context.",body:"Keep the source and the point visible.",eyebrow:"AUTHORED EXAMPLE",source:"Caller supplied reference",duration:6}),
      ()=>KineticText({...box,text:"Context makes the detail meaningful.",emphasisWords:[1,4],duration:6}),
    ];
    for(const component of instances){const mounted=mount(component),root=mounted.stage.children[0];assert.equal(root.tag,"Group");assert.equal(root.props.end,"180f");checkBounds(root);
      for(const node of all(root).filter(node=>["Rect","Text","Group"].includes(node.tag))){assert.notEqual(node.props.start,undefined);assert.notEqual(node.props.end,undefined);}
      for(const node of all(root).filter(node=>node.tag==="Text")){assert.ok(node.props.fill);assert.equal(node.props.color,undefined);}
      mounted.dispose();
    }
  }
});

test("backdrops are bounded, reproducible, seed-dependent native geometry",()=>{
  for(const kind of ["grid","dots"] as const){
    const request={kind,width:1080,height:1920,spacing:96,seed:23};
    const first=getBackdropPattern(request);assert.deepEqual(getBackdropPattern(request),first);assert.notDeepEqual(getBackdropPattern({...request,seed:24}),first);
    assert.ok(first.length>0&&first.length<=512);assert.ok(Object.isFrozen(first));
    first.forEach(box=>{assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1080&&box.y+box.height<=1920);assert.ok(Object.isFrozen(box));});
    const native=mount(()=>Backdrop({...request,strength:.15}));
    for(const node of all(native.stage).filter(node=>String(node.props.name).startsWith("Backdrop mark")))assert.equal(node.props.opacity,.15);
    native.dispose();
  }
  assert.deepEqual(getBackdropPattern({kind:"solid"}),[]);
  assert.throws(()=>getBackdropPattern({kind:"dots",spacing:24}),/512/);
  for(const props of [{seed:-1},{seed:1.5},{spacing:NaN},{spacing:1},{strength:1},{gradientAngle:Infinity},{kind:"remote"}])assert.throws(()=>getBackdropPattern(props as never));
});

test("gradient backdrop uses native paints and color stops without illegal paint timing props",()=>{
  const native=mount(()=>Backdrop({kind:"gradient",start:10,duration:4,gradientAngle:135,theme:{background:"#102030",surface:"#405060"}}));
  const root=native.stage.children[0],paint=all(root).find(node=>node.tag==="LinearGradientPaint")!;
  assert.ok(paint);assert.equal(paint.props.rotation,135);assert.equal(paint.props.start,undefined);assert.equal(paint.props.end,undefined);
  assert.deepEqual(paint.children.map(node=>[node.props.offset,node.props.color]),[[0,"#102030"],[1,"#405060"]]);
  assert.equal(root.props.start,"300f");assert.equal(root.props.end,"420f");assert.equal(named(root,"Backdrop field").props.end,"120f");native.dispose();
});

test("panel geometry keeps exact authored ratio, gap and local slot clocks",()=>{
  const columns=getPanelLayout({width:1000,height:800,direction:"columns",padding:20,gap:40,ratio:.4});
  assert.deepEqual(columns,{first:{x:20,y:20,width:368,height:760},second:{x:428,y:20,width:552,height:760}});
  const stacked=getPanelLayout({width:800,height:1000,direction:"stack",padding:20,gap:40,ratio:.4});
  assert.deepEqual(stacked,{first:{x:20,y:20,width:760,height:368},second:{x:20,y:428,width:760,height:552}});
  const received: unknown[]=[];
  const native=mount(()=>PanelLayout({width:1000,height:800,start:7,duration:4,padding:20,gap:40,ratio:.4,first:b=>{received.push(b);return Text({...b,fill:"#FFFFFF",children:"First"});},second:b=>{received.push(b);return Text({...b,fill:"#FFFFFF",children:"Second"});}}));
  assert.deepEqual(received,[{x:0,y:0,width:368,height:760,start:"0f",end:"120f"},{x:0,y:0,width:552,height:760,start:"0f",end:"120f"}]);
  assert.equal(native.stage.children[0].props.start,"210f");assert.equal(named(native.stage,"Panel first").props.start,"0f");assert.equal(named(native.stage,"Panel first").props.end,"120f");native.dispose();
  for(const options of [{width:128,height:128,gap:64},{width:1000,height:800,ratio:0},{width:1000,height:800,ratio:NaN},{width:1000,height:800,direction:"auto"},{width:1000,height:800,padding:-1}])assert.throws(()=>getPanelLayout(options as never));
  assert.throws(()=>mount(dynamic(PanelLayout,{first:"bad",second:()=>undefined})),/slot functions/);
});

test("story beat reserves source context, wraps complete text and protects authored still hold",()=>{
  const native=mount(()=>StoryBeatCard({title:"A useful question",body:"The answer needs context.",source:"An authored reference",start:5,duration:6,minHold:3}));
  assert.equal(content(named(native.stage,"Story beat source")),"An authored reference");
  const root=native.stage.children[0],track=root.props.opacity as Keyframe<number>[];
  const entered=track.findIndex(key=>key.value===1),held=track.findLastIndex(key=>key.value===1);
  assert.ok((parseTime(track[held].time)!-parseTime(track[entered].time)!)*30>=90);
  assert.equal(root.props.start,"150f");assert.equal(root.props.end,"330f");native.dispose();
  assert.throws(()=>mount(()=>StoryBeatCard({title:"Question",body:"Answer",duration:3,minHold:3})),/reading-hold/);
  assert.throws(()=>mount(()=>StoryBeatCard({title:"Question",body:"word ".repeat(500),duration:6})),/2048|lines/);
  assert.throws(()=>mount(()=>StoryBeatCard({title:"Question",body:"Answer",source:"word ".repeat(100),duration:6})),/lines/);
});

test("animate false is the fully readable static state, including short-duration examples",()=>{
  const story=mount(()=>StoryBeatCard({title:"Question",body:"The answer.",animate:false,duration:1}));
  assert.equal(story.stage.children[0].props.opacity,1);assert.equal(story.stage.children[0].props.offsetY,0);assert.match(content(story.stage),/The answer/);story.dispose();
  const kinetic=mount(()=>KineticText({text:"Every word stays visible.",animate:false,duration:1}));
  for(const node of all(kinetic.stage).filter(node=>node.tag==="Text"))assert.equal(node.props.opacity,1);
  kinetic.dispose();
});

test("kinetic words keep prose order, complete layout and one-based emphasis before reveal",()=>{
  const config=validateKineticText({text:"Keep the source visible.",width:900,height:500,fontSize:60,start:10,duration:6,revealDuration:1,emphasisWords:[3]});
  assert.deepEqual(config.words.map(word=>[word.text,word.onsetFrame,word.emphasis]),[["Keep",0,false],["the",10,false],["source",20,true],["visible.",30,false]]);
  assert.equal(config.layout.start,300);assert.equal(config.holdFrames,60);assert.ok(Object.isFrozen(config.words));
  assert.equal(config.words[3].y,180,"future words reserve their next line before they become visible");
  const native=mount(()=>KineticText({text:"Keep the source visible.",width:900,height:500,fontSize:60,start:10,duration:6,revealDuration:1,emphasisWords:[3],theme:{accent:"#123456"}}));
  assert.equal(named(native.stage,"Kinetic word 3").props.fill,"#123456");assert.equal(named(native.stage,"Kinetic word 3").props.fontWeight,700);
  assert.equal(named(native.stage,"Kinetic word 4").props.y,config.words[3].y);assert.equal(native.stage.children[0].props.start,"300f");native.dispose();
});

test("native word opacity tracks are exact, reverse-seekable and hold rather than fading future words",()=>{
  const native=mount(()=>KineticText({text:"First then second",start:10,duration:6,revealDuration:1}));
  const root=native.stage.children[0],word=named(root,"Kinetic word 3");
  const track=word.props.opacity as Keyframe<number>[];
  assert.deepEqual(track,[{time:"0f",value:0,easing:"steps(1)"},{time:"30f",value:1}]);
  // This is the same anime steps implementation consumed by the engine's resolveEasing.
  const sample=(sceneFrame:number)=>{const local=sceneFrame-parseTime(root.props.start)!*30;return local>=30?1:local<=0?0:steps(1)(local/30);};
  assert.deepEqual([300,329,330,450,329,300].map(sample),[0,0,1,1,0,0]);
  const created=native.count.created,identities=all(root);
  for(let index=0;index<200;index++)native.setTime(index/30);
  assert.equal(native.count.created,created);assert.deepEqual(all(root),identities,"timeline ticks never reconstruct word entities");native.dispose();
});

test("measured kinetic layout uses complete weighted glyph widths and spaces rather than character cells",()=>{
  const measure=(value:string,weight:400|700)=>Array.from(value).reduce((sum,char)=>sum+(char===" "?8:char==="i"?4:char==="W"?20:10),0)*(weight===700?1.2:1);
  const result=validateKineticText({text:"ii WW ii",width:100,height:200,fontSize:40,emphasisWords:[2],duration:6},measure);
  assert.equal(result.measurement,"provided");
  assert.deepEqual(result.words.map(word=>[word.x,word.y,word.width]),[[0,0,10],[16,0,50],[73.6,0,10]]);
  assert.deepEqual(result.words.map(word=>word.onsetFrame),[0,15,30]);
  const wrapped=validateKineticText({text:"ii WW ii",width:72,height:200,fontSize:40,emphasisWords:[2],duration:6},measure);
  assert.deepEqual(wrapped.words.map(word=>[word.x,word.y]),[[0,0],[16,0],[0,60]],"whole words wrap without moving earlier slots");
  for(const value of [NaN,Infinity,-1,0])assert.throws(()=>validateKineticText({text:"Measured words",duration:6},()=>value),/measured width/);
  assert.throws(()=>validateKineticText({text:"oversized",width:100,height:200,duration:6},()=>120),/word wider/);
  assert.throws(()=>validateKineticText({text:"a b c",width:64,height:32,fontSize:24,duration:6},()=>40),/line\/height/);
});

test("local canvas measurement honors actual font/weight and is never repeated on unchanged timeline values",()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,"OffscreenCanvas"),fonts:string[]=[];
  let canvases=0,measurements=0;
  class LocalCanvas {
    constructor(){canvases++;}
    getContext(){return{font:"",measureText(value:string){measurements++;fonts.push(this.font);return{width:Array.from(value).reduce((sum,char)=>sum+(char===" "?8:char==="i"?4:20),0)*(this.font.startsWith("700 ")?1.2:1)};}};}
  }
  Object.defineProperty(globalThis,"OffscreenCanvas",{value:LocalCanvas,configurable:true,writable:true});
  try {
    const [time,setTime]=createSignal(0);
    const native=mount(()=>KineticText({get text(){time();return "ii WW ii";},get emphasisWords(){time();return [2];},width:100,height:200,fontSize:40,theme:{fontFamily:"TestFamily"},duration:6}));
    assert.equal(named(native.stage,"Kinetic word 2").props.x,16);
    assert.equal(named(native.stage,"Kinetic word 3").props.x,73.6);
    assert.equal(canvases,1);assert.equal(measurements,4,"repeated words and spaces use the per-layout cache");
    assert.ok(fonts.includes("400 40px TestFamily"));assert.ok(fonts.includes("700 40px TestFamily"));
    const entities=all(native.stage),created=native.count.created;
    for(let index=0;index<50;index++){setTime(index/30);native.setTime(index/30);}
    assert.equal(canvases,1);assert.equal(measurements,4);assert.equal(native.count.created,created);assert.deepEqual(all(native.stage),entities);
    const measured=validateKineticText({text:"ii WW ii",width:100,height:200,fontSize:40,emphasisWords:[2],duration:6});assert.equal(measured.measurement,"native");
    native.dispose();
  } finally {if(prior)Object.defineProperty(globalThis,"OffscreenCanvas",prior);else Reflect.deleteProperty(globalThis,"OffscreenCanvas");}
});

test("canvas-unavailable kinetic layout retains an explicit conservative CPU fallback",()=>{
  const prior=Object.getOwnPropertyDescriptor(globalThis,"OffscreenCanvas");
  Object.defineProperty(globalThis,"OffscreenCanvas",{value:undefined,configurable:true,writable:true});
  try {
    const result=validateKineticText({text:"ii WW ii",width:100,height:200,fontSize:40,emphasisWords:[2],duration:6});
    assert.equal(result.measurement,"conservative");assert.deepEqual(result.words.map(word=>word.y),[0,60,120]);
  } finally {if(prior)Object.defineProperty(globalThis,"OffscreenCanvas",prior);else Reflect.deleteProperty(globalThis,"OffscreenCanvas");}
});

test("kinetic validation rejects sparse/invalid indices, nonfinite timing and unreadable hidden text",()=>{
  const sparse:number[]=[];sparse.length=2;sparse[1]=2;Object.assign(sparse,{metadata:true});
  for(const props of [{emphasisWords:sparse},{emphasisWords:[1,1]},{emphasisWords:[0]},{emphasisWords:[9]},{revealDuration:NaN},{minHold:0},{duration:2,minHold:2,revealDuration:1},{fontSize:Infinity}])assert.throws(()=>validateKineticText({text:"Two words",...props}));
  assert.throws(()=>validateKineticText({text:"x".repeat(100),width:200,height:1000,fontSize:64}),/word wider/);
  assert.throws(()=>validateKineticText({text:"word ".repeat(97),width:3000,height:2000,fontSize:20}),/word count/);
  assert.throws(()=>validateKineticText({text:"Too much text for one line",width:128,height:32,fontSize:64}),/word wider|readable/);
  const literal='"; throw Error("not executed"); //';
  const native=mount(()=>KineticText({text:literal,duration:6,fontSize:32}));assert.match(content(native.stage),/throw/);native.dispose();
});

test("clock-derived equal prose and fresh equal emphasis arrays retain all native entities",()=>{
  for(const kind of ["story","kinetic"] as const){
    const [time,setTime]=createSignal(0);
    const native=mount(()=>kind==="story"?StoryBeatCard({title:"The question",get body(){return time()<2?"Keep context.":"Show the result.";},get source(){time();return "Authored example";},get minHold(){time();return 2;},duration:6}):KineticText({get text(){return time()<2?"Keep context.":"Show the result.";},get emphasisWords(){time();return [1];},get revealDuration(){time();return 1;},duration:6}));
    const first=all(native.stage),count=native.count.created;
    for(let index=0;index<50;index++)setTime(index/50);
    assert.equal(native.count.created,count,kind);assert.deepEqual(all(native.stage),first,kind);
    setTime(3);assert.match(content(native.stage),/Show/);assert.ok(native.count.created>count);
    setTime(0);assert.match(content(native.stage),/Keep/);assert.doesNotMatch(content(native.stage),/Show/);native.dispose();
  }
});

test("finite bounds, explicit theme colors and lifetime failures apply consistently",()=>{
  for(const component of [Backdrop,StoryBeatCard,KineticText])for(const bad of [{width:NaN},{height:Infinity},{width:4096,height:4096},{duration:-1},{start:3600,duration:1},{end:8,duration:6},{theme:{text:"transparent"}}])assert.throws(()=>mount(dynamic(component,{title:"Title",body:"Body",text:"Some words",...bad})));
});
