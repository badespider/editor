import test from "node:test";
import assert from "node:assert/strict";
import {
  EFFECT_CATALOG,
  MAX_EFFECTS,
  MAX_EFFECT_UNIFORM_BUFFERS,
  MAX_EFFECT_SOURCE_SAMPLES,
  chromaticAberration,
  colorGrade,
  compileEffects,
  duotone,
  filmLook,
  grain,
  pixelate,
  scanlines,
  vignette,
} from "../src/effects.ts";
import type { EffectKind, EffectSpec } from "../src/effects.ts";

const factories = {
  colorGrade, filmLook, vignette, grain, chromaticAberration, pixelate, scanlines, duotone,
};
const allDefaults = () => Object.values(factories).map((factory) => factory());

test("catalog describes every factory's defaults with labeled inclusive bounds", () => {
  assert.deepEqual(Object.keys(EFFECT_CATALOG), Object.keys(factories));
  for (const spec of allDefaults()) {
    assert(Object.isFrozen(spec));
    assert(Object.isFrozen(spec.params));
    const entry = EFFECT_CATALOG[spec.kind];
    assert(entry.label && entry.description);
    assert(Object.isFrozen(entry.parameters));
    for (const [name, parameter] of Object.entries(entry.parameters)) {
      assert(parameter.label);
      assert(Object.isFrozen(parameter));
      assert.equal(spec.params[name as keyof typeof spec.params], parameter.default);
      if (parameter.type === "number") {
        assert(Number.isFinite(parameter.min) && Number.isFinite(parameter.max));
        assert(parameter.default >= parameter.min && parameter.default <= parameter.max);
      } else {
        assert.equal(parameter.format, "#RRGGBB");
      }
    }
  }
});

test("factories snapshot options and freeze the resulting public descriptions", () => {
  const options = { exposure: 1, warmth: 0.3 };
  const description = colorGrade(options);
  options.exposure = 3;
  assert.equal(description.params.exposure, 1);
  assert.equal(description.params.warmth, 0.3);
  assert.equal(description.params.contrast, 1);
  assert.throws(() => Object.assign(description.params, { exposure: 5 }), TypeError);
  assert.throws(() => Object.assign(description, { kind: "grain" }), TypeError);
});

test("numeric controls reject non-finite/coerced/out-of-range input rather than clamp", () => {
  const unsafe = factories as Record<EffectKind, (input: Record<string, unknown>) => EffectSpec>;
  for (const [kind, entry] of Object.entries(EFFECT_CATALOG)) {
    for (const [name, parameter] of Object.entries(entry.parameters)) {
      if (parameter.type !== "number") continue;
      const factory = unsafe[kind as EffectKind];
      for (const value of [NaN, Infinity, -Infinity, "0", null, false]) {
        assert.throws(() => factory({ [name]: value }), new RegExp(`${kind}\\.${name}`));
      }
      assert.throws(() => factory({ [name]: parameter.min - 1 }), RangeError);
      assert.throws(() => factory({ [name]: parameter.max + 1 }), RangeError);
      assert.equal((factory({ [name]: parameter.min }).params as Record<string, unknown>)[name], parameter.min);
      assert.equal((factory({ [name]: parameter.max }).params as Record<string, unknown>)[name], parameter.max);
    }
  }
});

test("unknown controls and invalid option containers have actionable errors", () => {
  const unsafe = grain as (options: unknown) => EffectSpec;
  assert.throws(() => unsafe({ amuont: 0.1 }), /grain\.amuont: unknown parameter/);
  for (const options of [null, [], true, 1, "grain"]) {
    assert.throws(() => unsafe(options), /grain: options must be an object/);
  }
  assert.equal(grain({ amount: undefined }).params.amount, 0.1);
});

test("duotone accepts six-digit RGB colors and packs normalized channels", () => {
  const spec = duotone({ dark: "#1133aa", light: "#EECC88", amount: 0.6 });
  assert.equal(spec.params.dark, "#1133AA");
  assert.deepEqual(compileEffects([spec]).uniforms, {
    fx_s0_dark: [17 / 255, 51 / 255, 170 / 255, 0.6],
    fx_s0_light: [238 / 255, 204 / 255, 136 / 255, 0],
  });
  for (const dark of ["red", "#123", "#11223344", "112233", " #112233", "#GG0000"]) {
    assert.throws(() => duotone({ dark }), /duotone\.dark: expected a #RRGGBB color/);
  }
});

test("compilation is repeatable and does not mutate the stack or factory inputs", () => {
  const stack = Object.freeze([colorGrade({ exposure: 0.4 }), grain({ seed: 77 }), pixelate({ size: 12 })]);
  const first = compileEffects(stack);
  const second = compileEffects(stack);
  assert.deepEqual(first, second);
  assert.equal(stack.length, 3);
  // Returned host values are independent: changing one compile does not poison another.
  (first.uniforms.fx_s0_params as number[])[0] = 9;
  assert.equal((second.uniforms.fx_s0_params as number[])[0], 0.4);
});

test("knob changes update only uniforms, leaving the shader program stable", () => {
  const a = compileEffects([colorGrade(), grain(), duotone()]);
  const b = compileEffects([
    colorGrade({ exposure: 1, contrast: 1.3, warmth: -0.2 }),
    grain({ seed: 13, speed: 0 }),
    duotone({ dark: "#000000", light: "#FFFFFF", amount: 0.4 }),
  ]);
  assert.equal(a.wgsl, b.wgsl);
  assert.notDeepEqual(a.uniforms, b.uniforms);
});

test("one shader handles all eight effects, with unique stage-prefixed bindings", () => {
  const compiled = compileEffects(allDefaults());
  assert.equal((compiled.wgsl.match(/@fragment/g) ?? []).length, 1);
  assert.equal((compiled.wgsl.match(/sampleSource\(uv\)/g) ?? []).length, 1);
  assert.match(compiled.wgsl, /return stage8\(uv\)/);
  const declared = [...compiled.wgsl.matchAll(/@group\(1\) @binding\((\d+)\) var<uniform> (\w+):/g)];
  assert.equal(declared.length, 10);
  assert.equal(new Set(declared.map((match) => match[1])).size, 10);
  assert.deepEqual(declared.map((match) => match[2]), Object.keys(compiled.uniforms));
  assert(Object.keys(compiled.uniforms).every((name) => /^fx_s\d+_/.test(name)));
});

test("repeated effect instances keep independent uniform values", () => {
  const compiled = compileEffects([grain({ amount: 0.2, seed: 1 }), grain({ amount: 0.8, seed: 2 })]);
  assert.deepEqual(compiled.uniforms.fx_s0_params, [0.2, 1, 1, 0]);
  assert.deepEqual(compiled.uniforms.fx_s1_params, [0.8, 2, 1, 0]);
  assert.match(compiled.wgsl, /fn stage2[\s\S]*let color = stage1\(uv\)/);
});

test("coordinate effects sample previous stages, preserving declared order", () => {
  const gradeThenSplit = compileEffects([colorGrade({ warmth: 0.5 }), chromaticAberration()]).wgsl;
  const splitStage = gradeThenSplit.slice(gradeThenSplit.indexOf("fn stage2"));
  assert.match(splitStage, /stage1\(uv \+ offset\)/);
  assert.match(splitStage, /stage1\(uv - offset\)/);
  assert(!splitStage.includes("sampleSource"));

  const grainThenPixels = compileEffects([grain(), pixelate()]).wgsl;
  const pixelsThenGrain = compileEffects([pixelate(), grain()]).wgsl;
  assert.match(grainThenPixels.slice(grainThenPixels.indexOf("fn stage2")), /stage1\(clamp\(snapped/);
  assert.match(pixelsThenGrain.slice(pixelsThenGrain.indexOf("fn stage2")), /fx_noise\(uv/);
  assert.notEqual(grainThenPixels, pixelsThenGrain);
});

test("passthrough and neutral knob settings remain expressible", () => {
  const empty = compileEffects([]);
  assert.deepEqual(empty.uniforms, {});
  assert.match(empty.wgsl, /fn stage0\(uv: vec2f\) -> vec4f \{ return sampleSource\(uv\); \}/);
  assert.match(empty.wgsl, /return stage0\(uv\)/);
  const neutral = compileEffects([
    colorGrade(), filmLook({ strength: 0 }), vignette({ strength: 0 }), grain({ amount: 0 }),
    chromaticAberration({ amount: 0 }), pixelate({ size: 1 }), scanlines({ strength: 0 }), duotone({ amount: 0 }),
  ]);
  assert.deepEqual(neutral.uniforms.fx_s0_params, [0, 1, 1, 0]);
  assert.equal(neutral.uniforms.fx_s4_amount, 0);
  assert.equal(neutral.uniforms.fx_s5_size, 1);
});

test("grain uses seeded quantized playhead time and RGB is re-premultiplied", () => {
  const { wgsl } = compileEffects([grain({ seed: 3, speed: 0 })]);
  assert.match(wgsl, /floor\(globals\.time \* 30\.0 \+ 0\.0001\) \* speed/);
  assert(!/Date|performance|random\(/.test(wgsl));
  assert.match(wgsl, /color\.a > 0\.000001/);
  assert.match(wgsl, /color\.rgb \/ color\.a/);
  assert.match(wgsl, /clamp\(rgb,[^\n]+\) \* alpha, alpha/);
});

test("bounded stacks fail before returning a shader that exceeds portable limits", () => {
  assert.equal(MAX_EFFECTS, 8);
  assert.equal(MAX_EFFECT_UNIFORM_BUFFERS, 11);
  assert.throws(() => compileEffects(Array.from({ length: 9 }, () => grain())), /at most 8 effects/);
  assert.throws(() => compileEffects(Array.from({ length: 6 }, () => colorGrade())), /needs 12 uniform buffers.*maximum is 11/);
  assert.equal(Object.keys(compileEffects([...Array.from({ length: 5 }, () => colorGrade()), grain()]).uniforms).length, 11);
});

test("recursive spatial composition is bounded at 81 source samples per pixel", () => {
  assert.equal(MAX_EFFECT_SOURCE_SAMPLES, 81);
  assert.match(compileEffects(Array.from({ length: 4 }, () => chromaticAberration())).wgsl, /return stage4\(uv\)/);
  assert.throws(
    () => compileEffects(Array.from({ length: 5 }, () => chromaticAberration())),
    /243 source samples per pixel.*maximum is 81.*Reduce chromaticAberration/,
  );
  // Cost is conservative, so a later knob update cannot turn an accepted stack expensive.
  assert.throws(() => compileEffects(Array.from({ length: 5 }, () => chromaticAberration({ amount: 0 }))), /maximum is 81/);
});

test("opaque descriptions reject forged, deserialized and sparse stacks clearly", () => {
  const unsafe = compileEffects as (effects: unknown) => unknown;
  assert.throws(() => unsafe({}), /expected an array/);
  assert.throws(() => unsafe([JSON.parse(JSON.stringify(grain()))]), /effect 0 must be created by an effect factory/);
  assert.throws(() => unsafe([null]), /effect 0 must be created by an effect factory/);
  assert.throws(() => unsafe(new Array(1)), /effect 0 must be created by an effect factory/);
});
