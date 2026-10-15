import assert from "node:assert/strict";
import test from "node:test";
import { buildMotionBrief, buildMotionModule, getMotionContentExample, motionCategories, motionMoments, searchMotionMoments } from "../src/motion-catalog.ts";

test("every requested creative category has searchable native entries",()=>{
  assert.equal(motionCategories.length,11);
  for(const category of motionCategories){
    const entries=searchMotionMoments("","portrait",category);
    assert.ok(entries.length,category);
    assert.ok(entries.every(entry=>entry.category===category));
  }
  assert.throws(()=>searchMotionMoments("",undefined,"unknown" as never));
});
test("editable settings are independent, immutable in briefs and bound to selected IDs",()=>{
  const example=getMotionContentExample("chart-bars");
  const untouched=getMotionContentExample("chart-bars");
  example.title="Changed";
  assert.notEqual(example.title,untouched.title);
  const brief=buildMotionBrief({momentIds:["chart-bars"],mode:"template",format:"portrait",content:{"chart-bars":{title:"My data",data:[{label:"A",value:4}],valueDomain:[0,8],unit:"kg",disclosure:{kind:"source",text:"Caller-supplied lab record"}}}});
  assert.equal(brief.content["chart-bars"].title,"My data");
  assert.ok(Object.isFrozen(brief.content["chart-bars"].data));
  assert.throws(()=>buildMotionBrief({momentIds:["chart-bars"],mode:"template",format:"portrait",content:{"metric-card":{}}}),/unselected/);
});
test("unrecognized parameters and malformed numerical, caption or motion settings fail before module creation",()=>{
  const make=(content:Record<string,unknown>)=>buildMotionModule({momentIds:["chart-bars"],mode:"template",format:"portrait",content:{"chart-bars":content}});
  assert.throws(()=>make({madeUp:true}));
  assert.throws(()=>make({data:[{label:"A",value:Infinity}]}));
  assert.throws(()=>make({baseline:5}));
  assert.throws(()=>make({valueDomain:[5,1]}));
  assert.throws(()=>make({disclosure:{kind:"source",text:""}}));
  assert.throws(()=>buildMotionModule({momentIds:["caption-clean"],mode:"template",format:"portrait",content:{"caption-clean":{cues:[{text:"Bad",start:4,end:2}]}}}));
  assert.throws(()=>buildMotionModule({momentIds:["metric-card"],mode:"template",format:"portrait",theme:"custom" as never}));
  assert.throws(()=>buildMotionModule({momentIds:["metric-card"],mode:"template",format:"portrait",motion:"rush" as never}));
});
test("theme and reduced motion remain declared intent and caption timing is preserved",()=>{
  const brief=buildMotionBrief({momentIds:["caption-highlight","text-reveal"],mode:"sequence",format:"portrait",theme:"dark",motion:"reduced"});
  assert.equal(brief.theme,"dark");assert.equal(brief.motion,"reduced");
  assert.deepEqual(brief.content["caption-highlight"].cues,getMotionContentExample("caption-highlight").cues);
  assert.equal(brief.duration,15);
  assert.equal(motionMoments.length,25);
});
