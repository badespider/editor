import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { compareReferenceVideos } from '../src/reference-evidence.ts';
import { runMedia } from '../src/delivery.ts';

test('comparison duration budgets remain explicit, finite and bounded before any media work', async () => {
  for (const maxDuration of [0, -1, 7200.001, Infinity, NaN]) await assert.rejects(compareReferenceVideos({
    reference: 'not-opened.mp4', render: 'not-opened.mp4', times: [0], outputDirectory: 'not-created', maxDuration,
  }), /maxDuration/);
});

test('real comparisons explicitly permit long reference and render sources while cached sessions never enlarge the default budget', async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'reference-comparison-budget-')));
  t.after(async () => {
    const target = resolve(directory), parent = resolve(tmpdir()) + sep;
    assert.ok(target.startsWith(parent) && target.slice(parent.length).startsWith('reference-comparison-budget-'));
    await rm(target, { recursive: true, force: true });
  });
  const long = join(directory, 'long.mkv'), short = join(directory, 'short.mkv'), cacheDir = join(directory, 'cache');
  // Small, generated static test media: the long source has 1,201 actual
  // presentation seconds, without depending on a user's footage or any model.
  for (const [path, duration] of [[long, 1201], [short, 1]] as const) await runMedia([
    '-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', `color=c=white:s=16x16:r=1:d=${duration}`,
    '-c:v', 'ffv1', '-threads', '1', path,
  ]);
  for (const [index, reference, render] of [[0, long, short], [1, short, long]] as const) {
    const explicit = await compareReferenceVideos({ reference, render, times: [0], maxDuration: 1202, cacheDir,
      outputDirectory: join(directory, `explicit-${index}`) });
    assert.equal(explicit.comparison.pairs.length, 1);
    assert.equal(explicit.comparison.externalModelCalls, 0);
    assert.ok(Math.max(explicit.comparison.reference.duration, explicit.comparison.render.duration) > 1200);
    const defaultOutput = join(directory, `default-${index}`);
    await assert.rejects(compareReferenceVideos({ reference, render, times: [0], cacheDir, outputDirectory: defaultOutput }), /exceeds maxDuration/);
    await assert.rejects(stat(defaultOutput), (error: NodeJS.ErrnoException) => error.code === 'ENOENT');
  }
});
