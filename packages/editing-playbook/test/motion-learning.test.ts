import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import test from 'node:test';
import type { AgentSession } from '@diffusionstudio/video-understanding/agent';
import { MotionLearningService } from '../src/motion-learning.ts';
import type { MotionLearningJob } from '../src/motion-learning.ts';
import { MotionLibrary } from '../src/motion-library.ts';
import type { LearnedMotion } from '../src/motion-learned.ts';
import type { ReferenceCodexRequest, ReferenceCodexRunner } from '../src/reference-codex.ts';
import type { ReferenceComparison } from '../src/reference-evidence.ts';
import type { RecreationSamplingResult } from '../src/reference-sampling.ts';
import { fingerprint } from '../src/preview.ts';

// All runner, evidence, decoding and comparison responses in this file are
// explicit synthetic seams. Passing lifecycle tests is not an audiovisual review.
function nativeComponent(text = 'Example', fill = '#121212'): LearnedMotion {
  return { schemaVersion: 1, id: 'rising-label', name: 'Rising label', description: 'A label moves into a reading hold.', tags: ['label', 'rise'],
    parameters: [
      { id: 'headline', label: 'Headline', type: 'text', default: text, minimum: null, maximum: null, bindings: [{ layerId: 'label', field: 'text' }] },
      { id: 'accent', label: 'Accent', type: 'color', default: fill, minimum: null, maximum: null, bindings: [{ layerId: 'label', field: 'fill' }] },
    ],
    plan: { schemaVersion: 2, title: 'Synthetic label', summary: 'Explicit unit-test native data.', width: 640, height: 360, fps: 30, duration: 2,
      background: '#ffffff', assetRequests: [], observations: ['Synthetic fixture only.'], unresolved: ['Physical phone readability was not tested.'],
      layers: [{ id: 'label', name: 'Editable label', type: 'text', start: 0, end: 2, x: 30, y: 100, width: 580, height: 100,
        rotation: 0, opacity: 1, fill, radius: 0, text, fontFamily: 'Arial', fontSize: 40, fontWeight: 400, fontStyle: 'normal',
        textAlign: 'left', letterSpacing: 0, leading: 1, assetId: null, objectFit: 'fill', sourceIn: 0, scaleX: 1, scaleY: 1, clipToBox: false,
        evidenceIds: ['dense-0', 'dense-1'], keyframes: [
          { time: 0, x: 30, y: 140, width: 580, height: 100, scale: 1, rotation: 0, opacity: 0, easing: 'easeOut' },
          { time: .5, x: 30, y: 100, width: 580, height: 100, scale: 1, rotation: 0, opacity: 1, easing: 'easeOut' },
        ] }],
    },
  };
}
const passedReview = { verdict: 'pass', summary: 'Synthetic runner approved the injected fixture; no real image judgment occurred.',
  sourceMotionRetained: true, changedContentUsable: true, reusableParameters: true, limitations: ['Sampled synthetic test inputs only.'] };

async function waitFor(service: MotionLearningService, id: string, predicate: (job: MotionLearningJob) => boolean) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { const job = await service.status(id); if (predicate(job)) return job; await pause(5); }
  throw new Error('Synthetic learning job did not reach the expected lifecycle state');
}
async function unlocked(directory: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { await stat(join(directory, '.active.lock')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    await pause(5);
  }
  throw new Error('Synthetic learning worker did not release its lock');
}

async function fixture(t: { after(fn: () => Promise<void>): void }, options: {
  review?: Partial<typeof passedReview>; component?: LearnedMotion;
  candidates?: { id: string; name: string; start: number; end: number; evidenceIds: string[]; reason: string }[];
  run?: (request: ReferenceCodexRequest, index: number) => Promise<unknown>;
  reviewSequence?: unknown[];
  badMetadata?: { width?: number; height?: number; duration?: number; hasAudio?: boolean };
  badComparisonHash?: boolean; unavailable?: boolean;
} = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'motion-learning-test-'))), jobs = join(directory, 'jobs');
  const sourcePath = join(directory, 'reference.mp4'), image = join(directory, 'synthetic.png');
  const bytes = Buffer.alloc(512); bytes.write('ftyp', 4); bytes.write('Synthetic fixture only.', 20);
  await writeFile(sourcePath, bytes); await writeFile(image, 'Synthetic image bytes; the injected model never decodes them.');
  const sourceHash = await fingerprint(sourcePath), sourceInfo = await stat(sourcePath);
  const source = { path: sourcePath, sha256: sourceHash, bytes: sourceInfo.size, mtimeMs: sourceInfo.mtimeMs,
    width: 640, height: 360, duration: 615, hasAudio: false, startTime: 0, containerStartTime: 0 };
  const overviewTimes = [0, 120, 300, 440, 441, 614.5];
  const overview: AgentSession = { kind: 'agent-video-evidence', schemaVersion: 1, id: 'e'.repeat(64), revision: 1,
    createdAt: new Date().toISOString(), goal: 'Synthetic whole-file overview', source,
    timeBasis: 'seconds from first video presentation timestamp', audio: {} as AgentSession['audio'],
    inspections: [{ id: 'overview', request: { times: overviewTimes, count: 6, native: false, clip: false, audio: false }, contactSheet: image,
      contactSheetOrder: overviewTimes.map((_, index) => `overview-${index}`),
      artifacts: overviewTimes.map((time, index) => ({ id: `overview-${index}`, kind: 'frame', path: image, start: time, end: time, requestedTime: time, native: false })) }],
    transcripts: [], observations: [], externalModelCalls: 0, safeToAutoEdit: false, limitations: ['Synthetic evidence, not decoded frames.'] };
  const calls = { model: [] as ReferenceCodexRequest[], overview: [] as string[], inspect: [] as { start: number; end: number }[], decodes: 0, probes: 0, compare: 0 };
  let reviewIndex = 0;
  const runner: ReferenceCodexRunner = {
    capabilities: async () => ({ available: !options.unavailable, installed: true, authenticated: !options.unavailable,
      auth: options.unavailable ? 'unavailable' : 'chatgpt', runner: 'codex-cli', remoteProcessing: true,
      analysisWindowSeconds: 120, timeoutSeconds: 600, reason: 'Synthetic capability fixture; no account request.' }),
    run: async request => {
      const index = calls.model.length; calls.model.push(request);
      const value = options.run ? await options.run(request, index) : basename(request.directory) === 'discovery'
        ? { candidates: options.candidates ?? [{ id: 'late-label', name: 'A later native label', start: 440, end: 442, evidenceIds: ['overview-3'], reason: 'Synthetic moving-label candidate.' }], coverageNotes: ['Synthetic overview includes late source times.'] }
        : basename(request.directory) === 'authoring' ? options.component ?? nativeComponent()
          : options.reviewSequence?.[reviewIndex++] ?? { ...passedReview, ...options.review };
      return { output: JSON.stringify(value), usage: null, model: 'synthetic-runner', executable: 'injected-test-runner',
        logPath: join(request.directory, 'events.jsonl'), stderrPath: join(request.directory, 'stderr.log') };
    },
  };
  const dependencies: NonNullable<ConstructorParameters<typeof MotionLearningService>[0]>['dependencies'] = {
    overview: async (path, _cache, signal) => { signal.throwIfAborted(); calls.overview.push(path); return structuredClone(overview); },
    inspect: async (_path, input) => {
      input.signal?.throwIfAborted(); calls.inspect.push({ start: input.start ?? 0, end: input.end });
      const start = input.start ?? 0, end = input.end;
      const frames: RecreationSamplingResult['frames'] = [start, start + .5, start + 1, end - 1 / 30].map((time, index) => ({
        id: `dense-${index}`, path: image, requestedTime: time, decodedTime: time, packetTime: time, native: false, reasons: ['selected-scene'] }));
      return { kind: 'reference-recreation-evidence', schemaVersion: 1, outputDirectory: directory, sessionId: overview.id, source,
        requestedRange: { start, end }, range: { start, end }, timeBasis: overview.timeBasis, mode: 'selected-scene',
        inventory: { timeBase: '1/30', availablePacketTimes: 60, omittedMissingPts: 0, firstTime: start, lastTime: end - 1 / 30, path: join(directory, 'packets.json') },
        candidates: [], candidatePass: null, scenes: [], frames, inspections: [],
        contactSheets: [{ path: image, orderedFrameIds: frames.map(frame => frame.id), count: frames.length, earliestDecodedTime: start, latestDecodedTime: end - 1 / 30 }],
        coverage: { requestedFrames: 4, uniqueDecodedTimes: 4, largestDecodedGap: 1, baselineTargetSpacing: .5,
          allInventoriedPresentationTimestampsRequested: false, visionAttachmentLimit: 12, exceedsVisionAttachmentLimit: false },
        externalModelCalls: 0, continuousViewing: false, audioReviewed: false, semanticCutsVerified: false, limitations: ['Synthetic dense evidence.'] };
    },
    media: async (_args, settings) => { settings?.signal?.throwIfAborted(); calls.decodes++; return Buffer.alloc(0); },
    probe: async (path, signal) => { signal?.throwIfAborted(); calls.probes++; const value = JSON.parse(await readFile(path, 'utf8')); return {
      width: value.width, height: value.height, duration: value.duration, hasAudio: value.hasAudio, startTime: 0, containerStartTime: 0, ...options.badMetadata }; },
    compare: async input => {
      input.signal?.throwIfAborted(); calls.compare++;
      await mkdir(input.outputDirectory, { recursive: true });
      const reference = { requestedTime: 0, decodedTime: 0, absolutePts: 0, delta: 0, evidenceId: 'source-comparison-frame', frame: 'frame.png', sha256: 'f'.repeat(64) };
      const rendered = { ...reference, evidenceId: 'render-comparison-frame' };
      const comparison = { reference: { sha256: options.badComparisonHash ? 'f'.repeat(64) : sourceHash }, render: { sha256: await fingerprint(input.render) },
        pairs: [{ time: 0, image: 'pair.png', reference, render: rendered }], contactSheet: { image: 'contact.png' } } as ReferenceComparison;
      return { directory: input.outputDirectory, comparison };
    },
    fingerprint,
  };
  const library = new MotionLibrary({ directory: join(directory, 'library') }), services: MotionLearningService[] = [];
  const make = () => { const service = new MotionLearningService({ directory: jobs, library, runner, dependencies }); services.push(service); return service; };
  const start = (service: MotionLearningService, maxCandidates = 1) => service.start({ path: sourcePath, projectId: 'synthetic-project', maxCandidates, fontFamilies: ['Arial'] });
  const ready = async (service: MotionLearningService, id: string, oldToken?: string) => {
    const value = await waitFor(service, id, job => ['complete', 'failed', 'cancelled'].includes(job.state) || job.state === 'awaiting-render' && job.renderTask?.token !== oldToken);
    assert.equal(value.state, 'awaiting-render', value.error ?? JSON.stringify(value.receipt)); assert.ok(value.renderTask); return value;
  };
  const render = async (job: MotionLearningJob, sameBytes = false) => {
    assert.ok(job.renderTask);
    await writeFile(job.renderTask.previewPath, JSON.stringify({ width: job.renderTask.plan.width, height: job.renderTask.plan.height, duration: job.renderTask.plan.duration,
      hasAudio: false, variant: sameBytes ? 0 : job.renderTask.variant, layers: sameBytes ? null : job.renderTask.plan.layers }));
  };
  const acknowledge = (service: MotionLearningService, job: MotionLearningJob) => {
    assert.ok(job.renderTask); return service.rendered({ id: job.id, projectId: job.projectId, sceneId: 10 + job.renderTask.variant, token: job.renderTask.token });
  };
  const finish = async (service: MotionLearningService, initial: MotionLearningJob) => {
    let job = await ready(service, initial.id);
    for (let variant = 0; variant < 2; variant++) {
      assert.equal(job.renderTask!.variant, variant); await render(job); await acknowledge(service, job);
      if (variant === 0) job = await ready(service, initial.id, job.renderTask!.token);
    }
    const complete = await waitFor(service, initial.id, job => ['complete', 'failed', 'cancelled'].includes(job.state));
    assert.equal(complete.state, 'complete', complete.error ?? 'Expected terminal complete'); await unlocked(jobs); return complete;
  };
  t.after(async () => {
    for (const service of services) await service.shutdown();
    const target = resolve(directory), parent = resolve(tmpdir()) + sep;
    assert.ok(target.startsWith(parent) && target.slice(parent.length).startsWith('motion-learning-test-'));
    await rm(target, { recursive: true, force: true });
  });
  return { directory, jobs, sourcePath, sourceHash, overview, library, calls, make, start, ready, render, acknowledge, finish };
}

test('whole-video discovery, dense authoring, two checked native exports and critic publish one persistent component', async t => {
  const data = await fixture(t), service = data.make(), initial = await data.start(service), final = await data.finish(service, initial);
  assert.equal(final.externalModelCalls, 3); assert.equal(final.modelCallBudget, 4);
  assert.equal(data.calls.overview.length, 1);
  assert.deepEqual(data.calls.inspect, [{ start: 440, end: 442 }], 'discovery reaches source times beyond the old 120 second recreation interval');
  assert.deepEqual([data.calls.decodes, data.calls.probes, data.calls.compare], [2, 2, 2]);
  assert.deepEqual(data.calls.model.map(request => basename(request.directory)), ['discovery', 'authoring', 'review']);
  assert.equal(final.receipt?.added.length, 1); assert.equal(final.receipt?.duplicates.length, 0); assert.equal(final.receipt?.skipped.length, 0);
  const entry = await data.library.read(final.receipt!.added[0]);
  assert.equal(entry.entry.humanReview, 'pending'); assert.equal(entry.entry.status, 'machine-reviewed-draft');
  assert.equal(entry.entry.provenance[0].sourceSha256, data.sourceHash);
  assert.deepEqual(entry.entry.provenance[0].range, { start: 440, end: 442 });
  assert.match(entry.skill, /native motion/);
  const receipt = JSON.parse(await readFile(join(final.outputDirectory, 'delivery.json'), 'utf8'));
  assert.deepEqual(receipt.added, final.receipt!.added);
});

test('rejected visual quality or a failed reusable-content check never installs a component', async t => {
  for (const review of [{ verdict: 'reject' }, { sourceMotionRetained: false }, { changedContentUsable: false }, { reusableParameters: false }]) {
    const data = await fixture(t, { review }), service = data.make(), initial = await data.start(service), final = await data.finish(service, initial);
    assert.deepEqual(final.receipt?.added, []); assert.equal(final.receipt?.skipped.length, 1);
    assert.match(final.receipt!.skipped[0].reason, /Visual review rejected/);
    assert.deepEqual(await data.library.list(), []); assert.equal(final.externalModelCalls, 3);
  }
});

test('a previously learned behavior with different wording and palette is linked as a duplicate', async t => {
  const data = await fixture(t, { component: nativeComponent('Fresh supplied words', '#ff7700') });
  const preview = join(data.directory, 'earlier-native-preview.mp4'); await writeFile(preview, 'Earlier synthetic review artifact');
  const original = await data.library.publish({ component: nativeComponent('Earlier label', '#117755'), previewPath: preview,
    provenance: { sourceSha256: 'b'.repeat(64), sourceName: 'Earlier source.mp4', range: { start: 10, end: 12 }, evidenceIds: ['dense-0', 'dense-1'] },
    review: { verdict: 'pass', summary: 'Synthetic pre-existing library fixture.', limitations: [], renderHashes: [await fingerprint(preview), 'c'.repeat(64)], continuousViewing: false } });
  const service = data.make(), initial = await data.start(service), final = await data.finish(service, initial);
  assert.deepEqual(final.receipt?.added, []); assert.deepEqual(final.receipt?.duplicates, [original.entry.id]);
  const entries = await data.library.list(); assert.equal(entries.length, 1); assert.equal(entries[0].provenance.length, 2);
});

test('cancelling a pending account runner stops late output without publication or another call', async t => {
  let announce!: () => void; const started = new Promise<void>(resolveStarted => { announce = resolveStarted; });
  const data = await fixture(t, { run: async request => { announce(); await new Promise<void>(resolveAbort => request.signal.addEventListener('abort', () => resolveAbort(), { once: true }));
    return { candidates: [], coverageNotes: [] }; } });
  const service = data.make(), initial = await data.start(service); await started;
  const final = await service.cancel(initial.id);
  assert.equal(final.state, 'cancelled'); assert.equal(final.renderTask, null); assert.equal(data.calls.model.length, 1);
  assert.deepEqual(await data.library.list(), []); await unlocked(data.jobs);
});

test('wrong-project and stale render tokens cannot advance or consume a review call', async t => {
  const data = await fixture(t), service = data.make(), initial = await data.start(service), first = await data.ready(service, initial.id);
  const token = first.renderTask!.token;
  await assert.rejects(service.rendered({ id: first.id, projectId: 'other-project', sceneId: 10, token }), /project-bound/);
  await assert.rejects(service.rendered({ id: first.id, projectId: first.projectId, sceneId: 10, token: randomUUID() }), /project-bound/);
  assert.equal(data.calls.decodes, 0); assert.equal(data.calls.model.length, 2);
  await data.render(first); await data.acknowledge(service, first);
  const second = await data.ready(service, initial.id, token);
  await assert.rejects(service.rendered({ id: second.id, projectId: second.projectId, sceneId: 10, token }), /project-bound/);
  assert.equal(data.calls.model.length, 2);
  await service.cancel(initial.id); assert.deepEqual(await data.library.list(), []);
});

test('concurrent acknowledgement of one render token runs one native-export check', async t => {
  const data = await fixture(t), service = data.make(), initial = await data.start(service), first = await data.ready(service, initial.id);
  await data.render(first);
  const responses = await Promise.allSettled([data.acknowledge(service, first), data.acknowledge(service, first)]);
  assert.equal(responses.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(responses.filter(result => result.status === 'rejected').length, 1);
  const second = await data.ready(service, initial.id, first.renderTask!.token);
  assert.equal(data.calls.decodes, 1);
  await data.render(second); await data.acknowledge(service, second);
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.receipt?.added.length, 1); assert.equal(data.calls.model.length, 3);
});

test('a different service instance cannot start while this directory owns an awaiting-render job', async t => {
  const data = await fixture(t), first = data.make(), initial = await data.start(first);
  await data.ready(first, initial.id); const second = data.make();
  await assert.rejects(data.start(second), /already running/);
  assert.equal(data.calls.model.length, 2);
  await first.cancel(initial.id); await unlocked(data.jobs);
  const next = await data.start(second); await data.ready(second, next.id);
  assert.equal(data.calls.model.length, 4); await second.cancel(next.id);
});

test('a persisted interrupted job is marked failed without rerunning account processing', async t => {
  const data = await fixture(t), service = data.make(), jobId = randomUUID(), outputDirectory = join(data.jobs, jobId), now = new Date().toISOString();
  await mkdir(outputDirectory, { recursive: true });
  const job: MotionLearningJob = { schemaVersion: 1, kind: 'editor-motion-learning', id: jobId, projectId: 'synthetic-project',
    state: 'discovering', message: 'Interrupted test fixture.', createdAt: now, updatedAt: now, ownerPid: process.pid,
    input: { path: data.sourcePath, projectId: 'synthetic-project', maxCandidates: 1, fontFamilies: ['Arial'] },
    outputDirectory, externalModelCalls: 1, modelCallBudget: 4, source: null, candidates: [], renderTask: null, receipt: null, error: null,
    coverage: [], currentIndex: 0, renders: [] };
  await writeFile(join(outputDirectory, 'job.json'), JSON.stringify(job));
  const restored = await service.status(jobId);
  assert.equal(restored.state, 'failed'); assert.match(restored.message, /will not rerun/); assert.equal(restored.renderTask, null);
  assert.equal(data.calls.model.length, 0); assert.equal(data.calls.overview.length, 0);
  const persisted = JSON.parse(await readFile(join(outputDirectory, 'job.json'), 'utf8'));
  assert.equal(persisted.state, 'failed');
});

test('invalid candidate limits and unavailable account stop before any model call', async t => {
  const data = await fixture(t, { unavailable: true }), service = data.make();
  for (const maxCandidates of [0, 4, -1, 1.5]) await assert.rejects(data.start(service, maxCandidates));
  const initial = await data.start(service), final = await waitFor(service, initial.id, job => job.state === 'failed');
  assert.equal(final.externalModelCalls, 0); assert.equal(data.calls.model.length, 0); assert.equal(data.calls.overview.length, 0);
});

test('no discovered reusable motion finishes after one account call without a render task', async t => {
  const data = await fixture(t, { candidates: [] }), service = data.make(), initial = await data.start(service, 3);
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.state, 'complete', final.error ?? 'Expected empty discovery completion');
  assert.equal(final.externalModelCalls, 1); assert.equal(final.modelCallBudget, 10);
  assert.equal(final.renderTask, null); assert.deepEqual(final.receipt?.added, []); assert.equal(data.calls.inspect.length, 0);
});

test('discovery citations must address actual overview evidence before dense authoring', async t => {
  const data = await fixture(t, { candidates: [{ id: 'invented', name: 'Invalid citation', start: 440, end: 442, evidenceIds: ['not-attached'], reason: 'Synthetic invalid discovery.' }] });
  const service = data.make(), initial = await data.start(service), final = await waitFor(service, initial.id, job => job.state === 'failed');
  assert.match(final.error!, /attached source range/); assert.equal(final.externalModelCalls, 1); assert.equal(data.calls.inspect.length, 0);
  assert.deepEqual(await data.library.list(), []);
});

test('wrong native export geometry, duration or audio is rejected before critic or library publication', async t => {
  for (const badMetadata of [{ width: 638 }, { height: 358 }, { duration: 2.1 }, { hasAudio: true }]) {
    const data = await fixture(t, { badMetadata }), service = data.make(), initial = await data.start(service), first = await data.ready(service, initial.id);
    await data.render(first); await data.acknowledge(service, first);
    const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
    assert.equal(final.state, 'complete'); assert.equal(final.receipt?.skipped.length, 1);
    assert.match(final.receipt!.skipped[0].reason, /canvas, duration or silent-track/);
    assert.equal(data.calls.model.length, 2); assert.equal(data.calls.compare, 0); assert.deepEqual(await data.library.list(), []);
  }
});

test('identical actual export hashes fail the changed-content variant gate before critic', async t => {
  const data = await fixture(t), service = data.make(), initial = await data.start(service); let job = await data.ready(service, initial.id);
  for (let variant = 0; variant < 2; variant++) { await data.render(job, true); await data.acknowledge(service, job); if (!variant) job = await data.ready(service, initial.id, job.renderTask!.token); }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.receipt?.skipped.length, 1); assert.match(final.receipt!.skipped[0].reason, /distinct actual exports/);
  assert.equal(data.calls.model.length, 2); assert.deepEqual(await data.library.list(), []);
});

test('comparison source fingerprints bind the critique to the exact retained source', async t => {
  const data = await fixture(t, { badComparisonHash: true }), service = data.make(), initial = await data.start(service), final = await data.finish(service, initial);
  assert.equal(final.receipt?.skipped.length, 1); assert.match(final.receipt!.skipped[0].reason, /Comparison fingerprints/);
  assert.equal(data.calls.model.length, 2); assert.deepEqual(await data.library.list(), []);
});

test('replacing the source after authoring prevents export review and automatic publication', async t => {
  const data = await fixture(t), service = data.make(), initial = await data.start(service), first = await data.ready(service, initial.id);
  await data.render(first); await writeFile(data.sourcePath, 'Changed source fixture'); await data.acknowledge(service, first);
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.match(final.receipt!.skipped[0].reason, /source changed/i); assert.equal(data.calls.model.length, 2); assert.equal(data.calls.decodes, 0);
  assert.deepEqual(await data.library.list(), []);
});

test('three accepted first-pass candidates use seven calls inside the ten-call correction budget', async t => {
  const candidates = [120, 300, 440].map((start, index) => ({ id: `candidate-${index}`, name: `Synthetic pattern ${index + 1}`,
    start, end: start + 2, evidenceIds: [`overview-${index + 1}`], reason: 'Synthetic separate source interval.' }));
  const data = await fixture(t, { candidates }), service = data.make(), initial = await data.start(service, 3);
  let previousToken: string | undefined;
  for (let candidate = 0; candidate < 3; candidate++) {
    for (let variant = 0; variant < 2; variant++) {
      const job = await data.ready(service, initial.id, previousToken);
      assert.equal(job.currentIndex, candidate); assert.equal(job.renderTask!.variant, variant);
      await data.render(job); await data.acknowledge(service, job); previousToken = job.renderTask!.token;
    }
  }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.state, 'complete', final.error ?? 'Expected bounded multi-candidate completion');
  assert.equal(final.modelCallBudget, 10); assert.equal(final.externalModelCalls, 7); assert.equal(data.calls.model.length, 7);
  assert.deepEqual([data.calls.decodes, data.calls.probes, data.calls.compare], [6, 6, 6]);
  assert.equal(final.receipt?.added.length, 1); assert.equal(final.receipt?.duplicates.length, 2);
  assert.equal((await data.library.list())[0].provenance.length, 3);
});

test('frozen identical native keys are skipped before mounting even when base properties differ', async t => {
  const value = nativeComponent();
  value.plan.layers[0].keyframes[1] = { ...value.plan.layers[0].keyframes[0], time: .5 };
  const data = await fixture(t, { component: value }), service = data.make(), initial = await data.start(service);
  const final = await waitFor(service, initial.id, job => ['complete', 'failed', 'awaiting-render'].includes(job.state));
  assert.equal(final.state, 'complete', 'A time-zero key overrides the static base; identical effective keys have no observed motion');
  assert.equal(final.receipt?.skipped.length, 1); assert.match(final.receipt!.skipped[0].reason, /observed native motion/);
  assert.equal(final.externalModelCalls, 2); assert.equal(data.calls.decodes, 0); assert.deepEqual(await data.library.list(), []);
});

test('distinct native layer start times support a progressive text reveal without property keyframes', async t => {
  const value = nativeComponent();
  value.plan.layers[0].keyframes = [];
  value.plan.layers.push({ ...structuredClone(value.plan.layers[0]), id: 'second-label', name: 'Second revealed label',
    text: 'The next thought', start: .5, y: 220, keyframes: [] });
  const data = await fixture(t, { component: value }), service = data.make(), initial = await data.start(service);
  const job = await data.ready(service, initial.id);
  assert.equal(job.renderTask!.variant, 0);
  assert.deepEqual(job.renderTask!.plan.layers.map(layer => ({ start: layer.start, end: layer.end, keys: layer.keyframes.length })),
    [{ start: 0, end: 2, keys: 0 }, { start: .5, end: 2, keys: 0 }]);
  assert.equal(data.calls.model.length, 2, 'staged native visibility is eligible for the actual-render quality gate');
  assert.deepEqual(await data.library.list(), [], 'reaching a render task does not install an unreviewed component');
  await service.cancel(initial.id);
});

test('changing source bytes during the critic call prevents the subsequent automatic publish', async t => {
  let sourceToChange = '';
  const data = await fixture(t, { run: async request => {
    if (basename(request.directory) === 'discovery') return { candidates: [{ id: 'late-label', name: 'Late label', start: 440, end: 442,
      evidenceIds: ['overview-3'], reason: 'Synthetic native motion.' }], coverageNotes: [] };
    if (basename(request.directory) === 'authoring') return nativeComponent();
    await writeFile(sourceToChange, 'The reference changed while the synthetic critic was running'); return passedReview;
  } });
  sourceToChange = data.sourcePath;
  const service = data.make(), initial = await data.start(service), final = await data.finish(service, initial);
  assert.equal(final.receipt?.skipped.length, 1); assert.match(final.receipt!.skipped[0].reason, /source changed/i);
  assert.equal(final.externalModelCalls, 3); assert.deepEqual(await data.library.list(), []);
});

test('a cached overview frame omitted from the attached contact-sheet order cannot support discovery', async t => {
  const data = await fixture(t);
  data.overview.inspections[0].contactSheetOrder = data.overview.inspections[0].contactSheetOrder!.filter(id => id !== 'overview-3');
  const service = data.make(), initial = await data.start(service), final = await waitFor(service, initial.id, job => job.state === 'failed');
  assert.match(final.error!, /attached source range/); assert.equal(final.externalModelCalls, 1); assert.equal(data.calls.inspect.length, 0);
});

test('a proposed correction receives two fresh native render tasks before the exact revised component is published', async t => {
  const corrected = nativeComponent();
  corrected.plan.layers[0].x = 70;
  corrected.plan.layers[0].keyframes = corrected.plan.layers[0].keyframes.map(point => ({ ...point, x: 70 }));
  const data = await fixture(t, { reviewSequence: [
    { ...passedReview, verdict: 'reject', summary: 'Synthetic correction: move the label to the observed position.', sourceMotionRetained: false, correctedComponent: corrected },
    passedReview,
  ] }), service = data.make(), initial = await data.start(service);
  let previousToken: string | undefined, initialToken = '';
  const retainedExports: string[] = [];
  for (let index = 0; index < 4; index++) {
    const job = await data.ready(service, initial.id, previousToken), task = job.renderTask!;
    assert.equal(task.variant, index % 2);
    if (index === 0) initialToken = task.token;
    if (index === 2) {
      assert.equal(job.candidates[0].revision, 1);
      assert.equal(task.plan.layers[0].x, 70);
      await assert.rejects(service.rendered({ id: job.id, projectId: job.projectId, sceneId: 10, token: initialToken }), /project-bound/);
      assert.deepEqual(await data.library.list(), [], 'a proposed but unrendered correction is not installed');
    }
    retainedExports.push(task.previewPath);
    await data.render(job); await data.acknowledge(service, job); previousToken = task.token;
  }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.state, 'complete', final.error ?? 'Expected corrected completion');
  assert.equal(final.externalModelCalls, 4); assert.equal(final.modelCallBudget, 4);
  assert.equal(final.receipt?.added.length, 1); assert.equal(final.receipt?.skipped.length, 0);
  assert.deepEqual([data.calls.decodes, data.calls.probes, data.calls.compare], [4, 4, 4]);
  assert.equal(new Set(retainedExports).size, 4, 'both revisions preserve separate exported artifacts');
  for (const path of retainedExports) assert.ok((await stat(path)).isFile());
  const published = await data.library.read(final.receipt!.added[0]);
  assert.equal(published.component.plan.layers[0].x, 70);
  assert.deepEqual(published.entry.review.renderHashes, final.renders.map(render => render.sha256));
});

test('a rejected corrected revision stops after four calls and never proposes or mounts a third revision', async t => {
  const corrected = nativeComponent(); corrected.plan.layers[0].fontSize = 36;
  const data = await fixture(t, { reviewSequence: [
    { ...passedReview, verdict: 'reject', sourceMotionRetained: false, correctedComponent: corrected },
    { ...passedReview, verdict: 'reject', summary: 'Synthetic final rejection after the bounded correction.', changedContentUsable: false },
  ] }), service = data.make(), initial = await data.start(service);
  let previousToken: string | undefined;
  for (let index = 0; index < 4; index++) {
    const job = await data.ready(service, initial.id, previousToken);
    assert.equal(job.renderTask!.variant, index % 2);
    await data.render(job); await data.acknowledge(service, job); previousToken = job.renderTask!.token;
  }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.state, 'complete'); assert.equal(final.renderTask, null);
  assert.equal(final.externalModelCalls, 4); assert.equal(data.calls.model.length, 4);
  assert.equal(final.receipt?.added.length, 0); assert.equal(final.receipt?.skipped.length, 1);
  assert.match(final.receipt!.skipped[0].reason, /Visual review rejected/);
  assert.deepEqual(await data.library.list(), []);
});

test('all three bounded candidates can each correct once without exceeding ten account calls', async t => {
  const candidates = [120, 300, 440].map((start, index) => ({ id: `candidate-${index}`, name: `Corrected synthetic pattern ${index + 1}`,
    start, end: start + 2, evidenceIds: [`overview-${index + 1}`], reason: 'Synthetic separate interval.' }));
  const corrected = nativeComponent();
  corrected.plan.layers[0].fontSize = 36;
  const data = await fixture(t, { candidates, reviewSequence: Array.from({ length: 3 }, () => [
    { ...passedReview, verdict: 'reject', sourceMotionRetained: false, correctedComponent: corrected }, passedReview,
  ]).flat() }), service = data.make(), initial = await data.start(service, 3);
  let previousToken: string | undefined;
  for (let index = 0; index < 12; index++) {
    const job = await data.ready(service, initial.id, previousToken);
    assert.equal(job.currentIndex, Math.floor(index / 4)); assert.equal(job.renderTask!.variant, index % 2);
    await data.render(job); await data.acknowledge(service, job); previousToken = job.renderTask!.token;
  }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.state, 'complete', final.error ?? 'Expected all bounded corrections to finish');
  assert.equal(final.modelCallBudget, 10); assert.equal(final.externalModelCalls, 10); assert.equal(data.calls.model.length, 10);
  assert.deepEqual([data.calls.decodes, data.calls.probes, data.calls.compare], [12, 12, 12]);
  assert.equal(final.receipt?.added.length, 1); assert.equal(final.receipt?.duplicates.length, 2);
  assert.equal(final.receipt?.skipped.length, 0); assert.equal((await data.library.list())[0].provenance.length, 3);
});

test('source mutation after a correction proposal prevents its fresh exports from reaching final critique', async t => {
  const corrected = nativeComponent(); corrected.plan.layers[0].fontSize = 36;
  const data = await fixture(t, { reviewSequence: [
    { ...passedReview, verdict: 'reject', sourceMotionRetained: false, correctedComponent: corrected }, passedReview,
  ] }), service = data.make(), initial = await data.start(service);
  let previousToken: string | undefined;
  for (let index = 0; index < 2; index++) {
    const job = await data.ready(service, initial.id, previousToken);
    await data.render(job); await data.acknowledge(service, job); previousToken = job.renderTask!.token;
  }
  const revised = await data.ready(service, initial.id, previousToken);
  assert.equal(revised.candidates[0].revision, 1);
  await data.render(revised); await writeFile(data.sourcePath, 'Reference changed after the correction was proposed');
  await data.acknowledge(service, revised);
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.receipt?.skipped.length, 1); assert.match(final.receipt!.skipped[0].reason, /source changed/i);
  assert.equal(final.externalModelCalls, 3); assert.equal(data.calls.decodes, 2);
  assert.deepEqual(await data.library.list(), []);
});

test('a changed corrected export cannot be substituted before the final critique and publication', async t => {
  const corrected = nativeComponent(); corrected.plan.layers[0].fontSize = 36;
  const data = await fixture(t, { reviewSequence: [
    { ...passedReview, verdict: 'reject', sourceMotionRetained: false, correctedComponent: corrected }, passedReview,
  ] }), service = data.make(), initial = await data.start(service);
  let previousToken: string | undefined, revisedPreview = '';
  for (let index = 0; index < 4; index++) {
    const job = await data.ready(service, initial.id, previousToken);
    if (index === 2) revisedPreview = job.renderTask!.previewPath;
    await data.render(job);
    if (index === 3) await writeFile(revisedPreview, 'Corrected render was changed after its checked acknowledgement');
    await data.acknowledge(service, job); previousToken = job.renderTask!.token;
  }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.receipt?.skipped.length, 1); assert.match(final.receipt!.skipped[0].reason, /Comparison fingerprints/);
  assert.equal(final.externalModelCalls, 3); assert.deepEqual(await data.library.list(), []);
});

test('a correction may cite genuine source-side comparison frames and still must render twice before publication', async t => {
  const corrected = nativeComponent();
  corrected.plan.layers[0].fontSize = 36;
  corrected.plan.layers[0].evidenceIds.push('source-comparison-frame');
  const data = await fixture(t, { reviewSequence: [
    { ...passedReview, verdict: 'reject', sourceMotionRetained: false, correctedComponent: corrected }, passedReview,
  ] }), service = data.make(), initial = await data.start(service);
  let previousToken: string | undefined;
  for (let index = 0; index < 4; index++) {
    const job = await data.ready(service, initial.id, previousToken);
    assert.equal(job.renderTask!.variant, index % 2);
    if (index === 2) {
      assert.equal(job.candidates[0].revision, 1);
      assert.ok(job.renderTask!.plan.layers[0].evidenceIds.includes('source-comparison-frame'));
      assert.deepEqual(await data.library.list(), [], 'a source-cited correction still needs its own exact-export review');
    }
    await data.render(job); await data.acknowledge(service, job); previousToken = job.renderTask!.token;
  }
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.receipt?.added.length, 1); assert.equal(final.receipt?.skipped.length, 0);
  assert.equal(final.externalModelCalls, 4); assert.equal(data.calls.decodes, 4);
  const published = await data.library.read(final.receipt!.added[0]);
  assert.ok(published.component.plan.layers[0].evidenceIds.includes('source-comparison-frame'));
  assert.ok(published.entry.provenance[0].evidenceIds.includes('source-comparison-frame'));
});

test('a correction cannot misattribute render-side comparison frames as source evidence', async t => {
  const corrected = nativeComponent();
  corrected.plan.layers[0].fontSize = 36;
  corrected.plan.layers[0].evidenceIds.push('render-comparison-frame');
  const data = await fixture(t, { reviewSequence: [
    { ...passedReview, verdict: 'reject', sourceMotionRetained: false, correctedComponent: corrected }, passedReview,
  ] }), service = data.make(), initial = await data.start(service), final = await data.finish(service, initial);
  assert.equal(final.receipt?.added.length, 0); assert.equal(final.receipt?.skipped.length, 1);
  assert.match(final.receipt!.skipped[0].reason, /unshown evidence/);
  assert.equal(final.candidates[0].revision, 0); assert.equal(final.externalModelCalls, 3);
  assert.equal(data.calls.decodes, 2); assert.equal(final.renderTask, null); assert.deepEqual(await data.library.list(), []);
});

test('editing the saved component after its native task is issued cannot change the reviewed or published artifact', async t => {
  const data = await fixture(t), service = data.make(), initial = await data.start(service), first = await data.ready(service, initial.id);
  await data.render(first);
  const path = join(first.outputDirectory, 'candidate-late-label', 'component.json');
  const changed = JSON.parse(await readFile(path, 'utf8'));
  changed.description = 'Tampered component after native rendering';
  await writeFile(path, JSON.stringify(changed, null, 2));
  await data.acknowledge(service, first);
  const final = await waitFor(service, initial.id, job => ['complete', 'failed'].includes(job.state));
  assert.equal(final.receipt?.added.length, 0); assert.equal(final.receipt?.skipped.length, 1);
  assert.match(final.receipt!.skipped[0].reason, /component.*(?:changed|hash|fingerprint)|artifact.*changed/i);
  assert.equal(final.externalModelCalls, 2); assert.equal(final.renderTask, null);
  assert.deepEqual(await data.library.list(), []);
});
