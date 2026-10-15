import assert from "node:assert/strict";
import test from "node:test";
import { motion } from "../src/motion-presets";
import { PRESENTATION_THEMES } from "../src/presentation-themes";
import { educationTheme } from "../src/education-core";
import { parseTime, TIME_FPS } from "../src/time";
import type { Keyframe } from "../src/types";

test("reveal builds one entrance, a still reading hold, and a faster exact-frame exit", () => {
  const result = motion.reveal({ duration: 4, direction: "left" });
  assert.deepEqual(result.opacity, [
    { time: "0f", value: 0, easing: "linear" }, { time: "3f", value: 0, easing: "easeOut" },
    { time: "15f", value: 1, easing: "linear" }, { time: "111f", value: 1, easing: "easeIn" }, { time: "119f", value: 0 },
  ]);
  assert.ok(Array.isArray(result.offsetX));
  assert.deepEqual(result.offsetX.slice(0, 4).map(key => key.value), [-24, -24, 0, 0]);
  assert.ok(Math.abs(result.offsetX.at(-1)!.value - 15.6) < 1e-9);
  assert.equal(result.offsetY, undefined); assert.equal(result.scale, undefined);
});

test("reveal can use opacity only and remains compatible with a trimmed media clock", () => {
  assert.deepEqual(Object.keys(motion.reveal({ duration: 2, direction: "none" })), ["opacity"]);
  assert.deepEqual(Object.keys(motion.reveal({ duration: 2, distance: 0 })), ["opacity"]);
  const original = motion.reveal({ duration: "12f", enterDuration: "3f", exitDuration: "2f", delay: 0 });
  const shifted = motion.forClip({ sourceIn: 5 }, original);
  for (const values of Object.values(original)) {
    assert.ok(Array.isArray(values));
    const times = values.map(key => Math.round(parseTime(key.time)! * TIME_FPS));
    assert.equal(times[0], 0); assert.equal(times.at(-1), 11);
    assert.ok(times.every((time, index) => !index || time > times[index - 1]));
  }
  assert.ok(Array.isArray(shifted.opacity)); assert.equal(shifted.opacity.at(-1)?.time, "161f");
  assert.equal((original.opacity as Keyframe<number>[]).at(-1)?.time, "11f");
});

test("reveal rejects overlapping phases and invalid direction/geometry/timing", () => {
  for (const options of [undefined, { duration: .4 }, { duration: 0 }, { duration: Infinity },
    { duration: 4, delay: -1 }, { duration: 4, enterDuration: 0 }, { duration: 4, exitDuration: NaN },
    { duration: 4, distance: -1 }, { duration: 4, direction: "diagonal" }]) {
    assert.throws(() => Reflect.apply(motion.reveal, undefined, [options]));
  }
  assert.throws(() => motion.reveal({ duration: "6f", enterDuration: "3f", exitDuration: "2f", delay: 0 }), /reading-hold/);
});

function luminance(hex: string): number {
  const rgb = [1,3,5].map(index => parseInt(hex.slice(index,index + 2),16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
test("curated paper themes keep every text role readable against both native surfaces", () => {
  for (const theme of [PRESENTATION_THEMES.documentary.paper, PRESENTATION_THEMES.education.classroom]) {
    assert.ok(Object.isFrozen(theme));
    for (const surface of [theme.background, theme.surface]) for (const key of ["text","muted","accent"] as const) {
      const a = luminance(surface), b = luminance(theme[key]);
      assert.ok((Math.max(a,b) + .05) / (Math.min(a,b) + .05) >= 4.5, `${key} on ${surface}`);
    }
  }
  assert.deepEqual(educationTheme(PRESENTATION_THEMES.education.classroom), PRESENTATION_THEMES.education.classroom);
  assert.equal(PRESENTATION_THEMES.education.technical.background, "#101C2B");
});
