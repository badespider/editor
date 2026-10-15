import assert from "node:assert/strict";
import test from "node:test";
import { motion } from "../src/motion-presets.ts";
import type { MotionPreset } from "../src/motion-presets.ts";
import { parseTime, TIME_FPS } from "../src/time.ts";
import type { Keyframe, PatchProps } from "../src/types.ts";

function track(preset: MotionPreset, property: keyof MotionPreset): Keyframe<number>[] {
  const value = preset[property];
  assert.ok(Array.isArray(value), `${property} is an editable keyframe track`);
  return value;
}

function frameNumbers(keyframes: Keyframe<number>[]) {
  return keyframes.map(key => {
    const seconds = parseTime(key.time);
    assert.notEqual(seconds, undefined);
    return Math.round(seconds! * TIME_FPS);
  });
}

function invoke(method: keyof typeof motion, options?: unknown): unknown {
  return Reflect.apply(motion[method], undefined, [options]);
}

test("reveal protects an explicit reading hold at the exact canonical frame budget", () => {
  const options = { duration: "20f", delay: "2f", enterDuration: "4f", exitDuration: "3f" } as const;
  const result = motion.reveal({ ...options, minHold: "10f", direction: "left" });
  const opacity = track(result, "opacity");
  assert.deepEqual(frameNumbers(opacity), [0, 2, 6, 16, 19]);
  assert.deepEqual(opacity.map(key => key.value), [0, 0, 1, 1, 0]);
  assert.equal(opacity[2].easing, "linear");
  assert.equal(opacity[3].easing, "easeIn");
  assert.throws(() => motion.reveal({ ...options, minHold: "11f" }), /reading-hold has 10 frames but minHold requires 11/);
  assert.throws(() => motion.reveal({ ...options, duration: "19f", minHold: "10f" }), /minHold requires 10/);
  assert.deepEqual(motion.reveal({ ...options, minHold: 10 / 30 }), motion.reveal({ ...options, minHold: "10f" }));
});

test("minimum hold preserves existing default tracks and never removes the one-frame hold", () => {
  assert.deepEqual(motion.reveal({ duration: 4 }), motion.reveal({ duration: 4, minHold: "1f" }));
  const smallestDefault = motion.reveal({ duration: "25f" });
  assert.deepEqual(frameNumbers(track(smallestDefault, "opacity")), [0, 3, 15, 16, 24]);
  assert.throws(() => motion.reveal({ duration: "25f", minHold: "2f" }), /minHold/);
  for (const minHold of [0, -.1, NaN, Infinity, null, false, ".001f", "0.1f", "bad", "1second"]) {
    assert.throws(() => invoke("reveal", { duration: 4, minHold }), /minHold/);
  }
});

test("reading hold and final frame travel exactly once with a trimmed media clock", () => {
  const original = motion.reveal({ duration: "20f", delay: "2f", enterDuration: "4f", exitDuration: "3f", minHold: "10f", direction: "up" });
  const baseline = structuredClone(original);
  const shifted = motion.forClip({ sourceIn: "91f" }, original);
  for (const property of Object.keys(original) as (keyof MotionPreset)[]) {
    assert.deepEqual(frameNumbers(track(shifted, property)), [91, 93, 97, 107, 110]);
    assert.deepEqual(track(shifted, property).map(key => key.value), track(original, property).map(key => key.value));
  }
  assert.equal(track(shifted, "opacity").at(-1)?.value, 0);
  assert.deepEqual(original, baseline);
});

test("popIn is spreadable native opacity and uniform-scale motion", () => {
  const props: PatchProps = motion.popIn();
  assert.deepEqual(Object.keys(props).sort(), ["opacity", "scale"]);
  assert.deepEqual(props.scale, [{time: "0f", value: .82, easing: "bouncy"}, {time: "12f", value: 1}]);
  assert.deepEqual(props.opacity, [{time: "0f", value: 0, easing: "easeOut"}, {time: "6f", value: 1}]);
  assert.deepEqual(motion.captionPop().scale, [{time: "0f", value: .9, easing: "bouncy"}, {time: "9f", value: 1}]);
  assert.deepEqual(motion.captionPop({duration: undefined, fromScale: undefined}), motion.captionPop());
  assert.equal(track(motion.captionPop({duration: "3f", fromScale: .7}), "scale").at(-1)?.time, "3f");
});

test("delay holds the initial pose and zero delay never makes duplicate keys", () => {
  const immediate = motion.popIn({duration: "1f", delay: 0});
  for (const property of ["opacity", "scale"] as const) assert.deepEqual(frameNumbers(track(immediate, property)), [0, 1]);
  assert.deepEqual(motion.fadeIn({duration: "12f", delay: "3f"}).opacity, [
    {time: "0f", value: 0}, {time: "3f", value: 0, easing: "easeOut"}, {time: "15f", value: 1},
  ]);
  const delayed = track(motion.popIn({duration: "12f", delay: "3f"}), "scale");
  assert.deepEqual(delayed.map(k => k.value), [.82, .82, 1]);
  assert.deepEqual(frameNumbers(delayed), [0, 3, 15]);
});

test("seconds, frames and clock notation produce the same canonical timeline", () => {
  assert.deepEqual(motion.fadeIn({duration: 1, delay: .5}), motion.fadeIn({duration: "30f", delay: "15f"}));
  assert.deepEqual(motion.fadeIn({duration: 1, delay: .5}), motion.fadeIn({duration: "00:01", delay: "00:00.5"}));
  assert.deepEqual(frameNumbers(track(motion.fadeIn({duration: .05}), "opacity")), [0, 2]);
  assert.deepEqual(frameNumbers(track(motion.fadeIn({duration: "0.5f"}), "opacity")), [0, 1]);
});

test("slides enter from the requested edge without replacing layout positions or opacity", () => {
  for (const [direction, property, from] of [
    ["left", "offsetX", -80], ["right", "offsetX", 80], ["up", "offsetY", -80], ["down", "offsetY", 80],
  ] as const) {
    const preset = motion.slideIn({direction, distance: 80, duration: "9f", delay: "2f", easing: "snappy"});
    assert.deepEqual(Object.keys(preset), [property]);
    assert.deepEqual(track(preset, property), [{time: "0f", value: from}, {time: "2f", value: from, easing: "snappy"}, {time: "11f", value: 0}]);
  }
  assert.equal(track(motion.slideIn({easing: "cubicBezier(0.25,0.1,0.25,1)"}), "offsetX")[0].easing, "cubicBezier(0.25,0.1,0.25,1)");
  for (const easing of ["bouncy", "spring(0.4,500)", "steps(3)"] as const) assert.equal(track(motion.slideIn({easing}), "offsetX")[0].easing, easing);
});

test("fadeOut uses an explicit local start and holds transparent after its last key", () => {
  assert.deepEqual(motion.fadeOut({at: "2f", duration: "4f"}).opacity, [
    {time: "0f", value: 1}, {time: "2f", value: 1, easing: "easeIn"}, {time: "6f", value: 0},
  ]);
  assert.deepEqual(frameNumbers(track(motion.fadeOut({at: 0, duration: "1f"}), "opacity")), [0, 1]);
  assert.throws(() => invoke("fadeOut", {duration: 1}), /at.*time/);
});

test("custom easings normalize to host grammar and retain native step direction", () => {
  for (const [input, expected] of [
    ["cubicBezier(0.25, 0.1, 0.25, 1)", "cubicBezier(0.25,0.1,0.25,1)"],
    ["spring( .4, 500 )", "spring(.4,500)"],
    ["steps(3, true)", "steps(3,true)"],
    ["steps(3,false)", "steps(3,false)"],
  ]) {
    const preset = invoke("slideIn", {easing: input}) as MotionPreset;
    const actual = track(preset, "offsetX")[0].easing;
    assert.equal(actual, expected);
    // WorldDocument.parseEasing's accepted descriptor grammar.
    assert.ok(/^cubicBezier\(-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+\)$/.test(actual!) || /^spring\(-?[\d.]+,-?[\d.]+\)$/.test(actual!) || /^steps\(\d+(,(true|false))?\)$/.test(actual!));
  }
  for (const easing of ["spring(5e-1,500)", "cubicBezier(0.25,0.1,0.25,1e0)", "spring(0 .5,500)", "steps(0,true)", "steps(3,1)"]) assert.throws(() => invoke("slideIn", {easing}), /easing/);
});

test("slowZoom uses actual uniform scale rather than changing layout dimensions", () => {
  const zoom = motion.slowZoom({duration: 2, from: 1.2, to: .8});
  assert.deepEqual(Object.keys(zoom), ["scale"]);
  assert.deepEqual(zoom.scale, [{time: "0f", value: 1.2, easing: "linear"}, {time: "60f", value: .8}]);
  assert.equal(track(motion.slowZoom({duration: "1f", from: .001, to: 2}), "scale")[0].value, .001);
});

test("float completes whole up-and-down cycles and returns to its original offset", () => {
  const keys = track(motion.float({duration: "32f", distance: 7, cycles: 2}), "offsetY");
  assert.deepEqual(frameNumbers(keys), [0, 4, 8, 12, 16, 20, 24, 28, 32]);
  assert.deepEqual(keys.map(k => k.value), [0, -7, 0, 7, 0, -7, 0, 7, 0]);
  assert.deepEqual(frameNumbers(track(motion.float({duration: "5f", cycles: 1}), "offsetY")), [0, 1, 3, 4, 5]);
  assert.equal(track(motion.float({duration: "4000f", cycles: 1000}), "offsetY").length, 4001);
  assert.throws(() => motion.float({duration: "7f", cycles: 2}), /four frames per cycle/);
});

test("all preset tracks use finite strictly increasing integer frame times", () => {
  const presets = [motion.popIn(), motion.captionPop(), motion.slideIn({delay: .31}), motion.fadeIn({delay: .31}), motion.fadeOut({at: .31}), motion.slowZoom({duration: .31}), motion.float({duration: 1.03})];
  for (const preset of presets) for (const property of Object.keys(preset) as (keyof MotionPreset)[]) {
    const keys = track(preset, property), frames = frameNumbers(keys);
    assert.ok(keys.every(key => typeof key.time === "string" && /^\d+f$/.test(key.time) && Number.isFinite(key.value)));
    assert.ok(frames.every((frame, index) => Number.isSafeInteger(frame) && (index === 0 || frame > frames[index - 1])));
  }
});

test("invalid timings fail before they can become zero-length or unsafe tracks", () => {
  for (const duration of [0, -1, -.0001, NaN, Infinity, -Infinity, .001, "0f", "-1f", "0.1f", "garbage", "1second", "00:nope", "1e309f", undefined]) {
    assert.throws(() => invoke("slowZoom", {duration}), /duration.*(?:time|frame)/, String(duration));
  }
  for (const delay of [-.001, NaN, Infinity, "-1f", "bad"]) assert.throws(() => invoke("fadeIn", {delay}), /delay/);
  for (const at of [-.001, NaN, Infinity, "-1f"]) assert.throws(() => invoke("fadeOut", {at}), /at/);
  assert.throws(() => motion.fadeIn({duration: Number.MAX_SAFE_INTEGER, delay: 1}), /safe frame/);
  assert.throws(() => motion.fadeIn({duration: "1f", delay: "9007199254740991f"}), /safe frame/);
});

test("invalid distances, scales, cycle counts and easings fail with named errors", () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.throws(() => motion.slideIn({distance: value}), /distance/);
    assert.throws(() => motion.float({duration: 1, distance: value}), /distance/);
    assert.throws(() => motion.popIn({fromScale: value}), /fromScale/);
    assert.throws(() => motion.slowZoom({duration: 1, from: value}), /from/);
    assert.throws(() => motion.slowZoom({duration: 1, to: value}), /to/);
  }
  assert.throws(() => motion.popIn({fromScale: .0009}), /at least 0.001/);
  for (const cycles of [0, -1, .5, NaN, Infinity, 1001]) assert.throws(() => motion.float({duration: 1, cycles}), /cycles/);
  for (const easing of ["unknown", "steps(0)", "steps(1.5)", "spring(2,500)", "spring(0.5,0)", "cubicBezier(-1,0,1,1)", "cubicBezier(0,,1,1)", "cubicBezier(0,NaN,1,1)"]) assert.throws(() => invoke("slideIn", {easing}), /easing/);
  assert.throws(() => invoke("slideIn", {direction: "diagonal"}), /direction/);
});

test("combine merges only disjoint property ownership and copies input keyframes", () => {
  const fade = motion.fadeIn();
  const result: PatchProps = motion.combine(fade, motion.slideIn(), motion.float({duration: 1}), motion.slowZoom({duration: 1}));
  assert.deepEqual(Object.keys(result).sort(), ["offsetX", "offsetY", "opacity", "scale"]);
  assert.deepEqual(motion.combine(), {});
  const copy = track(result, "opacity"), original = track(fade, "opacity");
  copy[0].value = .2;
  assert.equal(original[0].value, 0);
  assert.throws(() => motion.combine(motion.popIn(), motion.fadeIn()), /overlapping opacity/);
  assert.throws(() => motion.combine(motion.popIn(), motion.slowZoom({duration: 1})), /overlapping scale/);
  assert.throws(() => motion.combine(motion.fadeIn(), motion.fadeOut({at: 10})), /overlapping opacity/);
  assert.throws(() => Reflect.apply(motion.combine, undefined, [{animations: [{type: "grow"}]}]), /does not support animations/);
});

test("combine validates custom native tracks and canonicalizes their clocks", () => {
  assert.deepEqual(motion.combine({offsetX: [{time: 0, value: -3}, {time: "00:01", value: 0}]}).offsetX, [{time: "0f", value: -3}, {time: "30f", value: 0}]);
  for (const preset of [null, [], {opacity: undefined}, {offsetX: []}, {opacity: NaN}, {scale: 0}, {opacity: -1}, {offsetX: [{time: 0, value: Infinity}]}]) assert.throws(() => Reflect.apply(motion.combine, undefined, [preset]));
  assert.throws(() => Reflect.apply(motion.combine, undefined, [{offsetX: Array(2)}]), /keyframe time/);
  assert.throws(() => motion.combine({offsetX: [{time: "1f", value: 1}, {time: 1 / 30, value: 2}]}), /increase strictly/);
  assert.throws(() => motion.combine({offsetX: [{time: "2f", value: 1}, {time: "1f", value: 2}]}), /increase strictly/);
});

test("repeated calls are deterministic and do not share mutable tracks", () => {
  const options = Object.freeze({duration: "9f" as const, delay: "3f" as const, fromScale: .85});
  const a = motion.popIn(options), b = motion.popIn(options);
  assert.deepEqual(a, b);
  track(a, "scale")[0].value = .5;
  assert.equal(track(b, "scale")[0].value, .85);
  assert.deepEqual(options, {duration: "9f", delay: "3f", fromScale: .85});
});

test("forClip maps clip-relative motion into seconds or frame-based source clocks", () => {
  const entrance = motion.popIn({duration: "12f", delay: "3f"});
  const seconds = motion.forClip({sourceIn: 10}, entrance);
  assert.deepEqual(seconds, motion.forClip({sourceIn: "300f"}, entrance));
  assert.deepEqual(frameNumbers(track(seconds, "scale")), [300, 303, 315]);
  assert.deepEqual(frameNumbers(track(seconds, "opacity")), [300, 303, 309]);
  assert.deepEqual(track(seconds, "scale").map(k => k.value), [.82, .82, 1]);
  assert.equal(track(seconds, "scale")[1].easing, "bouncy");
  const clip = {sourceIn: 10, sourceOut: 18, start: 0};
  assert.deepEqual(motion.forClip(clip, entrance), seconds);
  assert.deepEqual(Object.keys(seconds).sort(), ["opacity", "scale"]);
  assert.deepEqual(clip, {sourceIn: 10, sourceOut: 18, start: 0});
});

test("forClip preserves zero-origin tracks, static values and input ownership", () => {
  const entrance = motion.fadeIn({delay: "3f"});
  assert.deepEqual(motion.forClip({}, entrance), entrance);
  assert.deepEqual(motion.forClip({sourceIn: 0}, entrance), entrance);
  assert.deepEqual(motion.forClip({sourceIn: 2}, {opacity: .5, scale: 1.2}), {opacity: .5, scale: 1.2});
  const adapted = motion.forClip({sourceIn: "6f"}, entrance);
  track(adapted, "opacity")[0].value = .3;
  assert.equal(track(entrance, "opacity")[0].value, 0);
  assert.deepEqual(frameNumbers(track(entrance, "opacity")), [0, 3, 15]);
  assert.deepEqual(motion.forClip({sourceIn: 1}), {});
});

test("forClip offsets the entire slowZoom and float window without shortening them", () => {
  const adapted = motion.forClip({sourceIn: 10}, motion.slowZoom({duration: 8}), motion.float({duration: 8, cycles: 2}));
  assert.deepEqual(frameNumbers(track(adapted, "scale")), [300, 540]);
  const floatingFrames = frameNumbers(track(adapted, "offsetY"));
  assert.equal(floatingFrames[0], 300);
  assert.equal(floatingFrames.at(-1), 540);
  assert.equal(floatingFrames.length, 9);
  assert.equal(track(adapted, "offsetY").at(-1)?.value, 0);
});

test("forClip validates the source clock, collisions and shifted-frame overflow", () => {
  for (const sourceIn of [-1, NaN, Infinity, "bad", "-1f"]) assert.throws(() => Reflect.apply(motion.forClip, undefined, [{sourceIn}, motion.fadeIn()]), /sourceIn/);
  assert.throws(() => Reflect.apply(motion.forClip, undefined, [null, motion.fadeIn()]), /clip clock/);
  assert.throws(() => motion.forClip({sourceIn: "9007199254740991f"}, motion.fadeIn({duration: "1f"})), /safe frame/);
  assert.throws(() => motion.forClip({sourceIn: 10}, motion.fadeIn(), motion.fadeOut({at: 2})), /overlapping opacity/);
});
