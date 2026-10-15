import assert from "node:assert/strict";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { buildReferenceStyleModule, referenceStyleJsonSchema, referenceStylePlanSchema } from "../src/reference-style.ts";
import type { ReferenceStylePlan } from "../src/reference-style.ts";

const layer = (overrides: Partial<ReferenceStylePlan["layers"][number]> = {}): ReferenceStylePlan["layers"][number] => ({
  id: "headline", name: "Opening headline", type: "text", start: 2, end: 6, x: 80, y: 100, width: 900, height: 180,
  rotation: 0, opacity: 1, fill: "#FDFDFD", text: "An original explanation", fontFamily: "Arial", fontSize: 64,
  fontWeight: 700, textAlign: "left", radius: 0, keyframes: [], ...overrides,
});
const plan = (overrides: Partial<ReferenceStylePlan> = {}): ReferenceStylePlan => ({
  schemaVersion: 1, title: "Original native study", summary: "An authored text and shape plan.", uncertainties: ["Reference font is not identified."],
  width: 1080, height: 1920, fps: 30, duration: 8, background: "#181818", layers: [layer()], ...overrides,
});
type Node = { tag: string; props: Record<string, unknown>; children: Node[]; parent?: Node };
type NativeMount = { root: Node; nodes(): Node[]; setTime(time: number): void; created(): number; dispose(): void };
type NativeRuntime = { referenceStyleManifest: { duration: number; sceneKey: string; layers: unknown[] }; mount(): NativeMount };

async function nativeModule(source: string): Promise<NativeRuntime> {
  const repository = fileURLToPath(new URL("../../../", import.meta.url));
  const jsx = resolve(repository, "packages/jsx/src/index.ts");
  const result = await build({
    stdin: { contents: `import Project,{referenceStyleManifest} from "test-reference-style";
import {renderProject} from ${JSON.stringify(jsx)};
import {createSignal} from "solid-js";
export {referenceStyleManifest};
export function mount(){
 const [clock,setClock]=createSignal({time:0,frame:0,delta:0,playing:false});let created=0;
 const stage={tag:"stage",props:{},children:[]};
 const document={stage,tick:clock,createElement(tag){created++;return{tag,props:{},children:[]};},createTextNode(text){created++;return{tag:"#text",props:{text},children:[]};},replaceText(node,text){node.props.text=text;},isTextNode(node){return node.tag==="#text";},setProperty(node,key,value){node.props[key]=value;},insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},getParentNode(node){return node.parent;},getFirstChild(node){return node.children[0];},getNextSibling(node){return node.parent?.children[node.parent.children.indexOf(node)+1];}};
 const dispose=renderProject(Project,document);
 return{root:stage,nodes(){const nodes=[];function walk(node){nodes.push(node);node.children.forEach(walk);}walk(stage);return nodes;},created:()=>created,dispose,setTime(time){const prior=clock().time;setClock({time,frame:Math.floor(time*30),delta:time-prior,playing:false});}};
}`, resolveDir: repository, loader: "js" },
    bundle: true, write: false, format: "esm", platform: "node", conditions: ["browser"], logLevel: "silent",
    plugins: [{ name: "reference-style-host", setup(builder) {
      builder.onResolve({ filter: /^test-reference-style$/ }, () => ({ path: "generated", namespace: "reference-style" }));
      builder.onLoad({ filter: /.*/, namespace: "reference-style" }, () => ({ contents: source, loader: "js", resolveDir: repository }));
      builder.onResolve({ filter: /^dapi-host:@diffusionstudio\/jsx$/ }, () => ({ path: jsx }));
    } }],
  });
  const directory = await mkdtemp(join(tmpdir(), "editor-reference-style-")), file = join(directory, "runtime.mjs");
  try { await writeFile(file, result.outputFiles[0].text); return await import(pathToFileURL(file).href); }
  finally { await unlink(file); await rmdir(directory); }
}
function named(mounted: NativeMount, name: string) {
  const node = mounted.nodes().find(node => node.props.name === name);
  assert.ok(node, `Missing native node ${name}`); return node;
}

test("provider schema uses required strict objects and no default, executable or asset fields", () => {
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const schema = value as Record<string, unknown>;
    assert.equal(Object.hasOwn(schema, "default"), false);
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual([...(schema.required as string[])].sort(), Object.keys(schema.properties as object).sort());
      for (const key of ["src", "url", "html", "code", "wgsl", "script", "image", "video"]) assert.equal(Object.hasOwn(schema.properties as object, key), false);
    }
    Object.values(schema).forEach(visit);
  };
  visit(referenceStyleJsonSchema);
  assert.deepEqual(referenceStyleJsonSchema.required, ["schemaVersion", "title", "summary", "uncertainties", "width", "height", "fps", "duration", "background", "layers"]);
});

test("runtime rejects malformed or unbounded plans before generating a module", () => {
  const invalid: unknown[] = [
    { ...plan(), src: "https://example.com/video.mp4" }, { ...plan(), width: Infinity }, { ...plan(), fps: 60 },
    { ...plan(), width: 4096, height: 4096 }, { ...plan(), duration: 121 }, { ...plan(), background: "url(x)" },
    { ...plan(), layers: [] }, { ...plan(), layers: Array.from({ length: 121 }, (_, i) => layer({ id: `layer-${i}` })) },
    plan({ layers: [layer({ opacity: 1.1 })] }), plan({ layers: [layer({ width: 0 })] }),
    plan({ layers: [layer({ x: -1081 })] }), plan({ layers: [layer({ y: 3841 })] }),
    plan({ layers: [layer({ width: 2161 })] }), plan({ layers: [layer({ height: 3841 })] }),
    plan({ layers: [layer({ rotation: -3601 })] }), plan({ layers: [layer({ fill: "#fff" })] }),
    plan({ layers: [layer({ radius: 100 })] }), plan({ layers: [layer({ text: " " })] }),
    plan({ layers: [layer({ text: "x\u0000" })] }), plan({ layers: [layer({ fontFamily: "url(https://example.com/font)" })] }),
    plan({ layers: [layer({ fontSize: 7 })] }), plan({ layers: [layer({ fontWeight: 901 })] }),
    plan({ layers: [layer({ id: "same" }), layer({ id: "same" })] }),
    plan({ layers: [layer({ type: "rect", text: "Ignored text is not permitted" })] }),
  ];
  for (const input of invalid) assert.throws(() => buildReferenceStyleModule(input), JSON.stringify(input).slice(0, 100));
  const omitted = { ...layer() } as Partial<ReturnType<typeof layer>>; delete omitted.radius;
  assert.equal(referenceStylePlanSchema.safeParse({ ...plan(), layers: [omitted] }).success, false);
  assert.throws(() => buildReferenceStyleModule(plan(), { sceneKey: "x/y" }));
  assert.throws(() => buildReferenceStyleModule(plan(), { unexpected: true } as never));
});

test("glyph and native layer budgets are independent of temporal overlaps", () => {
  const large = plan({ layers: Array.from({ length: 10 }, (_, i) => layer({ id: `title-${i}`, text: "a".repeat(1200) })) });
  assert.ok(referenceStylePlanSchema.safeParse(large).success, "12,000 characters are allowed");
  large.layers.push(layer({ id: "overflow", text: "a" }));
  assert.equal(referenceStylePlanSchema.safeParse(large).success, false);
  assert.ok(referenceStylePlanSchema.safeParse(plan({ layers: Array.from({ length: 120 }, (_, i) => layer({ id: `box-${i}`, type: "rect", text: "" })) })).success);
});

test("circle-only ellipse and rotated rectangle line semantics are explicit", async () => {
  const valid = plan({ layers: [layer({ type: "ellipse", id: "circle", name: "Circle", text: "", width: 100, height: 100 }), layer({ type: "line", id: "rule", name: "Rule", text: "", width: 700, height: 4, rotation: 35, radius: 2 })] });
  assert.equal(referenceStylePlanSchema.safeParse(plan({ layers: [layer({ type: "ellipse", text: "", width: 200, height: 100 })] })).success, false);
  const runtime = await nativeModule(buildReferenceStyleModule(valid, { sceneKey: "shapes" })), mounted = runtime.mount();
  assert.equal(named(mounted, "Circle").tag, "Rect");
  assert.equal(named(mounted, "Circle").props.cornerRadius, 50);
  assert.equal(named(mounted, "Rule").props.rotation, 35);
  assert.equal(named(mounted, "Rule").props.width, 700);
  assert.equal(named(mounted, "Rule").props.height, 4);
  mounted.dispose();
});

test("absolute keyframes must fit layer time and occupy distinct canonical frames", () => {
  const key = (time: number) => ({ time, x: 80, y: 100, scale: 1, rotation: 0, opacity: 1 });
  assert.ok(referenceStylePlanSchema.safeParse(plan({ layers: [layer({ keyframes: [key(2), key(6)] })] })).success);
  for (const keys of [[key(1)], [key(7)], [key(4), key(3)], [key(3), key(3)], [key(3), key(3.001)], [{ ...key(3), scale: 4.1 }], [{ ...key(3), opacity: -1 }], [{ ...key(3), x: 2161 }], Array.from({ length: 21 }, (_, i) => key(2 + i / 10))]) {
    assert.equal(referenceStylePlanSchema.safeParse(plan({ layers: [layer({ keyframes: keys })] })).success, false);
  }
  assert.equal(referenceStylePlanSchema.safeParse(plan({ layers: [layer({ start: 3, end: 3 })] })).success, false);
  assert.equal(referenceStylePlanSchema.safeParse(plan({ layers: [layer({ start: 3, end: 3.001 })] })).success, false);
  assert.equal(referenceStylePlanSchema.safeParse(plan({ layers: [layer({ end: 9 })] })).success, false);
});

test("native tracks map scene time once while constant properties remain static", async () => {
  const authored = plan({ layers: [layer({ start: 2.01, end: 6.01, keyframes: [
    { time: 3.01, x: 200, y: 100, scale: 1.5, rotation: 30, opacity: .5 },
    { time: 5.01, x: 300, y: 100, scale: 1.5, rotation: 0, opacity: 1 },
  ] })] });
  const runtime = await nativeModule(buildReferenceStyleModule(authored, { sceneKey: "tracks" })), mounted = runtime.mount();
  const props = named(mounted, "Opening headline").props;
  assert.equal(props.start, "60f"); assert.equal(props.end, "180f");
  assert.deepEqual(props.x, [{ time: "0f", value: 80, easing: "linear" }, { time: "30f", value: 200, easing: "linear" }, { time: "90f", value: 300, easing: "linear" }]);
  assert.deepEqual(props.scale, [{ time: "0f", value: 1, easing: "linear" }, { time: "30f", value: 1.5, easing: "linear" }, { time: "90f", value: 1.5, easing: "linear" }]);
  assert.equal(props.y, 100, "an unchanged property must not acquire a keyframe track");
  assert.deepEqual(props.rotation, [{ time: "0f", value: 0, easing: "linear" }, { time: "30f", value: 30, easing: "linear" }, { time: "90f", value: 0, easing: "linear" }]);
  const original = JSON.stringify(props), count = mounted.created();
  for (const time of [5, 2, 8, 3, 3, 0, 5]) mounted.setTime(time);
  assert.equal(JSON.stringify(props), original, "keyframes are mounted once and sampled by the editor, not a reactive clock callback");
  assert.equal(mounted.created(), count);
  props.y = 250;
  mounted.setTime(7); mounted.setTime(0);
  assert.equal(props.y, 250, "static inspector edits are not overwritten by subsequent clock ticks");
  assert.equal(named(mounted, "Reference style background").props.end, "240f", "background preserves the declared full duration");
  const root = mounted.root.children[0];
  assert.equal(root.props.start, undefined); assert.equal(root.props.end, undefined, "scene root has no forbidden placement timing");
  mounted.dispose();
  mounted.setTime(4);
  assert.equal(mounted.created(), count, "disposing the reactive mount leaves no clock-driven work");
});

test("a key at layer start explicitly overrides base values without an accidental extra interpolation", async () => {
  const runtime = await nativeModule(buildReferenceStyleModule(plan({ layers: [layer({ keyframes: [{ time: 2, x: 200, y: 100, scale: 1, rotation: 0, opacity: 1 }] })] }), { sceneKey: "first-key" }));
  const mounted = runtime.mount();
  assert.equal(named(mounted, "Opening headline").props.x, 200);
  mounted.dispose();
});

test("strings remain literal native text and modules require only the trusted host", async () => {
  const payload = '</script>";globalThis.referenceStyleInjected=true;//\u2028https://example.com/text';
  const authored = plan({ layers: [layer({ text: payload })] });
  const before = JSON.stringify(authored);
  const source = buildReferenceStyleModule(authored, { sceneKey: "literal" });
  assert.deepEqual(Array.from(source.matchAll(/from "([^"]+)"/g), match => match[1]), ["dapi-host:@diffusionstudio/jsx"]);
  assert.doesNotMatch(source, /useTicker|createEffect|requestAnimationFrame|fetch\(|eval\(|new Function|import\(/);
  assert.ok(!source.includes("</script>"));
  const runtime = await nativeModule(source), mounted = runtime.mount();
  const text = named(mounted, "Opening headline");
  assert.equal(text.tag, "Text");
  assert.equal(text.children.map(child => child.props.text).join(""), payload);
  assert.equal(Object.hasOwn(globalThis, "referenceStyleInjected"), false);
  assert.equal(JSON.stringify(authored), before);
  assert.equal(source, buildReferenceStyleModule(authored, { sceneKey: "literal" }));
  assert.notEqual(buildReferenceStyleModule(authored), buildReferenceStyleModule(authored), "new modules receive distinct scene identities by default");
  mounted.dispose();
});

test("120 primitive layers create a finite stable native tree with no per-frame resource growth", async () => {
  const authored = plan({ duration: 120, layers: Array.from({ length: 120 }, (_, i) => layer({ id: `shape-${i}`, name: `Shape ${i}`, type: "rect", text: "", start: 0, end: 120 })) });
  const runtime = await nativeModule(buildReferenceStyleModule(authored, { sceneKey: "bounded" })), mounted = runtime.mount();
  assert.equal(mounted.nodes().filter(node => node.tag === "Rect").length, 122);
  const count = mounted.created();
  for (let i = 0; i < 100; i++) mounted.setTime(i % 2 ? 119 : 0);
  assert.equal(mounted.created(), count);
  assert.equal(runtime.referenceStyleManifest.duration, 120);
  assert.equal(named(mounted, "Shape 119").props.end, "3600f");
  mounted.dispose();
});
