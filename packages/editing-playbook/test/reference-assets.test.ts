import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { AgentEvidenceService } from '@diffusionstudio/video-understanding/agent';
import { runMedia } from '../src/delivery.ts';
import { fingerprint } from '../src/preview.ts';
import { prepareReferenceStudy } from '../src/reference-evidence.ts';
import { prepareReferenceAssets, referenceAssetCropPixels, referenceAssetRequestSchema, referenceAssetRequestsSchema } from '../src/reference-assets.ts';
import type { ReferenceAssetRequest } from '../src/reference-assets.ts';

const request = (patch: Partial<ReferenceAssetRequest> = {}): ReferenceAssetRequest => ({
  id: 'photo-detail', kind: 'frame-crop', time: .11, rect: { x: .25, y: .25, width: .5, height: .5 }, purpose: 'Supplied photo detail', ...patch,
});
const fakeSource = { path: 'unused.mp4', sha256: 'a'.repeat(64), width: 64, height: 48, duration: 1, sessionId: 'b'.repeat(64) };

test('asset requests are bounded inert IDs, timestamps and normalized ROIs, never model paths', () => {
  assert.equal(referenceAssetRequestSchema.parse(request()).purpose, 'Supplied photo detail');
  for (const invalid of [
    { ...request(), path: 'https://example.com/image.png' }, { ...request(), rect: { ...request().rect, command: 'ignored?' } },
    request({ id: '../outside' }), request({ id: 'reference-source' }), request({ time: NaN }), request({ time: Infinity }),
    request({ rect: { x: .75, y: 0, width: .5, height: .5 } }), request({ rect: { x: 0, y: 0, width: 1, height: 1 } }),
    request({ kind: 'texture-tile', rect: { x: 0, y: 0, width: .5, height: .5 } }), request({ purpose: '  ' }),
  ]) assert.equal(referenceAssetRequestSchema.safeParse(invalid).success, false);
  assert.equal(referenceAssetRequestsSchema.safeParse([]).success, false);
  assert.equal(referenceAssetRequestsSchema.safeParse([request(), request()]).success, false);
  assert.equal(referenceAssetRequestsSchema.safeParse(Array.from({ length: 17 }, (_, i) => request({ id: `asset-${i}` }))).success, false);
});

test('whole-pixel crop geometry encloses the requested ROI without breaking the area cap', () => {
  assert.deepEqual(referenceAssetCropPixels(request(), { width: 64, height: 48 }), { x: 16, y: 12, width: 32, height: 24 });
  assert.deepEqual(referenceAssetCropPixels(request({ rect: { x: .1, y: .1, width: .2, height: .2 } }), { width: 11, height: 9 }), { x: 1, y: 0, width: 3, height: 3 });
  assert.throws(() => referenceAssetCropPixels(request({ rect: { x: 0, y: 0, width: .5, height: 1 } }), { width: 3, height: 3 }), /Rounded crop pixels/);
  assert.throws(() => referenceAssetCropPixels(request(), { width: 4096, height: 4096 }), /pixel budget/);
});

test('asset preparation rejects unsafe paths, source-end times, unknown options and cancellation before work', async () => {
  for (const path of ['https://example.com/source.mp4', 'file:///tmp/source.mp4', '//server/source.mp4', '\\\\server\\source.mp4']) {
    await assert.rejects(prepareReferenceAssets({ source: { ...fakeSource, path }, requests: [request()], directory: 'unused-output' }), /local video|local filesystem/);
  }
  await assert.rejects(prepareReferenceAssets({ source: fakeSource, requests: [request({ time: 1 })], directory: 'unused-output' }), /before source end/);
  await assert.rejects(prepareReferenceAssets({ source: fakeSource, requests: [request()], directory: 'unused-output',
    signal: AbortSignal.abort(new Error('Cancelled asset preparation.')) }), /Cancelled/);
  await assert.rejects(prepareReferenceAssets({ source: fakeSource, requests: [request()], directory: 'unused-output', arbitrary: true } as never));
});

async function fixture(t: { after(fn: () => Promise<void>): void }, fixtureWidth = 64, fixtureHeight = 48) {
  const directory = await mkdtemp(join(tmpdir(), 'reference-assets-test-'));
  t.after(async () => {
    const checked = resolve(directory), parent = resolve(tmpdir()) + sep;
    assert.ok(checked.startsWith(parent) && checked.slice(parent.length).startsWith('reference-assets-test-'));
    await rm(checked, { recursive: true, force: true });
  });
  const path = join(directory, 'synthetic.mkv'), cacheDir = join(directory, 'cache');
  await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', `testsrc=size=${fixtureWidth}x${fixtureHeight}:rate=5:duration=1`,
    '-c:v', 'ffv1', '-pix_fmt', 'bgr0', '-threads', '1', path]);
  const prepared = await prepareReferenceStudy(path, { cacheDir, goal: 'Synthetic asset pixel test, no semantic analysis.' });
  const { path: sourcePath, sha256, width, height, duration, sessionId } = prepared.evidence.source;
  return { directory, path, cacheDir, source: { path: sourcePath, sha256, width, height, duration, sessionId } };
}

const rgba = (path: string, width: number, height: number) => runMedia(['-v', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'file,pipe',
  '-i', path, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { limit: width * height * 4 });

test('real native evidence produces exact crops and a full-canvas repeated tile with source/PTS provenance', async t => {
  const data = await fixture(t), before = await fingerprint(data.path);
  const texture = request({ id: 'paper-tile', kind: 'texture-tile', time: .11, rect: { x: .125, y: .125, width: .125, height: .125 }, purpose: 'Background paper region; test-authored, needs visual review.' });
  const directory = join(data.directory, 'assets');
  const assets = await prepareReferenceAssets({ source: data.source, requests: [request(), texture], directory, cacheDir: data.cacheDir });
  assert.equal(assets.length, 2);
  assert.deepEqual(assets.map(asset => [asset.width, asset.height]), [[32, 24], [64, 48]]);
  assert.ok(assets.every(asset => asset.preparedMedia && asset.reviewRequired && asset.provenance.requestedTime === .11 && Math.abs(asset.provenance.decodedTime - .2) < 1e-6));
  assert.equal(assets[0].provenance.sourceSha256, before);
  assert.equal(assets[0].provenance.evidenceId, assets[1].provenance.evidenceId, 'duplicate times share one native frame');
  assert.deepEqual(assets[1].provenance.repeatPolicy, { mode: 'repeat-pixels', columns: 8, rows: 8, anchor: 'top-left' });
  assert.match(assets[1].provenance.limitation, /not a recovered background/);
  const service = new AgentEvidenceService(data.cacheDir), session = await service.read(data.source.sessionId);
  const frame = session.inspections.flatMap(inspection => inspection.artifacts).find(artifact => artifact.id === assets[0].provenance.evidenceId)!;
  const original = await rgba(frame.path, 64, 48);
  for (const asset of assets) {
    assert.equal(asset.sha256, await fingerprint(asset.path));
    assert.equal(asset.provenance.frameSha256, await fingerprint(frame.path));
    assert.equal(await realpath(asset.path), asset.path);
    const pixels = await rgba(asset.path, asset.width, asset.height), crop = asset.provenance.cropPixels;
    for (const [x, y] of [[0, 0], [7, 5], [8, 6], [asset.width - 1, asset.height - 1]]) {
      const ox = crop.x + x % crop.width, oy = crop.y + y % crop.height;
      assert.deepEqual(pixels.subarray((y * asset.width + x) * 4, (y * asset.width + x + 1) * 4), original.subarray((oy * 64 + ox) * 4, (oy * 64 + ox + 1) * 4));
    }
  }
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.externalModelCalls, 0); assert.equal(manifest.reviewRequired, true);
  assert.equal(manifest.assets[1].sha256, assets[1].sha256);
  assert.equal(await fingerprint(data.path), before, 'original media is never modified');
  await assert.rejects(prepareReferenceAssets({ source: data.source, requests: [request()], directory, cacheDir: data.cacheDir }), /EEXIST/);
  assert.equal((await stat(assets[0].path)).isFile(), true, 'retry does not replace retained outputs');
});

test('real source/session and cached-frame mismatches cannot silently create bound assets', async t => {
  const data = await fixture(t);
  await assert.rejects(prepareReferenceAssets({ source: { ...data.source, sha256: '0'.repeat(64) }, requests: [request()],
    directory: join(data.directory, 'bad-hash'), cacheDir: data.cacheDir }), /does not match/);
  await assert.rejects(prepareReferenceAssets({ source: { ...data.source, width: 48, height: 64 }, requests: [request()],
    directory: join(data.directory, 'bad-dimensions'), cacheDir: data.cacheDir }), /does not match/);
  const service = new AgentEvidenceService(data.cacheDir), inspected = await service.inspect(data.source.sessionId, { times: [.11], native: true });
  const frame = inspected.artifacts.find(artifact => artifact.kind === 'frame')!;
  const outside = join(data.directory, 'outside-evidence.png'), cached = await service.read(data.source.sessionId);
  await writeFile(outside, await readFile(frame.path));
  const cachedFrame = cached.inspections.flatMap(inspection => inspection.artifacts).find(artifact => artifact.id === frame.id)!;
  cachedFrame.path = outside;
  const sessionPath = join(service.directory, data.source.sessionId, 'session.json');
  await writeFile(sessionPath, JSON.stringify(cached));
  await assert.rejects(prepareReferenceAssets({ source: data.source, requests: [request()], directory: join(data.directory, 'escaped-frame'), cacheDir: data.cacheDir }), /canonical directory/);
  cachedFrame.path = frame.path;
  await writeFile(sessionPath, JSON.stringify(cached));
  await writeFile(frame.path, 'not a PNG');
  await assert.rejects(prepareReferenceAssets({ source: data.source, requests: [request()], directory: join(data.directory, 'corrupt-frame'), cacheDir: data.cacheDir }), /PNG/);
  const changed = await readFile(data.path); changed[changed.length - 1] ^= 1;
  await writeFile(data.path, changed);
  const current = await stat(data.path);
  cached.source.bytes = current.size; cached.source.mtimeMs = current.mtimeMs;
  await writeFile(sessionPath, JSON.stringify(cached));
  await assert.rejects(prepareReferenceAssets({ source: data.source, requests: [request()], directory: join(data.directory, 'changed-source'), cacheDir: data.cacheDir }), /Unsupported local video|source changed/);
});

test('texture repetition preserves partial edge tiles on an odd-sized source canvas', async t => {
  const data = await fixture(t, 65, 49);
  const [asset] = await prepareReferenceAssets({ source: data.source,
    requests: [request({ id: 'edge-texture', kind: 'texture-tile', rect: { x: .1, y: .1, width: .15, height: .18 }, purpose: 'Synthetic clean-background candidate.' })],
    directory: join(data.directory, 'odd-assets'), cacheDir: data.cacheDir });
  assert.deepEqual([asset.width, asset.height], [65, 49]);
  const session = await new AgentEvidenceService(data.cacheDir).read(data.source.sessionId);
  const frame = session.inspections.flatMap(inspection => inspection.artifacts).find(artifact => artifact.id === asset.provenance.evidenceId)!;
  const original = await rgba(frame.path, 65, 49), pixels = await rgba(asset.path, 65, 49), crop = asset.provenance.cropPixels;
  assert.ok(65 % crop.width !== 0 && 49 % crop.height !== 0);
  for (const [x, y] of [[0, 0], [crop.width, crop.height], [64, 48], [63, 47], [64, 0], [0, 48]]) {
    const offset = (y * 65 + x) * 4, expected = ((crop.y + y % crop.height) * 65 + crop.x + x % crop.width) * 4;
    assert.deepEqual(pixels.subarray(offset, offset + 4), original.subarray(expected, expected + 4));
  }
});
