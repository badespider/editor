import assert from "node:assert/strict";
import test from "node:test";
import { createReferenceStudy } from "@diffusionstudio/editing-playbook/reference";
import { MAX_REFERENCE_STUDY_BYTES, matchReferenceMedia, newReferenceBeat, parseReferenceStudyText, serializeReferenceStudy, referenceComparisonTimes, referenceComparisonWindow } from "../src/components/sidebar-left/reference-workbench-state.ts";

const media = () => ({ name: "reference.mp4", sha256: null, bytes: 123456, duration: 10, width: 1920, height: 1080 });

test("study roundtrip validates strict bounded JSON and preserves a prepared checksum as inert data", () => {
  const study = createReferenceStudy({ ...media(), sha256: "a".repeat(64) });
  assert.deepEqual(parseReferenceStudyText(JSON.stringify(study)), study);
  assert.throws(() => parseReferenceStudyText(JSON.stringify({ ...study, execute: "shell command" })));
  assert.throws(() => parseReferenceStudyText("{"), /valid JSON/);
  assert.throws(() => parseReferenceStudyText(" ".repeat(MAX_REFERENCE_STUDY_BYTES + 1)), /512 KiB/);
});

test("near-limit multibyte studies emit reloadable compact JSON when pretty output would exceed the byte limit", () => {
  const study = createReferenceStudy(media());
  study.beats = Array.from({length:64}, (_, i) => ({
    ...newReferenceBeat(0,10,[]), id:`beat-${i+1}`, observation:"é".repeat(400)+"x".repeat(800),
    inference:"x".repeat(1200), uncertainty:"x".repeat(600), layout:"x".repeat(600), typography:"x".repeat(600),
    motion:"x".repeat(600), camera:"x".repeat(600), transition:"x".repeat(600),
    palette:Array(16).fill("#ffffff"), nativeMomentIds:["text-reveal","text-emphasis","background-grid","background-dots","background-gradient","caption-clean"],
  }));
  study.targets = Array.from({length:384}, (_, i) => ({beatId:`beat-${Math.floor(i/6)+1}`, property:`${i}`.padEnd(70,"x"),value:1,unit:"px"}));
  study.constraints={retain:Array(24).fill("x".repeat(300)),avoid:Array(24).fill("x".repeat(300))};
  const bytes=(text:string)=>new TextEncoder().encode(text).byteLength;
  assert.ok(bytes(JSON.stringify(study)) < MAX_REFERENCE_STUDY_BYTES);
  assert.ok(bytes(JSON.stringify(study,null,2)) > MAX_REFERENCE_STUDY_BYTES);
  const emitted=serializeReferenceStudy(study);
  assert.ok(bytes(emitted)<=MAX_REFERENCE_STUDY_BYTES);
  assert.deepEqual(parseReferenceStudyText(emitted),study);
  assert.equal(serializeReferenceStudy(createReferenceStudy(media())),JSON.stringify(createReferenceStudy(media()),null,2));
  const oversized={...study,beats:study.beats.map(beat=>({...beat,observation:"é".repeat(1200)}))};
  assert.throws(()=>serializeReferenceStudy(oversized),/512 KiB/);
});

test("reference attachment locks real metadata/hash mismatches and explicitly permits only unverified metadata when a hash is unavailable", () => {
  const expected = { ...media(), sha256: "a".repeat(64) };
  assert.equal(matchReferenceMedia(expected, null).identity, "unattached");
  const actual = media(), before = JSON.stringify(expected);
  assert.deepEqual([matchReferenceMedia(expected, actual).matches, matchReferenceMedia(expected, actual).identity], [true, "metadata-only"]);
  assert.equal(JSON.stringify(expected), before, "a prepared hash is not erased");
  assert.equal(matchReferenceMedia(expected, { ...actual, sha256: expected.sha256 }).identity, "checksum");
  assert.equal(matchReferenceMedia(expected, { ...actual, sha256: "b".repeat(64) }).matches, false);
  for (const changed of [{ name: "other.mp4" }, { bytes: 1 }, { width: 1080 }, { height: 1920 }, { duration: 11 }, { duration: NaN }]) {
    assert.equal(matchReferenceMedia(expected, { ...actual, ...changed }).matches, false);
  }
  assert.equal(matchReferenceMedia(expected, { ...actual, duration: 10.02 }).matches, true, "small container/browser timing precision difference");
});

test("paired preview offsets map once, clamp to shared overlap and reject invalid/no-overlap clocks", () => {
  const overlap = referenceComparisonWindow(10, 7, 4, 2)!;
  assert.deepEqual(overlap, { referenceStart: 4, renderStart: 2, duration: 5 });
  assert.deepEqual(referenceComparisonTimes(overlap, 1.5), { elapsed: 1.5, reference: 5.5, render: 3.5 });
  assert.deepEqual(referenceComparisonTimes(overlap, 100), { elapsed: 5, reference: 9, render: 7 });
  assert.deepEqual(referenceComparisonTimes(overlap, -2), { elapsed: 0, reference: 4, render: 2 });
  for (const args of [[10, 7, 10, 0], [10, 7, 0, 7], [10, 7, -1, 0], [NaN, 7, 0, 0], [10, 0, 0, 0]]) {
    assert.equal(referenceComparisonWindow(...args as [number, number, number, number]), null);
  }
  assert.throws(() => referenceComparisonTimes(overlap, NaN), /finite/);
});

test("new playhead beats have unique IDs and bounded source-relative ranges, including the final instant", () => {
  const beat = newReferenceBeat(9.99, 10, ["beat-1", "beat-3"]);
  assert.equal(beat.id, "beat-2"); assert.ok(beat.start < beat.end && beat.end === 10);
  assert.equal(newReferenceBeat(10, 10, []).end, 10);
  assert.ok(newReferenceBeat(10, 10, []).start < 10);
  assert.equal(newReferenceBeat(-3, 10, []).start, 0);
  assert.deepEqual(beat.nativeMomentIds, []);
  assert.throws(() => newReferenceBeat(0, 10, Array.from({ length: 64 }, (_, i) => `beat-${i}`)), /64/);
  assert.throws(() => newReferenceBeat(0, 0, []), /finite/);
});
