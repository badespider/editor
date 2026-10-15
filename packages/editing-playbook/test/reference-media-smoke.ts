// Opt-in FFmpeg regression. All videos are authored synthetic local fixtures.
// No desktop, model, network, user media or subjective review is involved.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runMedia } from '../src/delivery.ts';
import { fingerprint } from '../src/preview.ts';
import { compareReferenceVideos, prepareReferenceStudy } from '../src/reference-evidence.ts';

const directory = await mkdtemp(join(tmpdir(), 'editor-reference-test-'));
const reference = join(directory, 'reference-10fps.mp4'), render = join(directory, 'render-24fps.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=10:d=3',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-output_ts_offset', '5', reference]);
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=24:d=4',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-output_ts_offset', '9', render]);
const cacheDir = join(directory, 'evidence');
const prepared = await prepareReferenceStudy(reference, { cacheDir, title: 'Synthetic reference study', times: [.13, 1.11] });
assert.equal(prepared.study.reference.sha256, await fingerprint(reference));
assert.equal(prepared.study.reference.name, 'reference-10fps.mp4');
assert.deepEqual(prepared.study.beats, []);
assert.equal(prepared.evidence.externalModelCalls, 0);
assert.equal(prepared.evidence.overview.artifacts.length, 12);
assert.equal(prepared.evidence.inspection!.artifacts.length, 2);
assert.ok(Math.abs(prepared.evidence.inspection!.artifacts[0].start - .2) < 1e-6);
const times = [0, .13, .91, 1.72], outputDirectory = join(directory, 'comparison');
const result = await compareReferenceVideos({ reference, render, times, referenceStart: .2, renderStart: .4, cacheDir, outputDirectory });
const report = result.comparison;
assert.equal(result.directory, outputDirectory);
assert.equal(report.reference.startTime, 5);
assert.equal(report.render.startTime, 9);
assert.equal(report.reference.duration, 3);
assert.equal(report.render.duration, 4);
assert.equal(report.pairs.length, 4);
assert.equal(report.geometry.reference.fittedWidth, 640);
assert.equal(report.geometry.render.fittedWidth, 202);
for (const [index, pair] of report.pairs.entries()) {
  assert.equal(pair.time, times[index]);
  assert.equal(pair.reference.requestedTime, times[index] + .2);
  assert.equal(pair.render.requestedTime, times[index] + .4);
  assert.ok(pair.reference.decodedTime >= pair.reference.requestedTime - 1e-6);
  assert.ok(pair.render.decodedTime >= pair.render.requestedTime - 1e-6);
  assert.ok(pair.reference.delta < 1 / 10 + 1e-6);
  assert.ok(pair.render.delta < 1 / 24 + 1e-6);
  assert.equal(pair.reference.absolutePts, pair.reference.decodedTime + 5);
  assert.equal(pair.render.absolutePts, pair.render.decodedTime + 9);
  for (const entry of [pair, { image: pair.reference.frame, sha256: pair.reference.sha256 }, { image: pair.render.frame, sha256: pair.render.sha256 }]) {
    assert.equal(await fingerprint(join(outputDirectory, entry.image)), entry.sha256);
  }
  const metadata = JSON.parse((await runMedia(['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'json', join(outputDirectory, pair.image)], { binary: process.env.FFPROBE_PATH || 'ffprobe' })).toString());
  assert.equal(metadata.streams[0].width, 1280); assert.equal(metadata.streams[0].height, 424);
}
assert.ok(report.pairs.some(pair => Math.abs(pair.reference.decodedTime - pair.render.decodedTime) > .01));
assert.equal(await fingerprint(join(outputDirectory, report.contactSheet.image)), report.contactSheet.sha256);
assert.deepEqual(JSON.parse(await readFile(join(outputDirectory, 'comparison.json'), 'utf8')), report);
assert.ok((await readFile(join(outputDirectory, 'index.html'), 'utf8')).includes('first decoded frame at or after'));
assert.equal(report.visualReviewRecorded, false);
const rotated = join(directory, 'rotated-display.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-display_rotation:v:0', '90', '-i', render, '-c', 'copy', rotated]);
const rotatedResult = await compareReferenceVideos({ reference, render: rotated, times: [.13], cacheDir, outputDirectory: join(directory, 'rotated-comparison') });
assert.equal(rotatedResult.comparison.render.width, 180); // Encoded metadata.
assert.equal(rotatedResult.comparison.render.height, 320);
assert.equal(rotatedResult.comparison.geometry.render.sourceWidth, 320); // Extracted display pixels.
assert.equal(rotatedResult.comparison.geometry.render.sourceHeight, 180);
assert.equal(rotatedResult.comparison.geometry.render.fittedWidth, 640);
assert.equal(rotatedResult.comparison.geometry.render.fittedHeight, 360);
await assert.rejects(compareReferenceVideos({ reference, render, times, cacheDir, outputDirectory }), /already exists/);
await assert.rejects(compareReferenceVideos({ reference, render, times: [2.8], referenceStart: .2, cacheDir, outputDirectory: join(directory, 'out-of-range') }), /no clamping/);
await assert.rejects(stat(join(directory, 'out-of-range')), /ENOENT/);
// A same-length media modification with restored mtime must not masquerade as
// the previous source. A new pipeline session is bound to the new SHA-256.
const previous = await stat(render), bytes = await readFile(render);
const marker = bytes.indexOf(Buffer.from('Lavf'));
if (marker >= 0) bytes[marker] = 'X'.charCodeAt(0); else throw new Error('Synthetic MP4 has no encoder metadata fixture.');
await writeFile(render, bytes); await utimes(render, previous.atime, previous.mtime);
const changed = await prepareReferenceStudy(render, { cacheDir, times: [0] });
assert.notEqual(changed.study.reference.sha256, report.render.sha256);
assert.notEqual(changed.evidence.sessionId, report.render.sessionId);
console.log(JSON.stringify({ directory, status: 'passed', referenceSha256: report.reference.sha256, renderSha256: report.render.sha256,
  comparison: join(outputDirectory, 'comparison.json'), viewer: join(outputDirectory, 'index.html'), checks: [
    'pipeline reference preparation', 'empty authored study', 'native evidence', 'distinct frame rates', 'nonzero source PTS origins',
    'one-time start offsets', 'first-at-or-after decoded times', 'contain portrait and landscape', 'retained PNG hashes',
    'side-by-side image dimensions', 'portable viewer', 'display rotation preserved', 'new output only', 'strict range rejection', 'changed input fingerprint',
  ], actualEditorRender: false, visualReviewRecorded: false, externalModelCalls: 0 }));
