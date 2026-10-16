import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import { AssembleTitle, getAssembleTitleLayout } from "../src/assemble-title";
import type { AssembleTitleProps } from "../src/assemble-title";
import { renderProject } from "../src/renderer";
import type { ProjectDocument, ProjectTick } from "../src/document";
type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(props: AssembleTitleProps) {
  const stage: Node = {tag:"stage",props:{},children:[]};
  const [tick,setTick]=createSignal<ProjectTick>({time:0,frame:0,delta:0,playing:false});let created=0;
  const document: ProjectDocument<Node>={stage,tick,createElement(tag){created++;return{tag,props:{},children:[]};},createTextNode(text){created++;return{tag:"#text",props:{text},children:[]};},replaceText(node,text){node.props.text=text;},isTextNode:node=>node.tag==="#text",setProperty(node,key,value){node.props[key]=value;},
    insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},getParentNode:node=>node.parent,getFirstChild:node=>node.children[0],getNextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]};
  return{stage,created:()=>created,dispose:renderProject(()=>AssembleTitle(props),document),seek(time:number){setTick({time,frame:Math.round(time*30),delta:time-tick().time,playing:false});}};
}
const all=(node:Node):Node[]=>[node,...node.children.flatMap(all)];
const literal=(node:Node):string=>node.tag==="#text"?node.props.text:node.children.map(literal).join("");

test("assembly allocates fixed glyph positions and spreads local onsets within a complete hold budget",()=>{
  const d=getAssembleTitleLayout({text:"A CLEAR IDEA",subtitle:"Authored example",start:3,duration:6,revealDuration:1.2,glyphDuration:.4,minHold:3});
  assert.equal(d.startFrame,90);assert.equal(d.endFrame,270);assert.equal(d.glyphs.length,10);
  assert.equal(d.glyphs[0].onset,0);assert.equal(d.glyphs.at(-1)!.onset+d.glyphFrames,d.revealFrames);
  assert.equal(d.subtitleFrame,39);assert.equal(d.settledFrame,45);assert.ok(d.frames-d.settledFrame>=d.holdFrames);
  assert.ok(Object.isFrozen(d)&&Object.isFrozen(d.glyphs)&&Object.isFrozen(d.glyphs[0]));
  for(const glyph of d.glyphs){assert.ok(glyph.x>=0);assert.ok(glyph.x+glyph.width<=d.width);assert.ok(glyph.y>=0&&glyph.y+glyph.height<=d.height);}
  assert.equal(d.measurement,"conservative");
});

test("native assembly has editable literal glyphs, blur animations and bounded component-local tracks",()=>{
  const native=mount({text:'";run();',subtitle:"Literal text",start:4,duration:6});
  try{
    const root=native.stage.children[0],glyphs=root.children.filter(node=>node.props.name?.startsWith("Assembly glyph"));
    assert.equal(root.props.start,"120f");assert.equal(root.props.end,"300f");assert.equal(root.props.clipToBox,true);assert.equal(root.props.fill,undefined);
    assert.equal(glyphs.map(literal).join(""),'";run();');assert.equal(literal(root.children.at(-1)!),"Literal text");
    assert.ok(glyphs.every(node=>node.tag==="Text"&&node.props.end==="180f"));
    assert.deepEqual(glyphs[0].props.animations,[{type:"blur",phase:"in",duration:"12f"}]);
    assert.equal(glyphs[0].props.opacity[0].value,0);assert.equal(glyphs[0].props.opacity.at(-1).value,1);
    const nodes=all(native.stage),count=native.created();for(const time of [0,.2,1.5,5,.2,0])native.seek(time);
    assert.equal(native.created(),count);assert.deepEqual(all(native.stage),nodes);
  }finally{native.dispose();}
});

test("reduced motion retains the authored subtitle stage and complete title; blur can be disabled independently",()=>{
  const quiet=mount({text:"CLEAR",subtitle:"Second stage",animate:false,duration:5});
  try{
    const root=quiet.stage.children[0],glyphs=root.children.slice(0,-1);
    assert.ok(glyphs.every(node=>node.props.start==="0f"&&node.props.opacity===1&&node.props.offsetX===0&&node.props.offsetY===0&&node.props.scale===1&&node.props.animations.length===0));
    assert.equal(root.children.at(-1)!.props.start,"39f");
  }finally{quiet.dispose();}
  const unblurred=mount({text:"CLEAR",blur:false});try{assert.ok(unblurred.stage.children[0].children.every(node=>node.props.animations.length===0));}finally{unblurred.dispose();}
});

test("bounds and invalid stage budgets reject before creating native text",()=>{
  const invalid:unknown[]=[null,{}, {text:""},{text:"A\nB"},{text:"A😀"},{text:"A".repeat(49)}, {text:"Hi",duration:0},{text:"Hi",duration:2},{text:"Hi",start:3599,duration:6},{text:"Hi",duration:6,end:6},{text:"Hi",glyphDuration:2,revealDuration:1},{text:"Hi",width:159},{text:"Hi",height:119},{text:"Hi",width:4096,height:4096},{text:"A LONG TITLE",width:180,height:120,fontSize:90},{text:"Hi",subtitle:"x".repeat(96),width:300,fontSize:80},{text:"Hi",scatter:NaN},{text:"Hi",color:"orange"},{text:"Hi",fontWeight:750},{text:"Hi",animate:"false"},{text:"Hi",unknown:true}];
  for(const props of invalid)assert.throws(()=>getAssembleTitleLayout(props as AssembleTitleProps),JSON.stringify(props));
  const single=getAssembleTitleLayout({text:"A",duration:4});assert.equal(single.glyphs[0].onset,0);
  const portrait=getAssembleTitleLayout({text:"MAKE IT CLEAR",width:936,height:360,duration:5});assert.ok(portrait.glyphs.at(-1)!.x<936);
});
