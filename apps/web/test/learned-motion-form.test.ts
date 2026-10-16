import assert from "node:assert/strict";
import test from "node:test";
import type { LearnedMotion } from "@diffusionstudio/editing-playbook/motion-learned";
import { learnedMotionFieldDefaults, learnedMotionFieldValues, learnedMotionFieldsFromJson } from "../src/components/sidebar-left/learned-motion-form.ts";

function component(): LearnedMotion {
  return { schemaVersion: 1, id: "editable-label", name: "Editable label", description: "Synthetic native form fixture.", tags: [],
    plan: { schemaVersion: 2, title: "Form fixture", summary: "Synthetic component, not a reviewed video.", width: 640, height: 360, fps: 30, duration: 2,
      background: "#FFFFFF", assetRequests: [], unresolved: [], observations: [], layers: [{ id: "label", name: "Label", type: "text", start: 0, end: 2,
        x: 30, y: 100, width: 580, height: 100, rotation: 0, opacity: 1, fill: "#121212", radius: 0, text: "Example", fontFamily: "Arial", fontSize: 40, fontWeight: 400,
        fontStyle: "normal", textAlign: "left", letterSpacing: 0, leading: 1, assetId: null, objectFit: "contain", sourceIn: 0,
        scaleX: 1, scaleY: 1, clipToBox: false, evidenceIds: ["synthetic-frame"], keyframes: [] }] },
    parameters: [{ id: "headline", label: "Headline", type: "text", default: "Example", minimum: null, maximum: null, bindings: [{ layerId: "label", field: "text" }] },
      { id: "ink", label: "Text color", type: "color", default: "#121212", minimum: null, maximum: null, bindings: [{ layerId: "label", field: "fill" }] },
      { id: "size", label: "Type size", type: "number", default: 40, minimum: 20, maximum: 120, bindings: [{ layerId: "label", field: "fontSize" }] },
      { id: "font", label: "Font", type: "font", default: "Arial", minimum: null, maximum: null, bindings: [{ layerId: "label", field: "fontFamily" }] }],
  };
}

test("normal controls retain literal wording and emit typed numeric, color and font values", () => {
  const input = component(), before = structuredClone(input), fields = learnedMotionFieldDefaults(input);
  assert.deepEqual(fields, { headline: "Example", ink: "#121212", size: "40", font: "Arial" });
  const hostile = '</script>${globalThis.formExecuted=true}\nA second line';
  Object.assign(fields, { headline: hostile, ink: "#AABBCC", size: "67.5", font: "Verdana" });
  assert.deepEqual(learnedMotionFieldValues(input, fields), { headline: hostile, ink: "#AABBCC", size: 67.5, font: "Verdana" });
  assert.deepEqual(input, before); assert.equal((globalThis as Record<string, unknown>).formExecuted, undefined);
});

test("unfinished or invalid numeric controls never silently reuse defaults or become zero", () => {
  const input = component(), fields = learnedMotionFieldDefaults(input);
  for (const size of ["", "   ", "NaN", "Infinity", "five", "19", "121"]) assert.throws(() => learnedMotionFieldValues(input, { ...fields, size }));
  for (const changed of [{ headline: " " }, { ink: "#FFF" }, { font: "url(https://invalid.example)" }]) assert.throws(() => learnedMotionFieldValues(input, { ...fields, ...changed }));
});

test("advanced JSON applies atomically to controls and fills omitted parameters from declared defaults", () => {
  const input = component(), fields = learnedMotionFieldsFromJson(input, JSON.stringify({ headline: "A new idea", size: 52 }));
  assert.deepEqual(fields, { headline: "A new idea", ink: "#121212", size: "52", font: "Arial" });
  assert.deepEqual(learnedMotionFieldValues(input, fields), { headline: "A new idea", ink: "#121212", size: 52, font: "Arial" });
  const roundtrip = learnedMotionFieldsFromJson(input, JSON.stringify(learnedMotionFieldValues(input, fields)));
  assert.deepEqual(roundtrip, fields);
});

test("malformed JSON, extra parameters and incompatible value types cannot replace controls", () => {
  const input = component(), fields = learnedMotionFieldDefaults(input), before = structuredClone(fields);
  for (const value of ["{", "null", "[]", '{"unknown":"x"}', '{"size":"52"}', '{"headline":42}', '{"ink":"javascript:run()"}']) assert.throws(() => learnedMotionFieldsFromJson(input, value));
  assert.deepEqual(fields, before);
});
