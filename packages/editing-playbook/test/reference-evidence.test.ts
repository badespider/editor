import assert from 'node:assert/strict';
import { mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compareReferenceVideos, escapeReferenceHtml, mapReferenceTimes, prepareReferenceStudy,
  referenceComparisonHtml, referencePanelGeometry } from '../src/reference-evidence.ts';
import type { ReferenceComparison } from '../src/reference-evidence.ts';

test('comparison timeline applies each source start once with strict source bounds', () => {
  assert.deepEqual(mapReferenceTimes([0, .13, 1.72], { duration: 3, start: .2 }, { duration: 4, start: .4 }), [
    { time: 0, referenceTime: .2, renderTime: .4 },
    { time: .13, referenceTime: .33, renderTime: .53 },
    { time: 1.72, referenceTime: 1.92, renderTime: 2.12 },
  ]);
  assert.deepEqual(mapReferenceTimes([0], { duration: 1 }, { duration: 1 }), [{ time: 0, referenceTime: 0, renderTime: 0 }]);
  for (const times of [[], [-1], [Number.NaN], [Infinity], [0, 0], [1, .5], Array.from({ length: 25 }, (_, index) => index / 100)]) {
    assert.throws(() => mapReferenceTimes(times, { duration: 10 }, { duration: 10 }));
  }
  assert.throws(() => mapReferenceTimes([1], { duration: 2, start: 1 }, { duration: 5 }), /no clamping/);
  assert.throws(() => mapReferenceTimes([1], { duration: 5 }, { duration: 2, start: 1 }), /no clamping/);
  assert.throws(() => mapReferenceTimes([0], { duration: 2, start: -1 }, { duration: 5 }));
  assert.throws(() => mapReferenceTimes([0], { duration: 0 }, { duration: 5 }));
});

test('landscape and portrait comparisons contain independently with explicit whole pixel rounding', () => {
  assert.deepEqual(referencePanelGeometry(1920, 1080), { sourceWidth: 1920, sourceHeight: 1080, width: 640, height: 360,
    fittedWidth: 640, fittedHeight: 360, left: 0, top: 0, fit: 'contain', dimensionRounding: 'floor to whole display pixels' });
  assert.deepEqual(referencePanelGeometry(1080, 1920), { sourceWidth: 1080, sourceHeight: 1920, width: 640, height: 360,
    fittedWidth: 202, fittedHeight: 360, left: 219, top: 0, fit: 'contain', dimensionRounding: 'floor to whole display pixels' });
  assert.equal(referencePanelGeometry(1000, 1000).left, 140);
  for (const dimensions of [[0, 1], [1, 0], [Infinity, 1], [1.5, 1], [32769, 1]]) {
    assert.throws(() => referencePanelGeometry(dimensions[0], dimensions[1]));
  }
});

test('portable comparison viewer escapes source data and uses explicit decoded time labels', () => {
  assert.equal(escapeReferenceHtml('<a x="&\'">'), '&lt;a x=&quot;&amp;&#39;&quot;&gt;');
  const comparison = {
    reference: { name: '<img src=x onerror="evil()">.mp4', sha256: 'a'.repeat(64) },
    render: { name: '</title><script>evil()</script>.mp4', sha256: 'b'.repeat(64) },
    manifest: 'comparison.json', contactSheet: { image: 'contact-sheet.png' },
    pairs: [{ time: .13, image: 'pairs/pair-000.png', reference: { requestedTime: .33, decodedTime: .4, frame: 'frames/reference-000.png' }, render: { requestedTime: .53, decodedTime: .5416666667, frame: 'frames/render-000.png' } }],
  } as ReferenceComparison;
  const html = referenceComparisonHtml(comparison);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;evil()&quot;&gt;.mp4'));
  assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;'));
  assert.ok(!html.includes('<script>') && !html.includes('<img src=x'));
  assert.ok(html.includes('0.330000 s → decoded 0.400000 s'));
  assert.ok(html.includes('first decoded frame at or after'));
  assert.ok(html.includes('src="pairs/pair-000.png"'));
  assert.ok(html.includes('href="frames/reference-000.png"') && html.includes('href="frames/render-000.png"'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes('https:') && !html.includes('file:'));
});

test('reject remote URLs, shares, arbitrary documents, invalid times and cancellation before frame work', async () => {
  for (const path of ['https://example.com/a.mp4', 'file:///tmp/a.mp4', 'ftp://example.com/a.mp4', '\\\\server\\a.mp4', '//server/a.mp4']) {
    await assert.rejects(prepareReferenceStudy(path), /regular local video/);
  }
  await assert.rejects(compareReferenceVideos({ reference: 'https://example.com/a.mp4', render: 'unused.mp4', times: [0], outputDirectory: 'unused-reference-output' }), /regular local video/);
  await assert.rejects(prepareReferenceStudy('unused.mp4', { times: [1, 0] }), /strictly increasing/);
  const cancelled = AbortSignal.abort(new Error('User cancelled inspection.'));
  await assert.rejects(prepareReferenceStudy('unused.mp4', { signal: cancelled }), /cancelled/);
  await assert.rejects(compareReferenceVideos({ reference: 'unused.mp4', render: 'unused.mp4', times: [0], outputDirectory: 'unused-reference-output', signal: cancelled }), /cancelled/);
  const directory = await mkdtemp(join(tmpdir(), 'reference-container-test-')), path = join(directory, 'playlist.mp4');
  try {
    await writeFile(path, '#EXTM3U\nhttps://example.com/private-media.ts\n');
    await assert.rejects(prepareReferenceStudy(path), /Unsupported local video container/);
    await assert.rejects(prepareReferenceStudy(directory), /regular local video/);
  } finally { await unlink(path); await rmdir(directory); }
});
