import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { PATCH_PROP_KEYS } from "../../../packages/jsx/src/types.ts";
import type { TextProps } from "@diffusionstudio/jsx";

type State = { x: number; y: number; effectiveX: number; effectiveY: number; clip: boolean; width: number; height: number };
type Draw = { chars: string; clip: { width: number; height: number } | null };
type Fixture = { set(name: string, value: unknown): void; state(): State; seek(frame: number): State; draws(): Draw[]; draw(): State;
  addChild(): void; bounds(clipped: boolean): { minX: number; minY: number; maxX: number; maxY: number };
  roundTripAdopt(): State; independentAxisTrack(): void; undo(): void; removeScale(): void; removeUniform(): void };
type Runtime = { fixture(): Fixture };
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
import {createWorld,hasComponent} from "bitecs";import {createComponents} from ${JSON.stringify(file("api/components.ts"))};import {observeWorld} from ${JSON.stringify(file("api/observers.ts"))};
import {createEntity} from ${JSON.stringify(file("api/entities.ts"))};import {setComponent,addComponent,removeComponent} from ${JSON.stringify(file("api/events.ts"))};import {appendChild} from ${JSON.stringify(file("api/hierarchy.ts"))};
import {serializeEntity,deserializeEntity} from ${JSON.stringify(file("api/serialize.ts"))};import {setKeyframeTrack} from ${JSON.stringify(file("api/keyframe.ts"))};
import {createHistory} from ${JSON.stringify(file("utils/history.ts"))};import {motionSystem} from ${JSON.stringify(file("systems/motion.ts"))};import {transformSystem} from ${JSON.stringify(file("systems/transform.ts"))};import {renderNode} from ${JSON.stringify(file("systems/render.ts"))};import {measureImageBounds} from ${JSON.stringify(file("encode/image-bounds.ts"))};
globalThis.__ControlElement=class ControlElement{};globalThis.__ControlText=class ControlText{};
function world(){const value=createWorld({components:createComponents(),mode:"offline-video",frameRate:30,assets:new Map(),camera:{a:1,b:0,c:0,d:1,e:0,f:0},resolution:1,canvas:{width:1000,height:1000},hitRegions:[],rebuildTimelineIndex(){},history:createHistory()});observeWorld(value);return value;}
export function fixture(){const w=world(),c=w.components,doc=new WorldDocument(w),parent=doc.createElement("Rect"),node=doc.createElement("Text"),eid=node.eid;doc.setProperty(parent,"width",500);doc.setProperty(parent,"height",500);appendChild(w,eid,parent.eid);setComponent(w,eid,c.Chars,"2021");doc.setProperty(node,"fontFamily","Arial");doc.setProperty(node,"fontSize",40);doc.setProperty(node,"width",120);doc.setProperty(node,"height",60);
let path=null,clip=null;const stack=[],draws=[];w.ctx={globalAlpha:1,filter:"none",save(){stack.push(clip);},restore(){clip=stack.pop();},transform(){},setTransform(){},translate(){},closePath(){},beginPath(){path=null;},rect(_x,_y,width,height){path={width,height};},roundRect(_x,_y,width,height){path={width,height};},clip(){clip=path?{...path}:null;},measureText(chars){return{width:chars.length*16,fontBoundingBoxAscent:20,fontBoundingBoxDescent:10,actualBoundingBoxLeft:0,actualBoundingBoxRight:chars.length*16,actualBoundingBoxAscent:0,actualBoundingBoxDescent:30};},fillText(chars){draws.push({chars,clip:clip?{...clip}:null});},strokeText(){}};
globalThis.OffscreenCanvas=class{getContext(){return w.ctx;}};const state=()=>({x:hasComponent(w,eid,c.Scale)?c.Scale.x[eid]??1:1,y:hasComponent(w,eid,c.Scale)?c.Scale.y[eid]??1:1,effectiveX:c.Computed.scaleX[eid],effectiveY:c.Computed.scaleY[eid],clip:hasComponent(w,eid,c.ClipToBox),width:c.Computed.width[eid],height:c.Computed.height[eid]});
return{undo:()=>w.history.undo(),removeScale:()=>removeComponent(w,eid,c.Scale),removeUniform:()=>removeComponent(w,eid,c.UniformScale),set:(name,value)=>doc.setProperty(node,name,value),state,seek(frame){c.Computed.localTime[eid]=frame;motionSystem(w);return state();},draws:()=>draws,draw(){draws.length=0;transformSystem(w);renderNode(w,eid);return state();},addChild(){const child=doc.createElement("Text");setComponent(w,child.eid,c.Chars,"child");appendChild(w,child.eid,eid);},bounds(clipped){if(clipped)addComponent(w,eid,c.ClipToBox);else removeComponent(w,eid,c.ClipToBox);const child=createEntity(w);setComponent(w,child,c.Geometry,0);appendChild(w,child,eid);c.WorldBounds.minX[eid]=0;c.WorldBounds.minY[eid]=0;c.WorldBounds.maxX[eid]=120;c.WorldBounds.maxY[eid]=60;c.WorldBounds.minX[child]=-100;c.WorldBounds.minY[child]=-200;c.WorldBounds.maxX[child]=400;c.WorldBounds.maxY[child]=500;const bounds={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};measureImageBounds(w,eid,bounds);return bounds;},roundTripAdopt(){const record=serializeEntity(w,eid);delete record.ChildOf;const restored=world(),rid=createEntity(restored);deserializeEntity(restored,rid,record);const adopt=new WorldDocument(restored,{mode:"adopt",adoptIndex:new Map([["0",rid]])}),native=adopt.createElement("Text");adopt.setProperty(native,"scaleX",.1);adopt.setProperty(native,"scaleY",.1);adopt.setProperty(native,"clipToBox",false);const r=restored.components;return{x:r.Scale.x[rid]??1,y:r.Scale.y[rid]??1,effectiveX:r.Computed.scaleX[rid],effectiveY:r.Computed.scaleY[rid],clip:hasComponent(restored,rid,r.ClipToBox),width:r.Computed.width[rid],height:r.Computed.height[rid]};},independentAxisTrack(){setKeyframeTrack(w,eid,"scale.x",[{time:0,value:.5,easing:"linear"},{time:30,value:2,easing:"linear"}]);}};
}`, loader: "js", resolveDir: repository },
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

test("static axes and own-box clipping share the public JSX and patch contract", () => {
  const props: TextProps = { children: "2021", scaleX: 1.3, scaleY: .8, clipToBox: true };
  assert.equal(props.scaleX, 1.3); for (const key of ["scaleX", "scaleY", "clipToBox"] as const) assert.ok(PATCH_PROP_KEYS.includes(key));
});

test("actual native scale observers compose static axes and a uniform track once across repeated seeks", async () => {
  const { fixture } = await runtime(), state = fixture(); state.set("scaleX", 1.3); state.set("scaleY", .8); state.set("scale", [{ time: "0f", value: .5 }, { time: "30f", value: 2 }]);
  for (const frame of [0, 15, 30, 15, 0, 30, 15]) { const value = state.seek(frame), factor = .5 + frame / 30 * 1.5; assert.equal(value.effectiveX, 1.3 * factor); assert.equal(value.effectiveY, .8 * factor); }
  state.set("scaleX", 0); assert.equal(state.seek(15).effectiveX, 0);
});

test("undo and component removal ignore stale axis arrays and refresh static native transforms", async () => {
  const { fixture } = await runtime(), state = fixture();
  state.set("scale", 1.2); state.set("scaleX", 1.5);
  assert.equal(state.state().effectiveX, 1.2 * 1.5);
  state.undo(); // Reverse the first Scale write: bitecs keeps its raw x array.
  assert.equal(state.state().effectiveX, 1.2); assert.equal(state.state().effectiveY, 1.2);
  state.set("scale", 2); assert.equal(state.state().effectiveX, 2);
  state.set("scaleY", .8); // A fresh component must not restore the undone x=1.5.
  assert.equal(state.state().x, 1); assert.equal(state.state().effectiveX, 2);
  assert.equal(state.state().effectiveY, 1.6);
  state.removeScale(); assert.equal(state.state().effectiveY, 2);
  state.undo(); assert.equal(state.state().effectiveY, 1.6); // Undo remove retains authored axes.
  state.removeUniform(); assert.equal(state.state().effectiveX, 1); assert.equal(state.state().effectiveY, .8);
  state.undo(); assert.equal(state.state().effectiveX, 2); assert.equal(state.state().effectiveY, 1.6);
});

test("undoing the first axis write stays correct through uniform track forward and reverse seeks", async () => {
  const { fixture } = await runtime(), state = fixture();
  state.set("scale", [{ time: "0f", value: .5 }, { time: "30f", value: 2 }]);
  state.set("scaleX", 1.5); state.undo();
  for (const frame of [0, 30, 15, 0, 15, 30]) {
    const value = state.seek(frame), factor = .5 + frame / 30 * 1.5;
    assert.equal(value.effectiveX, factor); assert.equal(value.effectiveY, factor);
  }
});

test("independent native axis tracks retain their absolute values when no uniform scale is authored", async () => {
  const { fixture } = await runtime(), state = fixture(); state.set("scaleX", 1.3); state.set("scaleY", .8); state.independentAxisTrack();
  assert.equal(state.seek(15).effectiveX, 1.25); assert.equal(state.seek(15).effectiveY, .8);
});

test("invalid static scale and clipping inputs fail before changing native state", async () => {
  const { fixture } = await runtime(), state = fixture(); state.set("scaleX", 1.3); state.set("scaleY", .8); state.set("clipToBox", true);
  const original = state.state(); for (const value of [-1, NaN, Infinity, "1", [], null]) { assert.throws(() => state.set("scaleX", value), /finite non-negative/); assert.throws(() => state.set("scaleY", value), /finite non-negative/); }
  for (const value of [1, "true", [], null]) assert.throws(() => state.set("clipToBox", value), /boolean/);
  assert.deepEqual(state.state(), original);
});

test("native serialization and adopt preserve edited axes and own-box clipping without wrapper entities", async () => {
  const { fixture } = await runtime(), state = fixture(); state.set("scale", 2); state.set("scaleX", 1.3); state.set("scaleY", .8); state.set("clipToBox", true);
  const restored = state.roundTripAdopt(); assert.equal(restored.x, 1.3); assert.equal(restored.y, .8); assert.equal(restored.effectiveX, 2.6); assert.equal(restored.effectiveY, 1.6); assert.equal(restored.clip, true);
});

test("the actual renderer clips own text and descendants to each current local box", async () => {
  const { fixture } = await runtime(), state = fixture(); state.set("clipToBox", true); state.addChild(); state.set("width", 120); state.set("height", 20); state.draw();
  assert.ok(state.draws().length >= 2); assert.ok(state.draws().every(draw => draw.clip?.width === 120 && draw.clip.height === 20));
  state.set("height", 45); state.draw(); assert.equal(state.draws()[0].clip?.height, 45);
  state.set("height", 0); assert.equal(state.draw().height, 0); assert.equal(state.draws()[0].clip?.height, 0);
  state.set("width", 0); assert.equal(state.draw().width, 0); assert.equal(state.draws()[0].clip?.width, 0);
});

test("animated width and height define the native clip at each seek including a zero-size reveal", async () => {
  const { fixture } = await runtime(), state = fixture(); state.set("clipToBox", true);
  state.set("width", [{ time: "0f", value: 0 }, { time: "30f", value: 120 }]);
  state.set("height", [{ time: "0f", value: 0 }, { time: "30f", value: 60 }]);
  for (const frame of [0, 15, 30, 15, 0]) {
    state.seek(frame); const box = state.draw();
    assert.equal(box.width, frame * 4); assert.equal(box.height, frame * 2);
    assert.deepEqual(state.draws()[0].clip, { width: frame * 4, height: frame * 2 });
  }
});

test("unclipped zero-height text retains legacy autosizing and image captures exclude clipped child overflow", async () => {
  const { fixture } = await runtime(), text = fixture(); text.set("height", 0); assert.ok(text.draw().height > 0);
  assert.deepEqual(fixture().bounds(false), { minX: -100, minY: -200, maxX: 400, maxY: 500 });
  assert.deepEqual(fixture().bounds(true), { minX: 0, minY: 0, maxX: 120, maxY: 60 });
});
