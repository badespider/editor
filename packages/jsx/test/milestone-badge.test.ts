import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { MilestoneBadge, getMilestoneBadgeLayout } from "../src/milestone-badge";
import type { MilestoneBadgeProps } from "../src/milestone-badge";
import { renderProject } from "../src/renderer";
import { parseTime } from "../src/time";
import type { ProjectDocument, ProjectTick } from "../src/document";

type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(component: () => JSX.Element) {
  const stage: Node = {tag: "stage", props: {}, children: []};
  const [tick, setTick] = createSignal<ProjectTick>({time: 0, frame: 0, delta: 0, playing: false});
  let count=0;
  const document: ProjectDocument<Node> = {
    stage, tick, createElement(tag){count++;return{tag,props:{},children:[]};},createTextNode(text){count++;return{tag:"#text",props:{text},children:[]};},
    replaceText(node,text){node.props.text=text;},isTextNode:node=>node.tag==="#text",setProperty(node,key,value){node.props[key]=value;},
    insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},
    removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},getParentNode:node=>node.parent,getFirstChild:node=>node.children[0],getNextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1],
  };
  return{stage,created:()=>count,dispose:renderProject(component,document),setTime(time:number){setTick({time,frame:Math.floor(time*30),delta:time-tick().time,playing:false});}};
}
function all(node:Node):Node[]{return[node,...node.children.flatMap(all)];}
function named(node:Node,name:string):Node{const found=all(node).find(node=>node.props.name===name);assert.ok(found,name);return found;}
function literal(node:Node):string{return node.tag==="#text"?node.props.text:node.children.map(literal).join("");}
function layout(props:unknown){return getMilestoneBadgeLayout(props as MilestoneBadgeProps);}
function frames(time:unknown){return Math.round(parseTime(time as string)!*30);}

test("milestone uses source-independent authored values and a true inscribed value box",()=>{
  const d=getMilestoneBadgeLayout({value:"72%",label:"Completed",duration:5});
  assert.equal(d.value,"72%");assert.equal(d.label,"Completed");assert.equal(d.color,"#57D6C7");assert.equal(d.backgroundColor,undefined);
  const center={x:d.circle.x+d.circle.width/2,y:d.circle.y+d.circle.height/2};
  for(const x of [d.valueBox.x,d.valueBox.x+d.valueBox.width])for(const y of [d.valueBox.y,d.valueBox.y+d.valueBox.height])assert.ok(Math.hypot(x-center.x,y-center.y)<d.circle.width/2);
  assert.ok(d.fontSize*Array.from(d.value).length*1.1<=d.valueBox.width+.000001);assert.ok(d.fontSize*1.35<=d.valueBox.height+.000001);
  assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.circle)&&Object.isFrozen(d.valueBox)&&Object.isFrozen(d.labelBox));
});

test("circle, context and all label lines remain bounded in independently authored formats/sides",()=>{
  for(const box of [{width:1728,height:520},{width:936,height:700}])for(const labelSide of ["left","right","below"] as const){
    const d=getMilestoneBadgeLayout({value:"240",label:"A useful milestone",labelSide,...box});
    for(const part of [d.circle,d.valueBox,d.labelBox])assert.ok(part.x>=0&&part.y>=0&&part.x+part.width<=d.width+.000001&&part.y+part.height<=d.height+.000001);
    const peak=d.circle.width*1.06,center={x:d.circle.x+d.circle.width/2,y:d.circle.y+d.circle.height/2};
    assert.ok(center.x-peak/2>=0&&center.x+peak/2<=d.width&&center.y-peak/2>=0&&center.y+peak/2<=d.height,"overshoot fits its actual outer clip");
    if(labelSide==="left")assert.ok(d.labelBox.x+d.labelBox.width<d.circle.x);
    if(labelSide==="right")assert.ok(d.circle.x+d.circle.width<d.labelBox.x);
    if(labelSide==="below")assert.ok(d.circle.y+d.circle.height<d.labelBox.y);
    assert.ok(d.label.split("\n").length*d.labelFontSize*1.35<=d.labelBox.height+.000001);
  }
});

test("timing budgets protect the exact fully settled hold including a late label",()=>{
  const options={value:"8",label:"Modules",start:4,duration:"82f",popDuration:"12f",labelDelay:"16f",minHold:"60f"} as const;
  const d=getMilestoneBadgeLayout(options);assert.equal(d.settledFrame,22);assert.equal(d.frames-d.settledFrame,60);assert.equal(d.startFrame,120);assert.equal(d.endFrame,202);
  assert.throws(()=>getMilestoneBadgeLayout({...options,duration:"81f"}),/final reading hold/);
  assert.equal(getMilestoneBadgeLayout({value:"8",label:"Modules",start:4,end:9}).frames,150);
  const short=getMilestoneBadgeLayout({value:"8",label:"Modules",popDuration:"2f",labelDelay:0,duration:"66f"});
  assert.deepEqual((short.circleScale as any[]).map(key=>frames(key.time)),[0,1,2]);
});

test("native editable circle, value and label use fixed Rect clips and independent tracks",()=>{
  const native=mount(()=>MilestoneBadge({key:"goal",value:"72%",label:"Completed",start:7,duration:5,labelSide:"left",color:"#123456",textColor:"#FFFFFF",fontFamily:"Arial",fontSize:40,labelFontSize:32}));
  const root=native.stage.children[0],circle=named(root,"Milestone circle"),value=named(root,"Milestone value"),context=named(root,"Milestone context");
  assert.equal(root.tag,"Rect");assert.equal(root.props.clipToBox,true);assert.equal(root.props.fill,undefined);assert.equal(root.props.start,"210f");assert.equal(root.props.end,"360f");assert.equal(root.props.key,"goal");
  assert.equal(circle.tag,"Rect");assert.equal(circle.props.cornerRadius,circle.props.width/2);assert.equal(circle.props.fill,"#123456");
  assert.deepEqual(circle.props.scale,[{time:"0f",value:.025,easing:"easeOut"},{time:"10f",value:1.06,easing:"easeInOut"},{time:"12f",value:1}]);
  assert.equal(value.parent?.props.name,"Milestone value viewport");assert.equal(value.parent?.props.clipToBox,true);assert.equal(value.parent?.parent,circle);
  assert.equal(context.parent?.props.clipToBox,true);assert.equal(context.props.textAlign,"right");assert.equal(context.props.fontSize,32);assert.equal(value.props.fill,"#FFFFFF");assert.equal(value.props.fontSize,40);
  assert.ok(Array.isArray(context.props.offsetX)&&context.props.offsetX[0].value>0);assert.equal(context.props.offsetY,0);
  assert.equal(literal(value),"72%");assert.equal(literal(context),"Completed");assert.ok(all(root).every(node=>["Rect","Text","#text"].includes(node.tag)));
  for(const node of all(root).filter(node=>node.tag!=="#text"&&node!==root)){assert.equal(node.props.start,"0f");assert.equal(node.props.end,"150f");}
  native.dispose();
});

test("label reveals outward into its fixed viewport for all three sides",()=>{
  for(const side of ["left","right","below"] as const){const d=getMilestoneBadgeLayout({value:"24",label:"Sessions",labelSide:side});
    if(side==="below"){assert.equal(d.labelOffsetX,0);assert.ok((d.labelOffsetY as any[])[0].value<0);}else{assert.equal(d.labelOffsetY,0);assert.ok(side==="left"?(d.labelOffsetX as any[])[0].value>0:(d.labelOffsetX as any[])[0].value<0);}
    for(const value of [d.circleScale,d.valueOpacity,d.valueOffsetY,d.labelOpacity,d.labelOffsetX,d.labelOffsetY])if(Array.isArray(value)){
      const clock=value.map(key=>frames(key.time));assert.equal(new Set(clock).size,clock.length);assert.ok(clock.every((frame,index)=>Number.isSafeInteger(frame)&&(index===0||frame>clock[index-1])));
      assert.ok(Object.isFrozen(value)&&value.every(Object.isFrozen));
    }
  }
});

test("reduced motion keeps all complete literal content from the first frame",()=>{
  const d=getMilestoneBadgeLayout({value:"$8M",label:"Authored example",animate:false,duration:2,minHold:2,labelDelay:30,popDuration:10});
  assert.equal(d.settledFrame,0);assert.equal(d.circleScale,1);assert.equal(d.valueOpacity,1);assert.equal(d.labelOpacity,1);assert.equal(d.valueOffsetY,0);assert.equal(d.labelOffsetX,0);assert.equal(d.labelOffsetY,0);
  const native=mount(()=>MilestoneBadge({value:"$8M",label:"Authored example",animate:false,duration:2,minHold:2}));assert.match(literal(native.stage).replace(/\s+/g," "),/Authored example/);assert.match(literal(native.stage),/\$8M/);native.dispose();
});

test("native tracks remain deterministic under direct/reverse seeks without entity replacement",()=>{
  const native=mount(()=>MilestoneBadge({value:"32",label:"Lessons",start:4,duration:5}));
  const identities=all(native.stage),count=native.created(),tracks=JSON.stringify(identities.map(node=>node.props));
  for(const time of [4,4.1,4.4,5,8.9,5,4.4,4.1,4])native.setTime(time);
  assert.equal(native.created(),count);assert.deepEqual(all(native.stage),identities);assert.equal(JSON.stringify(identities.map(node=>node.props)),tracks);native.dispose();
});

test("fresh equal reactive wording preserves native nodes; authored changes restore backwards",()=>{
  const [time,setTime]=createSignal(0),native=mount(()=>MilestoneBadge({get value(){time();return "24";},get label(){return time()<2?"Lessons":"Chapters";}}));
  const initial=all(native.stage),count=native.created();for(let i=0;i<50;i++)setTime(i/30);assert.equal(native.created(),count);assert.deepEqual(all(native.stage),initial);
  setTime(3);assert.equal(literal(named(native.stage,"Milestone context")),"Chapters");setTime(0);assert.equal(literal(named(native.stage,"Milestone context")),"Lessons");native.dispose();
});

test("optional native background can be added and removed without leaving a stale root paint",()=>{
  const [background,setBackground]=createSignal<string|undefined>(),native=mount(()=>MilestoneBadge({value:"24",label:"Lessons",get backgroundColor(){return background();}}));
  assert.equal(all(native.stage).filter(node=>node.props.name==="Milestone background").length,0);setBackground("#445566");assert.equal(named(native.stage,"Milestone background").props.fill,"#445566");setBackground(undefined);
  assert.equal(all(native.stage).filter(node=>node.props.name==="Milestone background").length,0);assert.equal(native.stage.children[0].props.fill,undefined);native.dispose();
});

test("strict finite bounds, ambiguous timing and unreadable value/label budgets fail before authoring",()=>{
  const good={value:"24",label:"Lessons"};
  for(const bad of [null,{}, {...good,unknown:true},{...good,width:NaN},{...good,height:Infinity},{...good,width:4096,height:4096},{...good,width:100},{...good,value:""},{...good,value:"1\n2"},{...good,value:"1".repeat(17)},{...good,label:"x".repeat(81)},{...good,labelSide:"top"},{...good,start:-1},{...good,start:3600},{...good,end:5,duration:5},{...good,duration:0},{...good,popDuration:"1f"},{...good,popDuration:NaN},{...good,labelDelay:-1},{...good,minHold:0},{...good,minHold:5},{...good,fontSize:512},{...good,fontSize:Infinity},{...good,labelFontSize:Infinity},{...good,fontFamily:""},{...good,color:"orange"},{...good,backgroundColor:"transparent"},{...good,textColor:"red"},{...good,animate:"false"},{...good,width:128,height:128,labelFontSize:256}])assert.throws(()=>layout(bad),JSON.stringify(bad));
  const native=mount(()=>MilestoneBadge({value:"<script>",label:"Literal caller wording",width:1800,height:700}));assert.equal(literal(named(native.stage,"Milestone value")),"<script>");native.dispose();
});
