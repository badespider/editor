import test from "node:test";
import assert from "node:assert/strict";
import { createLook, LOOK_PRESETS } from "../src/look-presets.ts";
import { compileEffects, EFFECT_CATALOG, MAX_EFFECTS, MAX_EFFECT_UNIFORM_BUFFERS } from "../src/effects.ts";
import type { EffectSpec } from "../src/effects.ts";

const names = ["documentary", "clean-teaching", "archive", "night-tech"] as const;
const unsafe = createLook as (name: unknown, options?: unknown) => readonly EffectSpec[];

test("four frozen look descriptions expose readable intent and grain capability", () => {
  assert.deepEqual(Object.keys(LOOK_PRESETS), names);
  assert(Object.isFrozen(LOOK_PRESETS));
  for (const name of names) {
    assert(Object.isFrozen(LOOK_PRESETS[name]));
    assert(LOOK_PRESETS[name].title.length > 3);
    assert(LOOK_PRESETS[name].purpose.length > 20);
    assert.equal(LOOK_PRESETS[name].usesSeed, ["documentary", "archive"].includes(name));
  }
});

test("documentary orders restrained grade, fine grain and edge shading", () => {
  const stack = createLook("documentary");
  assert.deepEqual(stack.map(effect => effect.kind), ["colorGrade", "grain", "vignette"]);
  assert.deepEqual(stack[0].params, { exposure: 0, contrast: 1.05, saturation: .96, warmth: .1, tint: 0 });
  assert.deepEqual(stack[1].params, { amount: .018, seed: 0, speed: 1 });
  assert.deepEqual(stack[2].params, { strength: .1, roundness: .25, softness: .8 });
});

test("clean teaching keeps a single modest grade without texture or resampling", () => {
  const stack = createLook("clean-teaching");
  assert.deepEqual(stack.map(effect => effect.kind), ["colorGrade"]);
  assert.deepEqual(stack[0].params, { exposure: 0, contrast: 1.04, saturation: .98, warmth: 0, tint: 0 });
});

test("archive and night tech have distinct authored treatments and stable order", () => {
  const archive = createLook("archive"), night = createLook("night-tech");
  assert.deepEqual(archive.map(effect => effect.kind), ["colorGrade", "grain"]);
  assert(archive[0].kind === "colorGrade");
  assert(archive[0].params.saturation < .6 && archive[0].params.warmth > 0);
  assert.deepEqual(night.map(effect => effect.kind), ["colorGrade", "chromaticAberration"]);
  assert(night[0].kind === "colorGrade" && night[0].params.warmth < 0);
  assert(night[1].kind === "chromaticAberration" && night[1].params.amount > 0 && night[1].params.amount < 1);
});

test("zero strength is an exact native passthrough for every look", () => {
  const passthrough = compileEffects([]);
  for (const name of names) {
    const zero = createLook(name, { strength: 0, seed: 65536 });
    assert(Object.isFrozen(zero));
    assert.deepEqual(zero, []);
    assert.deepEqual(compileEffects(zero), passthrough);
  }
});

test("strength interpolates grade deltas and decorative amounts from neutral", () => {
  for (const name of names) {
    const full = createLook(name), half = createLook(name, { strength: .5 });
    assert.deepEqual(half.map(effect => effect.kind), full.map(effect => effect.kind));
    assert(full[0].kind === "colorGrade" && half[0].kind === "colorGrade");
    for (const key of ["exposure", "contrast", "saturation", "warmth", "tint"] as const) {
      const neutral = key === "contrast" || key === "saturation" ? 1 : 0;
      assert(Math.abs(half[0].params[key] - (neutral + (full[0].params[key] - neutral) / 2)) < 1e-12);
    }
    for (let index = 1; index < full.length; index++) {
      const a = full[index], b = half[index];
      if (a.kind === "grain" && b.kind === "grain") assert.equal(b.params.amount, a.params.amount / 2);
      if (a.kind === "vignette" && b.kind === "vignette") assert.equal(b.params.strength, a.params.strength / 2);
      if (a.kind === "chromaticAberration" && b.kind === "chromaticAberration") assert.equal(b.params.amount, a.params.amount / 2);
    }
  }
});

test("curated stacks stay in native control and portable resource limits", () => {
  for (const name of names) for (const strength of [Number.MIN_VALUE, .5, 1]) {
    const stack = createLook(name, { strength });
    assert(stack.length <= MAX_EFFECTS);
    for (const effect of stack) for (const [key, value] of Object.entries(effect.params)) {
      const controls = EFFECT_CATALOG[effect.kind].parameters as Record<string, { type: string; min?: number; max?: number }>;
      const control = controls[key];
      assert.equal(control.type, "number");
      assert(typeof value === "number" && Number.isFinite(value));
      assert(value >= control.min! && value <= control.max!);
    }
    assert(Object.keys(compileEffects(stack).uniforms).length <= MAX_EFFECT_UNIFORM_BUFFERS);
  }
});

test("seed is deterministic, isolated to grain and independent of caller mutation", () => {
  for (const name of names) {
    const options = { strength: .8, seed: 13 };
    const first = createLook(name, options), second = createLook(name, options);
    assert.deepEqual(first, second);
    assert(Object.isFrozen(first) && first.every(effect => Object.isFrozen(effect) && Object.isFrozen(effect.params)));
    options.strength = .1; options.seed = -7;
    assert.deepEqual(first, second);
    const otherSeed = createLook(name, { strength: .8, seed: 14 });
    if (LOOK_PRESETS[name].usesSeed) {
      assert.notDeepEqual(first, otherSeed);
      assert.deepEqual(first.filter(effect => effect.kind !== "grain"), otherSeed.filter(effect => effect.kind !== "grain"));
      assert(first.find(effect => effect.kind === "grain")?.params.seed === 13);
    } else assert.deepEqual(first, otherSeed);
  }
});

test("strict names and option containers reject typos and ignored foreign fields", () => {
  for (const name of ["Documentary", "cleanTeaching", "constructor", "__proto__", "", null, 1]) assert.throws(() => unsafe(name), /unknown look/);
  for (const options of [null, [], false, 0, "x", new Date(), new Map(), () => {}]) assert.throws(() => unsafe("documentary", options), /plain object/);
  assert.throws(() => unsafe("documentary", { strenght: .5 }), /unknown option/);
  assert.throws(() => unsafe("documentary", { [Symbol("seed")]: 2 }), /unknown option/);
  assert.throws(() => unsafe("documentary", Object.defineProperty({}, "opacity", { value: .5 })), /unknown option/);
  assert.deepEqual(createLook("documentary", Object.assign(Object.create(null), { strength: .5 })), createLook("documentary", { strength: .5 }));
});

test("strength and seed validate strictly even for neutral or unseeded looks", () => {
  for (const strength of [NaN, Infinity, -Infinity, null, false, "0"]) assert.throws(() => unsafe("documentary", { strength }), /strength/);
  for (const strength of [-.001, 1.001]) assert.throws(() => createLook("documentary", { strength }), RangeError);
  for (const seed of [NaN, Infinity, null, false, "1", .5, -65537, 65537]) {
    for (const name of names) assert.throws(() => unsafe(name, { strength: 0, seed }), /seed/);
  }
  for (const seed of [-65536, 0, 65536]) assert.equal(createLook("archive", { seed }).find(effect => effect.kind === "grain")?.params.seed, seed);
  for (const name of names) assert.deepEqual(createLook(name, { strength: undefined, seed: undefined }), createLook(name));
});
