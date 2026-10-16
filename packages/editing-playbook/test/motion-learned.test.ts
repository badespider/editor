import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearnedMotionMixModule, buildLearnedMotionModule, instantiateLearnedMotion, learnedMotionFingerprint, learnedMotionJsonSchema, learnedMotionSchema, trimLearnedMotionTimeline } from '../src/motion-learned.ts';
import type { LearnedMotion } from '../src/motion-learned.ts';
import { nativeModule } from './native-motion-host.ts';
import type { NativeNode } from './native-motion-host.ts';

function component(): LearnedMotion {
  return { schemaVersion: 1, id: 'staged-checklist', name: 'Staged checklist', description: 'A label rises into position before its companion card appears.', tags: ['checklist', 'stagger'],
    plan: { schemaVersion: 2, title: 'Editable checklist', summary: 'Native text with an offset reveal.', width: 1920, height: 1080, fps: 30, duration: 6, background: '#101010', assetRequests: [],
      layers: [{ id: 'heading', name: 'Checklist heading', type: 'text', start: 1, end: 6, x: 160, y: 200, width: 1600, height: 180,
        rotation: 0, opacity: 0, fill: '#FAFAFA', radius: 0, scaleX: 1, scaleY: 1, clipToBox: false, text: 'Build a reusable idea', fontFamily: 'Arial', fontSize: 80, fontWeight: 700,
        fontStyle: 'normal', textAlign: 'left', letterSpacing: 0, leading: 1.1, assetId: null, objectFit: 'contain', sourceIn: 0, evidenceIds: ['source-frame-1', 'source-frame-2'],
        keyframes: [{ time: 1, x: 160, y: 260, width: 1600, height: 180, scale: 1, rotation: 0, opacity: 0, easing: 'easeOut' },
          { time: 1.5, x: 160, y: 200, width: 1600, height: 180, scale: 1, rotation: 0, opacity: 1, easing: 'linear' }] }],
      unresolved: [], observations: ['Source-backed timing is sampled, not continuous viewing.'] },
    parameters: [{ id: 'heading', label: 'Heading', type: 'text', default: 'Build a reusable idea', minimum: null, maximum: null, bindings: [{ layerId: 'heading', field: 'text' }] },
      { id: 'ink', label: 'Text color', type: 'color', default: '#FAFAFA', minimum: null, maximum: null, bindings: [{ layerId: 'heading', field: 'fill' }] },
      { id: 'size', label: 'Type size', type: 'number', default: 80, minimum: 24, maximum: 120, bindings: [{ layerId: 'heading', field: 'fontSize' }] },
      { id: 'font', label: 'Font family', type: 'font', default: 'Arial', minimum: null, maximum: null, bindings: [{ layerId: 'heading', field: 'fontFamily' }] }],
  };
}
function changed(mutate: (value: LearnedMotion) => void) { const value = component(); mutate(value); return value; }

test('provider schema is strict and complete while learned data refuses media, code and uncontrolled bindings', () => {
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const schema = value as Record<string, unknown>;
    if (schema.type === 'object') { assert.equal(schema.additionalProperties, false); assert.deepEqual([...(schema.required as string[])].sort(), Object.keys(schema.properties as object).sort()); }
    if (typeof schema.type === 'string' || schema.anyOf || schema.$ref) assert.equal(Object.hasOwn(schema, 'default'), false);
    Object.values(schema).forEach(visit);
  };
  visit(learnedMotionJsonSchema);
  assert.ok(learnedMotionSchema.safeParse(component()).success);
  const invalid = [
    { ...component(), code: 'run()' },
    { ...component(), plan: { ...component().plan, layers: [{ ...component().plan.layers[0], type: 'video', assetId: 'reference-source' }] } },
    { ...component(), plan: { ...component().plan, assetRequests: [{ id: 'photo', kind: 'frame-crop', time: 1, rect: { x: 0, y: 0, width: .1, height: .1 }, purpose: 'No raster details in a reusable pattern.' }] } },
    changed(value => { value.plan.duration = 21; }),
    changed(value => { value.plan.layers = Array.from({ length: 65 }, (_, index) => ({ ...value.plan.layers[0], id: `label-${index}` })); }),
    changed(value => { value.parameters[0].bindings[0].layerId = 'missing-layer'; }),
    changed(value => { value.parameters[0].bindings[0].field = 'fill'; }),
    changed(value => { value.parameters[1].bindings[0] = { layerId: 'heading', field: 'x' as 'fill' }; }),
    changed(value => { value.parameters.push(structuredClone(value.parameters[0])); }),
    changed(value => { value.parameters[0].minimum = 0; }),
    changed(value => { value.parameters[2].minimum = 90; }),
    changed(value => { value.parameters[2].maximum = 10; }),
    changed(value => { value.parameters[0].default = 'A mismatched default'; }),
    changed(value => { value.parameters[1].default = 'rgb(1,2,3)'; }),
    changed(value => { value.parameters[3].default = 'url(https://invalid.example/font)'; }),
  ];
  for (const value of invalid) assert.equal(learnedMotionSchema.safeParse(value).success, false);
});

test('bindings replace literal data without mutating a template and reject unknown or incompatible values', () => {
  const source = component(), before = structuredClone(source), malicious = '</script>${globalThis.learnedWasExecuted=true}';
  const plan = instantiateLearnedMotion(source, { values: { heading: malicious, ink: '#123456', size: 96, font: 'Verdana' } });
  assert.equal(plan.layers[0].text, malicious); assert.equal(plan.layers[0].fill, '#123456'); assert.equal(plan.layers[0].fontSize, 96); assert.equal(plan.layers[0].fontFamily, 'Verdana');
  assert.deepEqual(source, before);
  const invalidValues: Record<string, string | number>[] = [{ missing: 'x' }, { heading: 123 }, { heading: '  ' }, { ink: '#FFF' }, { ink: 'javascript:run()' }, { size: 121 }, { size: NaN }, { size: '90' }, { font: 'bad;code()' }];
  for (const values of invalidValues) assert.throws(() => instantiateLearnedMotion(source, { values }));
  const inheritedName = changed(value => { value.parameters[0].id = 'constructor'; });
  assert.equal(instantiateLearnedMotion(inheritedName, { values: {} }).layers[0].text, 'Build a reusable idea');
});

test('duration retimes on canonical frames and aspect-ratio changes contain and center artwork', () => {
  const portrait = instantiateLearnedMotion(component(), { duration: 12, format: 'portrait' });
  assert.equal(portrait.width, 1080); assert.equal(portrait.height, 1920); assert.equal(portrait.duration, 12);
  assert.equal(portrait.layers[0].start, 2); assert.equal(portrait.layers[0].end, 12);
  assert.deepEqual(portrait.layers[0].keyframes.map(point => point.time), [2, 3]);
  assert.equal(portrait.layers[0].x, 90); assert.equal(portrait.layers[0].y, 768.75); assert.equal(portrait.layers[0].fontSize, 45);
  assert.equal(portrait.layers[0].keyframes[0].y, 802.5);
  assert.throws(() => instantiateLearnedMotion(component(), { duration: 1 / 30 }), /native frame|distinct native frames/);
  const closeKeys = changed(value => { value.plan.layers[0].keyframes[1].time = 1 + 1 / 30; });
  assert.throws(() => instantiateLearnedMotion(closeKeys, { duration: 1 }), /distinct native frames/);
});

test('4K shape typography placeholders stay valid when artwork is fitted to portrait', () => {
  const source = changed(value => {
    value.plan.width = 3840; value.plan.height = 2160;
    value.plan.layers.unshift({ ...structuredClone(value.plan.layers[0]), id: 'panel', name: 'Panel', type: 'rect', x: 0, y: 0, width: 3840, height: 2160,
      start: 0, end: 6, text: '', fontSize: 4, letterSpacing: 200, keyframes: [] });
  });
  const portrait = instantiateLearnedMotion(source, { format: 'portrait' });
  assert.equal(portrait.layers[0].width, 1080); assert.equal(portrait.layers[0].height, 607.5); assert.equal(portrait.layers[0].y, 656.25);
  assert.equal(portrait.layers[0].fontSize, 4); assert.equal(portrait.layers[0].letterSpacing, 200);
  assert.equal(portrait.layers[1].fontSize, 22.5);
});

test('timeline trimming removes only empty outer frames and preserves source offset, parameters and evidence', () => {
  const source = changed(value => { value.plan.duration = 9; value.plan.layers[0].start = 2; value.plan.layers[0].end = 7;
    value.plan.layers[0].keyframes = value.plan.layers[0].keyframes.map(point => ({ ...point, time: point.time + 1 })); });
  const before = structuredClone(source), { component: trimmed, offset } = trimLearnedMotionTimeline(source);
  assert.equal(offset, 2); assert.equal(trimmed.plan.duration, 5); assert.equal(trimmed.plan.layers[0].start, 0); assert.equal(trimmed.plan.layers[0].end, 5);
  assert.deepEqual(trimmed.plan.layers[0].keyframes.map(point => point.time), [0, .5]);
  assert.deepEqual(trimmed.parameters, source.parameters); assert.deepEqual(trimmed.plan.layers[0].evidenceIds, source.plan.layers[0].evidenceIds); assert.deepEqual(source, before);
  const alreadyTrimmed = trimLearnedMotionTimeline(trimmed); assert.equal(alreadyTrimmed.offset, 0); assert.deepEqual(alreadyTrimmed.component, trimmed);
  const short = changed(value => { value.plan.layers[0].end = 1.6; });
  assert.deepEqual(trimLearnedMotionTimeline(short), { component: short, offset: 0 }, 'retains the native minimum one-second component duration');
  const invisibleButPresent = changed(value => { value.plan.layers.push({ ...structuredClone(value.plan.layers[0]), id: 'retained-hold', start: 0, end: 6, opacity: 0, keyframes: [] }); });
  assert.deepEqual(trimLearnedMotionTimeline(invisibleButPresent), { component: invisibleButPresent, offset: 0 }, 'does not infer visibility from opacity or remove internal holds');
  assert.throws(() => trimLearnedMotionTimeline({ ...source, arbitraryCode: 'run()' }));
});

test('fingerprints ignore source wording, colors, IDs and source evidence while retaining motion and bindings', () => {
  const original = learnedMotionFingerprint(component());
  const wording = changed(value => {
    value.name = 'A different title'; value.description = 'A different explanation'; value.tags = ['different']; value.plan.title = 'Another graphic'; value.plan.background = '#EEEEEE';
    value.plan.summary = 'No source-specific instructions'; value.plan.observations = []; value.plan.layers[0].text = 'Completely fresh content'; value.plan.layers[0].fill = '#000000';
    value.plan.layers[0].name = 'New label'; value.plan.layers[0].evidenceIds = ['new-source-frame']; value.plan.layers[0].id = 'label';
    value.parameters.reverse(); value.parameters.forEach((parameter, index) => { parameter.id = `parameter-${index}`; parameter.label = `Parameter ${index}`; parameter.bindings[0].layerId = 'label'; if (parameter.type === 'text') parameter.default = value.plan.layers[0].text; if (parameter.type === 'color') parameter.default = '#000000'; });
  });
  assert.equal(learnedMotionFingerprint(wording), original);
  assert.notEqual(learnedMotionFingerprint(changed(value => { value.plan.layers[0].keyframes[0].y += 30; })), original);
  assert.notEqual(learnedMotionFingerprint(changed(value => { value.plan.layers[0].keyframes[0].easing = 'bouncy'; })), original);
  assert.notEqual(learnedMotionFingerprint(changed(value => { value.parameters = value.parameters.slice(0, 1); })), original);
});

test('trusted compiler mounts hostile wording as actual native text, with no media or executable additions', async () => {
  const wording = '</script>${globalThis.learnedWasExecuted=true}\u2028hello';
  const source = buildLearnedMotionModule(component(), { sceneKey: 'native-learned-test', values: { heading: wording } });
  assert.doesNotMatch(source, /<\/script>/); assert.match(source, /\\u003c/); assert.match(source, /\\u2028/);
  const runtime = await nativeModule(source), mounted = runtime.mount();
  try {
    const heading = mounted.nodes().find(node => node.props.name === 'Checklist heading'); assert.ok(heading);
    assert.equal(heading.props.fill, '#FAFAFA'); assert.ok(mounted.nodes().some(node => node.tag === '#text' && node.props.text === wording));
    assert.equal((globalThis as Record<string, unknown>).learnedWasExecuted, undefined);
    assert.equal(mounted.nodes().some(node => ['Video', 'Image', 'Audio'].includes(node.tag)), false);
    const count = mounted.created(); for (const time of [0, 5, 1.2, 3, 0, 5.9, 1.2]) mounted.setTime(time); assert.equal(mounted.created(), count);
  } finally { mounted.dispose(); }
});

test('learned mix preserves ordered clipped instances, separate identities and canonical local tracks', async () => {
  const input = { width: 1920, height: 1080, duration: 10, sceneKey: 'learned-mix-test', instances: [
    { key: 'first', component: component(), start: 0, end: 6, box: { x: 0, y: 0, width: 960, height: 540 }, values: { heading: 'First' } },
    { key: 'second', component: component(), start: 2, end: 10, box: { x: 960, y: 540, width: 960, height: 540 }, values: { heading: 'Second' } },
  ] };
  const runtime = await nativeModule(buildLearnedMotionMixModule(input)), mounted = runtime.mount();
  try {
    const first = mounted.nodes().find(node => node.props.key === 'first'), second = mounted.nodes().find(node => node.props.key === 'second'); assert.ok(first); assert.ok(second);
    assert.equal(first.props.clipToBox, true); assert.equal(second.props.clipToBox, true); assert.equal(second.props.start, '60f'); assert.equal(second.props.end, '300f');
    const keys = mounted.nodes().map(node => node.props.key).filter(Boolean); assert.equal(new Set(keys).size, keys.length);
    const fit = mounted.nodes().find(node => node.props.key === 'first-fit'); assert.ok(fit); assert.equal(fit.props.width, 1920); assert.equal(fit.props.x, -480); assert.equal(fit.props.scale, .5);
    const labels = mounted.nodes().filter(node => node.props.name === 'Checklist heading'); assert.equal(labels.length, 2);
    assert.deepEqual(labels.map(node => node.props.start), ['30f', '40f']);
    const count = mounted.created(); for (const time of [0, 9, 2, 6, 1, 8, 0]) mounted.setTime(time); assert.equal(mounted.created(), count);
  } finally { mounted.dispose(); }
  assert.throws(() => buildLearnedMotionMixModule({ ...input, instances: [input.instances[0], input.instances[0]] }), /Duplicate/);
  assert.throws(() => buildLearnedMotionMixModule({ ...input, instances: [input.instances[0], { ...input.instances[1], key: 'first-fit' }] }), /key collision/);
  assert.throws(() => buildLearnedMotionMixModule({ ...input, instances: [{ ...input.instances[0], end: 11 }] }), /lifetime/);
  assert.throws(() => buildLearnedMotionMixModule({ ...input, instances: [{ ...input.instances[0], box: { x: 1900, y: 0, width: 960, height: 540 } }] }), /box/);
});

test('learned mix constructs native backgrounds before foreground artwork in actual host creation order', async () => {
  const source = buildLearnedMotionMixModule({ width: 1920, height: 1080, duration: 6, instances: [
    { key: 'front', component: component(), start: 0, end: 6, box: { x: 0, y: 0, width: 1920, height: 1080 } },
  ] });
  // Observe the actual native Rect/Text results as they are constructed, before
  // their later insertion into the returned tree. ECS painting follows creation
  // order; a correct children array alone cannot prevent a late background cover.
  const traced = source.replace('import { Rect, Text } from "dapi-host:@diffusionstudio/jsx";', `import { Rect as NativeRect, Text as NativeText } from "dapi-host:@diffusionstudio/jsx";
const construction=globalThis.__learnedMotionConstruction=[];
const Rect=props=>{const node=NativeRect(props);construction.push(node);return node;};
const Text=props=>{const node=NativeText(props);construction.push(node);return node;};`);
  const runtime = await nativeModule(traced), mounted = runtime.mount();
  try {
    const construction = (globalThis as Record<string, unknown>).__learnedMotionConstruction as NativeNode[];
    const background = mounted.nodes().find(node => node.props.key === 'learned-mix-background'); assert.ok(background);
    const componentBackground = mounted.nodes().find(node => node.props.key === 'front-artwork-background'); assert.ok(componentBackground);
    const heading = mounted.nodes().find(node => node.props.name === 'Checklist heading'); assert.ok(heading);
    assert.equal(construction[0], background, 'scene background must be the first actual native primitive created');
    assert.ok(construction.indexOf(background) < construction.indexOf(componentBackground));
    assert.ok(construction.indexOf(componentBackground) < construction.indexOf(heading), 'component background must be created before its editable text');
  } finally { mounted.dispose(); delete (globalThis as Record<string, unknown>).__learnedMotionConstruction; }
});
