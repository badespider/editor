import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { CounterReveal, getCounterRevealLayout } from "../src/index";
import { renderProject } from "../src/renderer";
import { parseTime } from "../src/time";
import type { ProjectDocument, ProjectTick } from "../src/document";
import type { CounterRevealProps } from "../src/counter-reveal";
import type { Keyframe } from "../src/types";

type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(component: () => JSX.Element) {
  const stage: Node = {tag: "stage", props: {}, children: []};
  const [tick, setTick] = createSignal<ProjectTick>({time: 0, frame: 0, delta: 0, playing: false});
  let created = 0;
  const document: ProjectDocument<Node> = {
    stage, tick, createElement(tag){created++; return {tag, props: {}, children: []};},
    createTextNode(text){created++; return {tag: "#text", props: {text}, children: []};},
    replaceText(node,text){node.props.text=text;}, isTextNode: node => node.tag === "#text",
    setProperty(node,key,value){node.props[key]=value;},
    insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},
    removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node)+1],
  };
  return {stage, created: () => created, dispose: renderProject(component, document), setTime(time: number){setTick({time,frame:Math.floor(time*30),delta:time-tick().time,playing:false});}};
}
function all(node: Node): Node[] {return [node,...node.children.flatMap(all)];}
function named(node: Node, name: string): Node {const found=all(node).find(node=>node.props.name===name);assert.ok(found,name);return found;}
function content(node: Node): string {return node.tag === "#text" ? node.props.text : node.children.map(content).join("");}
function layout(input: unknown) {return getCounterRevealLayout(input as CounterRevealProps);}
function nativeFrame(value: unknown): number {return Math.round(parseTime(value as string)! * 30);}

test("counter timing supports uneven intervals and a fully settled final hold", () => {
  const d = getCounterRevealLayout({values:[10,11,12,13],start:5,duration:"90f",stepDurations:["4f","9f","15f"],revealDuration:"4f",minHold:"58f"});
  assert.deepEqual(d.onsets,[0,4,13,28]);assert.equal(d.settledFrame,32);assert.equal(d.frames-d.settledFrame,58);
  assert.equal(d.startFrame,150);assert.equal(d.endFrame,240);
  assert.throws(()=>getCounterRevealLayout({values:[10,11,12,13],duration:"90f",stepDurations:["4f","9f","15f"],minHold:"59f"}),/reading hold/);
  const ending=getCounterRevealLayout({values:[10,11],start:5,end:8});assert.equal(ending.frames,90);
});

test("fixed tabular positions preserve unchanged cells and complete formatted literals",()=>{
  const d=getCounterRevealLayout({values:["009","010","011"],width:900,height:400,cellGap:15,duration:4});
  assert.equal(d.columns,3);assert.equal(d.cellWidth,d.fontSize*1.2);assert.ok(d.rowWidth<900);assert.equal(d.rowX,(900-d.rowWidth)/2);assert.deepEqual(d.runs.filter(run=>run.column===0).map(run=>[run.character,run.startFrame,run.endFrame]),[["0",0,120]]);
  assert.deepEqual(d.runs.filter(run=>run.column===1).map(run=>run.character),["0","1"]);
  assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.runs)&&Object.isFrozen(d.runs[0])&&Object.isFrozen(d.values)&&Object.isFrozen(d.onsets));
  const varying=getCounterRevealLayout({values:[9,10,"$10B"],duration:4});assert.equal(varying.columns,4);
  assert.equal(varying.runs.find(run=>run.startFrame===0)?.column,3,"short values are right aligned without inventing zero digits");
  const literal=getCounterRevealLayout({values:["-1.5%","+2.5%"],duration:4});assert.deepEqual(literal.values,["-1.5%","+2.5%"]);
});

test("changed glyphs use native editable incoming/outgoing offset tracks and local lifetimes",()=>{
  const native=mount(()=>CounterReveal({values:[10,11,12],start:7,duration:4,stepDuration:"6f",revealDuration:"4f",width:800,height:400,fontSize:100,glyphScaleX:1.4,glyphScaleY:.9}));
  const root=native.stage.children[0];assert.equal(root.tag,"Rect");assert.equal(root.props.clipToBox,true);assert.equal(root.props.fill,undefined);
  assert.equal(root.props.start,"210f");assert.equal(root.props.end,"330f");
  const cell=named(root,"Foreground counter cell 2");assert.equal(cell.tag,"Rect");assert.equal(cell.props.clipToBox,true);assert.equal(cell.props.width,168);assert.equal(cell.props.height,200);
  const first=named(root,"Foreground counter cell 2 value 1"), second=named(root,"Foreground counter cell 2 value 2"), final=named(root,"Foreground counter cell 2 value 3");
  assert.deepEqual(first.props.offsetY,[{time:"0f",value:0,easing:"easeOut"},{time:"6f",value:0,easing:"easeIn"},{time:"10f",value:-200}]);
  assert.deepEqual(second.props.offsetY,[{time:"0f",value:200,easing:"easeOut"},{time:"4f",value:0,easing:"linear"},{time:"6f",value:0,easing:"easeIn"},{time:"10f",value:-200}]);
  assert.deepEqual(final.props.offsetY,[{time:"0f",value:200,easing:"easeOut"},{time:"4f",value:0,easing:"linear"}]);
  assert.equal(second.props.start,"6f");assert.equal(second.props.end,"16f");assert.equal(final.props.start,"12f");assert.equal(final.props.end,"120f");
  assert.equal(second.props.scaleX,1.4);assert.equal(second.props.scaleY,.9);assert.equal(second.props.textAlign,"center");
  assert.equal(named(root,"Foreground counter cell 1 value 1").props.offsetY,0,"unchanged tens digit never slides");
  assert.ok(all(root).every(node=>!["Surface","Video","Image","Html","ShaderPaint"].includes(node.tag)));native.dispose();
});

test("foreground and optional pale echo remain separate editable text and clips",()=>{
  const native=mount(()=>CounterReveal({values:[20,21],duration:4,echo:{color:"#112233",opacity:.15,scale:2,offsetY:20},color:"#EE8833"}));
  const root=native.stage.children[0];assert.equal(root.children[0].props.name,"Counter echo row");assert.equal(root.children[1].props.name,"Counter foreground row");
  const echo=named(root,"Counter echo row");assert.equal(echo.props.scale,2);assert.equal(echo.props.opacity,.15);assert.equal(echo.props.y,145);
  assert.equal(named(root,"Echo counter cell 2 value 2").props.fill,"#112233");assert.equal(named(root,"Foreground counter cell 2 value 2").props.fill,"#EE8833");
  assert.equal(content(named(root,"Echo counter cell 2 value 2")),"1");native.dispose();
  const quiet=mount(()=>CounterReveal({values:[20,21],echo:false}));assert.ok(!all(quiet.stage).some(node=>String(node.props.name).startsWith("Echo")));quiet.dispose();
});

test("reduced motion preserves every supplied value and onset with instantaneous changes",()=>{
  const d=getCounterRevealLayout({values:["10","11","12"],animate:false,stepDurations:["1f","2f"],duration:"34f",minHold:"31f"});
  assert.deepEqual(d.onsets,[0,1,3]);assert.equal(d.settledFrame,3);assert.ok(d.runs.every(run=>run.offsetY===0));
  const units=d.runs.filter(run=>run.column===1);assert.deepEqual(units.map(run=>[run.character,run.startFrame,run.endFrame]),[["0",0,1],["1",1,3],["2",3,34]]);
  const native=mount(()=>CounterReveal({values:[10,11,12],animate:false,stepDurations:["1f","2f"],duration:"34f",minHold:"31f"}));
  for(const node of all(native.stage).filter(node=>node.tag==="Text"))assert.equal(node.props.offsetY,0);native.dispose();
});

test("up/down reverse travel exactly; direct and reverse native clock seeks produce identical state",()=>{
  const up=getCounterRevealLayout({values:[10,11,12],duration:4}), down=getCounterRevealLayout({values:[10,11,12],duration:4,direction:"down"});
  assert.deepEqual(up.runs.map(run=>Array.isArray(run.offsetY)?run.offsetY.map(key=>key.value):[0]),down.runs.map(run=>Array.isArray(run.offsetY)?run.offsetY.map(key=>-key.value || 0):[0]));
  // Sample the authored host tracks at exact keys and held intervals. Both seek
  // directions derive from the requested local frame, never previous state.
  const state=(sceneFrame:number)=>up.runs.filter(run=>sceneFrame-up.startFrame>=run.startFrame&&sceneFrame-up.startFrame<run.endFrame).map(run=>{
    const at=sceneFrame-up.startFrame-run.startFrame, track=run.offsetY;
    if(typeof track==="number")return[run.column,run.character,track];
    const key=track.findLast(key=>nativeFrame(key.time)<=at)!;
    return[run.column,run.character,key.value];
  });
  const times=[0,6,10,12,16,80,16,12,10,6,0];const samples=times.map(state);assert.deepEqual(samples.slice(0,5),samples.slice(6).reverse());
  const native=mount(()=>CounterReveal({values:[10,11,12],duration:4}));const identities=all(native.stage),created=native.created();
  for(const frame of times)native.setTime(frame/30);assert.equal(native.created(),created);assert.deepEqual(all(native.stage),identities);native.dispose();
});

test("fresh equal reactive values do not rebuild glyphs on clock updates; changed values restore backwards",()=>{
  const [clock,setClock]=createSignal(0);
  const native=mount(()=>CounterReveal({get values(){return clock()<2?[10,11,12]:[30,31,32];},duration:4}));
  const initial=all(native.stage),created=native.created();
  for(let i=0;i<50;i++){setClock(i/30);native.setTime(i/30);}
  assert.equal(native.created(),created);assert.deepEqual(all(native.stage),initial);
  setClock(3);assert.equal(content(named(native.stage,"Foreground counter cell 1 value 1")),"3");
  setClock(0);assert.equal(content(named(native.stage,"Foreground counter cell 1 value 1")),"1");native.dispose();
});

test("landscape/portrait boxes fit cells and expose truthful conservative font limits",()=>{
  for(const box of [{width:1728,height:888},{width:936,height:1640},{width:3840,height:2160}]) {
    const d=getCounterRevealLayout({values:["2030","2031"],...box,glyphScaleX:1.3,glyphScaleY:.8});
    assert.ok(d.rowY>=0&&d.rowY+d.rowHeight<=d.height);assert.ok(d.fontSize*1.2*d.glyphScaleX<=d.cellWidth+.00001);assert.ok(d.fontSize*1.4*d.glyphScaleY<=d.rowHeight+.00001);
    assert.equal(d.columns*d.cellWidth+(d.columns-1)*d.cellGap,d.rowWidth);assert.ok(d.rowX>=0&&d.rowX+d.rowWidth<=d.width+.00001);
  }
  assert.throws(()=>getCounterRevealLayout({values:["2030"],width:400,height:200,fontSize:100,glyphScaleX:2}),/conservative cell budget/);
});

test("short counters center a compact em-cell run so enlarged echo glyphs stay in the outer clip",()=>{
  const small=getCounterRevealLayout({values:["01"],fontSize:8,glyphScaleX:.1});assert.equal(small.cellWidth,16,"scaled glyphs retain a finite useful clipping cell");
  for(const box of [{width:960,height:360,scale:2.4},{width:936,height:560,scale:2.6}]){
    const d=getCounterRevealLayout({values:["01","02","08"],width:box.width,height:box.height,echo:{scale:box.scale}});
    assert.ok(d.rowWidth<d.width,"short tokens must not stretch across the clipping box");
    for(let column=0;column<d.columns;column++){
      const center=d.rowX+d.rowWidth/2+((column+.5)*d.cellWidth-d.rowWidth/2)*box.scale;
      assert.ok(center>0&&center<d.width,"scaled echo cell center stays inside the actual outer clip");
    }
    const native=mount(()=>CounterReveal({values:["01","02","08"],width:box.width,height:box.height,echo:{scale:box.scale}}));
    for(const name of ["Counter foreground row","Counter echo row"]){const row=named(native.stage,name);assert.equal(row.props.x,d.rowX);assert.equal(row.props.width,d.rowWidth);}
    native.dispose();
  }
});

test("finite timing and strict data bounds fail before native entity creation",()=>{
  const sparse: string[]=[];sparse.length=2;sparse[1]="2";
  const bad:unknown[]=[null,{}, {values:[]},{values:sparse},{values:[1.5]},{values:[NaN]},{values:[Infinity]},{values:["ten"]},{values:["1\n2"]},{values:["1😀"]},{values:["1".repeat(17)]},{values:Array.from({length:49},(_,i)=>i)},
    {values:[1,2],duration:-1},{values:[1,2],start:3600},{values:[1,2],end:4,duration:4},{values:[1,2],stepDuration:1,stepDurations:[1]},{values:[1,2],stepDurations:[]},{values:[1,2],stepDurations:["3f"]},{values:[1,2],revealDuration:0},{values:[1,2],minHold:0},
    {values:[1,2],width:NaN},{values:[1,2],height:Infinity},{values:[1,2],width:4096,height:4096},{values:["123456"],width:32},{values:[1],glyphScaleX:0},{values:[1],glyphScaleY:5},{values:[1],fontSize:Infinity},{values:[1],fontWeight:901},{values:[1],color:"transparent"},{values:[1],echo:true},{values:[1],echo:{opacity:2}},{values:[1],echo:{scale:Infinity}},{values:[1],echo:{remote:"no"}},{values:[1],direction:"sideways"},{values:[1],animate:"false"},{values:[1],unsupported:"field"}];
  for(const props of bad)assert.throws(()=>layout(props),JSON.stringify(props));
  const many=Array.from({length:48},(_,i)=>String(i%2).repeat(16));assert.throws(()=>getCounterRevealLayout({values:many,duration:20}),/512/);
});

test("a single value and repeated values keep one static run per nonblank cell",()=>{
  const single=getCounterRevealLayout({values:["$10B"],duration:1,minHold:1});assert.equal(single.settledFrame,0);assert.equal(single.runs.length,4);assert.ok(single.runs.every(run=>run.offsetY===0));
  const repeated=getCounterRevealLayout({values:[1,1,1],duration:4});assert.equal(repeated.runs.length,1);assert.equal(repeated.runs[0].endFrame,120);
});
