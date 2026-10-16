import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import { z } from 'zod';
import { buildReconstructionModule, reconstructionJsonSchema, reconstructionPlanSchema, reconstructionRevisionJsonSchema, reconstructionRevisionSchema } from '../src/reference-reconstruction.ts';
import type { ReconstructionBinding, ReconstructionCompilerOptions, ReconstructionPlan } from '../src/reference-reconstruction.ts';

type Layer = ReconstructionPlan['layers'][number];
type Key = Layer['keyframes'][number];
const layer = (fields: Partial<Layer> = {}): Layer => ({ id: 'year', name: 'Year label', type: 'text',
  start: 2, end: 6, x: 80, y: 100, width: 900, height: 180, rotation: 0, opacity: 1, fill: '#FDFDFD', radius: 0,
  text: '2024', fontFamily: 'Impact', fontSize: 120, fontWeight: 700, fontStyle: 'normal', textAlign: 'left',
  letterSpacing: -1.25, leading: 1.125, assetId: null, objectFit: 'contain', sourceIn: 0, keyframes: [], evidenceIds: ['source-frame-1'], ...fields });
const plan = (fields: Partial<ReconstructionPlan> = {}): ReconstructionPlan => ({ schemaVersion: 2, title: 'Measured year graph',
  summary: 'Native text and geometry with source-bound prepared media where declared.', width: 1920, height: 1080, fps: 30,
  duration: 8, background: '#181818', assetRequests: [], layers: [layer()], unresolved: ['Exact reference font identity is unverified.'], observations: ['Authored test fixture.'], ...fields });
const key = (time: number, fields: Partial<Key> = {}): Key => ({ time, x: 80, y: 100, width: 900, height: 180, scale: 1, rotation: 0, opacity: 1, easing: 'linear', ...fields });
const sourceBinding = (fields: Partial<ReconstructionBinding> = {}): ReconstructionBinding => ({ id: 'reference-source', path: 'C:/source/reference.mp4', sha256: 'a'.repeat(64), kind: 'source-video', width: 1920, height: 1080, duration: 60, ...fields });
const options = (fields: Partial<ReconstructionCompilerOptions> = {}): ReconstructionCompilerOptions => ({ sceneKey: 'measured-reconstruction', bindings: [], audio: null, ...fields });
type Node = { tag: string; props: Record<string, unknown>; children: Node[]; parent?: Node };
type Mounted = { nodes(): Node[]; setTime(time: number): void; created(): number; dispose(): void };
type Native = { reconstructionManifest: { duration: number; bindings: ReconstructionBinding[] }; mount(): Mounted };
async function nativeModule(source: string): Promise<Native> {
  const repository = fileURLToPath(new URL('../../../', import.meta.url)), jsx = resolve(repository, 'packages/jsx/src/index.ts');
  const compiled = await build({ stdin: { contents: `import Project,{reconstructionManifest} from "reconstruction-test";
import {renderProject} from ${JSON.stringify(jsx)};
import {createSignal} from "solid-js";
export {reconstructionManifest};
export function mount(){const [clock,setClock]=createSignal({time:0,frame:0,delta:0,playing:false});let count=0;const stage={tag:"stage",props:{},children:[]};
const document={stage,tick:clock,createElement(tag){count++;return{tag,props:{},children:[]};},createTextNode(text){count++;return{tag:"#text",props:{text},children:[]};},replaceText(node,text){node.props.text=text;},isTextNode(node){return node.tag==="#text";},setProperty(node,key,value){node.props[key]=value;},insertNode(parent,node,anchor){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);const at=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(at<0?parent.children.length:at,0,node);node.parent=parent;},removeNode(parent,node){parent.children.splice(parent.children.indexOf(node),1);node.parent=undefined;},getParentNode(node){return node.parent;},getFirstChild(node){return node.children[0];},getNextSibling(node){return node.parent?.children[node.parent.children.indexOf(node)+1];}};
const dispose=renderProject(Project,document);return{dispose,created:()=>count,nodes(){const rows=[];function visit(node){rows.push(node);node.children.forEach(visit);}visit(stage);return rows;},setTime(time){const prior=clock().time;setClock({time,frame:Math.floor(time*30),delta:time-prior,playing:false});}};}`, loader: 'js', resolveDir: repository },
    bundle: true, write: false, platform: 'node', format: 'esm', conditions: ['browser'], logLevel: 'silent',
    plugins: [{ name: 'reconstruction-host', setup(builder) {
      builder.onResolve({ filter: /^reconstruction-test$/ }, () => ({ path: 'generated', namespace: 'reconstruction' }));
      builder.onLoad({ filter: /.*/, namespace: 'reconstruction' }, () => ({ contents: source, loader: 'js', resolveDir: repository }));
      builder.onResolve({ filter: /^dapi-host:@diffusionstudio\/jsx$/ }, () => ({ path: jsx }));
    } }],
  });
  const directory = await mkdtemp(join(tmpdir(), 'native-reconstruction-')), path = join(directory, 'runtime.mjs');
  try { await writeFile(path, compiled.outputFiles[0].text); return await import(pathToFileURL(path).href); }
  finally { await unlink(path); await rmdir(directory); }
}
function named(mounted: Mounted, name: string): Node { const value = mounted.nodes().find(node => node.props.name === name); assert.ok(value, name); return value; }

test('provider structure requires every bounded field and rejects arbitrary executable or source paths', () => {
  const visit = (item: unknown) => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item)) { item.forEach(visit); return; }
    const schema = item as Record<string, unknown>;
    if (schema.type === 'object') { assert.equal(schema.additionalProperties, false); assert.deepEqual([...(schema.required as string[])].sort(), Object.keys(schema.properties as object).sort()); }
    assert.equal(Object.hasOwn(schema, 'default'), false); Object.values(schema).forEach(visit);
  };
  visit(reconstructionJsonSchema); visit(reconstructionRevisionJsonSchema);
  assert.equal(reconstructionPlanSchema.safeParse({ ...plan(), code: 'execute()' }).success, false);
  assert.equal(reconstructionPlanSchema.safeParse(plan({ layers: [{ ...layer(), src: 'https://example.com/file' } as Layer] })).success, false);
  assert.equal(reconstructionPlanSchema.safeParse(plan({ layers: [layer({ assetId: 'https://example.com/file' })] })).success, false);
});

test('old v2 plans retain optional runtime controls while author and correction providers require all three without defaults', async () => {
  const old = plan(), parsed = reconstructionPlanSchema.parse(old);
  assert.equal(Object.hasOwn(parsed.layers[0], 'scaleX'), false); assert.equal(Object.hasOwn(parsed.layers[0], 'scaleY'), false);
  assert.equal(Object.hasOwn(parsed.layers[0], 'clipToBox'), false);
  assert.ok(reconstructionRevisionSchema.safeParse({ verdict: 'best-effort', differences: [], plan: old }).success);
  const fields = z.object({ properties: z.record(z.string(), z.unknown()), required: z.array(z.string()) }).passthrough();
  const planProvider = z.object({ properties: z.object({ layers: z.object({ items: fields }).passthrough() }).passthrough() }).passthrough();
  const provider = planProvider.parse(reconstructionJsonSchema);
  const correction = z.object({ properties: z.object({ plan: planProvider }).passthrough() }).passthrough().parse(reconstructionRevisionJsonSchema);
  for (const shape of [provider.properties.layers.items, correction.properties.plan.properties.layers.items]) {
    for (const field of ['scaleX', 'scaleY', 'clipToBox']) { assert.ok(shape.required.includes(field)); assert.ok(Object.hasOwn(shape.properties, field)); }
  }
  const runtime = await nativeModule(buildReconstructionModule(old, options())), mounted = runtime.mount(), text = named(mounted, 'Year label');
  assert.equal(text.props.scaleX, 1); assert.equal(text.props.scaleY, 1); assert.equal(text.props.clipToBox, false);
  mounted.dispose();
});

test('static axis scale and local-box clipping reject wrong types, nonfinite values and unsupported axis tracks', () => {
  for (const property of ['scaleX', 'scaleY']) {
    for (const value of [-.001, 4.001, NaN, Infinity, null, '1', [{ time: 0, value: 1 }]]) {
      const invalid = { ...plan(), layers: [{ ...layer(), [property]: value }] };
      assert.equal(reconstructionPlanSchema.safeParse(invalid).success, false);
      assert.equal(reconstructionRevisionSchema.safeParse({ verdict: 'revise', differences: [], plan: invalid }).success, false);
    }
  }
  for (const clipToBox of [0, 1, 'true', null, []]) assert.equal(reconstructionPlanSchema.safeParse({ ...plan(), layers: [{ ...layer(), clipToBox }] }).success, false);
  assert.ok(reconstructionPlanSchema.safeParse(plan({ layers: [layer({ scaleX: 0, scaleY: 4, clipToBox: true })] })).success);
  assert.equal(reconstructionPlanSchema.safeParse({ ...plan(), layers: [{ ...layer(), keyframes: [{ ...key(2), scaleX: 1 }] }] }).success, false, 'axis scales are static, not silently ignored key fields');
});

test('all native layer kinds forward axis scales and clipping without replacing uniform scale or allocating wrapper entities', async () => {
  const photo = { id: 'photo', kind: 'frame-crop' as const, time: 29, rect: { x: .1, y: .1, width: .2, height: .2 }, purpose: 'A source-bound photo detail.' };
  const layers: Layer[] = ['text', 'rect', 'ellipse', 'line', 'image', 'video'].map((type, index) => layer({ id: `layer-${index}`, name: `Kind ${type}`, type: type as Layer['type'], text: type === 'text' ? 'Literal glyphs' : '',
    width: type === 'ellipse' ? 180 : 900, scaleX: .65, scaleY: 1.25, clipToBox: true,
    assetId: type === 'image' ? 'photo' : type === 'video' ? 'reference-source' : null, sourceIn: type === 'video' ? 30 : 0,
    keyframes: [key(2, { scale: .5, width: type === 'ellipse' ? 180 : 900, height: 180 }), key(4, { scale: 1.5, width: type === 'ellipse' ? 180 : 1000, height: 180 })] }));
  const authored = plan({ assetRequests: [photo], layers }), bindings: ReconstructionBinding[] = [sourceBinding(), { id: 'photo', kind: 'frame-crop', path: 'C:/prepared/photo.png', sha256: 'b'.repeat(64), width: 384, height: 216 }];
  const runtime = await nativeModule(buildReconstructionModule(authored, options({ bindings }))), mounted = runtime.mount();
  for (const layer of layers) {
    const node = named(mounted, layer.name);
    assert.equal(node.props.scaleX, .65); assert.equal(node.props.scaleY, 1.25); assert.equal(node.props.clipToBox, true);
    assert.deepEqual((node.props.scale as { value: number }[]).map(point => point.value), [.5, 1.5]);
  }
  const state = JSON.stringify(mounted.nodes().map(node => node.props)), count = mounted.created();
  for (const time of [0, 7.9, 2, 4, 1, 6, 0, 4]) mounted.setTime(time);
  assert.equal(mounted.created(), count); assert.equal(JSON.stringify(mounted.nodes().map(node => node.props)), state);
  const defaults = await nativeModule(buildReconstructionModule({ ...authored, layers: layers.map(({ scaleX: _x, scaleY: _y, clipToBox: _clip, ...legacy }) => legacy) }, options({ bindings })));
  const baseline = defaults.mount(); assert.equal(count, baseline.created(), 'compiler forwards controls to the existing native nodes without wrapper/mask entities');
  mounted.dispose(); baseline.dispose();
});

test('invalid layer bounds, native times, identities and topology fail including revision plans', () => {
  for (const input of [plan({ width: 4096, height: 4096 }), plan({ duration: 121 }), plan({ layers: [] }),
    plan({ layers: [layer(), layer()] }), plan({ layers: [layer({ end: 9 })] }), plan({ layers: [layer({ start: 3, end: 3.001 })] }),
    plan({ layers: [layer({ letterSpacing: NaN })] }), plan({ layers: [layer({ leading: 0 })] }),
    plan({ layers: [layer({ keyframes: [key(2), key(2.001)] })] }), plan({ layers: [layer({ keyframes: [key(1)] })] }),
    plan({ layers: [layer({ keyframes: [key(4, { width: -1 })] })] }), plan({ layers: [layer({ type: 'ellipse', text: '', width: 100, height: 101 })] }),
  ]) { assert.equal(reconstructionPlanSchema.safeParse(input).success, false); assert.equal(reconstructionRevisionSchema.safeParse({ verdict: 'revise', differences: [], plan: input }).success, false); }
  assert.ok(reconstructionPlanSchema.safeParse(plan({ layers: Array.from({ length: 240 }, (_, index) => layer({ id: `line-${index}`, type: 'line', text: '' })) })).success);
  assert.equal(reconstructionPlanSchema.safeParse(plan({ layers: Array.from({ length: 241 }, (_, index) => layer({ id: `line-${index}`, type: 'line', text: '' })) })).success, false);
});

test('easing allows native curves while rejecting unbounded overshoot or foreign code', () => {
  for (const easing of ['linear', 'easeOut', 'snappy', 'cubicBezier(0.12, -1.5, 0.88, 2)']) assert.ok(reconstructionPlanSchema.safeParse(plan({ layers: [layer({ keyframes: [key(2, { easing })] })] })).success);
  for (const easing of ['alert(1)', 'cubicBezier(-1, 0, 1, 1)', 'cubicBezier(0, 1000000000000000000000, 1, 1)', 'cubicBezier(0, 0, 1.1, 1)', 'cubicBezier(0, 0, 1, 4.01)']) assert.equal(reconstructionPlanSchema.safeParse(plan({ layers: [layer({ keyframes: [key(2, { easing })] })] })).success, false);
});

test('oversized native typography supports the 4K canvas while keeping a finite font-size boundary', async () => {
  const authored = plan({ width: 3840, height: 2160, layers: [layer({ name: 'Oversized faint year', fontSize: 4096, width: 7600, height: 2160, opacity: .05 })] });
  assert.ok(reconstructionPlanSchema.safeParse(authored).success);
  const runtime = await nativeModule(buildReconstructionModule(authored, options())), mounted = runtime.mount();
  assert.equal(named(mounted, 'Oversized faint year').props.fontSize, 4096);
  mounted.dispose();
  for (const fontSize of [4096.001, Infinity, NaN]) {
    const invalid = { ...authored, layers: [{ ...authored.layers[0], fontSize }] };
    assert.equal(reconstructionPlanSchema.safeParse(invalid).success, false);
    assert.equal(reconstructionRevisionSchema.safeParse({ verdict: 'revise', differences: [], plan: invalid }).success, false);
  }
  assert.equal(reconstructionPlanSchema.safeParse({ ...authored, height: 2161 }).success, false, 'native canvas pixel budget is unchanged');
});

test('graph width and height tracks preserve easing, zero-size reveal and exact node-local times', async () => {
  const authored = plan({ layers: [layer({ type: 'rect', name: 'Graph bar', text: '', radius: 0, keyframes: [
    key(2, { width: 0, height: 0, easing: 'cubicBezier(0.2, 0, 0.8, 1)' }), key(3, { width: 600, height: 400, easing: 'easeOut' }), key(6, { width: 900, height: 800 }),
  ] })] });
  const runtime = await nativeModule(buildReconstructionModule(authored, options())), mounted = runtime.mount(), bar = named(mounted, 'Graph bar');
  assert.deepEqual(bar.props.width, [{ time: '0f', value: 0, easing: 'cubicBezier(0.2, 0, 0.8, 1)' }, { time: '30f', value: 600, easing: 'easeOut' }, { time: '120f', value: 900, easing: 'linear' }]);
  assert.deepEqual((bar.props.height as { value: number }[]).map(point => point.value), [0, 400, 800]);
  assert.equal(bar.props.y, 100, 'unchanged native properties remain static');
  const state = JSON.stringify(bar.props), count = mounted.created();
  for (const time of [0, 5.9, 2, 4, 8, 0, 4]) mounted.setTime(time);
  assert.equal(JSON.stringify(bar.props), state); assert.equal(mounted.created(), count);
  mounted.dispose();
});

test('animated circles keep a proportional native radius instead of becoming rounded rectangles', async () => {
  const runtime = await nativeModule(buildReconstructionModule(plan({ layers: [layer({ type: 'ellipse', text: '', name: 'Circle', width: 100, height: 100, keyframes: [key(2, { width: 100, height: 100, easing: 'easeOut' }), key(5, { width: 200, height: 200 })] })] }), options()));
  const mounted = runtime.mount(), circle = named(mounted, 'Circle');
  assert.deepEqual(circle.props.cornerRadius, [{ time: '0f', value: 50, easing: 'easeOut' }, { time: '90f', value: 100, easing: 'linear' }]);
  mounted.dispose();
});

test('prepared images require declared opaque requests and matching trusted binding kinds', async () => {
  const request = { id: 'paper', kind: 'texture-tile' as const, time: 29, rect: { x: 0, y: 0, width: .2, height: .2 }, purpose: 'Source-backed paper texture; no graphic flattening.' };
  const authored = plan({ assetRequests: [request], layers: [layer({ id: 'paper-layer', type: 'image', text: '', name: 'Paper', assetId: 'paper' }), layer()] });
  const binding: ReconstructionBinding = { id: 'paper', kind: 'texture-tile', path: 'C:/prepared/paper.png', sha256: 'b'.repeat(64), width: 1920, height: 1080 };
  assert.throws(() => buildReconstructionModule(authored, options()), /Unprepared/);
  assert.throws(() => buildReconstructionModule(authored, options({ bindings: [{ ...binding, kind: 'frame-crop' }] })), /match/);
  assert.throws(() => buildReconstructionModule(authored, options({ bindings: [{ ...binding, id: 'not-requested' }] })), /explicit/);
  assert.throws(() => buildReconstructionModule(authored, options({ bindings: [binding, binding] })), /Duplicate/);
  const runtime = await nativeModule(buildReconstructionModule(authored, options({ bindings: [binding] }))), mounted = runtime.mount();
  assert.equal(named(mounted, 'Paper').tag, 'Image'); assert.equal(named(mounted, 'Paper').props.src, binding.path);
  assert.equal(named(mounted, 'Year label').tag, 'Text');
  assert.deepEqual(runtime.reconstructionManifest.bindings, [binding]);
  mounted.dispose();
  assert.equal(reconstructionPlanSchema.safeParse({ ...authored, assetRequests: [{ ...request, rect: { x: 0, y: 0, width: 1, height: 1 } }] }).success, false);
  assert.equal(reconstructionPlanSchema.safeParse({ ...authored, assetRequests: [{ ...request, id: 'a'.repeat(65) }] }).success, false);
});

test('binding paths cannot be URLs, shares, relative paths or control-bearing strings', () => {
  for (const path of ['https://example.com/reference.mp4', 'data:video/mp4,AAAA', 'file:///tmp/reference.mp4', '../reference.mp4', '\\\\host\\share\\file.mp4', '//host/share/file.mp4', '/\\host/share/file.mp4', 'C:/file\u0000.mp4']) assert.throws(() => buildReconstructionModule(plan(), options({ bindings: [sourceBinding({ path })] })));
  assert.throws(() => buildReconstructionModule(plan(), options({ bindings: [sourceBinding({ width: .5 })] })));
  assert.throws(() => buildReconstructionModule(plan(), options({ bindings: [sourceBinding({ sha256: 'not-a-hash' })] })));
  assert.throws(() => buildReconstructionModule(plan(), options({ bindings: [sourceBinding({ kind: 'frame-crop' })] })), /source video/);
});

test('trimmed camera video tracks use its source clock once while timing and media remain independently editable', async () => {
  const authored = plan({ layers: [layer({ id: 'camera', type: 'video', text: '', name: 'Camera shot', assetId: 'reference-source', sourceIn: 30,
    keyframes: [key(2, { x: 80, easing: 'easeOut' }), key(4, { x: 200 })] }), layer()] });
  const runtime = await nativeModule(buildReconstructionModule(authored, options({ bindings: [sourceBinding()] }))), mounted = runtime.mount(), camera = named(mounted, 'Camera shot');
  assert.equal(camera.tag, 'Video'); assert.equal(camera.props.start, '60f'); assert.equal(camera.props.end, undefined);
  assert.equal(camera.props.sourceIn, '900f'); assert.equal(camera.props.sourceOut, '1020f'); assert.equal(camera.props.muted, true);
  assert.deepEqual(camera.props.x, [{ time: '900f', value: 80, easing: 'easeOut' }, { time: '960f', value: 200, easing: 'linear' }]);
  assert.equal(named(mounted, 'Year label').tag, 'Text');
  assert.throws(() => buildReconstructionModule(authored, options({ bindings: [sourceBinding({ duration: undefined })] })), /duration-bound/);
  assert.throws(() => buildReconstructionModule(authored, options({ bindings: [sourceBinding({ duration: 33 })] })), /exceeds/);
  mounted.dispose();
});

test('optional original audio maps one exact frame-aligned interval with duration checks', async () => {
  const settings = options({ bindings: [sourceBinding()], audio: { sourceIn: 30, sourceOut: 38 } });
  const runtime = await nativeModule(buildReconstructionModule(plan(), settings)), mounted = runtime.mount(), audio = named(mounted, 'Original reference audio');
  assert.equal(audio.tag, 'Audio'); assert.equal(audio.props.start, '0f'); assert.equal(audio.props.sourceIn, 30); assert.equal(audio.props.sourceOut, 38);
  for (const value of [options({ audio: settings.audio }), options({ bindings: [sourceBinding({ duration: undefined })], audio: settings.audio }), options({ bindings: [sourceBinding()], audio: { sourceIn: 30, sourceOut: 38.1 } }), options({ bindings: [sourceBinding({ duration: 37 })], audio: settings.audio })]) assert.throws(() => buildReconstructionModule(plan(), value), /Audio/);
  mounted.dispose();
});

test('literal typography is separate native content and no generated code or callback can overwrite static edits', async () => {
  const payload = '</script>";globalThis.reconstructionInjected=true;//\u2028https://example.com/display-only';
  const authored = plan({ layers: [layer({ text: payload })] }), source = buildReconstructionModule(authored, options()), runtime = await nativeModule(source), mounted = runtime.mount(), text = named(mounted, 'Year label');
  assert.deepEqual(Array.from(source.matchAll(/from "([^"]+)"/g), match => match[1]), ['dapi-host:@diffusionstudio/jsx']);
  assert.doesNotMatch(source, /useTicker|createEffect|eval\(|fetch\(|new Function|import\(/);
  assert.ok(!source.includes('</script>'));
  assert.equal(text.children.map(child => child.props.text).join(''), payload);
  assert.equal(text.props.letterSpacing, -1.25); assert.equal(text.props.leading, 1.125); assert.equal(text.props.fontFamily, 'Impact');
  text.props.leading = 1.4; text.props.letterSpacing = -2.5;
  mounted.setTime(7); mounted.setTime(0);
  assert.equal(text.props.leading, 1.4); assert.equal(text.props.letterSpacing, -2.5);
  assert.equal(Object.hasOwn(globalThis, 'reconstructionInjected'), false);
  assert.equal(source, buildReconstructionModule(authored, options()));
  assert.equal(named(mounted, 'Reference background').props.end, '240f');
  mounted.dispose();
});
