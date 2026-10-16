import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production modules with explicit browser/IDB boundary doubles.
// Keeping their actual async code catches lifecycle ordering regressions.
function load(relative, dependencies, globals = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'false');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, ...globals, require: name => {
    if (!(name in dependencies)) throw new Error(`Unexpected test dependency: ${name}`);
    return dependencies[name];
  } }, { filename: relative });
  return module.exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = () => new Promise(resolve => setImmediate(resolve));

function engineFixture({ restore = async () => {}, realize = async () => {} } = {}) {
  const calls = { frames: 0, cancel: 0, mountsDisposed: 0, keyboardDisposed: 0, cameraDisposed: 0, realized: 0 };
  const world = { canvas: null, components: {}, liveMounts: { disposeAll: () => calls.mountsDisposed++ } };
  class Canvas { getContext() { return {}; } parentElement = { getBoundingClientRect: () => ({ width: 320, height: 180 }) }; }
  const factory = load('../src/components/engine/api/engine.ts', {
    '../components': { ChildOf: () => {} }, bitecs: { Not: () => {}, query: () => [] },
    '../api': { createEngineWorld: () => world, restoreWorld: restore, switchActiveScene: () => {} },
    '../systems/transform': {}, '../systems/render': {}, '../systems/playback': {}, '../systems/motion': {}, '../systems/dom': {},
    '../systems/input-system': {}, '../systems/hud': {},
    '../systems': { createCameraController: () => ({ init() {}, dispose: () => calls.cameraDisposed++ }) },
    '../systems/keyboard': { createKeyboardSystem: () => ({ init() {}, dispose: () => calls.keyboardDisposed++ }) },
    '@/utils/mount': { realizeMounts: async (...args) => { calls.realized++; return realize(...args); } },
    'solid-js': { createSignal: initial => { let value = initial; return [() => value, next => { value = next; }]; } },
  }, { AudioContext: class {}, HTMLCanvasElement: Canvas, window: { devicePixelRatio: 1 },
    requestAnimationFrame: () => ++calls.frames, cancelAnimationFrame: () => calls.cancel++ });
  return { engine: factory.createEngine('project-a'), calls, canvas: new Canvas() };
}

test('disposing an engine prevents a delayed export finally block from restarting its RAF loop', () => {
  const { engine, calls } = engineFixture();
  engine.start(); assert.equal(engine.running, true); assert.equal(calls.frames, 1);
  engine.dispose(); engine.start(); engine.dispose();
  assert.equal(engine.disposed, true); assert.equal(engine.running, false); assert.equal(calls.frames, 1);
  assert.equal(calls.mountsDisposed, 1); assert.equal(calls.keyboardDisposed, 1); assert.equal(calls.cameraDisposed, 1);
});

test('project disposal during async engine initialization prevents late mounting and cleans late realized graphs', async () => {
  const restore = deferred(), first = engineFixture({ restore: () => restore.promise });
  const initializing = first.engine.init(first.canvas); first.engine.dispose(); restore.resolve(); await initializing;
  assert.equal(first.calls.realized, 0); assert.equal(first.calls.frames, 0); assert.equal(first.engine.initialized(), false);
  const realize = deferred(), second = engineFixture({ realize: () => realize.promise });
  const late = second.engine.init(second.canvas); await settle(); second.engine.dispose(); realize.resolve(); await late;
  assert.equal(second.calls.mountsDisposed, 2); assert.equal(second.calls.frames, 0); assert.equal(second.engine.initialized(), false);
});

function mountFixture(stage) {
  const waiting = deferred(), calls = { assets: 0, rendered: 0, disposed: 0, registered: 0, switched: 0, transactions: 0 };
  const world = { components: { Scene: {} }, history: { startTransaction: () => calls.transactions++, commitTransaction() {}, rollbackTransaction() {} },
    liveMounts: { supersede() {}, register: () => calls.registered++ } };
  const engine = { world, disposed: false, camera: { fitToActiveScene() {} } };
  class WorldDocument { rootEid = 1; async commit() { if (stage === 'commit') await waiting.promise; } }
  const module = load('../src/context/editor-api/mount.ts', {
    '@diffusionstudio/jsx': { renderProject: () => { calls.rendered++; return () => calls.disposed++; } }, nanoid: { nanoid: () => 'mount-fixture' },
    '@/components/engine': { switchActiveScene: () => calls.switched++ },
    '@/components/engine/api/assets': { createScriptAsset: async () => { calls.assets++; if (stage === 'asset') await waiting.promise; return { id: 'script-fixture' }; } },
    '@/utils/jsx': { WorldDocument, importProjectModule: async () => { if (stage === 'import') await waiting.promise; return { default: () => {} }; } },
    '@/utils/mount': { documentRootKeys: () => ['scene-fixture'] }, '@/utils': { assert: (condition, message) => { if (!condition) throw new Error(message); } },
    './node': {}, bitecs: { hasComponent: () => true },
  });
  return { ...module, waiting, calls, engine };
}

for (const stage of ['import', 'asset', 'commit']) test(`aborting during mount ${stage} cannot register a graph after project cleanup`, async () => {
  const fixture = mountFixture(stage), controller = new AbortController();
  const mounting = fixture.handleMount(() => fixture.engine, controller.signal)({ code: 'host-generated fixture' });
  await settle(); controller.abort(new Error('project changed')); fixture.engine.disposed = true; fixture.waiting.resolve();
  await assert.rejects(mounting, /project changed/);
  assert.equal(fixture.calls.registered, 0); assert.equal(fixture.calls.switched, 0);
  assert.equal(fixture.calls.rendered, stage === 'commit' ? 1 : 0);
  assert.equal(fixture.calls.disposed, stage === 'commit' ? 1 : 0);
});

test('a completed mount remains live when its former request signal later aborts', async () => {
  const fixture = mountFixture('complete'), controller = new AbortController();
  await fixture.handleMount(() => fixture.engine, controller.signal)({ code: 'host-generated fixture' }); controller.abort();
  assert.equal(fixture.calls.registered, 1); assert.equal(fixture.calls.disposed, 0); assert.equal(fixture.calls.switched, 1);
});

function queueFixture() {
  const transactions = [], records = new Map(), idle = [], errors = [];
  const database = { transaction: () => {
    const completed = deferred(), changes = [];
    const done = completed.promise.then(() => { for (const [key, value] of changes) value === undefined ? records.delete(key) : records.set(key, value); });
    const transaction = { completed, done, objectStore: () => ({ put: value => { changes.push([value.id, value]); return Promise.resolve(value.id); }, delete: key => { changes.push([key, undefined]); return Promise.resolve(); } }) };
    transactions.push(transaction); return transaction;
  } };
  const { WriteQueue } = load('../src/components/engine/db/project-db.ts', { idb: {}, '../api': { serializeEntity: (world, eid) => ({ id: String(eid), value: world.value }) }, './migrations': {} },
    { requestIdleCallback: callback => idle.push(callback), console: { error: (...args) => errors.push(args) } });
  return { queue: new WriteQueue(Promise.resolve(database)), transactions, records, errors };
}

test('save drain awaits an active IDB transaction and a newer entity value queued during it', async () => {
  const fixture = queueFixture(), world = { value: 'first' };
  fixture.queue.scheduleWrite(world, 1); const idleWrite = fixture.queue.flush(); await settle();
  let finished = false; const saving = fixture.queue.drain().then(() => { finished = true; });
  world.value = 'latest'; fixture.queue.scheduleWrite(world, 1);
  fixture.transactions[0].completed.resolve(); await settle();
  assert.equal(finished, false); assert.equal(fixture.transactions.length, 2); assert.equal(fixture.records.get('1').value, 'first');
  fixture.transactions[1].completed.resolve(); await saving; await idleWrite;
  assert.equal(fixture.records.get('1').value, 'latest');
});

test('save drain includes deletions queued during an active transaction', async () => {
  const fixture = queueFixture(); fixture.queue.scheduleWrite({ value: 'old' }, 1);
  const writing = fixture.queue.flush(); await settle(); const saving = fixture.queue.drain(); fixture.queue.scheduleDelete({}, 1);
  fixture.transactions[0].completed.resolve(); await settle(); assert.equal(fixture.transactions.length, 2);
  fixture.transactions[1].completed.resolve(); await saving; await writing; assert.equal(fixture.records.has('1'), false);
});

test('a background transaction failure cannot later be reported as a successful save', async () => {
  const fixture = queueFixture(); fixture.queue.scheduleWrite({ value: 'unsaved' }, 1);
  const writing = fixture.queue.flush(); await settle(); fixture.transactions[0].completed.reject(new Error('quota fixture'));
  await writing; assert.equal(fixture.errors.length, 1); await assert.rejects(fixture.queue.drain(), /quota fixture/);
});
