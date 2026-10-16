import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectRecreationSource, parseRecreationChangeHints, parseRecreationPacketInventory, planRecreationSamples } from '../src/reference-sampling.ts';

const packet = (time: number, pts = Math.round(time * 1000)) => ({ pts, time, absoluteTime: time + 5 });
const candidate = (time: number, score = 20) => ({ pts: Math.round(time * 1000), time, score,
  verification: 'unreviewed-change-hint' as const, sampled: false, evidenceIds: [] });

test('packet inventory retains exact presentation origin, sorts B-frame packet order and excludes the half-open end', () => {
  const result = parseRecreationPacketInventory({ streams: [{ time_base: '1/1000', start_pts: 5000 }], packets: [
    { pts: 6500 }, { pts: 6000 }, { pts: '7000' }, { pts: 6500 }, { pts: 8000 }, {}, { pts: 5900 },
  ] }, 5, { start: 1, end: 3 });
  assert.deepEqual(result.packets.map(packet => [packet.pts, packet.time]), [[6000, 1], [6500, 1.5], [7000, 2]]);
  assert.equal(result.timeBase, '1/1000'); assert.equal(result.omittedMissingPts, 1);
  assert.throws(() => parseRecreationPacketInventory({ streams: [{ time_base: '1/0' }], packets: [{ pts: 0 }] }, 0, { start: 0, end: 1 }), /time base/);
  assert.throws(() => parseRecreationPacketInventory({ streams: [{ time_base: '1/1000' }], packets: [{ pts: Number.MAX_SAFE_INTEGER + 1 }] }, 0, { start: 0, end: 1 }), /exact integer/);
  assert.throws(() => parseRecreationPacketInventory({ streams: [{ time_base: '1/1000' }], packets: [{}] }, 0, { start: 0, end: 1 }), /No presentation timestamps/);
});

test('scene detector metadata becomes bounded unverified native-PTS hints, never semantic cuts', () => {
  const inventory = parseRecreationPacketInventory({ streams: [{ time_base: '1/1000' }], packets: [{ pts: 5000 }, { pts: 5500 }, { pts: 6000 }, { pts: 6500 }] }, 5, { start: 0, end: 2 });
  const text = 'frame:0 pts:5500 pts_time:5.5\nlavfi.scd.score=14.5\nlavfi.scd.time=5.5\n' +
    'frame:1 pts:6000 pts_time:6\nlavfi.scd.score=25.2\nframe:2 pts:6500 pts_time:6.5\nlavfi.scd.score=19\n';
  const hints = parseRecreationChangeHints(text, inventory, 5, { start: 0, end: 2 }, 2);
  assert.equal(hints.rawCount, 3); assert.equal(hints.truncated, true);
  assert.deepEqual(hints.candidates.map(candidate => [candidate.time, candidate.score]), [[1, 25.2], [1.5, 19]]);
  assert.ok(hints.candidates.every(candidate => candidate.verification === 'unreviewed-change-hint' && !candidate.sampled && candidate.evidenceIds.length === 0));
  assert.equal(parseRecreationChangeHints('frame:0 pts:9999 pts_time:9.999\nlavfi.scd.score=95\n', inventory, 5, { start: 0, end: 2 }).candidates.length, 0);
});

test('dense baseline uses available PTS with change neighbors and safe first-at-or-after requests', () => {
  const packets = Array.from({ length: 30 }, (_, index) => packet(index / 10));
  const result = planRecreationSamples(packets, { start: 0, end: 3 }, 24, [candidate(1.1)]);
  const times = result.samples.map(sample => sample.packet.time);
  assert.ok(times.includes(1) && times.includes(1.1) && times.includes(1.2));
  assert.equal(times[0], 0); assert.equal(times.at(-1), 2.9);
  assert.ok(result.samples.every(sample => sample.requestedTime <= sample.packet.time && sample.requestedTime < 3));
  assert.ok(result.samples.every((sample, index) => index === 0 || sample.requestedTime > result.samples[index - 1].requestedTime));
  assert.ok(result.samples.length <= 24);
});

test('variable frame-rate baselines span source time rather than concentrating in the high-FPS section', () => {
  const packets = [...Array.from({ length: 100 }, (_, index) => packet(index / 100)), packet(5), packet(9)];
  const result = planRecreationSamples(packets, { start: 0, end: 10 }, 12);
  assert.ok(result.samples.some(sample => sample.packet.time === 5));
  assert.equal(result.samples.at(-1)!.packet.time, 9);
  assert.ok(result.samples.length <= 12);
});

test('120-second baseline remains within 384 frames while dense selected-scene mode requests every inventoried timestamp when it fits', () => {
  const packets = Array.from({ length: 3600 }, (_, index) => packet(index / 30, index));
  const candidates = Array.from({ length: 60 }, (_, index) => ({ ...candidate(index * 2), pts: index * 60 }));
  const dense = planRecreationSamples(packets, { start: 0, end: 120 }, 320, candidates);
  assert.ok(dense.samples.length <= 320 && dense.samples.length >= 240);
  assert.ok(dense.baselineTargetSpacing < .51);
  const scenePackets = packets.filter(packet => packet.time >= 32.1 && packet.time < 35.2);
  const scene = planRecreationSamples(scenePackets, { start: 32.1, end: 35.2 }, 96, [], 'selected-scene');
  assert.equal(scene.samples.length, scenePackets.length);
  assert.ok(scene.samples.every(sample => sample.reasons.includes('selected-scene')));
  const single = planRecreationSamples([packet(0)], { start: 0, end: .033333 }, 320);
  assert.equal(single.samples.length, 1); assert.equal(single.samples[0].requestedTime, 0);
  assert.throws(() => planRecreationSamples(packets.slice(0, 2).reverse(), { start: 0, end: 1 }, 12), /ordered/);
});

test('invalid windows and cancellation are rejected before evidence or a detector process starts', async () => {
  await assert.rejects(inspectRecreationSource('unused.mp4', { start: 0, end: 120.01 }), /120 seconds/);
  await assert.rejects(inspectRecreationSource('unused.mp4', { start: 2, end: 1 }), /positive source window/);
  await assert.rejects(inspectRecreationSource('unused.mp4', { start: 0, end: 1, signal: AbortSignal.abort(new Error('Cancelled fixture')) }), /Cancelled fixture/);
  await assert.rejects(inspectRecreationSource('https://example.com/video.mp4', { start: 0, end: 1 }), /regular local video/);
  await assert.rejects(inspectRecreationSource('/\\host/share/video.mp4', { start: 0, end: 1 }), /regular local video/);
  await assert.rejects(inspectRecreationSource('\\/host/share/video.mp4', { start: 0, end: 1 }), /regular local video/);
});
