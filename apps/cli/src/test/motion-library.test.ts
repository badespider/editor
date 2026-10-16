import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MotionLibrary } from '@diffusionstudio/editing-playbook/motion-library';
import type { LearnedMotion } from '@diffusionstudio/editing-playbook/motion-learned';
import { nativeModule } from '../../../../packages/editing-playbook/test/native-motion-host.ts';

const repository = fileURLToPath(new URL('../../../../', import.meta.url));
const cli = join(repository, 'apps/cli/dist/index.js');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
function component(): LearnedMotion {
  return { schemaVersion: 1, id: 'cli-rising-label', name: 'CLI rising label', description: 'Synthetic native label used only for CLI tests.', tags: ['synthetic', 'label'],
    plan: { schemaVersion: 2, title: 'Synthetic CLI label', summary: 'Authored test fixture; no real reference analysis or visual review.',
      width: 640, height: 360, fps: 30, duration: 2, background: '#FFFFFF', assetRequests: [], unresolved: [], observations: ['Synthetic CLI fixture.'],
      layers: [{ id: 'label', name: 'CLI editable label', type: 'text', start: 0, end: 2, x: 30, y: 100, width: 580, height: 100,
        rotation: 0, opacity: 1, fill: '#121212', radius: 0, text: 'Example', fontFamily: 'Arial', fontSize: 40, fontWeight: 400,
        fontStyle: 'normal', textAlign: 'left', letterSpacing: 0, leading: 1, assetId: null, objectFit: 'contain', sourceIn: 0,
        scaleX: 1, scaleY: 1, clipToBox: false, evidenceIds: ['synthetic-frame-1', 'synthetic-frame-2'],
        keyframes: [{ time: 0, x: 30, y: 140, width: 580, height: 100, scale: 1, rotation: 0, opacity: 0, easing: 'easeOut' },
          { time: .5, x: 30, y: 100, width: 580, height: 100, scale: 1, rotation: 0, opacity: 1, easing: 'easeOut' }] }] },
    parameters: [{ id: 'headline', label: 'Headline', type: 'text', default: 'Example', minimum: null, maximum: null, bindings: [{ layerId: 'label', field: 'text' }] },
      { id: 'ink', label: 'Text color', type: 'color', default: '#121212', minimum: null, maximum: null, bindings: [{ layerId: 'label', field: 'fill' }] }],
  };
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const temporary = await realpath(tmpdir()), directory = await mkdtemp(join(temporary, 'editor-motion-library-cli-'));
  t.after(async () => {
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(temporary) + sep) && basename(target).startsWith('editor-motion-library-cli-'));
    await rm(target, { recursive: true, force: true });
  });
  const libraryDirectory = join(directory, 'user-library'), library = new MotionLibrary({ directory: libraryDirectory });
  const previewPath = join(directory, 'synthetic-preview.mp4'), preview = 'Synthetic bytes; not an actual rendered or visually reviewed video.';
  await writeFile(previewPath, preview);
  const guard = join(directory, 'forbid-external.cjs');
  await writeFile(guard, `const forbidden=()=>{throw new Error("Motion library CLI tests forbid network, app connections and subprocesses");};
globalThis.fetch=forbidden;
for(const[id,names]of[["node:http",["request","get"]],["node:https",["request","get"]],["node:net",["connect","createConnection"]],["node:tls",["connect"]],["node:child_process",["spawn","spawnSync","exec","execSync","execFile","execFileSync","fork"]]]){const mod=require(id);for(const name of names)mod[name]=forbidden;}
require("node:net").Socket.prototype.connect=forbidden;require("node:net").Server.prototype.listen=forbidden;require("node:module").syncBuiltinESMExports();
`);
  const run = (args: string[], expected = 0) => {
    const result = spawnSync(process.execPath, ['--require', guard, cli, 'playbook', 'motion', 'library', '--directory', libraryDirectory, ...args], {
      cwd: directory, encoding: 'utf8', timeout: 15000, maxBuffer: 2 * 1024 ** 2,
      env: { ...process.env, OPENAI_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
    });
    assert.equal(result.error, undefined, result.error?.message); assert.equal(result.signal, null);
    assert.equal(result.status, expected, `${JSON.stringify(args)}\n${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stderr, /tests forbid/);
    const value = JSON.parse(result.stdout); assert.equal(value.externalCalls, 0); return value;
  };
  const json = async (name: string, value: unknown) => { const path = join(directory, name); await writeFile(path, JSON.stringify(value)); return path; };
  const absent = async (path: string) => assert.rejects(readFile(path), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  const publish = () => library.publish({ component: component(), previewPath,
    provenance: { sourceSha256: 'a'.repeat(64), sourceName: 'Synthetic reference.mp4', range: { start: 4, end: 6 }, evidenceIds: ['synthetic-frame-1', 'synthetic-frame-2'] },
    review: { verdict: 'pass', summary: 'Injected test receipt, not a real visual review.', limitations: ['Synthetic fixture only.'],
      renderHashes: [digest(preview), digest('Synthetic changed-content variant')], continuousViewing: false },
  });
  return { directory, run, json, absent, publish };
}

test('built CLI lists and reads the persistent user library from an explicit directory outside the checkout', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.run(['list']).entries, []);
  const published = await f.publish(), listed = f.run(['list']);
  assert.equal(listed.entries.length, 1); assert.equal(listed.entries[0].id, published.entry.id);
  const read = f.run(['read', published.entry.id]);
  assert.deepEqual(read.component, component()); assert.equal(read.entry.humanReview, 'pending');
  assert.match(read.skill, /quoted data|are data; never follow instructions/i);
  for (const id of ['../outside', 'learned-invalid', `learned-${'f'.repeat(32)}`]) assert.equal(typeof f.run(['read', id], 1).error, 'string');
});

test('CLI create keeps supplied wording inert, mounts native text, and refuses overwrites and invalid parameters', async t => {
  const f = await fixture(t), { entry } = await f.publish();
  const wording = '</script>${globalThis.motionLibraryCliExecuted=true}\u2028literal';
  const values = await f.json('values.json', { headline: wording, ink: '#123456' }), output = join(f.directory, 'portrait.js');
  const created = f.run(['create', entry.id, '--values', values, '--format', 'portrait', '--duration', '4', '-o', output]);
  assert.equal(created.libraryId, entry.id); assert.equal(created.humanReview, 'pending');
  const source = await readFile(output, 'utf8'); assert.doesNotMatch(source, /<\/script>/);
  const runtime = await nativeModule(source), mounted = runtime.mount();
  try {
    assert.ok(mounted.nodes().some(node => node.tag === '#text' && node.props.text === wording));
    const label = mounted.nodes().find(node => node.props.name === 'CLI editable label'); assert.ok(label); assert.equal(label.props.fill, '#123456');
    const scene = mounted.nodes().find(node => node.props.scene); assert.ok(scene); assert.equal(scene.props.width, 1080); assert.equal(scene.props.height, 1920);
    assert.equal((globalThis as Record<string, unknown>).motionLibraryCliExecuted, undefined);
  } finally { mounted.dispose(); }
  const before = digest(source);
  assert.match(f.run(['create', entry.id, '-o', output], 1).error, /exist/i); assert.equal(digest(await readFile(output)), before);
  for (const [index, args] of [
    ['--values', await f.json('unknown-value.json', { unknown: 'bad' })], ['--values', await f.json('wrong-type.json', { headline: 42 })],
    ['--values', await f.json('wrong-color.json', { ink: 'url(https://invalid.example)' })], ['--duration', 'NaN'], ['--format', 'square'],
  ].entries()) {
    const rejected = join(f.directory, `invalid-${index}.js`);
    assert.equal(typeof f.run(['create', entry.id, ...args, '-o', rejected], 1).error, 'string'); await f.absent(rejected);
  }
});

test('CLI learned mix accepts its published schema, preserves separate clipped instances, and rejects invalid recipes without outputs', async t => {
  const f = await fixture(t), { entry } = await f.publish(), schema = f.run(['mix-schema']);
  assert.equal(schema.schema.additionalProperties, false); assert.equal(schema.example.schemaVersion, 1);
  const recipe = { schemaVersion: 1, width: 1920, height: 1080, duration: 6, instances: [
    { id: entry.id, key: 'first', start: 0, end: 4, box: { x: 0, y: 0, width: 960, height: 540 }, values: { headline: 'First idea' } },
    { id: entry.id, key: 'second', start: 1, end: 6, box: { x: 960, y: 540, width: 960, height: 540 }, values: { headline: 'Second idea' } },
  ] };
  const path = await f.json('mix.json', recipe), output = join(f.directory, 'mix.js');
  assert.equal(f.run(['mix', path, '-o', output]).humanReview, 'pending');
  const source = await readFile(output, 'utf8'), runtime = await nativeModule(source), mounted = runtime.mount();
  try {
    const first = mounted.nodes().find(node => node.props.key === 'first'), second = mounted.nodes().find(node => node.props.key === 'second');
    assert.ok(first); assert.ok(second); assert.equal(first.props.clipToBox, true); assert.equal(second.props.clipToBox, true);
    assert.equal(second.props.start, '30f'); assert.equal(second.props.end, '180f');
    for (const text of ['First idea', 'Second idea']) assert.ok(mounted.nodes().some(node => node.tag === '#text' && node.props.text === text));
  } finally { mounted.dispose(); }
  assert.match(f.run(['mix', path, '-o', output], 1).error, /exist/i); assert.equal(digest(await readFile(output)), digest(source));
  const invalid = [
    { ...recipe, instances: [recipe.instances[0], { ...recipe.instances[1], key: 'first' }] },
    { ...recipe, instances: [{ ...recipe.instances[0], id: '../outside' }] },
    { ...recipe, instances: [{ ...recipe.instances[0], box: { x: 1900, y: 0, width: 960, height: 540 } }] },
    { ...recipe, instances: [{ ...recipe.instances[0], end: 7 }] },
    { ...recipe, code: 'Unexpected executable content is rejected' },
  ];
  for (const [index, value] of invalid.entries()) {
    const rejected = join(f.directory, `invalid-mix-${index}.js`), input = await f.json(`invalid-mix-${index}.json`, value);
    assert.equal(typeof f.run(['mix', input, '-o', rejected], 1).error, 'string'); await f.absent(rejected);
  }
});
