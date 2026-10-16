import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the production async render adapter, isolating only its editor/IPC
// boundaries. The protocol loop itself has a separate production-code test.
function fixture({ mountStep = async () => {}, renderStep = async () => {}, image = false } = {}) {
  const calls = { mount: 0, audit: 0, render: 0, ack: 0, mountSignal: null, renderSignal: null, config: null };
  const engine = { disposed: false, world: { projectId: 'project-1', selection: { scene: 1 }, components: { Deleted: {} },
    store: { db: Promise.resolve({ getKey: async () => 'saved' }), queue: { drain: async () => {} } } } };
  const task = { token: 'task-1', candidateId: 'candidate-1', variant: 0, previewPath: 'C:/isolated/variant-0.mp4',
    plan: { width: 3840, height: 2160, duration: 3, assetRequests: [], layers: [{ type: image ? 'image' : 'rect' }] } };
  const job = { id: 'job-1', projectId: 'project-1', state: 'awaiting-render', message: '', renderTask: task, candidates: [] };
  const dependencies = {
    bitecs: { getAllEntities: () => [1], hasComponent: () => false },
    '@/lib/ipc': { mainBridge: { call: async () => { calls.ack++; return { added: ['learned-pattern'] }; } } },
    '@desktop/main-channels': { MAIN_CHANNELS: { REFERENCE_LEARN_RENDERED: 'rendered' } },
    '@/context/editor-api/mount': { handleMount: (_engine, signal) => async () => { calls.mount++; calls.mountSignal = signal; await mountStep(engine, signal); } },
    '@/context/editor-api/node': { handleNodeRender: (_engine, signal) => async request => { calls.render++; calls.renderSignal = signal; calls.config = request.config; await renderStep(engine, signal); signal.throwIfAborted(); } },
    '@/context/render': { renderOverlay: () => false },
    '@/components/engine/font': { WebFonts: { Inter: {} } },
    '@diffusionstudio/editing-playbook/reference-reconstruction': { reconstructionPlanSchema: { parse: value => value }, buildReconstructionModule: () => 'TRUSTED' },
    './reference-native-audit': { auditReconstructionWorld: () => { calls.audit++; } },
    './reference-learn-flow': { driveMotionLearning: async options => { options.assertCurrent(); const scene = await options.render(job); return options.rendered(job.id, scene, task.token); } },
  };
  const source = readFileSync(new URL('../src/components/sidebar-left/reference-learn-run.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console, setTimeout, window: { desktop: { getPathForFile: () => 'C:/isolated/reference.mkv' } },
    require: name => { if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`); return dependencies[name]; } });
  return { calls, engine, run: signal => module.exports.learnReferenceMotions(engine, {}, 1, () => {}, signal) };
}

test('native learning forwards cancellation to mount and renderer and keeps the full source canvas', async () => {
  const controller = new AbortController(), f = fixture();
  await f.run(controller.signal);
  assert.equal(f.calls.mountSignal, controller.signal); assert.equal(f.calls.renderSignal, controller.signal);
  assert.equal(f.calls.config.video.resolution, 2160, '4K plans must not silently export at a 1920-pixel height');
  assert.equal(f.calls.config.audio.enabled, false); assert.equal(f.calls.audit, 1); assert.equal(f.calls.ack, 1);
});

test('cancel after the native mount prevents audit, render and host acknowledgment', async () => {
  const controller = new AbortController(), f = fixture({ mountStep: async () => controller.abort() });
  await assert.rejects(f.run(controller.signal), /abort/i);
  assert.equal(f.calls.mount, 1); assert.equal(f.calls.audit, 0); assert.equal(f.calls.render, 0); assert.equal(f.calls.ack, 0);
});

test('a disposed or changed project cannot continue from mount to export', async () => {
  for (const mutate of [engine => { engine.disposed = true; }, engine => { engine.world.projectId = 'other-project'; }]) {
    const f = fixture({ mountStep: async engine => mutate(engine) });
    await assert.rejects(f.run(new AbortController().signal), /changed or closed/i);
    assert.equal(f.calls.render, 0); assert.equal(f.calls.ack, 0);
  }
});

test('cancel during export never acknowledges an incomplete preview', async () => {
  const controller = new AbortController(), f = fixture({ renderStep: async () => controller.abort() });
  await assert.rejects(f.run(controller.signal), /abort/i);
  assert.equal(f.calls.render, 1); assert.equal(f.calls.ack, 0);
});

test('source imagery cannot be silently installed as a reusable native component', async () => {
  const f = fixture({ image: true });
  await assert.rejects(f.run(new AbortController().signal), /native graphics and text only/i);
  assert.equal(f.calls.mount, 0); assert.equal(f.calls.render, 0); assert.equal(f.calls.ack, 0);
});
