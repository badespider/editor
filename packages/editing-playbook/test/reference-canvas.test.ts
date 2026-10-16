import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { runMedia } from '../src/delivery.ts';
import { probe } from '../src/preview.ts';
import { preflightRecreationCanvas, validateRecreationCanvas } from '../src/reference-canvas.ts';

test('the current native canvas and AVC budgets accept normal 4K and reject impossible exact renders', () => {
  assert.deepEqual(validateRecreationCanvas({ width: 3840, height: 2160 }), { width: 3840, height: 2160, rotation: 0 });
  assert.deepEqual(validateRecreationCanvas({ width: 2160, height: 3840 }), { width: 2160, height: 3840, rotation: 0 });
  assert.deepEqual(validateRecreationCanvas({ width: 4096, height: 2024 }), { width: 4096, height: 2024, rotation: 0 });
  for (const size of [{ width: 853, height: 480 }, { width: 854, height: 481 }]) {
    assert.throws(() => validateRecreationCanvas(size), /even.*AVC/);
  }
  for (const size of [{ width: 4098, height: 100 }, { width: 100, height: 4098 }, { width: 4096, height: 2026 }]) {
    assert.throws(() => validateRecreationCanvas(size), /4096.*8,294,400/);
  }
  for (const width of [NaN, Infinity, 0, -2, 1, 2.5]) assert.throws(() => validateRecreationCanvas({ width, height: 480 }));
});

test('both numeric display matrices and legacy string rotations must represent an unrotated canvas', () => {
  const size = { width: 64, height: 48 };
  assert.deepEqual(validateRecreationCanvas(size, [0, '0', -360, '360']), { ...size, rotation: 0 });
  for (const degrees of [90, -90, 180, 270, '90', '-90', '0.5']) {
    assert.throws(() => validateRecreationCanvas(size, [0, degrees]), /Normalize the rotated source before recreation/);
  }
  for (const degrees of [NaN, Infinity, '', 'unknown', 'Infinity']) assert.throws(() => validateRecreationCanvas(size, [degrees]));
});

test('invalid geometry and cancellation fail before a source is opened', async () => {
  await assert.rejects(preflightRecreationCanvas({ path: 'missing-source.mp4', width: 853, height: 480 }), /even.*AVC/);
  await assert.rejects(preflightRecreationCanvas({ path: 'missing-source.mp4', width: 8192, height: 480 }), /4096/);
  await assert.rejects(preflightRecreationCanvas({ path: 'missing-source.mp4', width: 64, height: 48 },
    { signal: AbortSignal.abort(new Error('Canvas preflight cancelled.')) }), /Canvas preflight cancelled/);
});

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'reference-canvas-test-'));
  t.after(async () => {
    const checked = resolve(directory), parent = resolve(tmpdir()) + sep;
    assert.ok(checked.startsWith(parent) && checked.slice(parent.length).startsWith('reference-canvas-test-'));
    await rm(checked, { recursive: true, force: true });
  });
  return directory;
}

test('real odd-width video is rejected before its AVC export would change the canvas', async t => {
  const directory = await fixture(t), path = join(directory, 'odd.mkv');
  await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc=size=853x480:rate=5:duration=0.4',
    '-c:v', 'ffv1', '-pix_fmt', 'bgr0', '-threads', '1', path]);
  const source = await probe(path);
  assert.equal(source.width, 853); assert.equal(source.height, 480);
  await assert.rejects(preflightRecreationCanvas({ path, width: source.width, height: source.height }), /Normalize odd source dimensions/);
});

test('real MP4 display rotation is rejected while its original unrotated stream passes', async t => {
  const directory = await fixture(t), path = join(directory, 'normal.mp4'), rotated = join(directory, 'rotated.mp4');
  await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=blue:size=64x48:rate=5:duration=0.4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-threads', '1', path]);
  await runMedia(['-v', 'error', '-nostdin', '-n', '-display_rotation', '90', '-i', path, '-map', '0:v:0', '-c', 'copy', rotated]);
  assert.deepEqual(await preflightRecreationCanvas({ path, width: 64, height: 48 }), { width: 64, height: 48, rotation: 0 });
  const metadata = await probe(rotated);
  assert.equal(metadata.width, 64); assert.equal(metadata.height, 48, 'encoded dimensions alone cannot identify the rotated display');
  await assert.rejects(preflightRecreationCanvas({ path: rotated, width: 64, height: 48 }), /Normalize the rotated source before recreation/);
  await assert.rejects(preflightRecreationCanvas({ path, width: 66, height: 48 }), /canvas dimensions changed/);
});

test('real Matroska legacy ROTATE tags are checked despite container capitalization', async t => {
  const directory = await fixture(t), path = join(directory, 'legacy.mkv');
  await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=blue:size=64x48:rate=5:duration=0.4',
    '-c:v', 'ffv1', '-metadata:s:v:0', 'rotate=90', '-threads', '1', path]);
  await assert.rejects(preflightRecreationCanvas({ path, width: 64, height: 48 }), /Normalize the rotated source before recreation/);
});
