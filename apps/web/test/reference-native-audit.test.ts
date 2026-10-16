import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import type { ReconstructionPlan } from "@diffusionstudio/editing-playbook/reference-reconstruction";
import type { ReconstructionWorldAudit } from "../src/components/sidebar-left/reference-native-audit.ts";

type Fixture = {
  audit(): ReconstructionWorldAudit; walks(): number; nativeKind(key: string): string;
  duplicate(key: string): void; drop(key: string): void; changeText(key: string, text: string): void;
  changeToRect(key: string): void; addPaint(key: string, type: "video" | "image", nested?: boolean): void;
  addExtraAudio(): void; removeAudioSource(): void; extraGeometry(): void;
  changeAxes(key: string, x: number, y: number): void; changeClipping(key: string, clip: boolean): void;
};
type Runtime = { fixture(plan: ReconstructionPlan, hasAudio: boolean): Fixture };
const layer = (id: string, type: ReconstructionPlan["layers"][number]["type"], text = "") => ({ id, name: id, type,
  start: 0, end: 3, x: 0, y: 0, width: 800, height: 400, rotation: 0, opacity: 1, fill: "#FFFFFF", radius: 0,
  text, fontFamily: "Arial", fontSize: 100, fontWeight: 700, fontStyle: "normal" as const, textAlign: "left" as const,
  letterSpacing: 0, leading: 1, assetId: type === "video" ? "reference-source" : type === "image" ? "paper" : null,
  objectFit: "contain" as const, sourceIn: 0, keyframes: [], evidenceIds: ["frame-1"] });
const plan = (media = false): ReconstructionPlan => ({ schemaVersion: 2, title: "Native audit fixture", summary: "An authored fixture, not reference observations.",
  width: 1920, height: 1080, fps: 30, duration: 3, background: "#181818", assetRequests: [],
  layers: [layer("year", "text", "2021"), layer("graph", "rect"), ...(media ? [layer("photo", "image"), layer("camera", "video")] : [])], unresolved: [], observations: [] });
let runtimePromise: Promise<Runtime> | undefined;
function runtime(): Promise<Runtime> {
  return runtimePromise ??= (async () => {
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    const source = resolve(repository, "apps/web/src/components/sidebar-left/reference-native-audit.ts"), selection = resolve(repository, "apps/web/src/context/editor-api/selection.ts");
    const events = resolve(repository, "apps/web/src/components/engine/api/events.ts"), components = resolve(repository, "apps/web/src/components/engine/api/components.ts");
    const constants = resolve(repository, "apps/web/src/components/engine/components/constants.ts"), relations = resolve(repository, "apps/web/src/components/engine/components/relations.ts");
    const queries = resolve(repository, "apps/web/src/components/engine/api/query.ts"), timing = resolve(repository, "apps/web/src/components/engine/utils/time.ts");
    const stubs: Record<string, string> = {
      "@/components/engine": `export * from ${JSON.stringify(constants)}; export * from ${JSON.stringify(queries)};
export {addComponent,removeComponent} from ${JSON.stringify(events)};export {findGeometryAsset} from ${JSON.stringify(timing)};
import {getEntityTree as actualTree} from ${JSON.stringify(queries)};export function getEntityTree(world,root){world.auditWalks++;return actualTree(world,root);}`,
      "@/components/engine/components": `export {ChildOf} from ${JSON.stringify(relations)};`,
    };
    const bundled = await build({
      stdin: { contents: `import {auditReconstructionWorld} from ${JSON.stringify(source)};import {entityType} from ${JSON.stringify(selection)};
import {createWorld,addEntity,hasComponent} from "bitecs";import {observe,setComponent,addComponent,removeComponent} from ${JSON.stringify(events)};
import {createComponents} from ${JSON.stringify(components)};import {ChildOf} from ${JSON.stringify(relations)};import {GeometryType,PaintType} from ${JSON.stringify(constants)};
export function fixture(plan,hasAudio){const c=createComponents(),world=createWorld({components:c,frameRate:30,auditWalks:0,assets:new Map([
["image-source",{id:"image-source",type:"IMAGE"}],["video-source",{id:"video-source",type:"VIDEO",duration:12,channels:2}]]),history:{push(entry){entry.execute();},untrack(fn){return fn();}}});
for(const component of Object.values(c))observe(world,"set",component,(eid,value)=>{if(Array.isArray(component))component[eid]=value;else for(const[key,field]of Object.entries(value))component[key][eid]=field;});
const byKey=new Map();function node(key,parent,kind="rect",text=""){const eid=addEntity(world);c.Cache.fills[eid]=[];setComponent(world,eid,c.Geometry,kind==="text"?GeometryType.TEXT:GeometryType.RECT);if(key){setComponent(world,eid,c.Key,key);byKey.set(key,eid);}if(kind==="text")setComponent(world,eid,c.Chars,text);if(parent){addComponent(world,eid,ChildOf(parent));}return eid;}
const scene=node("scene",null);addComponent(world,scene,c.Scene);node("_reconstruction-background",scene);
function paint(parent,type){const eid=addEntity(world);addComponent(world,eid,ChildOf(parent));setComponent(world,eid,c.Paint,type==="video"?PaintType.VIDEO:PaintType.IMAGE);setComponent(world,eid,c.AssetId,type+"-source");c.Cache.fills[parent].push(eid);return eid;}
for(const layer of plan.layers){const eid=node(layer.id,scene,layer.type,layer.text);setComponent(world,eid,c.Scale,{x:layer.scaleX??1,y:layer.scaleY??1});if(layer.clipToBox)addComponent(world,eid,c.ClipToBox);if(layer.type==="image"||layer.type==="video")paint(eid,layer.type);}
function audio(key="_reconstruction-audio"){const eid=node(key,scene);addComponent(world,eid,c.Audio);setComponent(world,eid,c.AssetId,"video-source");return eid;}if(hasAudio)audio();
return{audit:()=>auditReconstructionWorld(world,scene,plan,hasAudio),walks:()=>world.auditWalks,nativeKind:key=>entityType(world,byKey.get(key)),duplicate(key){node(key,scene);},drop(key){addComponent(world,byKey.get(key),c.Deleted);},changeText(key,text){setComponent(world,byKey.get(key),c.Chars,text);},changeToRect(key){setComponent(world,byKey.get(key),c.Geometry,GeometryType.RECT);},addPaint(key,type,nested=false){let parent=byKey.get(key);if(nested){const eid=addEntity(world);c.Cache.fills[eid]=[];addComponent(world,eid,ChildOf(parent));parent=eid;}paint(parent,type);},addExtraAudio(){audio("unplanned-audio");},removeAudioSource(){removeComponent(world,byKey.get("_reconstruction-audio"),c.AssetId);},extraGeometry(){node(null,scene);},changeAxes(key,x,y){setComponent(world,byKey.get(key),c.Scale,{x,y});},changeClipping(key,clip){(clip?addComponent:removeComponent)(world,byKey.get(key),c.ClipToBox);}};}`, loader: "js", resolveDir: repository },
      bundle: true, write: false, platform: "node", format: "esm", conditions: ["browser"], logLevel: "silent",
      plugins: [{ name: "native-audit-world", setup(builder) {
        builder.onResolve({ filter: /^@\// }, args => stubs[args.path] ? ({ path: args.path, namespace: "native-audit-stub" }) : undefined);
        // Keep the production subtree/type queries; isolate their unrelated DB-dependent parent helper.
        builder.onResolve({ filter: /^\.\/base$/ }, args => args.importer.replaceAll("\\", "/").endsWith("/api/query.ts") ? ({ path: "parent-helper", namespace: "native-audit-stub" }) : undefined);
        builder.onLoad({ filter: /.*/, namespace: "native-audit-stub" }, args => ({ contents: args.path === "parent-helper" ? `import {getRelationTargets} from "bitecs";import {ChildOf} from ${JSON.stringify(relations)};export function getParentEntity(world,eid){return getRelationTargets(world,eid,ChildOf)[0]??null;}` : stubs[args.path], loader: "js", resolveDir: repository }));
      } }],
    });
    const directory = await mkdtemp(join(tmpdir(), "editor-native-audit-")), modulePath = join(directory, "runtime.mjs");
    try { await writeFile(modulePath, bundled.outputFiles[0].text); return await import(pathToFileURL(modulePath).href); }
    finally { await unlink(modulePath); await rmdir(directory); }
  })();
}

test("native audit accepts separately editable text, shapes and audio with one actual subtree traversal", async () => {
  const { fixture } = await runtime(), result = fixture(plan(), true), audit = result.audit();
  assert.deepEqual({ ...audit, sceneId: 0 }, { sceneId: 0, layers: 2, geometryNodes: 5, textNodes: 1, videoPaints: 0, imagePaints: 0, audioNodes: 1 });
  assert.equal(result.walks(), 1);
});

test("the original video cannot overpaint a reconstruction through its Audio node, even as a nested descendant", async () => {
  const { fixture } = await runtime();
  for (const nested of [false, true]) { const result = fixture(plan(), true); result.addPaint("_reconstruction-audio", "video", nested); assert.throws(() => result.audit(), /Audio contains.*paint/); }
});

test("declared camera clips and prepared images remain allowed while additional media paints fail", async () => {
  const { fixture } = await runtime(), result = fixture(plan(true), true);
  assert.equal(result.audit().videoPaints, 1); assert.equal(result.audit().imagePaints, 1);
  const unexpected = fixture(plan(true), true); unexpected.addPaint("photo", "video"); assert.throws(() => unexpected.audit(), /unexpected media paints/);
  const background = fixture(plan(), false); background.addPaint("_reconstruction-background", "image"); assert.throws(() => background.audit(), /background.*media paints/);
});

test("every authored key must resolve once to its declared native kind and literal text", async () => {
  const { fixture } = await runtime();
  const duplicate = fixture(plan(), false); duplicate.duplicate("year"); assert.throws(() => duplicate.audit(), /exactly one.*year/);
  const absent = fixture(plan(), false); absent.drop("year"); assert.throws(() => absent.audit(), /exactly one.*year/);
  const wording = fixture(plan(), false); wording.changeText("year", "2024"); assert.throws(() => wording.audit(), /literal wording/);
  const wrongKind = fixture(plan(), false); wrongKind.changeToRect("year"); assert.throws(() => wrongKind.audit(), /wrong native kind/);
});

test("audio presence and source binding cannot differ silently from the requested reconstruction", async () => {
  const { fixture } = await runtime();
  const missing = fixture(plan(), true); missing.drop("_reconstruction-audio"); assert.throws(() => missing.audit(), /exactly one.*audio/);
  const source = fixture(plan(), true); source.removeAudioSource(); assert.throws(() => source.audit(), /audio-capable source/);
  const additional = fixture(plan(), false); additional.addExtraAudio(); assert.throws(() => additional.audit(), /Audio node count/);
  const geometry = fixture(plan(), false); geometry.extraGeometry(); assert.throws(() => geometry.audit(), /native geometry layers/);
});

test("native API labels video-backed Audio by node intent while explicit video remains video", async () => {
  const { fixture } = await runtime(), result = fixture(plan(true), true);
  assert.equal(result.nativeKind("_reconstruction-audio"), "audio"); assert.equal(result.nativeKind("camera"), "video");
  assert.equal(result.nativeKind("photo"), "image"); assert.equal(result.nativeKind("year"), "text");
});

test("native audit rejects lost glyph proportions or clipping even when layer kinds and wording match", async () => {
  const { fixture } = await runtime(), authored = plan();
  Object.assign(authored.layers[0], { scaleX: 1.3, scaleY: .9, clipToBox: true });
  fixture(authored, false).audit();
  const axes = fixture(authored, false); axes.changeAxes("year", 1, .9);
  assert.throws(() => axes.audit(), /independent scale axes/);
  const clipping = fixture(authored, false); clipping.changeClipping("year", false);
  assert.throws(() => clipping.audit(), /box clipping/);
  const extra = fixture(plan(), false); extra.changeClipping("year", true);
  assert.throws(() => extra.audit(), /box clipping/);
});
