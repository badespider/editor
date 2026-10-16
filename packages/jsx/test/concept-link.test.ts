import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { ConceptLink, getConceptLinkLayout } from "../src/concept-link";
import type { ConceptLinkProps } from "../src/concept-link";
import { renderProject } from "../src/renderer";
import { parseTime } from "../src/time";
import type { ProjectDocument, ProjectTick } from "../src/document";

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
function close(a: number,b: number){assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);}
function frame(time: unknown): number {return Math.round(parseTime(time as string)!*30);}

test("concept layout retains literal content, frozen geometry and a full reading hold",()=>{
  const d=getConceptLinkLayout({term:"CPU",definition:"Runs supplied instructions",start:7,duration:4});
  assert.equal(d.term,"CPU");assert.equal(d.definition,"Runs supplied instructions");assert.equal(d.startFrame,210);assert.equal(d.endFrame,330);
  assert.equal(d.nodeFrames,10);assert.equal(d.linkFrame,12);assert.equal(d.cardFrame,24);assert.equal(d.revealFrames,10);assert.equal(d.settledFrame,34);assert.equal(d.frames-d.settledFrame,86);
  for(const part of [d,d.node,d.card,d.line,d.line.from,d.line.to])assert.ok(Object.isFrozen(part));
  assert.equal(getConceptLinkLayout({term:"CPU",definition:"Runs code",start:7,end:11}).frames,120);
  assert.throws(()=>getConceptLinkLayout({term:"CPU",definition:"Runs code",duration:"63f"}),/reading hold/);
});

test("bounded down and right layouts meet the circle boundary and correct tag edge",()=>{
  const small=getConceptLinkLayout({term:"IO",definition:"Transfers data",width:160,height:160});assert.equal(small.node.width,48);
  for(const size of [{width:640,height:420},{width:888,height:600},{width:880,height:480},{width:1600,height:700}])for(const direction of ["down","right"] as const){
    const d=getConceptLinkLayout({term:"API",definition:"A defined interface",...size,direction});
    const {node:n,card:c,line:l}=d,r=n.width/2,center={x:n.x+r,y:n.y+r};
    close(Math.hypot(l.from.x-center.x,l.from.y-center.y),r);
    close(Math.hypot(l.to.x-l.from.x,l.to.y-l.from.y),l.length);
    if(direction==="down"){close(l.to.y,c.y);close(l.to.x,c.x+c.width/2);}else{close(l.to.x,c.x);close(l.to.y,c.y+c.height/2);}
    assert.ok(n.x-n.width*.03>=0&&n.y-n.height*.03>=0&&n.x+n.width*1.03<=d.width&&n.y+n.height*1.03<=d.height,"overshooting circle remains inside fixed bounds");
    assert.ok(c.x>=0&&c.y>=0&&c.x+c.width<=d.width&&c.y+c.height<=d.height);
    assert.ok(d.wrappedDefinition.split("\n").length<=3);assert.ok(d.termFontSize>=8);
  }
});

test("one editable circle, growing connector and independently clipped tag use explicit local time",()=>{
  const native=mount(()=>ConceptLink({term:"CPU",definition:"Runs supplied instructions",x:20,y:30,start:7,duration:4}));
  const root=native.stage.children[0];assert.equal(root.tag,"Rect");assert.equal(root.props.fill,undefined);assert.equal(root.props.clipToBox,true);assert.equal(root.props.start,"210f");assert.equal(root.props.end,"330f");
  const circle=named(root,"Concept term circle"), term=named(root,"Concept term");
  assert.equal(circle.props.cornerRadius,circle.props.width/2);assert.deepEqual(circle.props.scale,[{time:"0f",value:.05,easing:"easeOut"},{time:"8f",value:1.06,easing:"easeInOut"},{time:"10f",value:1}]);
  assert.equal(term.props.start,"2f");assert.equal(term.props.end,"120f");assert.equal(content(term),"CPU");
  const line=named(root,"Concept connector");assert.equal(line.props.start,"12f");assert.equal(line.props.end,"120f");assert.equal(line.props.width[0].value,0);assert.equal(line.props.width[1].time,"10f");
  const tag=named(root,"Concept definition reveal");assert.equal(tag.tag,"Rect");assert.equal(tag.props.clipToBox,true);assert.equal(tag.props.fill,undefined);assert.equal(tag.props.start,"24f");assert.equal(tag.props.end,"120f");assert.equal(tag.props.width[0].value,0);
  assert.equal(named(root,"Concept definition").props.start,"0f");assert.equal(named(root,"Concept definition").props.end,"96f");assert.equal(named(root,"Concept definition surface").props.width,tag.props.width[1].value);
  assert.equal(root.children[0],line,"connector paints behind its term and definition");
  assert.ok(all(root).every(node=>!["Group","Surface","Video","Image","Html","ShaderPaint"].includes(node.tag)));
  for(const leaf of all(root).filter(node=>node.tag==="Rect"||node.tag==="Text"))assert.ok(leaf.props.start!==undefined&&leaf.props.end!==undefined,"all native leaves have explicit lifetimes");native.dispose();
});

test("animated connector keeps the node endpoint anchored during growth, including diagonal layouts",()=>{
  for(const direction of ["down","right"] as const){
    const d=getConceptLinkLayout({term:"RAM",definition:"Working memory",direction});
    const native=mount(()=>ConceptLink({term:"RAM",definition:"Working memory",direction}));
    const line=named(native.stage,"Concept connector"), angle=line.props.rotation*Math.PI/180;
    // x/y/width share exactly the same easeOut progress. Evaluate several
    // possible progresses independent of playback direction or easing formula.
    for(const progress of [0,.125,.5,.875,1]){
      const interpolate=(track:any[])=>track[0].value+(track[1].value-track[0].value)*progress;
      const width=interpolate(line.props.width),centerX=interpolate(line.props.x)+width/2,centerY=interpolate(line.props.y)+line.props.height/2;
      close(centerX-Math.cos(angle)*width/2,d.line.from.x);close(centerY-Math.sin(angle)*width/2,d.line.from.y);
      close(centerX+Math.cos(angle)*width/2,d.line.from.x+(d.line.to.x-d.line.from.x)*progress);
      close(centerY+Math.sin(angle)*width/2,d.line.from.y+(d.line.to.y-d.line.from.y)*progress);
    }native.dispose();
  }
});

test("reduced motion keeps staged terms and full definition text with no decorative tracks",()=>{
  const d=getConceptLinkLayout({term:"NET",definition:"Moves data between machines",animate:false});assert.equal(d.settledFrame,24);
  const native=mount(()=>ConceptLink({term:"NET",definition:"Moves data between machines",animate:false}));
  const circle=named(native.stage,"Concept term circle"),line=named(native.stage,"Concept connector"),card=named(native.stage,"Concept definition reveal");
  assert.equal(circle.props.scale,1);assert.equal(line.props.start,"12f");assert.equal(card.props.start,"24f");assert.equal(line.props.width,d.line.length);assert.equal(card.props.width,d.card.width);assert.equal(named(native.stage,"Concept term").props.start,"0f");
  assert.equal(content(named(native.stage,"Concept definition")),d.wrappedDefinition);
  for(const node of all(native.stage))for(const value of Object.values(node.props))assert.ok(!Array.isArray(value),"reduced mode uses static values and lifetimes");native.dispose();
});

test("direct and reverse native clock seeks preserve identities and stage/track state",()=>{
  const native=mount(()=>ConceptLink({term:"IO",definition:"Transfers input and output",start:2,duration:4}));
  const nodes=all(native.stage),created=native.created(),snapshot=()=>JSON.stringify(all(native.stage).map(node=>[node.tag,node.props]));
  const initial=snapshot();for(const time of [2,2.2,2.4,2.8,3.133,5.9,3.133,2.8,2.4,2.2,2]){native.setTime(time);assert.equal(snapshot(),initial);}
  assert.equal(native.created(),created);assert.deepEqual(all(native.stage),nodes);
  const card=named(native.stage,"Concept definition reveal"), timeline=[0,12,23,24,34,80,34,24,23,12,0];
  const state=(at:number)=>at<frame(card.props.start)?"absent":at<frame(card.props.start)+frame(card.props.width[1].time)?"revealing":"held";
  assert.deepEqual(timeline.slice(0,5).map(state),timeline.slice(6).reverse().map(state));native.dispose();
});

test("equal fresh reactive content does not rebuild nodes; authored changes can restore backwards",()=>{
  const [clock,setClock]=createSignal(0);const native=mount(()=>ConceptLink({get term(){return clock()<2?"API":"CPU";},get definition(){return clock()<2?"A defined interface":"Runs supplied instructions";}}));
  const created=native.created(),nodes=all(native.stage);
  for(let i=0;i<50;i++){setClock(i/30);native.setTime(i/30);}assert.equal(native.created(),created);assert.deepEqual(all(native.stage),nodes);
  setClock(3);assert.equal(content(named(native.stage,"Concept term")),"CPU");setClock(0);assert.equal(content(named(native.stage,"Concept term")),"API");native.dispose();
});

test("strict content, timing, colors and geometry fail before mounting invalid native nodes",()=>{
  const base={term:"CPU",definition:"Runs code"};
  const bad:unknown[]=[null,{}, {...base,term:""},{...base,term:"twenty one characters!"},{...base,definition:"line\nbreak"},{...base,definition:"x".repeat(101)},
    {...base,duration:-1},{...base,end:5,duration:5},{...base,start:3600},{...base,nodeDuration:"2f"},{...base,linkDelay:"9f"},{...base,cardDelay:"20f"},{...base,revealDuration:0},{...base,minHold:0},{...base,duration:1},
    {...base,width:NaN},{...base,height:Infinity},{...base,width:4096,height:4096},{...base,nodeSize:500},{...base,cardWidth:900},{...base,width:180,height:180,fontSize:60},{...base,nodeSize:200,height:260},
    {...base,term:"LONGUNBROKENTERM"},{...base,direction:"up"},{...base,fontFamily:""},{...base,fontSize:7},{...base,accent:"orange"},{...base,textColor:"transparent"},{...base,surfaceColor:"#FFF"},{...base,lineColor:8},{...base,animate:"false"},{...base,unsupported:"field"}];
  for(const input of bad)assert.throws(()=>getConceptLinkLayout(input as ConceptLinkProps),JSON.stringify(input));
});
