import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { ExchangeDiagram, GoodsBox, IllustratedPerson, MoneyNote, getExchangeDiagramLayout } from "../src/illustrated-exchange";
import type { ExchangeDiagramProps } from "../src/illustrated-exchange";
import { renderProject } from "../src/renderer";
import type { ProjectDocument, ProjectTick } from "../src/document";

type Node={tag:string;props:Record<string,any>;children:Node[];parent?:Node};
function mount(component:()=>JSX.Element){
  const stage:Node={tag:"stage",props:{},children:[]};
  const [tick,setTick]=createSignal<ProjectTick>({time:0,frame:0,delta:0,playing:false});let created=0;
  const document:ProjectDocument<Node>={stage,tick,createElement(tag){created++;return{tag,props:{},children:[]};},createTextNode(text){return{tag:"#text",props:{text},children:[]};},replaceText(node,text){node.props.text=text;},isTextNode:node=>node.tag==="#text",setProperty(node,key,value){node.props[key]=value;},insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},getParentNode:node=>node.parent,getFirstChild:node=>node.children[0],getNextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]};
  return{stage,created:()=>created,dispose:renderProject(component,document),setTime(time:number){setTick({time,frame:Math.floor(time*30),delta:time-tick().time,playing:false});}};
}
function all(node:Node):Node[]{return[node,...node.children.flatMap(all)];}
function named(node:Node,name:string){const found=all(node).find(n=>n.props.name===name);assert.ok(found,name);return found;}
function content(node:Node):string{return node.tag==="#text"?node.props.text:node.children.map(content).join("");}

test("exchange has canonical transfer stages, literal changed content and a final hold",()=>{
  const d=getExchangeDiagramLayout({start:2,duration:7,spentLabel:"PAID",earnedLabel:"RECEIVED",moneyLabel:"€",goodsLabel:"BOOK"});
  assert.equal(d.startFrame,60);assert.equal(d.endFrame,270);assert.equal(d.transferFrame,15);assert.equal(d.transferFrames,105);assert.equal(d.labelFrame,123);assert.ok(d.frames-d.labelFrame-6>=d.holdFrames);assert.ok(Object.isFrozen(d));assert.equal(d.goodsLabel,"BOOK");assert.equal(d.moneyLabel,"€");
  assert.equal(getExchangeDiagramLayout({start:2,end:9}).frames,210);
});
test("all illustration artwork uses editable paths and native articulated group descendants",()=>{
  const native=mount(()=>ExchangeDiagram({start:3,duration:7}));
  const nodes=all(native.stage);assert.ok(nodes.filter(n=>n.tag==="Path").length>=35);assert.ok(nodes.every(n=>!["Surface","Image","Video","Html","ShaderPaint"].includes(n.tag)));
  const payer=named(native.stage,"Payer / articulated person"),seller=named(native.stage,"Seller / articulated person");
  assert.equal(named(payer,"Right shoulder pivot").props.anchorX,0);assert.equal(named(seller,"Left shoulder pivot").props.anchorX,1);
  assert.equal(named(payer,"Right elbow pivot").parent,named(payer,"Right shoulder pivot"));
  assert.equal(named(seller,"Left elbow pivot").parent,named(seller,"Left shoulder pivot"));
  assert.ok(Array.isArray(named(payer,"Right shoulder pivot").props.rotation));
  assert.ok(Array.isArray(named(payer,"Right elbow pivot").props.rotation));
  assert.ok(nodes.filter(n=>n.tag==="Path").every(n=>Array.isArray(n.props.commands)&&n.props.strokeWidth>0&&n.props.start!==undefined&&n.props.end!==undefined));
  assert.equal(native.stage.children[0].props.start,"90f");assert.equal(native.stage.children[0].props.end,"300f");native.dispose();
});
test("money and goods travel in opposite directions and use one local authored clock",()=>{
  const native=mount(()=>ExchangeDiagram({start:4,duration:7,presentation:"handoff"}));
  const money=named(native.stage,"Money transfer arc"),goods=named(native.stage,"Goods transfer arc");
  assert.equal(money.props.start,"0f");assert.equal(money.props.end,"210f");assert.equal(goods.props.end,"210f");
  assert.ok(money.props.x[0].value<money.props.x.at(-1).value);assert.ok(goods.props.x[0].value>goods.props.x.at(-1).value);
  assert.ok(Math.min(...money.props.y.map((p:any)=>p.value))<money.props.y[0].value);
  assert.equal(named(native.stage,"Exchange explanation labels").props.start,"123f");assert.equal(named(native.stage,"Spent label").props.end,"87f");native.dispose();
});
test("changed-content, portrait and repeated native parts retain literal independent nodes",()=>{
  const native=mount(()=>ExchangeDiagram({width:936,height:1100,spentLabel:"TUITION",earnedLabel:"LESSONS",moneyLabel:"£",goodsLabel:"COURSE",moneyColor:"#55AAEE",clothingColor:"#B0A0C0"}));
  assert.equal(content(named(native.stage,"Spent label")),"TUITION");assert.equal(content(named(native.stage,"Earned label")),"LESSONS");assert.equal(content(named(native.stage,"Money symbol")),"£");assert.equal(content(named(native.stage,"Parcel label")),"COURSE");
  assert.equal(named(native.stage,"Banknote 1").props.fill,"#55AAEE");assert.equal(named(native.stage,"Dress").props.fill,"#B0A0C0");
  const coords=native.stage.children[0].children[0];assert.equal(coords.props.width,1000);assert.equal(coords.props.height,600);assert.equal(coords.props.anchorX,0);assert.equal(coords.props.scale,.936);assert.ok(coords.props.y>0);native.dispose();
});
test("reduced motion keeps meaning, labels and independent vector parts without transform tracks",()=>{
  const native=mount(()=>ExchangeDiagram({animate:false}));
  for(const node of all(native.stage))for(const key of ["x","y","rotation","scale","opacity"])assert.ok(!Array.isArray(node.props[key]),`${node.props.name}/${key}`);
  assert.equal(named(native.stage,"Money transfer arc").props.x,485);assert.equal(named(native.stage,"Goods transfer arc").props.x,485);assert.equal(content(named(native.stage,"Spent label")),"SPENT");native.dispose();
});
test("direct and reverse native clock seeks retain exact native graph and authored tracks",()=>{
  const native=mount(()=>ExchangeDiagram({duration:7})),nodes=all(native.stage),count=native.created(),snapshot=()=>JSON.stringify(all(native.stage).map(n=>[n.tag,n.props]));
  const initial=snapshot();for(const time of [0,.5,1.2,2.7,4,4.3,6.9,4.3,4,2.7,1.2,.5,0]){native.setTime(time);assert.equal(snapshot(),initial);}
  assert.equal(native.created(),count);assert.deepEqual(all(native.stage),nodes);native.dispose();
});
test("parts are independently reusable and preserve caller-supplied style and content",()=>{
  const money=mount(()=>MoneyNote({label:"€",color:"#227799",duration:2}));assert.equal(content(named(money.stage,"Money symbol")),"€");assert.equal(named(money.stage,"Banknote 1").props.fill,"#227799");money.dispose();
  const goods=mount(()=>GoodsBox({label:"FOOD",color:"#E5AE70",duration:2}));assert.equal(content(named(goods.stage,"Parcel label")),"FOOD");assert.equal(all(goods.stage).filter(n=>n.tag==="Path").length,3);goods.dispose();
  for(const appearance of ["ponytail","short"] as const)for(const facing of ["left","right"] as const){const person=mount(()=>IllustratedPerson({appearance,facing,duration:3}));assert.ok(named(person.stage,facing==="right"?"Right elbow pivot":"Left elbow pivot"));person.dispose();}
});
test("invalid content, dimensions, timing and unsupported fields fail before native construction",()=>{
  const invalid:unknown[]=[null,{}, {presentation:"unknown"},{width:359},{height:239},{width:4096,height:4096},{duration:1},{duration:7,end:7},{start:-1},{transferDuration:"3f"},{transferStart:1,transferDuration:4,labelDelay:4},{labelDelay:6.5},{spentLabel:""},{moneyLabel:"a".repeat(9)},{goodsLabel:"line\nbreak"},{moneyColor:"green"},{fontFamily:""},{animate:"false"},{untrusted:"field"}];
  for(const input of invalid.filter(value=>JSON.stringify(value)!=="{}"))assert.throws(()=>getExchangeDiagramLayout(input as ExchangeDiagramProps),JSON.stringify(input));
});
test("cycle mode holds money above goods with native arrows; handoff remains distinct",()=>{
  const native=mount(()=>ExchangeDiagram({presentation:"cycle"}));
  const money=named(native.stage,"Money transfer arc"),goods=named(native.stage,"Goods transfer arc");
  assert.equal(money.props.x.at(-1).value,485);assert.equal(goods.props.x.at(-1).value,485);
  assert.equal(money.props.y.at(-1).value,85);assert.equal(goods.props.y.at(-1).value,200);
  assert.ok(named(native.stage,"Clockwise money to goods arrow"));assert.ok(named(native.stage,"Clockwise goods to money arrow"));
  assert.equal(getExchangeDiagramLayout({}).presentation,"cycle");native.dispose();
});
test("each path selection box contains its normalized commands, controls and stroke",()=>{
  const native=mount(()=>ExchangeDiagram({}));
  for(const path of all(native.stage).filter(n=>n.tag==="Path")){
    const margin=path.props.strokeWidth/2;
    assert.ok(path.props.width>margin*2&&path.props.height>margin*2,path.props.name);
    for(const command of path.props.commands){
      for(const field of ["x","cx","c1x","c2x"])if(field in command)assert.ok(command[field]>=margin&&command[field]<=path.props.width-margin,path.props.name+"/"+field);
      for(const field of ["y","cy","c1y","c2y"])if(field in command)assert.ok(command[field]>=margin&&command[field]<=path.props.height-margin,path.props.name+"/"+field);
    }
  }
  const arrow=named(native.stage,"Earned curved arrow");assert.ok(arrow.props.x>500&&arrow.props.width<100);
  const arm=named(native.stage,"Left forearm and hand");assert.ok(arm.props.y<0&&arm.props.height<100);
  native.dispose();
});
