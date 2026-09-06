import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverySettingsSchema, formatChapters, mapDeliveryChapters, planDeliveryTimeline } from '../src/delivery-schema.ts';
import { comparePcm } from '../src/render-review.ts';

test('frame alignment retains the whole selected range without gaps', () => {
  const timeline = planDeliveryTimeline([{ id: 'a', in: .123, out: 1.124 }, { id: 'b', in: 5, out: 6 }], 30);
  assert.deepEqual(timeline, [{ id: 'a', startFrame: 0, durationFrames: 31 }, { id: 'b', startFrame: 31, durationFrames: 30 }]);
});
test('settings reject unsupported timebases, odd dimensions and partial dimensions', () => {
  for (const input of [{ fps: 60 }, { width: 1920 }, { width: 321, height: 180 }, { width: 8000, height: 2160 }]) {
    assert.equal(deliverySettingsSchema.safeParse(input).success, false);
  }
});
test('chapter times derive from clip anchors rather than title graphics', () => {
  const timeline = planDeliveryTimeline([{ id: 'a', in: 0, out: 12 }, { id: 'b', in: 0, out: 15 }, { id: 'c', in: 0, out: 20 }], 30);
  const settings = deliverySettingsSchema.parse({ chapters: [{ segmentId: 'a', title: 'Start' }, { segmentId: 'b', title: 'Middle' }, { segmentId: 'c', title: 'End' }] });
  assert.equal(formatChapters(mapDeliveryChapters(settings, timeline, 30)), '00:00 Start\n00:12 Middle\n00:27 End\n');
  assert.equal(formatChapters([{ seconds: 3661, title: 'Later' }]), '1:01:01 Later\n');
});
test('invalid chapter targets, ordering and short final chapters are rejected', () => {
  const timeline = planDeliveryTimeline([{ id: 'a', in: 0, out: 30 }], 30);
  for (const chapters of [
    [{ segmentId: 'missing', title: 'Missing' }],
    [{ segmentId: 'a', title: 'Only one' }],
    [{ segmentId: 'a', title: 'Start' }, { segmentId: 'a', offset: 10, title: 'Middle' }, { segmentId: 'a', offset: 25, title: 'Too short' }],
  ]) assert.throws(() => mapDeliveryChapters(deliverySettingsSchema.parse({ chapters }), timeline, 30));
});
test('waveform review detects wrong sound, missing sound, excess gain and delayed sound', () => {
  const a = Float32Array.from({ length: 8000 }, (_, i) => .15 * Math.sin(.2 * i + .00003 * i * i));
  const b = Float32Array.from(a, (_, i) => .15 * Math.sin(.3 * i + .00006 * i * i));
  assert.equal(comparePcm(a, a).pass, true);
  assert.equal(comparePcm(a, b).pass, false);
  assert.equal(comparePcm(a, new Float32Array(a.length)).pass, false);
  assert.equal(comparePcm(a, Float32Array.from(a, x => x * 3)).pass, false);
  const delayed = new Float32Array(a.length); delayed.set(a.subarray(0, a.length - 480), 480);
  const result = comparePcm(a, delayed);
  assert.equal(result.lagMs, 30); assert.equal(result.pass, false);
});
test('silent audio never certifies source identity', () => {
  assert.equal(comparePcm(new Float32Array(8000), new Float32Array(8000)).status, 'silent_reference_not_identity_proof');
});

test('short or truncated waveform samples cannot pass alignment review', () => {
  assert.equal(comparePcm(new Float32Array(1000), new Float32Array(1000)).pass, false);
  assert.equal(comparePcm(new Float32Array(8000), new Float32Array(7999)).pass, false);
});
