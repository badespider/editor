import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { PATCH_PROP_KEYS } from "../../../packages/jsx/src/types.ts";
import {parseVectorPathCommands} from "../../../packages/jsx/src/vector-path.ts";

type VectorSnapshot = { commands: unknown[]; fillEnabled: boolean; groupWidth: number; groupHeight: number; innerWidth: number; innerHeight: number; e: number; f: number; localE: number; localF: number; hasAnchor: boolean; strokeWidth:number; strokeCap:number; strokeJoin:number; strokeColor:number };
type VectorFixture = { set(name:string,value:unknown):void; group(name:string,value:unknown):void; undo():void; snapshot():VectorSnapshot; draw(): { calls:unknown[][]; fills:number; strokes:number; widths:number[] }; restore():VectorSnapshot; autoBounds():number[]; seek(frame:number):VectorSnapshot };
type Stacking = { children:string[]; paints:number[]; strokes:number[]; allIndexed:boolean; explicitIndex:number };
type StackFixture = { snapshot():Stacking; restored():Stacking; insert(key:string,anchor?:string):void; undo():void; siblings():string[]; adopt():string[] };
type Runtime = { vectorFixture():VectorFixture; stackFixture():StackFixture };
let runtimePromise: Promise<Runtime> | undefined;
function runtime(): Promise<Runtime> {
  return runtimePromise ??= (async () => {
    const repository = fileURLToPath(new URL("../../../", import.meta.url)), engine = resolve(repository, "apps/web/src/components/engine");
    const file = (name: string) => resolve(engine, name), jsx = resolve(repository, "apps/web/src/utils/jsx.ts");
    const unused = ["computeAudioSyncOffsetCached", "getAssetFile", "hasAudioSources", "transcribeScene", "transcriptTrim"];
    const stubs: Record<string, string> = {
      "@/components/engine": `export * from ${JSON.stringify(file("components/constants.ts"))};export * from ${JSON.stringify(file("api/events.ts"))};export * from ${JSON.stringify(file("api/entities.ts"))};export * from ${JSON.stringify(file("api/hierarchy.ts"))};export * from ${JSON.stringify(file("api/query.ts"))};export * from ${JSON.stringify(file("api/resize.ts"))};export * from ${JSON.stringify(file("api/keyframe.ts"))};export {getParentEntity} from ${JSON.stringify(file("api/base.ts"))};export {findAssetDuration,findGeometryAsset} from ${JSON.stringify(file("utils/time.ts"))};${unused.map(name => `export function ${name}(){throw new Error("Unexpected ${name}");}`).join("\n")}`,
      "@/components/engine/components": `export * from ${JSON.stringify(file("components/relations.ts"))};`,
      "@/components/engine/font": "export const WebFonts={};export function loadWebFont(){throw new Error('Unexpected font fetch');}",
      "@/components/engine/decoders/html": "export class HtmlHost{}export function isHtmlInCanvasSupported(){return false;}",
      "@/components/engine/decoders/surface": "export class SurfaceHost{}",
      "@/components/engine/decoders/caption/utils": "export function resolveTranscript(){throw new Error('Unexpected transcript');}",
      "@/utils/genai": "export const ASPECT_RATIO_DIMENSIONS={};export function findEmptyPlacement(){throw new Error('Unexpected placement');}",
      "@/utils/jsx-generation": "export function resolveAsset(){throw new Error('Unexpected media');}export function resolveGeneratedAsset(){throw new Error('Unexpected generation');}",
      "@/utils": "export function assert(value,message){if(!value)throw new Error(message);}export function assertAllSettled(values){for(const value of values)if(value.status==='rejected')throw value.reason;}export function parseColor(value){return /^#[A-Fa-f0-9]{6}$/.test(value)?parseInt(value.slice(1),16):null;}export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));",
      "@/utils/color": "export function colorToHex(value){return '#'+value.toString(16).padStart(6,'0');}",
    };
    const bundled = await build({
      stdin: { contents: `import {WorldDocument} from ${JSON.stringify(jsx)};
import {createWorld,hasComponent,getAllEntities} from "bitecs";import {createComponents} from ${JSON.stringify(file("api/components.ts"))};import {observeWorld} from ${JSON.stringify(file("api/observers.ts"))};
import {createEntity} from ${JSON.stringify(file("api/entities.ts"))};import {setComponent,addComponent,removeComponent} from ${JSON.stringify(file("api/events.ts"))};import {appendChild} from ${JSON.stringify(file("api/hierarchy.ts"))};
import {serializeEntity,deserializeEntity,cloneFromRecords} from ${JSON.stringify(file("api/serialize.ts"))};import {setKeyframeTrack} from ${JSON.stringify(file("api/keyframe.ts"))};
import {createHistory} from ${JSON.stringify(file("utils/history.ts"))};import {motionSystem} from ${JSON.stringify(file("systems/motion.ts"))};import {transformSystem} from ${JSON.stringify(file("systems/transform.ts"))};import {renderNode} from ${JSON.stringify(file("systems/render.ts"))};import {measureImageBounds} from ${JSON.stringify(file("encode/image-bounds.ts"))};
globalThis.__ControlElement=class ControlElement{};globalThis.__ControlText=class ControlText{};
function world(){const value=createWorld({components:createComponents(),mode:"offline-video",frameRate:30,assets:new Map(),camera:{a:1,b:0,c:0,d:1,e:0,f:0},resolution:1,canvas:{width:1000,height:1000},hitRegions:[],rebuildTimelineIndex(){},history:createHistory()});observeWorld(value);return value;}
export function vectorFixture(){
 const w=world(),c=w.components,doc=new WorldDocument(w),parent=doc.createElement("Rect"),outer=doc.createElement("Group"),inner=doc.createElement("Group"),path=doc.createElement("Path");
 const set=(node,props)=>{for(const [key,value] of Object.entries(props))doc.setProperty(node,key,value);};
 set(parent,{width:500,height:500});set(outer,{x:40,y:70,width:200,height:100,rotation:90,anchorX:0,anchorY:0});set(inner,{x:30,y:20,width:100,height:80,rotation:90,anchorX:0,anchorY:0});
 appendChild(w,outer.eid,parent.eid);appendChild(w,inner.eid,outer.eid);appendChild(w,path.eid,inner.eid);
 const original=[{op:"M",x:0,y:0},{op:"L",x:100,y:0},{op:"Q",cx:110,cy:40,x:100,y:80},{op:"C",c1x:60,c1y:90,c2x:20,c2y:90,x:0,y:80},{op:"Z"}];
 set(path,{x:4,y:6,width:100,height:80,commands:original,fill:"#F3AA77",strokeColor:"#123456",strokeWidth:4,strokeCap:"round",strokeJoin:"bevel"});
 const calls=[],widths=[];let fills=0,strokes=0;w.ctx={globalAlpha:1,filter:"none",save(){},restore(){},transform(){},setTransform(){},translate(){},beginPath(){calls.push(["begin"]);},rect(){},roundRect(){},closePath(){calls.push(["Z"]);},moveTo(...v){calls.push(["M",...v]);},lineTo(...v){calls.push(["L",...v]);},quadraticCurveTo(...v){calls.push(["Q",...v]);},bezierCurveTo(...v){calls.push(["C",...v]);},fill(){fills++;},stroke(){strokes++;widths.push(this.lineWidth);},clip(){}};
 const snapshot=(value=w,eid=path.eid,group=outer.eid,child=inner.eid)=>{const q=value.components;transformSystem(value);return{commands:q.VectorPath.commands[eid],fillEnabled:q.VectorPath.fillEnabled[eid],groupWidth:q.Computed.width[group],groupHeight:q.Computed.height[group],innerWidth:q.Computed.width[child],innerHeight:q.Computed.height[child],e:q.WorldTransform.e[eid],f:q.WorldTransform.f[eid],localE:q.LocalTransform.e[eid],localF:q.LocalTransform.f[eid],hasAnchor:hasComponent(value,eid,q.Anchor),strokeWidth:q.StrokeStyle.width[eid],strokeCap:q.StrokeStyle.cap[eid],strokeJoin:q.StrokeStyle.join[eid],strokeColor:q.Color[q.Cache.strokes[eid][0]]};};
 return{seek(frame){c.Computed.localTime[outer.eid]=frame;motionSystem(w);return snapshot();},set:(name,value)=>doc.setProperty(path,name,value),group:(name,value)=>doc.setProperty(outer,name,value),undo:()=>w.history.undo(),snapshot,draw(){calls.length=0;widths.length=0;fills=0;strokes=0;transformSystem(w);renderNode(w,parent.eid);return{calls:[...calls],fills,strokes,widths:[...widths]};},restore(){const records=getAllEntities(w).map(eid=>serializeEntity(w,eid)),r=world(),ids=cloneFromRecords(r,records),rid=ids.get(path.eid),adopt=new WorldDocument(r,{mode:"adopt",adoptIndex:new Map([["0",rid]])}),native=adopt.createElement("Path");adopt.setProperty(native,"commands",[{op:"M",x:999,y:999}]);adopt.setProperty(native,"fillEnabled",true);return snapshot(r,rid,ids.get(outer.eid),ids.get(inner.eid));},autoBounds(){const g=doc.createElement("Group"),leaf=doc.createElement("Rect");set(leaf,{x:20,y:10,width:60,height:40});appendChild(w,leaf.eid,g.eid);transformSystem(w);transformSystem(w);return[c.Computed.width[g.eid],c.Computed.height[g.eid],c.Computed.originX[g.eid],c.Computed.originY[g.eid]];}};
}

export function stackFixture(){
 const w=world(),c=w.components,doc=new WorldDocument(w),root=doc.createElement("Group"),front=doc.createElement("Path"),back=doc.createElement("Path"),middle=doc.createElement("Path");
 const handles={front,back,middle};
 for(const [key,node] of Object.entries(handles)){doc.setProperty(node,"key",key);doc.setProperty(node,"commands",[{op:"M",x:0,y:0},{op:"L",x:20,y:20}]);}
 // Creation order differs from authored stacking. This was previously lost on restore.
 doc.insertNode(root,back);doc.insertNode(root,front);doc.insertNode(root,middle,front);
 const paint1=doc.createElement("SolidPaint"),paint2=doc.createElement("SolidPaint");doc.setProperty(paint1,"color","#110000");doc.setProperty(paint2,"color","#220000");doc.insertNode(front,paint1);doc.insertNode(front,paint2);
 const mediaBackground=createEntity(w);setComponent(w,mediaBackground,c.Paint,0);setComponent(w,mediaBackground,c.Color,0x330000);setComponent(w,mediaBackground,c.ItemIndex,-5);appendChild(w,mediaBackground,front.eid);
 for(const color of [0x111111,0x222222]){const stroke=createEntity(w);addComponent(w,stroke,c.Stroke);setComponent(w,stroke,c.Color,color);appendChild(w,stroke,front.eid);}
 const snapshot=(value=w,r=root.eid,f=front.eid,bg=mediaBackground)=>{const q=value.components;return{children:q.Cache.children[r].map(id=>q.Key[id]),paints:q.Cache.fills[f].map(id=>q.Color[id]),strokes:q.Cache.strokes[f].map(id=>q.Color[id]),allIndexed:getAllEntities(value).filter(id=>q.Cache.children[r].includes(id)||q.Cache.fills[f].includes(id)||q.Cache.strokes[f].includes(id)).every(id=>hasComponent(value,id,q.ItemIndex)),explicitIndex:q.ItemIndex[bg]};};
 const siblings=(document=doc,parent=root)=>{const list=[];for(let child=document.getFirstChild(parent);child;child=document.getNextSibling(child))list.push(document.world.components.Key[child.eid]);return list;};
 return{snapshot,restored(){const records=getAllEntities(w).map(id=>serializeEntity(w,id)).reverse(),r=world(),ids=cloneFromRecords(r,records);return snapshot(r,ids.get(root.eid),ids.get(front.eid),ids.get(mediaBackground));},insert(key,anchor){w.history.transaction("Insert native child",()=>doc.insertNode(root,handles[key],anchor?handles[anchor]:undefined));},undo:()=>w.history.undo(),siblings,adopt(){const recordIds=[root.eid,front.eid,back.eid,middle.eid],adopt=new WorldDocument(w,{mode:"adopt",adoptIndex:new Map(recordIds.map((id,index)=>[String(index),id]))}),r=adopt.createElement("Group"),f=adopt.createElement("Path"),b=adopt.createElement("Path"),m=adopt.createElement("Path");adopt.insertNode(r,b);adopt.insertNode(r,m,f);adopt.insertNode(r,f);return siblings(adopt,r);}};
}
`, loader: "js", resolveDir: repository },
      bundle: true, write: false, platform: "node", format: "esm", conditions: ["browser"], logLevel: "silent",
      define: { Element: "globalThis.__ControlElement", Text: "globalThis.__ControlText" },
      plugins: [{ name: "native-transform-clipping", setup(builder) {
        builder.onResolve({ filter: /[\\/]engine[\\/]api[\\/]base\.ts$/ }, () => ({ path: "parent-helper", namespace: "control-stub" }));
        builder.onResolve({ filter: /^@\// }, args => stubs[args.path] ? ({ path: args.path, namespace: "control-stub" }) : undefined);
        builder.onResolve({ filter: /^\.\/base$/ }, args => args.importer.replaceAll("\\", "/").includes("/engine/api/") ? ({ path: "parent-helper", namespace: "control-stub" }) : undefined);
        builder.onResolve({ filter: /^\.\.\/api\/base$/ }, args => ({ path: "parent-helper", namespace: "control-stub" }));
        builder.onResolve({ filter: /^\.\.\/decoders$/ }, args => args.importer.replaceAll("\\", "/").endsWith("/systems/render.ts") ? ({ path: "render-decoders", namespace: "control-stub" }) : undefined);
        builder.onResolve({ filter: /^\.\.\/decoders\/audio-peaks$/ }, () => ({ path: "audio-peaks", namespace: "control-stub" }));
        builder.onResolve({ filter: /^\.\.\/api\/interactions$/ }, () => ({ path: "interactions", namespace: "control-stub" }));
        builder.onLoad({ filter: /.*/, namespace: "control-stub" }, args => ({ contents: args.path === "parent-helper" ? `import {getRelationTargets} from "bitecs";import {ChildOf} from ${JSON.stringify(file("components/relations.ts"))};export function getParentEntity(world,eid){return getRelationTargets(world,eid,ChildOf)[0]??null;}` : args.path === "render-decoders" ? "export const resolveImageDecoder=()=>null,resolveVideoDecoder=()=>null,resolveSequenceDecoder=()=>null,resolveCaptionDecoder=()=>null,resolveShaderHost=()=>null;" : args.path === "audio-peaks" ? "export const getAudioPeaks=()=>null;" : args.path === "interactions" ? "export function handleCanvasInteraction(){}export function handleGeometryInteraction(){}" : stubs[args.path], loader: "js", resolveDir: repository }));
      } }],
    });
    const directory = await mkdtemp(join(tmpdir(), "editor-transform-clipping-")), modulePath = join(directory, "runtime.mjs");
    try { await writeFile(modulePath, bundled.outputFiles[0].text); return await import(pathToFileURL(modulePath).href); }
    finally { await unlink(modulePath); await rmdir(directory); }
  })();
}


test("native vector commands are strict copied data, including closed subpaths", () => {
 const source=[{op:"M",x:0,y:0},{op:"L",x:100,y:0},{op:"Q",cx:40,cy:-10,x:100,y:100},{op:"C",c1x:80,c1y:100,c2x:0,c2y:80,x:0,y:0},{op:"Z"}];
 const copy=parseVectorPathCommands(source); assert.deepEqual(copy,source);source[0].x=90;assert.equal((copy[0] as {x:number}).x,0);
 for(const value of [[],"<svg/>",[{op:"L",x:0,y:0}],[{op:"M",x:Infinity,y:0}],[{op:"M",x:0,y:0,d:"M0 0"}],[{op:"M",x:0,y:0},{op:"Z"},{op:"L",x:1,y:1}],Array.from({length:1025},()=>({op:"M",x:0,y:0}))])assert.throws(()=>parseVectorPathCommands(value));
 for(const key of ["commands","fillEnabled","strokeColor","strokeWidth","strokeCap","strokeJoin","anchorX","anchorY"] as const) assert.ok(PATCH_PROP_KEYS.includes(key));
});

test("actual native renderer draws M/L/Q/C/Z fills and outlines independently, including zero width", async()=>{
 const state=(await runtime()).vectorFixture(), drawn=state.draw();
 assert.ok(drawn.calls.some(call=>call[0]==="Q")); assert.ok(drawn.calls.some(call=>call[0]==="C"));assert.equal(drawn.fills,1);assert.equal(drawn.strokes,1);assert.deepEqual(drawn.widths,[4]);
 state.set("fillEnabled",false);assert.equal(state.draw().fills,0);assert.equal(state.draw().strokes,1);
 state.set("strokeWidth",0);assert.equal(state.draw().strokes,0);state.set("strokeWidth",2);assert.deepEqual(state.draw().widths,[2]);
});

test("fixed nested group boxes keep stable shoulder pivots and compose local transforms", async()=>{
 const state=(await runtime()).vectorFixture(), value=state.snapshot();
 assert.deepEqual([value.groupWidth,value.groupHeight,value.innerWidth,value.innerHeight],[200,100,100,80]);
 assert.ok(Math.abs(value.e-16)<1e-9);assert.ok(Math.abs(value.f-94)<1e-9);
 state.set("commands",[{op:"M",x:-100,y:-100},{op:"L",x:800,y:400}]);
 const changed=state.snapshot();assert.equal(changed.groupWidth,200);assert.equal(changed.innerWidth,100);
 assert.deepEqual(state.autoBounds(),[60,40,20,10]);
});

test("path edits, disabled fills, normalized anchors and fixed groups survive serialize/adopt", async()=>{
 const state=(await runtime()).vectorFixture();state.set("commands",[{op:"M",x:5,y:7},{op:"L",x:75,y:60}]);state.set("fillEnabled",false);state.set("anchorX",0);state.set("anchorY",1);
 assert.deepEqual(state.restore(),state.snapshot());
});

test("invalid native path or pivot patches leave artwork unchanged and command edits undo",async()=>{
 const state=(await runtime()).vectorFixture(), original=state.snapshot();
 for(const value of ["M0 0",[{op:"M",x:NaN,y:1}],[{op:"C",x:1,y:1}]])assert.throws(()=>state.set("commands",value));
 for(const value of [-1,NaN,Infinity,2,".5"])assert.throws(()=>state.set("anchorX",value));
 for(const value of [-1,NaN,Infinity,10001])assert.throws(()=>state.set("strokeWidth",value));
 assert.deepEqual(state.snapshot(),original);
 state.set("commands",[{op:"M",x:9,y:9}]);state.undo();assert.deepEqual(state.snapshot().commands,original.commands);
 state.set("rotation",90);const centered=state.snapshot();state.set("anchorX",0);assert.equal(state.snapshot().hasAnchor,true);state.undo();assert.equal(state.snapshot().hasAnchor,false);assert.equal(state.snapshot().localE,centered.localE);assert.equal(state.snapshot().localF,centered.localF);
});


test("nested group rotation tracks use the same local clock for forward, direct and reverse seeks",async()=>{
 const state=(await runtime()).vectorFixture();state.group("rotation",[{time:"0f",value:0},{time:"30f",value:90}]);
 const expected=new Map<number,VectorSnapshot>();for(const frame of [0,15,30])expected.set(frame,state.seek(frame));
 assert.notEqual(expected.get(0)?.e,expected.get(30)?.e);
 for(const frame of [15,0,30,0,15,30])assert.deepEqual(state.seek(frame),expected.get(frame));
});


test("native stacking survives reversed serialized record order for paths, paints and strokes",async()=>{
 const state=(await runtime()).stackFixture();
 assert.deepEqual(state.snapshot(),{children:["back","middle","front"],paints:[0x330000,0x110000,0x220000],strokes:[0x111111,0x222222],allIndexed:true,explicitIndex:-5});
 assert.deepEqual(state.restored(),state.snapshot());assert.deepEqual(state.siblings(),["back","middle","front"]);
});

test("native insert anchors, append moves and undo use persisted stacking while initial adopt preserves edits",async()=>{
 const state=(await runtime()).stackFixture();state.insert("back");assert.deepEqual(state.siblings(),["middle","front","back"]);state.undo();assert.deepEqual(state.siblings(),["back","middle","front"]);
 state.insert("front","back");assert.deepEqual(state.siblings(),["front","back","middle"]);assert.deepEqual(state.restored(),state.snapshot());
 assert.deepEqual(state.adopt(),["front","back","middle"]);
});
