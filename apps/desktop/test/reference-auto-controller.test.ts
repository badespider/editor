import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticReferenceComparisonTimes } from '../src/reference-auto-controller.ts';

test('low-rate references compare known decoded frames, including a real final 10 fps frame', () => {
  const decoded = [0, .4, .8, 1.2, 1.7, 2.1, 2.5, 2.9];
  const times = automaticReferenceComparisonTimes({ duration: 3, sourceRange: { start: 0, end: 3 }, frames: decoded.map(decodedTime => ({ decodedTime })) });
  assert.equal(times.length, 8);
  assert.equal(times[0], 0);
  assert.ok(times.at(-1)! < 2.9 && times.at(-1)! > 2.89999);
  assert.ok(times.every((time, index) => time <= decoded[index] && time < 3));
  // A first-at-or-after 10 fps decoder always has a valid matching source PTS.
  const sourcePts = Array.from({ length: 30 }, (_, index) => index / 10);
  assert.deepEqual(times.map(time => sourcePts.find(pts => pts >= time)), decoded);
});

test('offsets map once, sparse counts stay honest and absent end-state samples are never invented', () => {
  const times = automaticReferenceComparisonTimes({ duration: 3, sourceRange: { start: 10, end: 15 }, frames: [10, 10, 10.4, 11.8, 13, 14.5].map(decodedTime => ({ decodedTime })) });
  assert.equal(times.length, 3);
  assert.equal(times[0], 0);
  assert.ok(Math.abs(times[1] - .399999) < 1e-12);
  assert.ok(Math.abs(times[2] - 1.799999) < 1e-12);
  assert.ok(times.every(time => time + 10 < 13));
});

test('exclude requests beyond the native preview final PTS and keep subframe decimals below the known source timestamp', () => {
  const last = 59 / 30;
  const times = automaticReferenceComparisonTimes({ duration: 2, sourceRange: { start: 0, end: 4 }, frames: [0, 1.3333333333333333, last, 1.99, 2].map(decodedTime => ({ decodedTime })) });
  assert.equal(times.length, 3);
  assert.ok(times[1] < 1.3333333333333333);
  assert.ok(times.at(-1)! < last);
  const one = automaticReferenceComparisonTimes({ duration: 1 / 30, sourceRange: { start: 0, end: 1 }, frames: [{ decodedTime: 0 }, { decodedTime: .01 }] });
  assert.deepEqual(one, [0]);
});

test('bounded representative selection preserves available first and last samples', () => {
  const frames = Array.from({ length: 12 }, (_, index) => ({ decodedTime: index / 4 }));
  const times = automaticReferenceComparisonTimes({ duration: 3, sourceRange: { start: 0, end: 3 }, frames });
  assert.equal(times.length, 8);
  assert.equal(times[0], 0); assert.equal(times.at(-1), 2.75 - .000001);
  assert.equal(new Set(times).size, times.length);
  assert.ok(times.every((time, index) => index === 0 || time > times[index - 1]));
});

test('fail unsupported or empty overlap instead of manufacturing comparison frames', () => {
  assert.throws(() => automaticReferenceComparisonTimes({ duration: 1, sourceRange: { start: 0, end: 2 }, frames: [{ decodedTime: 1 }] }), /No retained source frame/);
  assert.throws(() => automaticReferenceComparisonTimes({ duration: 1, sourceRange: { start: 2, end: 1 }, frames: [{ decodedTime: 0 }] }), /positive duration/);
  assert.throws(() => automaticReferenceComparisonTimes({ duration: NaN, sourceRange: { start: 0, end: 1 }, frames: [{ decodedTime: 0 }] }));
});
