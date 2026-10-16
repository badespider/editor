import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";

type Snapshot = { audio: boolean; assetId?: string; paintTypes: number[]; durationFrames: number | null; trim: { start?: number; end?: number }; delay?: number };
type Fixture = { mount(tag: "Audio" | "Video", assetId: string, timing?: boolean): Promise<Snapshot> };
type Runtime = { fixture(): Fixture; videoPaint: number };
let runtimePromise: Promise<Runtime> | undefined;

function runtime(): Promise<Runtime> {
  return runtimePromise ??= (async () => {
    const repository = fileURLToPath(new URL("../../../", import.meta.url));
    const jsx = resolve(repository, "apps/web/src/utils/jsx.ts"), events = resolve(repository, "apps/web/src/components/engine/api/events.ts");
    const constants = resolve(repository, "apps/web/src/components/engine/components/constants.ts"), relations = resolve(repository, "apps/web/src/components/engine/components/relations.ts");
    const components = resolve(repository, "apps/web/src/components/engine/api/components.ts"), timing = resolve(repository, "apps/web/src/components/engine/utils/time.ts");
    const unused = ["computeAudioSyncOffsetCached", "deleteEntity", "findGeometryAsset", "getAssetFile", "getEntityTree", "getParentEntity", "getSceneAncestor", "hasAudioSources", "removeChild", "setKeyframeTrack", "transcribeScene", "transcriptTrim"];
    const stubs: Record<string, string> = {
      "@/components/engine": `export * from ${JSON.stringify(constants)}; export {addComponent,removeComponent,setComponent} from ${JSON.stringify(events)};
import {addEntity} from "bitecs"; import {addComponent,setComponent} from ${JSON.stringify(events)}; import {ChildOf} from ${JSON.stringify(relations)};
export {findAssetDuration} from ${JSON.stringify(timing)};
export function createEntity(world){const eid=addEntity(world);world.components.Cache.fills[eid]=[];return eid;}
export function appendChild(world,child,parent){addComponent(world,child,ChildOf(parent));world.components.Cache.fills[parent].push(child);}
export function getNextName(_world,name){return name;}
export function resizeEntity(world,eid,size){setComponent(world,eid,world.components.Size,size);}
${unused.map(name => `export function ${name}(){throw new Error("Unexpected ${name} in audio source test");}`).join("\n")}`,
      "@/components/engine/components": `export {ChildOf} from ${JSON.stringify(relations)};`,
      "@/components/engine/font": "export const WebFonts={};export function loadWebFont(){throw new Error('Unexpected font');}",
      "@/components/engine/decoders/html": "export class HtmlHost{}export function isHtmlInCanvasSupported(){return false;}",
      "@/components/engine/decoders/surface": "export class SurfaceHost{}",
      "@/components/engine/decoders/caption/utils": "export function resolveTranscript(){throw new Error('Unexpected transcript');}",
      "@/utils/genai": "export const ASPECT_RATIO_DIMENSIONS={};export function findEmptyPlacement(){throw new Error('Unexpected placement');}",
      "@/utils/jsx-generation": "export async function resolveAsset(world,id){const asset=world.assets.get(id);if(!asset)throw new Error('Missing source');return asset;}export function resolveGeneratedAsset(){throw new Error('Unexpected generation');}",
      "@/utils": "export function assert(value,message){if(!value)throw new Error(message);}export function assertAllSettled(values){for(const value of values)if(value.status==='rejected')throw value.reason;}export function parseColor(){throw new Error('Unexpected color');}",
    };
    const bundled = await build({
      stdin: { contents: `import {WorldDocument} from ${JSON.stringify(jsx)};
import {createWorld,hasComponent,query,Not} from "bitecs";
import {observe} from ${JSON.stringify(events)};import {createComponents} from ${JSON.stringify(components)};
import {ChildOf} from ${JSON.stringify(relations)};import {findAssetDuration} from ${JSON.stringify(timing)};
import {PaintType} from ${JSON.stringify(constants)};
globalThis.__AudioTestElement=class AudioTestElement{};globalThis.__AudioTestText=class AudioTestText{};
export const videoPaint=PaintType.VIDEO;
export function fixture(){const c=createComponents();const world=createWorld({components:c,frameRate:30,assets:new Map([
["video-source",{id:"video-source",type:"VIDEO",name:"camera.mkv",duration:12,width:3840,height:2160,channels:2}],
["audio-source",{id:"audio-source",type:"AUDIO",name:"sound.wav",duration:12}],
["image-source",{id:"image-source",type:"IMAGE",name:"image.png",width:1920,height:1080}]]),
history:{push(entry){entry.execute();},untrack(fn){return fn();}}});
for(const component of Object.values(c))observe(world,"set",component,(eid,value)=>{if(Array.isArray(component))component[eid]=value;else for(const[key,field]of Object.entries(value))component[key][eid]=field;});
return{async mount(tag,assetId,timing){const document=new WorldDocument(world),node=document.createElement(tag);document.setProperty(node,"src",assetId);
if(timing){document.setProperty(node,"start","0f");document.setProperty(node,"sourceIn","12f");document.setProperty(node,"sourceOut","72f");}
await document.commit();return{audio:hasComponent(world,node.eid,c.Audio),assetId:c.AssetId[node.eid],paintTypes:query(world,[c.Paint,ChildOf(node.eid),Not(c.Deleted)]).map(eid=>c.Paint[eid]),durationFrames:findAssetDuration(world,node.eid),trim:{start:c.Trim.start[node.eid],end:c.Trim.end[node.eid]},delay:c.Delay[node.eid]};}};}`, loader: "js", resolveDir: repository },
      bundle: true, write: false, platform: "node", format: "esm", conditions: ["browser"], logLevel: "silent",
      define: { Element: "globalThis.__AudioTestElement", Text: "globalThis.__AudioTestText" },
      plugins: [{ name: "audio-world-dependencies", setup(builder) {
        builder.onResolve({ filter: /^@\// }, args => stubs[args.path] ? ({ path: args.path, namespace: "audio-stub" }) : undefined);
        builder.onLoad({ filter: /.*/, namespace: "audio-stub" }, args => ({ contents: stubs[args.path], loader: "js", resolveDir: repository }));
      } }],
    });
    const directory = await mkdtemp(join(tmpdir(), "editor-audio-source-")), modulePath = join(directory, "runtime.mjs");
    try { await writeFile(modulePath, bundled.outputFiles[0].text); return await import(pathToFileURL(modulePath).href); }
    finally { await unlink(modulePath); await rmdir(directory); }
  })();
}

test("Audio with a video container retains the native sound source and trim without creating picture paints", async () => {
  const { fixture } = await runtime(), result = await fixture().mount("Audio", "video-source", true);
  assert.equal(result.audio, true); assert.equal(result.assetId, "video-source");
  assert.deepEqual(result.paintTypes, []);
  assert.equal(result.durationFrames, 360);
  assert.deepEqual(result.trim, { start: 12, end: 72 }); assert.equal(result.delay, -12);
});

test("Audio files remain audio-only while an explicit Video keeps its video paint", async () => {
  const { fixture, videoPaint } = await runtime();
  const audio = await fixture().mount("Audio", "audio-source");
  assert.equal(audio.audio, true); assert.equal(audio.assetId, "audio-source"); assert.deepEqual(audio.paintTypes, []); assert.equal(audio.durationFrames, 360);
  const video = await fixture().mount("Video", "video-source");
  assert.equal(video.audio, false); assert.deepEqual(video.paintTypes, [videoPaint]); assert.equal(video.durationFrames, 360);
});

test("Audio rejects still images instead of displaying their picture", async () => {
  const { fixture } = await runtime();
  await assert.rejects(fixture().mount("Audio", "image-source"), /Audio.*audio or video/);
});
