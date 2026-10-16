import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMotionMixBrief, buildMotionMixModule, getMotionMixExample, mixableMotionMoments } from "../src/motion-mix.ts";
import { motionMoments, buildMotionModule, getMotionContentExample } from "../src/motion-catalog.ts";
import { nativeModule } from "./native-motion-host.ts";
import type { NativeNode } from "./native-motion-host.ts";

function descendants(node:NativeNode):NativeNode[]{return [node,...node.children.flatMap(descendants)];}
function literal(node:NativeNode):string{return node.tag==="#text"?String(node.props.text):node.children.map(literal).join("");}

test("mix discovery reuses curated catalog metadata and preserves independent editable examples",()=>{
  assert.deepEqual(mixableMotionMoments().map(item=>item.id),motionMoments.filter(item=>item.mixable).map(item=>item.id));
  assert.equal(mixableMotionMoments().length,7);
  assert.ok(mixableMotionMoments().some(item=>item.id==="counter-reveal"));
  const first=getMotionMixExample(),second=getMotionMixExample();
  first.instances[0].box.width=100;
  assert.equal(second.instances[0].box.width,1920);
  const brief=buildMotionMixBrief(second);
  assert.equal(brief.duration,8);assert.ok(Object.isFrozen(brief.instances[1].content.values));
  assert.equal(brief.stackOrder,"instances are drawn bottom to top in array order");
});

test("mix validates timing, scene bounds, instance identity and strict per-preset content",()=>{
  const example=getMotionMixExample();
  const revise=(change:(copy:typeof example)=>void)=>{const copy=structuredClone(example);change(copy);return copy;};
  for(const invalid of [
    {...example,unexpected:true},
    revise(copy=>{copy.instances[1].key=copy.instances[0].key;}),
    revise(copy=>{copy.instances[1].presetId="question-reveal";}),
    revise(copy=>{copy.instances[1].presetId="missing";}),
    revise(copy=>{copy.instances[1].box.x=1900;}),
    revise(copy=>{copy.instances[1].end=copy.instances[1].start;}),
    revise(copy=>{copy.instances[1].end=8.1;}),
    revise(copy=>{copy.instances[1].end=1;}),
    revise(copy=>{copy.instances[1].content={values:["A"]};}),
    revise(copy=>{copy.instances[1].content={values:[1,2],stepDuration:.1,revealDuration:.2};}),
    revise(copy=>{copy.instances[1].content={values:[1,2],stepDurations:[.3,.4]};}),
    revise(copy=>{copy.instances[1].content={values:[1,2],fontSize:2048};}),
    revise(copy=>{copy.instances[1].content={values:[1,2],rowHeight:500};}),
    revise(copy=>{copy.instances[1].content={values:[1,2],echo:{offsetX:1800}};}),
    revise(copy=>{copy.instances[2].content={...copy.instances[2].content,baseline:4};}),
    revise(copy=>{copy.instances[2].box.width=400;}),
    revise(copy=>{copy.instances[0].content={src:"https://invalid.example/executable"};}),
  ])assert.throws(()=>buildMotionMixModule(invalid));
  const sparse=structuredClone(example);delete sparse.instances[1];
  assert.throws(()=>buildMotionMixBrief(sparse));
  const frames=buildMotionMixBrief(revise(copy=>{copy.instances[2].start=1.001;copy.instances[2].end=7.999;}));
  assert.equal(frames.instances[2].start,1);assert.equal(frames.instances[2].end,8);
});

for(const format of ["landscape","portrait"] as const){
  test(`${format} mix executes actual native host components without demo scene wrappers`,async()=>{
    const example=getMotionMixExample(format);
    example.instances[2].content!.data=[{label:"Before",value:20,color:"#123456"},{label:"After",value:70}];
    const source=buildMotionMixModule(example);
    assert.deepEqual(Array.from(source.matchAll(/from "([^"]+)"/g),match=>match[1]),["dapi-host:@diffusionstudio/jsx"]);
    assert.doesNotMatch(source,/fetch\(|setTimeout\(|Math\.random|Date\.|SOURCE MATERIAL \/ AUTHORED PLACEHOLDER/);
    const native=await nativeModule(source),mounted=native.mount();
    try{
      const root=mounted.document.stage.children[0];
      assert.equal(root.props.scene,"native-motion-mix");assert.equal(root.props.end,"240f");
      assert.deepEqual(root.children.map(child=>child.props.key),example.instances.map(item=>item.key));
      for(let index=0;index<root.children.length;index++){
        const wrapper=root.children[index],item=example.instances[index];
        assert.equal(wrapper.props.fill,undefined,"only the scene and selected background supply a fill");
        assert.equal(wrapper.props.clipToBox,true);assert.equal(wrapper.props.start,`${Math.round(item.start*30)}f`);
        assert.equal(wrapper.children[0].props.start,"0f","child time is local to its own placed wrapper");
      }
      const all=mounted.nodes();
      assert.ok(all.some(node=>node.props.name==="Counter foreground row"));
      assert.ok(all.some(node=>node.props.name==="Counter echo row"));
      assert.ok(all.some(node=>node.props.name==="SourceCard"));
      assert.ok(all.some(node=>node.props.name==="DataBars"));
      assert.ok(all.some(node=>node.props.name==="Bar 1" && node.props.fill==="#123456"),"supplied native data color survives the recipe adapter");
      assert.ok(all.some(node=>literal(node).replace(/\s+/g," ").includes("Authored sample data")),"illustrative disclosure stays visible");
      assert.ok(!all.some(node=>/\/title$|\/role$|\/source$/.test(String(node.props.name))),"template demonstration labels are absent");
      const counter=root.children[1],before=descendants(counter),created=mounted.created();
      for(const time of [7,0,2,1,7,0])mounted.setTime(time);
      assert.equal(mounted.created(),created,"native glyph entities survive repeated and reverse seeks");
      assert.deepEqual(descendants(counter),before);
    } finally{mounted.dispose();}
  });
}

test("repeated presets are distinct keyed native instances with local clocks and literal data",async()=>{
  const example=getMotionMixExample();
  example.instances=example.instances.slice(0,2);
  example.instances[1]={...example.instances[1],key:"first",end:4,content:{values:[10,20],echo:false}};
  example.instances.push({...structuredClone(example.instances[1]),key:"second",start:4,end:8,content:{values:[30,40],echo:false}});
  const native=await nativeModule(buildMotionMixModule(example)),mounted=native.mount();
  try{
    const root=mounted.document.stage.children[0],first=root.children[1],second=root.children[2];
    assert.notEqual(first,second);assert.equal(first.props.key,"first");assert.equal(second.props.key,"second");
    assert.equal(second.props.start,"120f");assert.equal(second.children[0].props.start,"0f");
    const firstTexts=descendants(first).filter(node=>node.tag==="Text"),secondTexts=descendants(second).filter(node=>node.tag==="Text");
    assert.equal(firstTexts.map(literal).join(""),"120");assert.equal(secondTexts.map(literal).join(""),"340");
    assert.equal(firstTexts[0].props.end,"10f");
  } finally{mounted.dispose();}
});

test("counter settings support uneven authored intervals and code-looking text remains literal",async()=>{
  const example=getMotionMixExample();
  example.instances[1].content={values:["$1M","$2M","$10B"],stepDurations:[.2,.4],revealDuration:.1,minHold:1,echo:false};
  example.instances[3].content={title:'";throw Error("bad");//',source:"Original author",detail:"Literal caller wording"};
  const brief=buildMotionMixBrief(example);
  assert.equal(brief.instances[1].content.stepDuration,undefined);
  const native=await nativeModule(buildMotionMixModule(example)),mounted=native.mount();
  try{assert.ok(mounted.nodes().some(node=>literal(node).replace(/\s+/g," ").includes('";throw Error("bad");//')));}
  finally{mounted.dispose();}
  const template=await nativeModule(buildMotionModule({momentIds:["counter-reveal"],format:"portrait",mode:"template",content:{"counter-reveal":getMotionContentExample("counter-reveal")}}));
  const templateMount=template.mount();templateMount.dispose();
});
