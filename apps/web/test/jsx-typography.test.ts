import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { PATCH_PROP_KEYS } from "../../../packages/jsx/src/types.ts";
import type { TextProps } from "@diffusionstudio/jsx";

type Fixture = {
  set(name: string, value: unknown): void;
  manual(leading: number, letterSpacing: number): void;
  values(): { leading: number | undefined; letterSpacing: number | undefined };
  adopt(): { set(name: string, value: unknown): void; commit(): Promise<void> };
  commit(): Promise<void>;
  fontRequests(): string[];
  blockFont(): () => void;
  failFont(): void;
};
type Runtime = { fixture(): Fixture };

let runtimePromise: Promise<Runtime> | undefined;
function runtime(): Promise<Runtime> {
  return runtimePromise ??= (async () => {
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    const jsx = resolve(repository, "apps/web/src/utils/jsx.ts");
    const events = resolve(repository, "apps/web/src/components/engine/api/events.ts");
    const constants = resolve(repository, "apps/web/src/components/engine/components/constants.ts");
    const relations = resolve(repository, "apps/web/src/components/engine/components/relations.ts");
    // Exercise the real WorldDocument setters, real bitecs and tracked ECS writes.
    // Decoders, asset loading and unrelated engine operations fail if touched.
    const unused = ["appendChild", "computeAudioSyncOffsetCached", "createEntity", "deleteEntity", "findAssetDuration", "findGeometryAsset", "getAssetFile", "getEntityTree", "getNextName", "getParentEntity", "getSceneAncestor", "hasAudioSources", "removeChild", "resizeEntity", "setKeyframeTrack", "transcribeScene", "transcriptTrim"];
    const stubs: Record<string, string> = {
      "@/components/engine": `export * from ${JSON.stringify(constants)}; export {addComponent,removeComponent,setComponent} from ${JSON.stringify(events)}; ${unused.map(name => `export function ${name}(){throw new Error("Unexpected ${name} in typography test");}`).join("\n")}`,
      "@/components/engine/components": `export {ChildOf} from ${JSON.stringify(relations)};`,
      "@/components/engine/font": "export const WebFonts={Inter:{}};export async function loadWebFont(world,family){world.fontRequests.push(family);await world.fontBarrier;if(world.failFont)throw new Error('Font unavailable');}",
      "@/components/engine/decoders/html": "export class HtmlHost{constructor(){throw new Error('Unexpected HTML host');}}export function isHtmlInCanvasSupported(){return false;}",
      "@/components/engine/decoders/surface": "export class SurfaceHost{constructor(){throw new Error('Unexpected surface host');}}",
      "@/components/engine/decoders/caption/utils": "export function resolveTranscript(){throw new Error('Unexpected transcript');}",
      "@/utils/genai": "export const ASPECT_RATIO_DIMENSIONS={};export function findEmptyPlacement(){throw new Error('Unexpected placement');}",
      "@/utils/jsx-generation": "export function resolveAsset(){throw new Error('Unexpected asset');}export function resolveGeneratedAsset(){throw new Error('Unexpected generation');}",
      "@/utils": "export function assert(value,message){if(!value)throw new Error(message);}export function assertAllSettled(values){for(const value of values)if(value.status==='rejected')throw value.reason;}export function parseColor(){throw new Error('Unexpected color');}",
    };
    const bundled = await build({
      stdin: { contents: `import {WorldDocument} from ${JSON.stringify(jsx)};
import {createWorld,addEntity} from "bitecs";
import {observe,setComponent} from ${JSON.stringify(events)};
globalThis.__TypographyElement=class TypographyElement{};
globalThis.__TypographyText=class TypographyText{};
export function fixture(){
 const components={Data:[],Geometry:[],Deleted:{},TextStyle:{leading:[],letterSpacing:[],fontFamily:[]}};
 const world=createWorld({components,fontRequests:[],fontBarrier:Promise.resolve(),failFont:false,promises:[],history:{push(entry){entry.execute();},untrack(fn){return fn();}}});
 observe(world,"set",components.TextStyle,(eid,data)=>{for(const [key,value] of Object.entries(data))components.TextStyle[key][eid]=value;});
 const eid=addEntity(world);components.Geometry[eid]=1;const document=new WorldDocument(world),node=document.element(eid);
 return{set(name,value){document.setProperty(node,name,value);},manual(leading,letterSpacing){setComponent(world,eid,components.TextStyle,{leading,letterSpacing});},values(){return{leading:components.TextStyle.leading[eid],letterSpacing:components.TextStyle.letterSpacing[eid]};},commit:()=>document.commit(),fontRequests:()=>world.fontRequests,blockFont(){let release;world.fontBarrier=new Promise(resolve=>{release=resolve;});return release;},failFont(){world.failFont=true;},adopt(){const restored=new WorldDocument(world,{mode:"adopt",adoptIndex:new Map([["0",eid]])});const adopted=restored.createElement("Text");return{set(name,value){restored.setProperty(adopted,name,value);},commit:()=>restored.commit()};}};
}`, loader: "js", resolveDir: repository },
      bundle: true, write: false, platform: "node", format: "esm", conditions: ["browser"], logLevel: "silent",
      define: { Element: "globalThis.__TypographyElement", Text: "globalThis.__TypographyText" },
      plugins: [{ name: "typography-world-dependencies", setup(builder) {
        builder.onResolve({ filter: /^@\// }, args => stubs[args.path] ? ({ path: args.path, namespace: "typography-stub" }) : undefined);
        builder.onLoad({ filter: /.*/, namespace: "typography-stub" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: repository }));
      } }],
    });
    const directory = await mkdtemp(join(tmpdir(), "editor-typography-")), modulePath = join(directory, "runtime.mjs");
    try { await writeFile(modulePath, bundled.outputFiles[0].text); return await import(pathToFileURL(modulePath).href); }
    finally { await unlink(modulePath); await rmdir(directory); }
  })();
}

test("JSX text and CLI patch share explicit pixel spacing and line multiplier properties", () => {
  const props: TextProps = { children: "2024\n2025", letterSpacing: -1.25, leading: 1.1 };
  assert.equal(props.letterSpacing, -1.25); assert.equal(props.leading, 1.1);
  assert.ok(PATCH_PROP_KEYS.includes("letterSpacing")); assert.ok(PATCH_PROP_KEYS.includes("leading"));
  assert.equal(PATCH_PROP_KEYS.filter(key => key === "leading").length, 1);
});

test("actual WorldDocument setters preserve fractional pixel spacing and multiplier values", async () => {
  const { fixture } = await runtime(), state = fixture();
  state.set("leading", 1.125); state.set("letterSpacing", -1.25);
  assert.deepEqual(state.values(), { leading: 1.125, letterSpacing: -1.25 });
  state.set("letterSpacing", .375); state.set("leading", 0);
  assert.deepEqual(state.values(), { leading: 0, letterSpacing: .375 });
});

test("invalid flow props fail before changing the native text style", async () => {
  const { fixture } = await runtime(), state = fixture();
  state.manual(1.2, -2);
  for (const value of [NaN, Infinity, -Infinity, "1.2", null, [], [{ time: 0, value: 1 }]]) {
    assert.throws(() => state.set("leading", value), /finite/);
    assert.throws(() => state.set("letterSpacing", value), /finite/);
    assert.deepEqual(state.values(), { leading: 1.2, letterSpacing: -2 });
  }
  assert.throws(() => state.set("leading", -.1), /non-negative/);
  assert.deepEqual(state.values(), { leading: 1.2, letterSpacing: -2 });
});

test("reload and export adopt retain hand-edited native typography before live changes resume", async () => {
  const { fixture } = await runtime(), state = fixture();
  state.set("leading", 1); state.set("letterSpacing", 0);
  state.manual(1.4, -1.75);
  const restored = state.adopt();
  restored.set("leading", 1); restored.set("letterSpacing", 0);
  assert.deepEqual(state.values(), { leading: 1.4, letterSpacing: -1.75 });
  await restored.commit();
  assert.deepEqual(state.values(), { leading: 1.4, letterSpacing: -1.75 });
  restored.set("leading", 1.6); restored.set("letterSpacing", -.5);
  assert.deepEqual(state.values(), { leading: 1.6, letterSpacing: -.5 });
});

test("curated font loads are deduplicated and mount completion waits for the actual face", async () => {
  const { fixture } = await runtime(), state = fixture(), release = state.blockFont();
  state.set("fontFamily", "Inter"); state.set("fontFamily", "Inter");
  assert.deepEqual(state.fontRequests(), ["Inter"]);
  let committed = false;
  const waiting = state.commit().then(() => { committed = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(committed, false);
  release(); await waiting;
  assert.equal(committed, true);
});

test("case-insensitive curated family names load one canonical face before mount completion", async () => {
  const { fixture } = await runtime(), state = fixture(), release = state.blockFont();
  state.set("fontFamily", "inter"); assert.deepEqual(state.fontRequests(), ["Inter"]);
  state.set("fontFamily", "INTER"); state.set("fontFamily", "Inter");
  assert.deepEqual(state.fontRequests(), ["Inter"]);
  let committed = false; const pending = state.commit().then(() => { committed = true; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(committed, false);
  release(); await pending; assert.equal(committed, true);
});

test("local names and prototype keys never become remote font requests, and failed curated faces reject commit", async () => {
  const { fixture } = await runtime(), local = fixture();
  for (const name of ["Arial", "Impact", "constructor", "toString"]) local.set("fontFamily", name);
  await local.commit();
  assert.deepEqual(local.fontRequests(), []);
  const failed = fixture(); failed.failFont(); failed.set("fontFamily", "Inter");
  await assert.rejects(failed.commit(), /Font unavailable/);
});
