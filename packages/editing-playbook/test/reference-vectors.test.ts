import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReconstructionModule, reconstructionJsonSchema, reconstructionPlanSchema } from '../src/reference-reconstruction.ts';
import type { ReconstructionPlan } from '../src/reference-reconstruction.ts';
import { buildLearnedMotionMixModule, buildLearnedMotionModule, instantiateLearnedMotion, learnedMotionFingerprint, learnedMotionSchema } from '../src/motion-learned.ts';
import type { LearnedMotion } from '../src/motion-learned.ts';
import { nativeModule } from './native-motion-host.ts';

type Layer = ReconstructionPlan['layers'][number];
const commands: NonNullable<Layer['pathCommands']> = [{ op: 'M', x: 0, y: 20 }, { op: 'Q', cx: 10, cy: 0, x: 20, y: 20 },
  { op: 'C', c1x: 25, c1y: 25, c2x: 40, c2y: 30, x: 40, y: 50 }, { op: 'L', x: 0, y: 50 }, { op: 'Z' }];
const layer = (value: Partial<Layer>): Layer => ({ id: 'figure', name: 'Figure', type: 'group', start: 2, end: 6, x: 300, y: 200,
  width: 100, height: 100, rotation: 0, opacity: 1, fill: '#FFFFFF', radius: 0, text: '', fontFamily: 'Arial', fontSize: 4,
  fontWeight: 400, fontStyle: 'normal', textAlign: 'left', letterSpacing: 0, leading: 1, assetId: null, objectFit: 'fill', sourceIn: 0,
  keyframes: [], evidenceIds: ['source-1'], ...value });
const plan = (): ReconstructionPlan => ({ schemaVersion: 2, title: 'Articulated exchange fixture', summary: 'Local vector parts and parent pivots.',
  width: 1920, height: 1080, fps: 30, duration: 6, background: '#F0F0F0', assetRequests: [], unresolved: [], observations: [],
  // A parent can appear later in the flat data. Actual native hierarchy is explicit.
  layers: [layer({ id: 'hand', name: 'Editable hand', type: 'path', parentId: 'shoulder', start: 3, x: 8, y: 12, width: 60, height: 60,
    pathCommands: commands, fillEnabled: false, strokeColor: '#123456', strokeWidth: 3, strokeCap: 'round', strokeJoin: 'bevel' }),
  layer({ id: 'shoulder', name: 'Shoulder pivot', parentId: 'figure', start: 2.5, x: 20, y: 40, width: 80, height: 80, anchorX: 0, anchorY: 0,
    keyframes: [{ time: 2.5, x: 20, y: 40, width: 80, height: 80, scale: 1, rotation: 0, opacity: 1, easing: 'easeInOut' },
      { time: 4, x: 20, y: 40, width: 80, height: 80, scale: 1, rotation: -60, opacity: 1, easing: 'linear' }] }),
  layer({}), layer({ id: 'label', name: 'Label', type: 'text', text: 'TRADE', x: 600, y: 200, width: 500, height: 100, fontSize: 60 })] });
const component = (): LearnedMotion => ({ schemaVersion: 1, id: 'vector-exchange', name: 'Vector exchange', description: 'Named vector parts move around a reusable shoulder pivot.', tags: ['vectors', 'exchange'],
  plan: learnedMotionSchema.shape.plan.parse(plan()), parameters: [{ id: 'label', label: 'Label', type: 'text', default: 'TRADE', minimum: null, maximum: null, bindings: [{ layerId: 'label', field: 'text' }] },
    { id: 'outline', label: 'Outline', type: 'color', default: '#123456', minimum: null, maximum: null, bindings: [{ layerId: 'hand', field: 'strokeColor' }] },
    { id: 'weight', label: 'Outline width', type: 'number', default: 3, minimum: 1, maximum: 8, bindings: [{ layerId: 'hand', field: 'strokeWidth' }] }] });

test('bounded vector data refuses markup, unknown fields, malformed paths, cycles, excessive depth and animated path dimensions', () => {
  assert.ok(reconstructionPlanSchema.safeParse(plan()).success);
  const invalid = (change: (value: ReconstructionPlan) => void) => { const value = plan(); change(value); assert.equal(reconstructionPlanSchema.safeParse(value).success, false); };
  invalid(value => { value.layers[0].pathCommands = '<svg onload="run()"/>' as unknown as typeof commands; });
  invalid(value => { value.layers[0].pathCommands = [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 1, y: 1, script: 'run()' }] as typeof commands; });
  invalid(value => { value.layers[0].pathCommands = [{ op: 'L', x: 1, y: 1 }]; });
  invalid(value => { value.layers[0].pathCommands = [{ op: 'M', x: 0, y: 0 }, { op: 'Z' }]; });
  invalid(value => { value.layers[0].pathCommands = [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: Infinity, y: 1 }]; });
  invalid(value => { value.layers[0].pathCommands = [{ op: 'M', x: 0, y: 0 }, { op: 'L', x: 121, y: 1 }]; });
  invalid(value => { value.layers[0].pathCommands = [commands[0], ...Array.from({ length: 512 }, () => commands[1])]; });
  invalid(value => { value.layers[0].parentId = 'absent'; });
  invalid(value => { value.layers[0].parentId = 'label'; });
  invalid(value => { value.layers[2].parentId = 'shoulder'; });
  invalid(value => { value.layers[0].start = 2; });
  invalid(value => { value.layers[1].anchorX = -1; });
  invalid(value => { value.layers[0].keyframes = [{ time: 3, x: 8, y: 12, width: 61, height: 60, scale: 1, rotation: 0, opacity: 1, easing: 'linear' }]; });
  invalid(value => { value.layers[0].strokeWidth = 0; });
  invalid(value => { value.layers[1].pathCommands = commands; });
  invalid(value => { value.layers = Array.from({ length: 10 }, (_, i) => layer({ id: `group-${i}`, parentId: i ? `group-${i - 1}` : null })); });
  invalid(value => { value.layers = Array.from({ length: 17 }, (_, i) => layer({ id: `part-${i}`, type: 'path', pathCommands: [commands[0], ...Array.from({ length: 511 }, () => commands[1])] })); });
  const provider = reconstructionJsonSchema as unknown as { properties: { layers: { items: { required: string[] } } } };
  for (const field of ['parentId', 'anchorX', 'anchorY', 'pathCommands', 'fillEnabled', 'strokeColor', 'strokeWidth', 'strokeCap', 'strokeJoin']) assert.ok(provider.properties.layers.items.required.includes(field));
});

test('trusted native compiler retains real nested groups, literal vector commands and exactly one parent-clock conversion', async () => {
  const runtime = await nativeModule(buildReconstructionModule(plan(), { sceneKey: 'vector-groups', bindings: [], audio: null })), mounted = runtime.mount();
  try {
    const node = (name: string) => { const result = mounted.nodes().find(node => node.props.name === name); assert.ok(result); return result; };
    const figure = node('Figure'), shoulder = node('Shoulder pivot'), hand = node('Editable hand');
    assert.equal(figure.tag, 'Group'); assert.equal(shoulder.tag, 'Group'); assert.equal(hand.tag, 'Path');
    assert.equal(shoulder.parent, figure); assert.equal(hand.parent, shoulder);
    assert.equal(figure.props.start, '60f'); assert.equal(shoulder.props.start, '15f'); assert.equal(hand.props.start, '15f');
    assert.equal(shoulder.props.end, '120f'); assert.equal(hand.props.end, '105f');
    assert.deepEqual(shoulder.props.rotation, [{ time: '0f', value: 0, easing: 'easeInOut' }, { time: '45f', value: -60, easing: 'linear' }]);
    assert.equal(shoulder.props.anchorX, 0); assert.equal(shoulder.props.anchorY, 0);
    assert.deepEqual(hand.props.commands, commands); assert.equal(hand.props.strokeColor, '#123456'); assert.equal(hand.props.strokeWidth, 3);
    assert.equal(hand.props.fillEnabled, false); assert.equal(hand.props.strokeCap, 'round'); assert.equal(hand.props.strokeJoin, 'bevel');
    assert.equal(mounted.nodes().some(node => ['HtmlPaint', 'Surface', 'Video', 'Image'].includes(node.tag)), false);
    const count = mounted.created(), before = JSON.stringify(mounted.nodes().map(node => node.props));
    for (const time of [0, 5.9, 3, 4, 2, 0, 4]) mounted.setTime(time);
    assert.equal(mounted.created(), count); assert.equal(JSON.stringify(mounted.nodes().map(node => node.props)), before);
  } finally { mounted.dispose(); }
});

test('learned vector parameters and portrait fitting scale local paths once and center only root groups', () => {
  assert.ok(learnedMotionSchema.safeParse(component()).success);
  const fitted = instantiateLearnedMotion(component(), { format: 'portrait', duration: 12, values: { outline: '#ABCDEF', weight: 6, label: 'SELL' } });
  const hand = fitted.layers[0], shoulder = fitted.layers[1], figure = fitted.layers[2];
  assert.equal(hand.x, 4.5); assert.equal(hand.y, 6.75); assert.equal(shoulder.y, 22.5);
  assert.equal(figure.x, 168.75); assert.equal(figure.y, 768.75);
  assert.equal(hand.strokeWidth, 3.375); assert.equal(hand.strokeColor, '#ABCDEF'); assert.equal(hand.start, 6);
  assert.deepEqual(hand.pathCommands?.[1], { op: 'Q', cx: 5.625, cy: 0, x: 11.25, y: 11.25 });
  assert.equal(shoulder.anchorX, 0); assert.equal(fitted.layers[3].text, 'SELL');
  const bad = component(); bad.parameters[1].bindings[0].layerId = 'figure'; assert.equal(learnedMotionSchema.safeParse(bad).success, false);
});

test('vector fingerprints retain editable shape and hierarchy but ignore renamed IDs, content, palette and evidence', () => {
  const before = learnedMotionFingerprint(component()), changed = component();
  changed.plan.layers[0].id = 'palm'; changed.plan.layers[0].strokeColor = '#ABCDEF'; changed.plan.layers[0].evidenceIds = ['source-2'];
  changed.parameters[1].default = '#ABCDEF'; changed.parameters[1].bindings[0].layerId = 'palm'; changed.parameters[2].bindings[0].layerId = 'palm';
  assert.equal(learnedMotionFingerprint(changed), before); assert.equal(JSON.parse(before).version, 2);
  changed.plan.layers[0].pathCommands![1] = { op: 'Q', cx: 15, cy: 0, x: 20, y: 20 };
  assert.notEqual(learnedMotionFingerprint(changed), before);
  const reparented = component(); reparented.plan.layers[0].parentId = 'figure'; assert.notEqual(learnedMotionFingerprint(reparented), before);
});

test('reusable native modules and mixed instances preserve editable paths and independent nested identities', async () => {
  for (const source of [buildLearnedMotionModule(component()), buildLearnedMotionMixModule({ width: 1920, height: 1080, duration: 6, instances: [
    { key: 'first', component: component(), start: 0, end: 6, box: { x: 0, y: 0, width: 960, height: 1080 } },
    { key: 'second', component: component(), start: 0, end: 6, box: { x: 960, y: 0, width: 960, height: 1080 }, values: { outline: '#ABCDEF' } },
  ] })]) {
    const runtime = await nativeModule(source), mounted = runtime.mount();
    try {
      const paths = mounted.nodes().filter(node => node.tag === 'Path'); assert.equal(paths.length, source.includes('learnedMotionMixManifest') ? 2 : 1);
      assert.ok(paths.every(path => path.parent?.tag === 'Group' && path.parent.parent?.tag === 'Group'));
      assert.equal(new Set(mounted.nodes().map(node => node.props.key).filter(Boolean)).size, mounted.nodes().filter(node => node.props.key).length);
      if (paths.length === 2) assert.deepEqual(paths.map(path => path.props.strokeColor), ['#123456', '#ABCDEF']);
    } finally { mounted.dispose(); }
  }
});
