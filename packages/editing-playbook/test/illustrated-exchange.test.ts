import assert from "node:assert/strict";
import test from "node:test";
import { buildMotionBrief, getMotionMoment, searchMotionMoments } from "../src/motion-catalog.ts";
import { buildMotionMixBrief, buildMotionMixModule } from "../src/motion-mix.ts";
import { recommend } from "../src/catalog.ts";
import { nativeModule } from "./native-motion-host.ts";

test("illustrated exchange is discoverable with its reusable skill, guide and native adapter",()=>{
  const item=getMotionMoment("exchange-diagram");assert.equal(item.mixable,true);assert.equal(item.category,"education");
  assert.deepEqual(searchMotionMoments("vector exchange").map(v=>v.id),["exchange-diagram"]);
  for(const goal of ["money exchange","vector drawings","nested groups","articulated limbs"]){const result=recommend("story",goal,false,"compose");assert.ok(result.skills.some(s=>s.id==="editor-illustrated-exchange"),goal);assert.ok(result.skills.some(s=>s.id==="editor-motion-recipes"),goal);}
});
test("exchange preset content and timing are bounded before code generation",()=>{
  const create=(settings:Record<string,unknown>)=>buildMotionBrief({momentIds:["exchange-diagram"],format:"landscape",mode:"template",content:{"exchange-diagram":settings}});
  const brief=create({moneyLabel:"€",spentLabel:"PAID",earnedLabel:"RECEIVED",moneyColor:"#22AACC"});assert.equal(brief.content["exchange-diagram"].moneyLabel,"€");
  for(const settings of [{presentation:"unknown"},{script:"untrusted"},{moneyColor:"green"},{transferDuration:.05},{transferStart:3,labelDelay:4.1},{labelDelay:6.5},{spentLabel:"x".repeat(19)},{goodsLabel:"new\nline"}])assert.throws(()=>create(settings));
});
test("repeated exchange mixes keep native vector hierarchy, local lifetimes and independent content",async()=>{
  const recipe={schemaVersion:1,format:"landscape",duration:7,instances:[
    {key:"first",presetId:"exchange-diagram",start:0,end:7,box:{x:0,y:200,width:960,height:600},content:{moneyLabel:"€",spentLabel:"PAID",earnedLabel:"RECEIVED"}},
    {key:"second",presetId:"exchange-diagram",start:0,end:7,box:{x:960,y:200,width:960,height:600},content:{moneyLabel:"£",moneyColor:"#5577CC"}},
  ]};
  const brief=buildMotionMixBrief(recipe);assert.ok(brief.skillReadArgs.some(v=>v[2]==="editor-illustrated-exchange"));
  const native=await nativeModule(buildMotionMixModule(recipe)),mounted=native.mount();
  try{
    const nodes=mounted.nodes(),parts=nodes.filter(n=>n.tag==="Path");assert.ok(parts.length>=70);assert.ok(nodes.every(n=>!["Surface","Image","Video","Html"].includes(n.tag)));
    const keyed=nodes.filter(n=>n.props.key!==undefined).map(n=>n.props.key);assert.equal(new Set(keyed).size,keyed.length,"repeated instances never duplicate internal native keys");
    const symbols=nodes.filter(n=>n.props.name==="Money symbol").map(n=>n.children.map(c=>c.props.text).join(""));assert.deepEqual(symbols,["€","£"]);
    const shoulders=nodes.filter(n=>n.props.name==="Right shoulder pivot"),elbows=nodes.filter(n=>n.props.name==="Right elbow pivot");assert.equal(shoulders.length,4);assert.equal(elbows.length,2);for(const elbow of elbows)assert.ok(shoulders.includes(elbow.parent!));
    const created=mounted.created(),snapshot=JSON.stringify(nodes.map(n=>n.props));for(const t of [0,1,3,6,3,1,0]){mounted.setTime(t);assert.equal(JSON.stringify(mounted.nodes().map(n=>n.props)),snapshot);}assert.equal(mounted.created(),created);
  }finally{mounted.dispose();}
  assert.throws(()=>buildMotionMixBrief({...recipe,instances:[{...recipe.instances[0],box:{x:0,y:0,width:300,height:600}}]}),/at least 360/);
});
