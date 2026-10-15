import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceRunGate, validateAutomaticReferenceFile } from "../src/components/sidebar-left/reference-auto-state.ts";

test("automatic reference blocks repeated drops, including while cancellation is still settling", () => {
  const gate = createReferenceRunGate(), run = gate.begin()!;
  assert.ok(run); assert.equal(gate.begin(), null);
  gate.cancel(); assert.equal(run.signal.aborted, true);
  assert.equal(gate.begin(), null, "abort is a request, not worker completion");
  assert.equal(gate.finish(run), true); assert.ok(gate.begin());
});

test("a stale completion cannot clear or update a newer automatic reference run", () => {
  const gate = createReferenceRunGate(), old = gate.begin()!;
  gate.finish(old); const current = gate.begin()!;
  assert.equal(gate.isCurrent(old), false); assert.equal(gate.finish(old), false);
  assert.equal(gate.isCurrent(current), true); assert.equal(gate.begin(), null);
  gate.cancel(); assert.equal(current.signal.aborted, true);
  assert.equal(gate.finish(current), true);
});

test("video selection validation stays metadata-only and accepts common local video extensions", () => {
  validateAutomaticReferenceFile({ name: "reference.mp4", size: 12, type: "" });
  validateAutomaticReferenceFile({ name: "capture", size: 12, type: "video/webm" });
  validateAutomaticReferenceFile({ name: "reference.MKV", size: 12, type: "application/octet-stream" });
  assert.throws(() => validateAutomaticReferenceFile({ name: "empty.mp4", size: 0, type: "video/mp4" }), /nonempty/);
  assert.throws(() => validateAutomaticReferenceFile({ name: "notes.json", size: 12, type: "application/json" }), /video file/);
});
