import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import test from 'node:test';
import { ReferenceRecreationService, recreationComparisonTimes, recreationVisualManifest, quantizedRecreationDuration, replaceRecreationJobFile, recreationModelBudget } from '../src/reference-recreation.ts';
import type { RecreationJob, RecreationStart } from '../src/reference-recreation.ts';
import type { ReferenceCodexRequest, ReferenceCodexRunner } from '../src/reference-codex.ts';
import type { ReconstructionPlan } from '../src/reference-reconstruction.ts';
import type { RecreationSamplingResult } from '../src/reference-sampling.ts';
import type { ReferenceComparison } from '../src/reference-evidence.ts';
import type { ReferencePreparedAsset } from '../src/reference-assets.ts';
import { referenceAssetCropPixels } from '../src/reference-assets.ts';
import { fingerprint } from '../src/preview.ts';

const plan = (x = 5, fields: Partial<ReconstructionPlan> = {}): ReconstructionPlan => ({
  schemaVersion: 2, title: 'Synthetic reconstruction', summary: 'A unit-test-authored native label, not real model analysis.',
  width: 100, height: 80, fps: 30, duration: 1, background: '#10141c', assetRequests: [], unresolved: ['No visual match was tested.'], observations: ['Synthetic fixture.'],
  layers: [{ id: 'label', name: 'Literal fixture', type: 'text', start: 0, end: 1, x, y: 5, width: 80, height: 30,
    rotation: 0, opacity: 1, fill: '#ffffff', radius: 0, text: 'Fixture', fontFamily: 'Arial', fontSize: 20, fontWeight: 400,
    fontStyle: 'normal', textAlign: 'left', letterSpacing: 0, leading: 1, assetId: null, objectFit: 'contain', sourceIn: 0,
    keyframes: [], evidenceIds: ['frame-0'] }], ...fields,
});
const critique = (value = plan(), verdict: 'revise' | 'best-effort' | 'unsupported' = 'best-effort') => ({
  verdict, plan: value, differences: [{ layerId: 'label', axis: 'geometry', observed: 'Synthetic position difference.', target: 'Keep the exact authored test target.' }],
});

async function waitFor(service: ReferenceRecreationService, id: string, predicate: (job: RecreationJob) => boolean) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { const job = await service.status(id); if (predicate(job)) return job; await pause(5); }
  throw new Error('Synthetic reconstruction did not reach its expected state.');
}
async function idle(directory: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { await stat(join(directory, '.active.lock')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') { await pause(5); return; } throw error; }
    await pause(5);
  }
  throw new Error('Synthetic reconstruction worker did not release its lock.');
}

async function fixture(t: { after(fn: () => Promise<void>): void }, options: {
  outputs?: unknown[]; run?: (request: ReferenceCodexRequest, index: number) => Promise<unknown>;
  inspect?: (signal?: AbortSignal) => Promise<void>; available?: boolean; transientSave?: boolean;
  long?: boolean; unattachedFrame?: boolean; renderMetadata?: { width?: number; height?: number; duration?: number; hasAudio?: boolean };
  range?: { start: number; end: number }; sourceDuration?: number;
  canvas?: { width: number; height: number }; canvasFailure?: string;
  assetDecodedTime?: number; frameTimes?: number[];
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'reference-recreation-test-')), jobs = join(directory, 'jobs');
  const sourcePath = join(directory, 'synthetic.mp4'), image = join(directory, 'synthetic.png');
  const header = Buffer.alloc(512); header.write('ftyp', 4); header.write('unit-test-only', 20);
  await writeFile(sourcePath, header); await writeFile(image, 'Synthetic image; the injected runner does not decode or upload it.');
  const sourceHash = await fingerprint(sourcePath), info = await stat(sourcePath), source = { path: await realpath(sourcePath), sha256: sourceHash,
    width: options.canvas?.width ?? 100, height: options.canvas?.height ?? 80, duration: options.sourceDuration ?? (options.range ? options.range.end + 1 : options.long ? 22 : 2), hasAudio: true, bytes: info.size, mtimeMs: info.mtimeMs, startTime: 10, containerStartTime: 10 };
  const range = options.range ?? { start: .2, end: options.long ? 20.2 : 1.2 }, duration = quantizedRecreationDuration(range, source.duration);
  const fixturePlan = () => { const value = plan(5, { duration }); value.layers[0].end = Math.min(1, duration); return value; };
  const frames: RecreationSamplingResult['frames'] = (options.frameTimes ?? [0, .3, .6, .96].map(fraction => range.start + fraction * duration)).map((time, i) => ({ id: `frame-${i}`, path: image, requestedTime: time, decodedTime: time, packetTime: time, native: false, reasons: ['selected-scene'] }));
  const evidence: RecreationSamplingResult = {
    kind: 'reference-recreation-evidence', schemaVersion: 1, outputDirectory: directory, sessionId: 'e'.repeat(64), source,
    requestedRange: range, range, timeBasis: 'seconds from first video presentation timestamp', mode: 'selected-scene',
    inventory: { timeBase: '1/1000', availablePacketTimes: 4, omittedMissingPts: 0, firstTime: range.start, lastTime: range.start + .96 * duration, path: join(directory, 'packets.json') },
    candidates: [], candidatePass: null, scenes: [], inspections: [],
    frames,
    contactSheets: [{ path: image, orderedFrameIds: frames.map(frame => frame.id), count: frames.length, earliestDecodedTime: frames[0].decodedTime, latestDecodedTime: frames.at(-1)!.decodedTime }],
    coverage: { requestedFrames: 4, uniqueDecodedTimes: 4, largestDecodedGap: .36, baselineTargetSpacing: .3,
      allInventoriedPresentationTimestampsRequested: true, visionAttachmentLimit: 12, exceedsVisionAttachmentLimit: false },
    externalModelCalls: 0, continuousViewing: false, audioReviewed: false, semanticCutsVerified: false, limitations: ['Synthetic injected evidence; no decoder or model involved.'],
  };
  const calls = { models: 0, assets: 0, comparisons: 0, comparisonBudgets: [] as (number | undefined)[], decodes: 0, dossiers: 0, canvas: [] as { path: string; width: number; height: number }[], requests: [] as ReferenceCodexRequest[], renames: 0, saveDelays: [] as number[], caches: [] as string[] };
  const runner: ReferenceCodexRunner = {
    capabilities: async () => ({ available: options.available !== false, installed: true, authenticated: options.available !== false,
      auth: options.available === false ? 'unavailable' : 'chatgpt', runner: 'codex-cli', remoteProcessing: true, analysisWindowSeconds: 120,
      timeoutSeconds: 600, reason: options.available === false ? 'Synthetic unavailable account.' : 'Synthetic runner, no external request.' }),
    run: async request => {
      const index = calls.models++; calls.requests.push(request);
      const value = options.run ? await options.run(request, index) : options.outputs?.[index] ?? (request.directory.endsWith('scout') ? {} : request.directory.endsWith('analysis') ? fixturePlan() : critique(fixturePlan()));
      return { output: JSON.stringify(value), usage: null, model: 'synthetic-test', logPath: join(request.directory, 'events.jsonl'),
        stderrPath: join(request.directory, 'stderr.log'), executable: 'injected-test-runner' };
    },
  };
  const dependencies: NonNullable<ConstructorParameters<typeof ReferenceRecreationService>[0]>['dependencies'] = {
    rename: async (source, target) => { calls.renames++; if (options.transientSave && calls.renames <= 2) throw Object.assign(new Error('Synthetic Windows sharing lock.'), { code: 'EPERM' }); await rename(source, target); },
    delay: async milliseconds => { calls.saveDelays.push(milliseconds); },
    inspect: async (_path, input) => { calls.caches.push(input.cacheDir!); await options.inspect?.(input.signal); input.signal?.throwIfAborted(); return evidence; },
    canvas: async (input, settings) => {
      calls.canvas.push(input); settings?.signal?.throwIfAborted();
      if (options.canvasFailure) throw new Error(options.canvasFailure);
      return { width: input.width, height: input.height, rotation: 0 };
    },
    dossier: async (input, settings) => {
      calls.dossiers++; calls.caches.push(settings.cacheDir!); settings.signal?.throwIfAborted();
      const focusPass = input.range.end - input.range.start > 12;
      // Synthetic trusted-boundary seam: real dossier source/PTS/image validation has its own tests.
      if (focusPass) await settings.scout({ prompt: 'Synthetic scout request, no real reference analysis.', images: [image], schema: {} });
      settings.signal?.throwIfAborted();
      const attachedFrameIds = input.frames.filter(frame => !options.unattachedFrame || frame.id !== 'frame-3').map(frame => frame.id);
      return { ...input, focusPass, authorImages: [image], attachedFrameIds,
        dossier: { schemaVersion: 1, focusPass, outputDirectory: directory, scout: null, sourceSha256: sourceHash, sessionId: input.sessionId, range: input.range,
          attachments: [{ kind: 'overview-sheet', path: image, sha256: await fingerprint(image), frameIds: attachedFrameIds }], focusWindows: [],
          budget: { focusFrameLimit: 192, focusFrames: 0, coarseFrameLimit: 72, coarseFrames: 4, nativeDetailFrames: 0, authorImageLimit: 12, authorImages: 1, retainedFrameArtifacts: 4, uniqueDecodedTimes: 4 },
          omittedCoverage: { sourceIntervalsOutsideFocus: [{ ...input.range, coverage: 'coarse-only' }], sourcePacketTimesNotAttached: 0, baseFrameIdsNotAttached: options.unattachedFrame ? ['frame-3'] : [], limitations: ['Synthetic fixture.'] } } };
    },
    assets: async input => {
      calls.assets++; calls.caches.push(input.cacheDir!); input.signal?.throwIfAborted(); await mkdir(input.directory);
      const assets: ReferencePreparedAsset[] = [];
      for (const request of input.requests) {
        const crop = referenceAssetCropPixels(request, { width: 100, height: 80 }), directory = await realpath(input.directory), path = join(directory, `${request.id}.png`);
        const width = request.kind === 'texture-tile' ? 100 : crop.width, height = request.kind === 'texture-tile' ? 80 : crop.height;
        // Header fixture only: raster correctness is covered by reference-assets.test.ts with real FFmpeg.
        const png = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png); png.write('IHDR', 12); png.writeUInt32BE(width, 16); png.writeUInt32BE(height, 20);
        await writeFile(path, png);
        assets.push({ id: request.id, kind: request.kind, path, sha256: await fingerprint(path), width, height, preparedMedia: true, reviewRequired: true,
          provenance: { sourceSha256: sourceHash, sessionId: evidence.sessionId, inspectionId: 'fixture-inspection', evidenceId: 'frame-0', frameSha256: 'f'.repeat(64),
            time: request.time, requestedTime: request.time, decodedTime: options.assetDecodedTime ?? request.time, absolutePts: 10 + (options.assetDecodedTime ?? request.time),
            normalizedRect: request.rect, cropPixels: crop, repeatPolicy: { mode: request.kind === 'texture-tile' ? 'repeat-pixels' : 'none', columns: request.kind === 'texture-tile' ? Math.ceil(100 / crop.width) : 1, rows: request.kind === 'texture-tile' ? Math.ceil(80 / crop.height) : 1, anchor: 'top-left' },
            purpose: request.purpose.trim(), limitation: 'Synthetic prepared-raster fixture, no source-object recovery.' } });
      }
      await writeFile(join(input.directory, 'manifest.json'), JSON.stringify({ schemaVersion: 1, kind: 'reference-prepared-assets', sourceSha256: sourceHash, assets, externalModelCalls: 0, preparedMedia: true, reviewRequired: true }));
      return assets;
    },
    media: async (_args, input) => { input?.signal?.throwIfAborted(); calls.decodes++; return Buffer.alloc(0); },
    probe: async (path, signal) => { signal?.throwIfAborted(); return { ...JSON.parse(await readFile(path, 'utf8')), startTime: 0, containerStartTime: 0 }; },
    compare: async input => {
      input.signal?.throwIfAborted(); calls.comparisons++; calls.comparisonBudgets.push(input.maxDuration); calls.caches.push(input.cacheDir!); await mkdir(input.outputDirectory);
      const side = { requestedTime: 0, decodedTime: 0, absolutePts: 0, delta: 0, evidenceId: 'comparison-frame', frame: 'frame.png', sha256: 'f'.repeat(64) };
      const comparison = { reference: { sha256: sourceHash }, render: { sha256: await fingerprint(input.render) }, pairs: [{ time: 0, image: 'pair.png', reference: side, render: side }], contactSheet: { image: 'contact.png' } } as ReferenceComparison;
      return { directory: input.outputDirectory, comparison };
    },
  };
  const services: ReferenceRecreationService[] = [];
  const makeService = () => { const service = new ReferenceRecreationService({ directory: jobs, runner, dependencies }); services.push(service); return service; };
  t.after(async () => {
    for (const service of services) await service.shutdown();
    const checked = resolve(directory), parent = resolve(tmpdir()) + sep;
    assert.ok(checked.startsWith(parent) && checked.slice(parent.length).startsWith('reference-recreation-test-'));
    await rm(checked, { recursive: true, force: true });
  });
  const start = (service: ReferenceRecreationService, fields: Partial<RecreationStart> = {}) => service.start({ path: sourcePath, projectId: 'test-project', goal: 'Match the supplied fixture without changing its message.', ...range, ...fields });
  const ready = async (service: ReferenceRecreationService, id: string) => { const job = await waitFor(service, id, job => ['awaiting-render', 'failed', 'cancelled'].includes(job.state)); assert.equal(job.state, 'awaiting-render', job.error ?? 'expected native plan'); await idle(jobs); return job; };
  const render = async (job: RecreationJob) => { assert.ok(job.result); await writeFile(job.result.previewPath, JSON.stringify({ width: job.result.plan.width, height: job.result.plan.height, duration: job.result.plan.duration, hasAudio: Boolean(job.result.audio), ...options.renderMetadata })); };
  return { directory, jobs, sourcePath, sourceHash, evidence, calls, makeService, start, ready, render };
}

test('comparison requests retain source-decoded instants, selected offset and a bounded ordered set', () => {
  const value = plan(), frames = Array.from({ length: 100 }, (_, i) => ({ decodedTime: 10 + i / 100 }));
  const times = recreationComparisonTimes(value, { start: 10, end: 11 }, frames);
  assert.ok(times.length <= 24 && times.length > 1);
  assert.equal(times[0], 0);
  assert.ok(times.every((time, i) => time >= 0 && time < 1 && (i === 0 || time > times[i - 1])));
  assert.ok(times.every(time => time === 0 || frames.some(frame => Math.abs(frame.decodedTime - 10 - .000001 - time) < 1e-12)));
  assert.throws(() => recreationComparisonTimes(value, { start: 20, end: 21 }, frames), /No source frame/);
});

test('selected-window recreation comparisons retain the existing two-hour source inspection budget', async t => {
  const data = await fixture(t, { sourceDuration: 1859.96 }), service = data.makeService(), initial = await data.start(service, { maxCorrections: 0 });
  const job = await data.ready(service, initial.id); await data.render(job);
  await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 9, revision: 0 });
  const final = await waitFor(service, initial.id, value => ['complete', 'failed'].includes(value.state));
  assert.equal(final.state, 'complete', final.error ?? 'long source comparison failed');
  assert.equal(final.result?.source.duration, 1859.96); assert.deepEqual(data.calls.comparisonBudgets, [7200]);
  assert.equal(final.externalModelCalls, 2);
});

test('atomic job replacement retries only transient sharing errors with bounded waits and preserves the old target on failure', async t => {
  const data = await fixture(t);
  for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
    const source = join(data.directory, `${code}.tmp`), target = join(data.directory, `${code}.json`), waits: number[] = [];
    await writeFile(source, 'new snapshot'); await writeFile(target, 'old snapshot');
    let attempts = 0;
    await replaceRecreationJobFile(source, target, { rename: async (a, b) => { if (++attempts <= 2) throw Object.assign(new Error('sharing lock'), { code }); await rename(a, b); }, delay: async milliseconds => { waits.push(milliseconds); } });
    assert.equal(attempts, 3); assert.deepEqual(waits, [25, 50]); assert.equal(await readFile(target, 'utf8'), 'new snapshot');
  }
  for (const code of ['EACCES', 'EIO']) {
    const source = join(data.directory, `failure-${code}.tmp`), target = join(data.directory, `failure-${code}.json`), waits: number[] = [];
    await writeFile(source, 'retained new snapshot'); await writeFile(target, 'retained old snapshot');
    let attempts = 0;
    await assert.rejects(replaceRecreationJobFile(source, target, { rename: async () => { attempts++; throw Object.assign(new Error('persistent failure'), { code }); }, delay: async milliseconds => { waits.push(milliseconds); } }), /persistent failure/);
    assert.equal(attempts, code === 'EIO' ? 1 : 6); assert.equal(waits.reduce((sum, value) => sum + value, 0), code === 'EIO' ? 0 : 675);
    assert.equal(await readFile(source, 'utf8'), 'retained new snapshot'); assert.equal(await readFile(target, 'utf8'), 'retained old snapshot');
  }
});

test('serialized service persistence recovers from a transient Windows rename without spending extra model calls', async t => {
  const data = await fixture(t, { transientSave: true }), service = data.makeService(), initial = await data.start(service);
  const job = await data.ready(service, initial.id);
  assert.deepEqual(data.calls.saveDelays, [25, 50]); assert.equal(data.calls.models, 1);
  const saved = JSON.parse(await readFile(join(job.outputDirectory, 'job.json'), 'utf8'));
  assert.equal(saved.state, 'awaiting-render'); assert.equal(saved.externalModelCalls, 1);
});

test('canonical reconstruction duration never rounds an audio/video interval past the actual source end', () => {
  assert.equal(quantizedRecreationDuration({ start: 0, end: 5.02 }, 5.02), 5);
  assert.equal(quantizedRecreationDuration({ start: 32.1, end: 35.2 }, 120), 3.1);
  assert.equal(quantizedRecreationDuration({ start: 4.98, end: 5.02 }, 5.02), 1 / 30);
  for (const start of [0, .017, .03, .5, 4.8]) {
    const duration = quantizedRecreationDuration({ start, end: 5.02 }, 5.02);
    assert.ok(Math.round((start + duration) * 30) / 30 <= 5.02);
  }
  assert.throws(() => quantizedRecreationDuration({ start: 0, end: .005 }, 1), /no complete/);
  assert.throws(() => quantizedRecreationDuration({ start: 0, end: 2 }, 1), /fit the source/);
});

test('focus model budgets reserve scout and final critique without exceeding four account calls', () => {
  assert.deepEqual(recreationModelBudget(2, false), { focusPass: false, effectiveMaxCorrections: 2, modelCallBudget: 4 });
  assert.deepEqual(recreationModelBudget(2, true), { focusPass: true, effectiveMaxCorrections: 1, modelCallBudget: 4 });
  assert.deepEqual(recreationModelBudget(0, true), { focusPass: true, effectiveMaxCorrections: 0, modelCallBudget: 3 });
  assert.throws(() => recreationModelBudget(3, true));
});

test('unsupported canvas or display rotation stops after source inspection and before scout, authoring or assets', async t => {
  for (const input of [
    { canvas: { width: 101, height: 80 }, canvasFailure: 'Odd dimensions require normalization.' },
    { canvas: { width: 4100, height: 80 }, canvasFailure: 'Canvas side exceeds the supported native size.' },
    { canvas: { width: 4096, height: 4096 }, canvasFailure: 'Canvas exceeds the native pixel budget.' },
    { canvas: { width: 100, height: 80 }, canvasFailure: 'Display rotation requires normalization.' },
  ]) {
    // The injected preflight covers service sequencing; actual probe/geometry cases are in reference-canvas.test.ts.
    const data = await fixture(t, { ...input, long: true }), service = data.makeService(), initial = await data.start(service);
    const failed = await waitFor(service, initial.id, job => job.state === 'failed');
    assert.equal(failed.error, input.canvasFailure); assert.equal(failed.result, null);
    assert.deepEqual(data.calls.canvas, [{ path: data.sourcePath, ...input.canvas }]);
    assert.equal(data.calls.models, 0); assert.equal(data.calls.dossiers, 0); assert.equal(data.calls.assets, 0);
    assert.equal(data.calls.caches.length, 1, 'only the initial evidence sampler ran');
  }
});

test('a selected range without a source frame inside the native output span fails before model calls while aligned single-frame ranges work', async t => {
  for (const input of [
    { range: { start: 32.101, end: 32.135 }, frameTimes: [32.132] },
    { range: { start: 10, end: 10.1 }, frameTimes: [10.09] },
  ]) {
    const data = await fixture(t, input), service = data.makeService(), initial = await data.start(service);
    const failed = await waitFor(service, initial.id, job => job.state === 'failed');
    assert.match(failed.error!, /Choose a wider or frame-aligned source interval/);
    assert.equal(data.calls.models, 0); assert.equal(data.calls.dossiers, 0); assert.equal(data.calls.assets, 0);
  }
  const data = await fixture(t, { range: { start: 32.1, end: 32.1 + 1 / 30 }, frameTimes: [32.1] });
  const service = data.makeService(), initial = await data.start(service), job = await data.ready(service, initial.id);
  assert.equal(job.result?.plan.duration, 1 / 30); assert.equal(data.calls.models, 1);
  assert.deepEqual(recreationComparisonTimes(job.result!.plan, job.result!.range, data.evidence.frames), [0]);
});

test('long-window scout plus one correction and exact final critique survive saved-job reload within four calls', async t => {
  const a = plan(5, { duration: 20 }), b = plan(6, { duration: 20 }), c = plan(7, { duration: 20 });
  const data = await fixture(t, { long: true, outputs: [{}, a, critique(b, 'revise'), critique(c, 'revise')] });
  const first = data.makeService(), initial = await data.start(first), prepared = await data.ready(first, initial.id);
  assert.equal(prepared.externalModelCalls, 2); assert.equal(data.calls.dossiers, 1);
  assert.deepEqual([prepared.result?.focusPass, prepared.result?.effectiveMaxCorrections, prepared.result?.modelCallBudget], [true, 1, 4]);
  assert.equal(data.calls.requests[0].images.length, 1); assert.equal(data.calls.requests[1].images.length, 1);
  assert.match(data.calls.requests[1].prompt, /effective correction passes after the first render: 1/);
  assert.ok(!data.calls.requests[1].prompt.includes(data.directory), 'private cache paths do not enter the author manifest');
  const service = data.makeService(); let job = await service.status(initial.id);
  for (let revision = 0; revision <= 1; revision++) {
    await data.render(job); await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 4, revision });
    job = await waitFor(service, job.id, value => ['awaiting-render', 'complete', 'failed'].includes(value.state));
    if (job.state === 'awaiting-render') await idle(data.jobs);
  }
  assert.equal(job.state, 'complete', job.error ?? 'expected bounded final render review');
  assert.equal(job.externalModelCalls, 4); assert.equal(job.result?.revision, 1); assert.equal(job.result?.plan.layers[0].x, 6);
  assert.equal(job.receipt?.agentVerdict, 'revision-budget');
  assert.deepEqual([job.receipt?.focusPass, job.receipt?.effectiveMaxCorrections, job.receipt?.modelCallBudget], [true, 1, 4]);
  const delivery = JSON.parse(await readFile(join(job.outputDirectory, 'delivery.json'), 'utf8'));
  assert.equal(delivery.modelCallBudget, 4); assert.equal(delivery.externalModelCalls, 4);
});

test('long-window zero-correction runs reserve three calls and never apply an unrendered proposal', async t => {
  const data = await fixture(t, { long: true }), service = data.makeService(), initial = await data.start(service, { maxCorrections: 0 });
  const job = await data.ready(service, initial.id); await data.render(job);
  await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 4, revision: 0 });
  const final = await waitFor(service, job.id, value => ['complete', 'failed'].includes(value.state));
  assert.equal(final.state, 'complete', final.error ?? 'expected completion');
  assert.equal(final.externalModelCalls, 3); assert.equal(final.result?.effectiveMaxCorrections, 0); assert.equal(final.result?.modelCallBudget, 3);
  assert.deepEqual(data.calls.caches, [join(job.outputDirectory, 'evidence-cache'), join(job.outputDirectory, 'evidence-cache'), join(job.outputDirectory, 'comparison-evidence')]);
});

test('cancelling an active scout prevents authoring, even if the runner returns late', async t => {
  let announce!: () => void; const started = new Promise<void>(resolveStarted => { announce = resolveStarted; });
  const data = await fixture(t, { long: true, run: async request => {
    announce(); await new Promise<void>(resolveAbort => request.signal.addEventListener('abort', () => resolveAbort(), { once: true })); return {};
  } });
  const service = data.makeService(), initial = await data.start(service); await started;
  const final = await service.cancel(initial.id);
  assert.equal(final.state, 'cancelled'); assert.equal(final.result, null); assert.equal(data.calls.models, 1); assert.equal(data.calls.assets, 0);
});

test('dossier layer citations cannot use cached source frames omitted from the author attachments', async t => {
  const value = plan(); value.layers[0].evidenceIds = ['frame-3'];
  const data = await fixture(t, { unattachedFrame: true, outputs: [value] }), service = data.makeService(), initial = await data.start(service);
  const final = await waitFor(service, initial.id, job => job.state === 'failed');
  assert.match(final.error!, /actual attached source frames/); assert.equal(data.calls.models, 1); assert.equal(final.result, null);
});

test('native render dimensions, duration and audio-track presence are checked before a critic call', async t => {
  for (const renderMetadata of [{ width: 101 }, { height: 81 }, { duration: 1.03 }, { hasAudio: false }]) {
    const data = await fixture(t, { renderMetadata }), service = data.makeService(), initial = await data.start(service);
    const job = await data.ready(service, initial.id); await data.render(job);
    await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 4, revision: 0 });
    const final = await waitFor(service, job.id, value => value.state === 'failed');
    assert.match(final.error!, /Native render metadata/); assert.equal(data.calls.models, 1); assert.equal(data.calls.comparisons, 0); assert.equal(final.receipt, null);
  }
});

test('a render changed while the critic runs cannot receive an exact-render receipt', async t => {
  const data = await fixture(t, { run: async request => {
    if (request.directory.endsWith('analysis')) return plan();
    await writeFile(join(dirname(request.directory), 'preview.mp4'), 'Replaced after comparison'); return critique();
  } });
  const service = data.makeService(), initial = await data.start(service), job = await data.ready(service, initial.id);
  await data.render(job); await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 4, revision: 0 });
  const final = await waitFor(service, job.id, value => value.state === 'failed');
  assert.match(final.error!, /changed after its source comparison/); assert.equal(final.receipt, null); assert.equal(data.calls.models, 2);
});

test('visual prompt manifest retains source timing and sheet order while omitting duplicate extraction records and cache paths', async t => {
  const data = await fixture(t), manifest = recreationVisualManifest(data.evidence);
  assert.equal(manifest.source.sha256, data.sourceHash); assert.deepEqual(manifest.range, { start: .2, end: 1.2 });
  assert.deepEqual(manifest.frames.map(frame => frame.id), data.evidence.frames.map(frame => frame.id));
  assert.deepEqual(manifest.contactSheets[0].orderedFrameIds, ['frame-0', 'frame-1', 'frame-2', 'frame-3']);
  assert.equal(manifest.contactSheets[0].attachment, 1);
  assert.equal(Object.hasOwn(manifest, 'inspections'), false); assert.equal(Object.hasOwn(manifest, 'inventory'), false);
  assert.ok(!JSON.stringify(manifest).includes(data.directory));
});

test('preparation preserves audio/range, restores from data and finishes with sampled human-review-required receipt', async t => {
  const data = await fixture(t), first = data.makeService(), initial = await data.start(first, { maxCorrections: 0 });
  const job = await data.ready(first, initial.id);
  assert.equal(job.externalModelCalls, 1); assert.deepEqual(job.result?.audio, { sourceIn: .2, sourceOut: 1.2 });
  const saved = JSON.parse(await readFile(join(job.outputDirectory, 'job.json'), 'utf8'));
  saved.result.module = 'throw new Error("cached code must not run")'; saved.result.bindings = [{ path: 'https://example.com/evil' }];
  await writeFile(join(job.outputDirectory, 'job.json'), JSON.stringify(saved));
  const restored = data.makeService(), resumed = await restored.status(job.id);
  assert.notEqual(resumed.result?.module, saved.result.module); assert.ok(resumed.result?.module.includes('dapi-host:'));
  assert.equal(resumed.result?.bindings[0].path, data.sourcePath);
  await data.render(resumed);
  await assert.rejects(restored.rendered({ id: job.id, projectId: 'another-project', sceneId: 4, revision: 0 }), /project-bound/);
  assert.equal((await restored.status(job.id)).state, 'awaiting-render');
  await restored.rendered({ id: job.id, projectId: 'test-project', sceneId: 4, revision: 0 });
  const final = await waitFor(restored, job.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.state, 'complete', final.error ?? 'expected completion');
  assert.equal(final.externalModelCalls, 2); assert.equal(data.calls.models, 2);
  assert.equal(final.receipt?.visualReview, 'human-review-required'); assert.equal(final.receipt?.agentVerdict, 'best-effort');
  assert.equal(data.calls.comparisons, 1); assert.equal(data.calls.decodes, 1);
  assert.equal(await fingerprint(data.sourcePath), data.sourceHash);
});

test('two corrections plus final critique consume at most four model calls and never apply an unrendered final plan', async t => {
  const data = await fixture(t, { outputs: [plan(5), critique(plan(6), 'revise'), critique(plan(7), 'revise'), critique(plan(8), 'revise')] });
  const service = data.makeService(), initial = await data.start(service);
  let job = await data.ready(service, initial.id);
  for (let revision = 0; revision <= 2; revision++) {
    assert.equal(job.result?.revision, revision); await data.render(job);
    await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 9, revision });
    job = await waitFor(service, job.id, candidate => ['awaiting-render', 'complete', 'failed'].includes(candidate.state));
    if (job.state === 'awaiting-render') await idle(data.jobs);
  }
  assert.equal(job.state, 'complete', job.error ?? 'expected completion');
  assert.equal(job.externalModelCalls, 4); assert.equal(data.calls.models, 4); assert.equal(job.result?.revision, 2);
  assert.equal(job.result?.plan.layers[0].x, 7, 'last proposed correction was not rendered or applied');
  assert.equal(job.receipt?.agentVerdict, 'revision-budget');
  await assert.rejects(service.rendered({ id: job.id, projectId: job.projectId, sceneId: 9, revision: 2 }), /project-bound/);
  assert.equal(data.calls.models, 4);
});

test('final critique refreshes only review notes in delivery while the exact rendered plan remains distinct from an unrendered proposal', async t => {
  const authored = plan(5, { unresolved: ['Not yet rendered or compared.'] }), reviewed = plan(7, { unresolved: ['Exact font identity remains uncertain from sampled pixels.'] });
  const data = await fixture(t, { outputs: [authored, critique(reviewed, 'revise')] }), service = data.makeService(), initial = await data.start(service, { maxCorrections: 0 });
  const job = await data.ready(service, initial.id); await data.render(job);
  await service.rendered({ id: job.id, projectId: job.projectId, sceneId: 9, revision: 0 });
  const final = await waitFor(service, job.id, value => ['complete', 'failed'].includes(value.state));
  assert.equal(final.state, 'complete', final.error ?? 'expected completion');
  assert.equal(final.result?.plan.layers[0].x, 5); assert.deepEqual(final.result?.plan.unresolved, authored.unresolved);
  assert.ok(final.receipt?.warnings.includes(reviewed.unresolved[0])); assert.ok(!final.receipt?.warnings.includes(authored.unresolved[0]));
  assert.ok(final.receipt?.warnings.some(note => /Model review is fallible/.test(note)));
  const review = JSON.parse(await readFile(join(job.result!.directory, 'visual-review.json'), 'utf8'));
  assert.equal(review.plan.layers[0].x, 7); assert.equal(review.proposedPlanAppliedToComparedRender, false);
  assert.equal(review.renderedPlanSha256, await fingerprint(join(job.result!.directory, 'plan.json')));
  assert.match(data.calls.requests[1].prompt, /Only unresolved\/observations metadata may be refreshed/);
});

test('prepared asset envelope survives reload and edited source-bound manifest or paths are rejected', async t => {
  const value = plan(), asset = { id: 'photo-detail', kind: 'frame-crop' as const, time: .2, rect: { x: .1, y: .1, width: .2, height: .2 }, purpose: 'Photographic detail' };
  value.assetRequests = [asset]; value.layers = [{ ...value.layers[0], type: 'image', text: '', assetId: asset.id }];
  const data = await fixture(t, { outputs: [value] }), service = data.makeService(), initial = await data.start(service);
  const job = await data.ready(service, initial.id), restored = data.makeService();
  const resumed = await restored.status(job.id);
  assert.equal(resumed.result?.assets.length, 1); assert.equal(data.calls.assets, 1);
  assert.equal(resumed.result?.bindings[1].id, asset.id);
  const path = join(job.result!.directory, 'assets', 'manifest.json'), original = await readFile(path, 'utf8'), manifest = JSON.parse(original);
  manifest.assets[0].provenance.normalizedRect.x = .5;
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(restored.status(job.id), /source-bound manifest/);
  await writeFile(path, original);
  const savedPath = join(job.outputDirectory, 'job.json'), saved = JSON.parse(await readFile(savedPath, 'utf8'));
  saved.result.evidencePath = join(data.directory, 'outside.json'); await writeFile(savedPath, JSON.stringify(saved));
  await assert.rejects(restored.status(job.id), /path mismatch/);
  saved.result.evidencePath = join(job.outputDirectory, 'evidence.json'); saved.externalModelCalls = 5;
  await writeFile(savedPath, JSON.stringify(saved)); await assert.rejects(restored.status(job.id));
});

test('prepared image decoded timestamps must stay inside the selection during creation and saved-job validation', async t => {
  const value = plan(), request = { id: 'photo-detail', kind: 'frame-crop' as const, time: .2, rect: { x: .1, y: .1, width: .2, height: .2 }, purpose: 'A source-bound detail.' };
  value.assetRequests = [request]; value.layers = [{ ...value.layers[0], type: 'image', text: '', assetId: request.id }];
  const rejected = await fixture(t, { outputs: [value], assetDecodedTime: 1.21 }), first = rejected.makeService(), initial = await rejected.start(first);
  const failed = await waitFor(first, initial.id, job => job.state === 'failed');
  assert.match(failed.error!, /decoded frames must stay inside/); assert.equal(failed.result, null); assert.equal(rejected.calls.models, 1);
  assert.ok((await stat(join(initial.outputDirectory, 'revision-0', 'assets', 'manifest.json'))).isFile(), 'failed prepared artifacts remain available');
  const data = await fixture(t, { outputs: [value] }), service = data.makeService(), second = await data.start(service), job = await data.ready(service, second.id);
  const path = join(job.result!.directory, 'assets', 'manifest.json'), original = await readFile(path, 'utf8'), manifest = JSON.parse(original), restored = data.makeService();
  for (const decodedTime of [.199, 1.2, 1.21]) {
    manifest.assets[0].provenance.decodedTime = decodedTime; manifest.assets[0].provenance.absolutePts = 10 + decodedTime;
    await writeFile(path, JSON.stringify(manifest)); await assert.rejects(restored.status(job.id), /decoded frames must stay inside/);
  }
  await writeFile(path, original); assert.equal((await restored.status(job.id)).result?.assets[0].provenance.decodedTime, .2);
  assert.equal(data.calls.models, 1);
});

test('concurrent starts reserve before async work and cancellation suppresses late model results', async t => {
  let announce!: () => void;
  const started = new Promise<void>(resolveStarted => { announce = resolveStarted; });
  const data = await fixture(t, { run: async request => { announce(); await new Promise<void>(resolveAbort => request.signal.addEventListener('abort', () => resolveAbort(), { once: true })); return plan(); } });
  const service = data.makeService(), results = await Promise.allSettled([data.start(service), data.start(service)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const initial = (results.find(result => result.status === 'fulfilled') as PromiseFulfilledResult<RecreationJob>).value;
  await started;
  const foreign = data.makeService(); await assert.rejects(foreign.cancel(initial.id), /owning editor/);
  const cancelled = await service.cancel(initial.id);
  assert.equal(cancelled.state, 'cancelled'); assert.equal(cancelled.result, null); assert.equal(data.calls.models, 1); assert.equal(data.calls.assets, 0);
  const persisted = JSON.parse(await readFile(join(cancelled.outputDirectory, 'job.json'), 'utf8'));
  assert.equal(persisted.state, 'cancelled'); assert.equal(persisted.externalModelCalls, 1);
  await service.shutdown(); await assert.rejects(data.start(service), /active reconstruction/);
});

test('unavailable account, malformed output and unavailable text fonts fail without an automatic retry', async t => {
  const unavailable = await fixture(t, { available: false }), a = unavailable.makeService(), first = await unavailable.start(a);
  const failed = await waitFor(a, first.id, job => job.state === 'failed'); assert.match(failed.error!, /unavailable account/); assert.equal(unavailable.calls.models, 0);
  const invalidPlan = plan(); invalidPlan.layers[0].fontFamily = 'Font Not In Available List';
  const invalid = await fixture(t, { outputs: [invalidPlan] }), b = invalid.makeService(), second = await invalid.start(b);
  const badFont = await waitFor(b, second.id, job => job.state === 'failed'); assert.match(badFont.error!, /available-font/); assert.equal(invalid.calls.models, 1);
  const malformed = await fixture(t, { outputs: [{ arbitraryCode: 'run()' }] }), c = malformed.makeService(), third = await malformed.start(c);
  assert.equal((await waitFor(c, third.id, job => job.state === 'failed')).result, null); assert.equal(malformed.calls.models, 1);
});

test('unknown source evidence IDs and out-of-window asset requests fail before materializing a native draft', async t => {
  const badIds = plan(); badIds.layers[0].evidenceIds = ['invented-frame'];
  const a = await fixture(t, { outputs: [badIds] }), serviceA = a.makeService(), initialA = await a.start(serviceA);
  assert.match((await waitFor(serviceA, initialA.id, job => job.state === 'failed')).error!, /actual attached source frames/);
  const badTime = plan(); badTime.assetRequests = [{ id: 'early-photo', kind: 'frame-crop', time: .1, rect: { x: 0, y: 0, width: .2, height: .2 }, purpose: 'Before the selected window.' }];
  const b = await fixture(t, { outputs: [badTime] }), serviceB = b.makeService(), initialB = await b.start(serviceB);
  assert.match((await waitFor(serviceB, initialB.id, job => job.state === 'failed')).error!, /selected reconstruction range/);
  assert.equal(a.calls.assets, 0); assert.equal(b.calls.assets, 0);
});

test('source video layers retain the selected 32-second offset instead of another valid whole-file interval', async t => {
  const video = (sourceIn: number) => {
    const value = plan(5, { duration: 3.1 });
    value.layers = [{ ...value.layers[0], type: 'video', text: '', assetId: 'reference-source', sourceIn, start: .4, end: 1.4 }];
    return value;
  };
  for (const sourceIn of [0, 32.5 - 1 / 30, 32.5 + 1 / 30, 35]) {
    const data = await fixture(t, { range: { start: 32.1, end: 35.2 }, outputs: [video(sourceIn)] });
    const service = data.makeService(), initial = await data.start(service);
    const failed = await waitFor(service, initial.id, job => job.state === 'failed');
    assert.match(failed.error!, /corresponding selected source instant/); assert.equal(failed.result, null); assert.equal(data.calls.models, 1); assert.equal(data.calls.assets, 0);
  }
  const data = await fixture(t, { range: { start: 32.1, end: 35.2 }, outputs: [video(32.5)] });
  const service = data.makeService(), initial = await data.start(service), job = await data.ready(service, initial.id);
  assert.equal(job.result?.plan.layers[0].sourceIn, 32.5); assert.match(job.result!.module, /"sourceIn":"975f","sourceOut":"1005f"/);
  const savedPath = join(job.outputDirectory, 'job.json'), original = await readFile(savedPath, 'utf8'), saved = JSON.parse(original);
  const restored = data.makeService();
  for (const sourceIn of [0, 32.5 - 1 / 30, 32.5 + 1 / 30]) {
    saved.result.plan.layers[0].sourceIn = sourceIn; await writeFile(savedPath, JSON.stringify(saved));
    await assert.rejects(restored.status(job.id), /corresponding selected source instant/);
  }
  await writeFile(savedPath, original); assert.equal((await restored.status(job.id)).result?.plan.layers[0].sourceIn, 32.5);
  assert.equal(data.calls.models, 1, 'saved validation never invokes a model');
});

test('video alignment uses canonical native clocks once and permits only source-end quantization tolerance', async t => {
  const range = { start: 32.117, end: 33.132 }, value = plan();
  value.layers = [{ ...value.layers[0], type: 'video', text: '', assetId: 'reference-source', sourceIn: 964 / 30 }];
  const data = await fixture(t, { range, outputs: [value] }), service = data.makeService(), initial = await data.start(service);
  const job = await data.ready(service, initial.id);
  assert.match(job.result!.module, /"sourceIn":"964f","sourceOut":"994f"/);
  assert.ok(994 / 30 > range.end && 994 / 30 - range.end < .5 / 30);
});

test('resuming an awaiting render refreshes a dead former owner before current-worker status is observed', async t => {
  let announce!: () => void, release!: () => void;
  const reviewing = new Promise<void>(resolveReview => { announce = resolveReview; }), held = new Promise<void>(resolveHeld => { release = resolveHeld; });
  const data = await fixture(t, { run: async request => {
    if (request.directory.endsWith('analysis')) return plan();
    announce(); await held; return critique();
  } });
  const original = data.makeService(), initial = await data.start(original), job = await data.ready(original, initial.id);
  const path = join(job.outputDirectory, 'job.json'), saved = JSON.parse(await readFile(path, 'utf8'));
  saved.ownerPid = 2147483647; await writeFile(path, JSON.stringify(saved)); await data.render(job);
  const resumed = data.makeService();
  try {
    await resumed.rendered({ id: job.id, projectId: job.projectId, sceneId: 4, revision: 0 }); await reviewing;
    const active = await resumed.status(job.id), observer = await data.makeService().status(job.id);
    assert.equal(active.state, 'reviewing'); assert.equal(observer.state, 'reviewing');
    assert.equal(active.ownerPid, process.pid); assert.equal(observer.ownerPid, process.pid);
    assert.equal(JSON.parse(await readFile(path, 'utf8')).ownerPid, process.pid);
  } finally { release(); }
  const final = await waitFor(resumed, job.id, value => ['complete', 'failed'].includes(value.state));
  assert.equal(final.state, 'complete', final.error ?? 'expected completed resumed review');
});

test('cancellation during awaiting-render cleanup is durable and prevents an already waiting rendered call from starting another review', async t => {
  for (const concurrentRender of [false, true]) {
    const data = await fixture(t), service = data.makeService();
    const internal = service as unknown as { release(id: string): Promise<void> };
    const originalRelease = internal.release.bind(service); let announce!: () => void, release!: () => void, hold = true;
    const settling = new Promise<void>(resolveSettling => { announce = resolveSettling; }), held = new Promise<void>(resolveHeld => { release = resolveHeld; });
    internal.release = async id => { await originalRelease(id); if (hold) { hold = false; announce(); await held; } };
    const initial = await data.start(service); await settling;
    const ready = await service.status(initial.id); assert.equal(ready.state, 'awaiting-render'); await data.render(ready);
    const rendering = concurrentRender ? service.rendered({ id: ready.id, projectId: ready.projectId, sceneId: 4, revision: 0 }) : null;
    if (rendering) await Promise.resolve();
    const cancellation = service.cancel(ready.id), duplicate = service.cancel(ready.id);
    const outcomes = Promise.allSettled([...(rendering ? [rendering] : []), cancellation, duplicate]); release();
    const results = await outcomes;
    if (concurrentRender) assert.equal(results[0].status, 'rejected');
    for (const result of results.slice(concurrentRender ? 1 : 0)) {
      assert.equal(result.status, 'fulfilled'); if (result.status === 'fulfilled') assert.equal(result.value.state, 'cancelled');
    }
    assert.equal((await data.makeService().status(ready.id)).state, 'cancelled');
    assert.equal(data.calls.models, 1, 'cancellation cannot start a paid critique on a fresh controller');
    await assert.rejects(service.rendered({ id: ready.id, projectId: ready.projectId, sceneId: 4, revision: 0 }), /project-bound/);
  }
});

test('shutdown during initial worker reservation settles cancellation without a dangling lock or missing-job error', async t => {
  const data = await fixture(t), service = data.makeService();
  const starting = data.start(service);
  const stopping = service.shutdown();
  const [startResult, stopResult] = await Promise.allSettled([starting, stopping]);
  assert.equal(startResult.status, 'rejected'); assert.equal(stopResult.status, 'fulfilled');
  assert.equal(data.calls.models, 0); await idle(data.jobs);
});

test('interrupted jobs fail on resume without another model call and changed source hashes invalidate the draft', async t => {
  const data = await fixture(t), service = data.makeService(), initial = await data.start(service), job = await data.ready(service, initial.id);
  const savedPath = join(job.outputDirectory, 'job.json'), saved = JSON.parse(await readFile(savedPath, 'utf8'));
  saved.state = 'reviewing'; await writeFile(savedPath, JSON.stringify(saved));
  const restored = data.makeService(), interrupted = await restored.status(job.id);
  assert.equal(interrupted.state, 'failed'); assert.match(interrupted.message, /will not rerun/); assert.equal(data.calls.models, 1);
  await writeFile(data.sourcePath, 'Changed private source; no decoder or model used.');
  await assert.rejects(restored.status(job.id), /source changed/);
});
