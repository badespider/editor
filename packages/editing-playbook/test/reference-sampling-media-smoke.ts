// Opt-in local media regression. No desktop/model/network or user media.
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMedia } from '../src/delivery.ts';
import { inspectRecreationScene, inspectRecreationSource } from '../src/reference-sampling.ts';

const directory = await mkdtemp(join(tmpdir(), 'editor-reference-sampling-test-')), source = join(directory, 'cut-origin.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=10:d=1',
  '-f', 'lavfi', '-i', 'color=red:s=320x180:r=10:d=1', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]',
  '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-output_ts_offset', '5', source]);
const cacheDir = join(directory, 'cache');
const result = await inspectRecreationSource(source, { cacheDir, start: 0, end: 2, maxFrames: 24 });
assert.equal(result.source.startTime, 5);
assert.equal(result.inventory.availablePacketTimes, 20);
assert.equal(result.candidates.length, 1);
assert.equal(result.candidates[0].time, 1);
assert.ok(result.candidates[0].score > 8 && result.candidates[0].sampled);
assert.equal(result.candidates[0].verification, 'unreviewed-change-hint');
assert.ok(result.frames.some(frame => Math.abs(frame.decodedTime - .9) < 1e-6));
assert.ok(result.frames.some(frame => Math.abs(frame.decodedTime - 1.1) < 1e-6));
assert.ok(result.frames.every(frame => frame.requestedTime <= frame.decodedTime + 1e-5 && frame.decodedTime < 2));
assert.ok(result.contactSheets.length <= 12);
assert.ok(result.scenes.every(scene => scene.semanticType === 'unknown'));
assert.deepEqual(JSON.parse(await readFile(join(result.outputDirectory, 'manifest.json'), 'utf8')), result);
const refined = await inspectRecreationScene(source, { cacheDir, sessionId: result.sessionId, start: .8, end: 1.3, maxFrames: 12, native: true });
assert.equal(refined.frames.length, 5); assert.equal(refined.coverage.allInventoriedPresentationTimestampsRequested, true);
assert.ok(refined.frames.every(frame => frame.native));
assert.ok(Math.abs(refined.coverage.largestDecodedGap - .1) < 1e-6);
await assert.rejects(inspectRecreationScene(source, { cacheDir, sessionId: result.sessionId, start: 0, end: 2.1 }), /does not match/);
const bounded = await inspectRecreationScene(source, { cacheDir, sessionId: result.sessionId, start: 1.8, end: 3, endPolicy: 'source-end' });
assert.deepEqual(bounded.requestedRange, { start: 1.8, end: 3 }); assert.deepEqual(bounded.range, { start: 1.8, end: 2 });
assert.ok(Math.abs(bounded.frames.at(-1)!.decodedTime - 1.9) < 1e-6);
await assert.rejects(inspectRecreationScene(source, { cacheDir, sessionId: result.sessionId, start: 2, end: 3, endPolicy: 'source-end' }), /does not match/);
const single = join(directory, 'single.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=30', '-frames:v', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', single]);
const tiny = await inspectRecreationSource(single, { cacheDir, start: 0, end: .033333, maxFrames: 24 });
assert.equal(tiny.frames.length, 1); assert.equal(tiny.frames[0].decodedTime, 0);
assert.equal(tiny.inventory.lastTime, 0);
console.log(JSON.stringify({ directory, status: 'passed', denseManifest: join(result.outputDirectory, 'manifest.json'), selectedManifest: join(refined.outputDirectory, 'manifest.json'),
  checks: ['native packet origin', '10 fps cut hint', 'before/after cut neighbors', 'actual decoded PTS', 'pipeline contact sheets',
    'semantic labels remain unknown', 'persistent manifest', 'selected native frames', 'complete inventoried short-scene coverage', 'strict source bounds', 'explicit source-end policy records requested and actual range', 'single-frame no-end-clamping'], externalModelCalls: 0 }));
