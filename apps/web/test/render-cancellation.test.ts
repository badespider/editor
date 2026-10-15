import assert from "node:assert/strict";
import test from "node:test";
import { createPendingRenderCancellation } from "../src/context/render-cancellation.ts";

test("cancellation during encoder initialization reaches the eventual encoder once", () => {
  const abort = new AbortController(), pending = createPendingRenderCancellation(abort.signal);
  let cancelled = 0;
  abort.abort(); pending.cancel();
  pending.attach(() => cancelled++);
  assert.equal(cancelled, 1);
  pending.dispose();
});
test("active encoder cancellation responds to its signal and overlay cancel idempotently", () => {
  const abort = new AbortController(), pending = createPendingRenderCancellation(abort.signal);
  let cancelled = 0;
  pending.attach(() => cancelled++); pending.cancel(); abort.abort();
  assert.equal(cancelled, 1);
  pending.dispose();
});
test("disposed render cannot cancel a subsequent encoder when an old signal aborts", () => {
  const abort = new AbortController(), pending = createPendingRenderCancellation(abort.signal);
  let cancelled = 0;
  pending.attach(() => cancelled++); pending.dispose(); abort.abort();
  assert.equal(cancelled, 0);
});
