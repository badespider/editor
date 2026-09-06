// Synthetic source/timestamp preparation tests; no editor or model provider required.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { prepareDelivery, readDeliveryBundle, runMedia } from '../src/delivery.ts';
import { fingerprint } from '../src/preview.ts';
import { verifyDelivery } from '../src/render-review.ts';
import type { Plan } from '../src/schema.ts';

const directory = resolve(process.argv[2]);
await mkdir(directory);
const source = join(directory, 'offset.mkv');
await runMedia(['-v', 'error', '-nostdin', '-n', '-copyts', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=6',
  '-f', 'lavfi', '-i', 'aevalsrc=0.15*sin(2*PI*(400*t+20*t*t)):s=48000:d=5.8', '-vf', 'setpts=PTS+5/TB',
  '-af', 'asetpts=PTS+5.2/TB', '-fps_mode', 'passthrough', '-c:v', 'libx264', '-c:a', 'pcm_s16le', source]);
const sourceHash = await fingerprint(source);
const plan: Plan = {
  schemaVersion: 1, brief: { goal: 'Technical fixture, not storytelling evidence', audience: 'Developers', format: 'montage', minDuration: 3.9, maxDuration: 4.2, allowReorder: false },
  skills: ['editor-review'], sources: [{ id: 'source', path: source, duration: 6, audio: 'other', sha256: sourceHash }],
  evidence: [0, 1].map(i => ({ id: `e${i}`, sourceId: 'source', start: i * 3 + .3, end: i * 3 + .4, observation: 'Known generated test pattern, not a claim about user footage', kind: 'visual', verification: 'observed' })),
  beats: [0, 1].map(i => ({ id: `b${i}`, role: 'action', purpose: 'Synthetic media regression', evidenceIds: [`e${i}`] })),
  segments: [0, 1].map(i => ({ id: `c${i}`, sourceId: 'source', beatId: `b${i}`, in: i * 3, out: i * 3 + 2, reason: 'Verify timestamp origin and reusable cuts', evidenceIds: [`e${i}`] })),
  protectedRanges: [], speechRanges: [], preferences: [], review: { previewInspected: false, reviewer: '', checks: [] },
};
await writeFile(join(directory, 'plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx' });
const bundlePath = join(directory, 'bundle');
const prepared = await prepareDelivery(plan, { output: bundlePath, baseDirectory: directory, settings: { width: 320, height: 180, name: 'Delivery regression' } });
assert.equal(prepared.bundle.frames, 120); assert.equal(prepared.bundle.duration, 4);
await readDeliveryBundle(bundlePath);
// Nonzero origin + delayed sound: the initial 200ms delay survives preparation.
const audio = await runMedia(['-v', 'error', '-i', join(bundlePath, 'media/c0.mp4'), '-vn', '-ar', '16000', '-ac', '1', '-f', 'f32le', '-']);
function rms(start: number, end: number) {
  let sum = 0, count = 0;
  for (let i = Math.floor(start * 16000); i < Math.floor(end * 16000); i++) { sum += audio.readFloatLE(i * 4) ** 2; count++; }
  return Math.sqrt(sum / count);
}
assert(rms(.02, .15) < .0001, 'Initial delayed audio was shifted earlier');
assert(rms(.3, .6) > .02, 'Delayed sound is missing');
await assert.rejects(prepareDelivery(plan, { output: bundlePath, baseDirectory: directory }), /EEXIST/);
const wrongHash = structuredClone(plan); wrongHash.sources[0].sha256 = '0'.repeat(64);
await assert.rejects(prepareDelivery(wrongHash, { output: join(directory, 'bad-hash'), baseDirectory: directory }), /source changed/);
const missingHash = structuredClone(plan); delete missingHash.sources[0].sha256;
await assert.rejects(prepareDelivery(missingHash, { output: join(directory, 'missing-hash'), baseDirectory: directory }), /SHA-256 is required/);
const changed = await readFile(join(bundlePath, 'edit.tsx'), 'utf8');
await writeFile(join(bundlePath, 'edit.tsx'), changed + '\n// tampered');
await assert.rejects(readDeliveryBundle(bundlePath), /composition or plan changed/);
await writeFile(join(bundlePath, 'edit.tsx'), changed);
const originalManifest = await readFile(join(bundlePath, 'bundle.json'), 'utf8');
const wrongMapping = JSON.parse(originalManifest);
wrongMapping.clips[0].sourceIn += 1;
await writeFile(join(bundlePath, 'bundle.json'), JSON.stringify(wrongMapping));
await assert.rejects(readDeliveryBundle(bundlePath), /source mapping disagrees/);
await writeFile(join(bundlePath, 'bundle.json'), originalManifest);
// Wrong picture and sound must be rejected even when dimensions/duration match.
const wrongVideo = join(directory, 'wrong.mp4');
await runMedia(['-v', 'error', '-n', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=4', '-f', 'lavfi', '-i',
  'sine=frequency=900:sample_rate=48000:duration=4', '-c:v', 'libx264', '-c:a', 'aac', wrongVideo]);
const wrongReview = await verifyDelivery(bundlePath, wrongVideo);
assert.equal(wrongReview.technicalPass, false); assert(wrongReview.errors.some(e => e.includes('audio'))); assert(wrongReview.errors.some(e => e.includes('picture')));
assert.equal(await fingerprint(source), sourceHash);
// Mixed aspect ratios, missing source audio, 24-fps input and fractional trims.
const portrait = join(directory, 'silent-portrait.mp4');
await runMedia(['-v', 'error', '-n', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=24:d=2', '-an', '-c:v', 'libx264', portrait]);
const mixedPlan = structuredClone(plan);
mixedPlan.brief.minDuration = 2; mixedPlan.brief.maxDuration = 2.2;
mixedPlan.sources.push({ id: 'portrait', path: portrait, duration: 2, audio: 'no_track', sha256: await fingerprint(portrait) });
mixedPlan.evidence[0].sourceId = 'portrait';
mixedPlan.segments[0] = { ...mixedPlan.segments[0], sourceId: 'portrait', in: .125, out: 1.138 };
mixedPlan.segments[1] = { ...mixedPlan.segments[1], in: 3.017, out: 4.035 };
const mixedBundlePath = join(directory, 'mixed-bundle');
const mixed = await prepareDelivery(mixedPlan, { output: mixedBundlePath, baseDirectory: directory, settings: { width: 320, height: 180, name: 'Mixed-media delivery regression' } });
assert.equal(mixed.bundle.frames, 62);
assert.deepEqual(mixed.bundle.clips.map(c => c.hasSourceAudio), [false, true]);
await readDeliveryBundle(mixedBundlePath);
await writeFile(join(directory, 'smoke-report.json'), JSON.stringify({ passed: true, sourceHash, bundlePath, aiCalls: 0,
  mixedBundlePath, checks: ['nonzero PTS origin', 'delayed audio preserved', 'source fingerprints', 'no overwrite', 'tampered composition rejected', 'wrong picture/audio rejected', 'mixed dimensions, silent source and fractional trims prepared'], wrongReview }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ passed: true, bundlePath, mixedBundlePath, sourceHash }));
