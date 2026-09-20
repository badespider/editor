import test from 'node:test';
import assert from 'node:assert/strict';
import { getRenderFrameCount } from '../src/components/engine/encode/utils.ts';

test('V4 frame-aligned excerpts do not lose their last frame', () => {
  assert.equal(Math.floor((969 / 30) * 30), 968); // Reproduces the old defect.
  for (const frames of [969, 1069, 1371]) {
    assert.equal(getRenderFrameCount(frames, 30, 30), frames);
  }
});

test('same-rate workareas retain their exact frame count', () => {
  for (const rate of [23.976, 24, 25, 29.97, 30, 50, 59.94, 60]) {
    for (let frames = 0; frames <= 20000; frames++) {
      assert.equal(getRenderFrameCount(frames, rate, rate), frames);
    }
  }
});

test('frame-rate conversion retains whole frames but does not round up partial ones', () => {
  assert.equal(getRenderFrameCount(24, 24, 30), 30);
  assert.equal(getRenderFrameCount(60, 60, 30), 30);
  assert.equal(getRenderFrameCount(600, 29.97, 59.94), 1200);
  assert.equal(getRenderFrameCount(1, 24, 30), 1);
  assert.equal(getRenderFrameCount(3, 24, 30), 3);
  assert.equal(getRenderFrameCount(10.999999, 30, 30), 10);
  assert.equal(getRenderFrameCount(969 - Number.EPSILON * 969, 30, 30), 969);
});
