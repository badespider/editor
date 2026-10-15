/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { ShaderPaint } from "./elements";
import type { ShaderPaintProps } from "./types";

export type ColorGradeOptions = Readonly<Partial<{
  exposure: number; contrast: number; saturation: number; warmth: number; tint: number;
}>>;
export type FilmLookOptions = Readonly<Partial<{
  warmth: number; grain: number; vignette: number; strength: number;
}>>;
export type VignetteOptions = Readonly<Partial<{
  strength: number; roundness: number; softness: number;
}>>;
export type GrainOptions = Readonly<Partial<{ amount: number; seed: number; speed: number }>>;
export type ChromaticAberrationOptions = Readonly<Partial<{ amount: number }>>;
export type PixelateOptions = Readonly<Partial<{ size: number }>>;
export type ScanlinesOptions = Readonly<Partial<{ strength: number; spacing: number }>>;
export type DuotoneOptions = Readonly<Partial<{ dark: string; light: string; amount: number }>>;

type ParametersByKind = {
  colorGrade: Required<ColorGradeOptions>;
  filmLook: Required<FilmLookOptions>;
  vignette: Required<VignetteOptions>;
  grain: Required<GrainOptions>;
  chromaticAberration: Required<ChromaticAberrationOptions>;
  pixelate: Required<PixelateOptions>;
  scanlines: Required<ScanlinesOptions>;
  duotone: Required<DuotoneOptions>;
};
export type EffectKind = keyof ParametersByKind;

export type NumericEffectParameter = Readonly<{
  type: "number"; label: string; default: number; min: number; max: number; unit?: string;
}>;
export type ColorEffectParameter = Readonly<{
  type: "color"; label: string; default: string; format: "#RRGGBB";
}>;
export type EffectParameter = NumericEffectParameter | ColorEffectParameter;
export type EffectCatalog = {
  readonly [K in EffectKind]: Readonly<{
    label: string;
    description: string;
    parameters: { readonly [P in keyof ParametersByKind[K]]:
      ParametersByKind[K][P] extends number ? NumericEffectParameter : ColorEffectParameter };
  }>;
};

function freezeCatalog<T extends EffectCatalog>(catalog: T): Readonly<T> {
  for (const entry of Object.values(catalog)) {
    for (const parameter of Object.values(entry.parameters)) Object.freeze(parameter);
    Object.freeze(entry.parameters);
    Object.freeze(entry);
  }
  return Object.freeze(catalog);
}

/**
 * Public knob catalog. All limits are inclusive. Factories reject unknown keys,
 * non-finite numbers and out-of-range values; they never silently clamp inputs.
 * Exposure uses stops; pixel amounts use composition pixels, not source pixels.
 * Vignette roundness blends an elliptical falloff (0) with a circular one (1).
 * Grain speed 0 freezes the pattern; other values scale the 30 Hz frame index.
 */
export const EFFECT_CATALOG = freezeCatalog({
  colorGrade: {
    label: "Color grade", description: "Exposure, contrast, saturation and color balance in decoded RGB space.",
    parameters: {
      exposure: { type: "number", label: "Exposure", default: 0, min: -8, max: 8, unit: "stops" },
      contrast: { type: "number", label: "Contrast", default: 1, min: 0, max: 2 },
      saturation: { type: "number", label: "Saturation", default: 1, min: 0, max: 2 },
      warmth: { type: "number", label: "Warmth", default: 0, min: -1, max: 1 },
      tint: { type: "number", label: "Tint (green to magenta)", default: 0, min: -1, max: 1 },
    },
  },
  filmLook: {
    label: "Film look", description: "A gentle contrast/saturation treatment with warmth, grain and vignette.",
    parameters: {
      warmth: { type: "number", label: "Warmth", default: 0.15, min: -1, max: 1 },
      grain: { type: "number", label: "Grain", default: 0.1, min: 0, max: 1 },
      vignette: { type: "number", label: "Vignette", default: 0.2, min: 0, max: 1 },
      strength: { type: "number", label: "Overall strength", default: 1, min: 0, max: 1 },
    },
  },
  vignette: {
    label: "Vignette", description: "Darken the edges while preserving source alpha.",
    parameters: {
      strength: { type: "number", label: "Strength", default: 0.35, min: 0, max: 1 },
      roundness: { type: "number", label: "Roundness", default: 0.5, min: 0, max: 1 },
      softness: { type: "number", label: "Softness", default: 0.6, min: 0, max: 1 },
    },
  },
  grain: {
    label: "Grain", description: "Seeded grain driven by local playhead time, never wall-clock time.",
    parameters: {
      amount: { type: "number", label: "Amount", default: 0.1, min: 0, max: 1 },
      seed: { type: "number", label: "Seed", default: 0, min: -65536, max: 65536 },
      speed: { type: "number", label: "Speed", default: 1, min: 0, max: 10 },
    },
  },
  chromaticAberration: {
    label: "Chromatic aberration", description: "Offset red and blue samples horizontally through the preceding effects.",
    parameters: {
      amount: { type: "number", label: "Channel offset", default: 2, min: 0, max: 64, unit: "px" },
    },
  },
  pixelate: {
    label: "Pixelate", description: "Sample the preceding effects on a composition-pixel grid. Size 1 is neutral.",
    parameters: {
      size: { type: "number", label: "Pixel size", default: 8, min: 1, max: 256, unit: "px" },
    },
  },
  scanlines: {
    label: "Scanlines", description: "Horizontal dark bands spaced in composition pixels.",
    parameters: {
      strength: { type: "number", label: "Strength", default: 0.2, min: 0, max: 1 },
      spacing: { type: "number", label: "Spacing", default: 4, min: 1, max: 128, unit: "px" },
    },
  },
  duotone: {
    label: "Duotone", description: "Map luminance between two colors, blended with the original RGB.",
    parameters: {
      dark: { type: "color", label: "Shadow color", default: "#17213A", format: "#RRGGBB" },
      light: { type: "color", label: "Highlight color", default: "#FFE6B3", format: "#RRGGBB" },
      amount: { type: "number", label: "Amount", default: 1, min: 0, max: 1 },
    },
  },
} satisfies EffectCatalog);

const effectBrand: unique symbol = Symbol("DiffusionStudio.EffectSpec");
type EffectOf<K extends EffectKind> = Readonly<{
  kind: K;
  params: Readonly<ParametersByKind[K]>;
  [effectBrand]: true;
}>;
/** Frozen, factory-created descriptions; use the discriminant to inspect knobs. */
export type EffectSpec = { [K in EffectKind]: EffectOf<K> }[EffectKind];
const descriptions = new WeakSet<object>();

function makeEffect<K extends EffectKind>(kind: K, input?: Partial<ParametersByKind[K]>): EffectOf<K> {
  if (input !== undefined && (input === null || typeof input !== "object" || Array.isArray(input))) {
    throw new TypeError(`${kind}: options must be an object`);
  }
  const values = input ?? {};
  const definitions: Record<string, EffectParameter> = EFFECT_CATALOG[kind].parameters;
  for (const name of Object.keys(values)) {
    if (!Object.hasOwn(definitions, name)) throw new TypeError(`${kind}.${name}: unknown parameter`);
  }
  const params: Record<string, number | string> = {};
  for (const [name, definition] of Object.entries(definitions)) {
    const value = (values as Record<string, unknown>)[name] ?? definition.default;
    // Only omitted/undefined values use defaults; null is an invalid input.
    const provided = (values as Record<string, unknown>)[name];
    if (provided === null) throw new TypeError(`${kind}.${name}: expected ${definition.type}`);
    if (definition.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`${kind}.${name}: expected a finite number`);
      }
      if (value < definition.min || value > definition.max) {
        throw new RangeError(`${kind}.${name}: expected ${definition.min}..${definition.max}, received ${value}`);
      }
      params[name] = value;
    } else {
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new TypeError(`${kind}.${name}: expected a #RRGGBB color`);
      }
      params[name] = value.toUpperCase();
    }
  }
  const spec = Object.freeze({ kind, params: Object.freeze(params), [effectBrand]: true as const }) as EffectOf<K>;
  descriptions.add(spec);
  return spec;
}

export const colorGrade = (options?: ColorGradeOptions): EffectOf<"colorGrade"> => makeEffect("colorGrade", options);
export const filmLook = (options?: FilmLookOptions): EffectOf<"filmLook"> => makeEffect("filmLook", options);
export const vignette = (options?: VignetteOptions): EffectOf<"vignette"> => makeEffect("vignette", options);
export const grain = (options?: GrainOptions): EffectOf<"grain"> => makeEffect("grain", options);
export const chromaticAberration = (options?: ChromaticAberrationOptions): EffectOf<"chromaticAberration"> => makeEffect("chromaticAberration", options);
export const pixelate = (options?: PixelateOptions): EffectOf<"pixelate"> => makeEffect("pixelate", options);
export const scanlines = (options?: ScanlinesOptions): EffectOf<"scanlines"> => makeEffect("scanlines", options);
export const duotone = (options?: DuotoneOptions): EffectOf<"duotone"> => makeEffect("duotone", options);

export type CompiledEffects = {
  wgsl: string;
  uniforms: Record<string, number | number[] | string>;
};
export const MAX_EFFECTS = 8;
/** WebGPU's portable 12 uniform-buffer limit includes the engine's globals. */
export const MAX_EFFECT_UNIFORM_BUFFERS = 11;
/** Conservative per-fragment source sample budget: each RGB split triples it. */
export const MAX_EFFECT_SOURCE_SAMPLES = 81;

const HELPERS = /* wgsl */ `
fn fx_straight(color: vec4f) -> vec3f {
  if (color.a > 0.000001) { return color.rgb / color.a; }
  return vec3f(0.0);
}
fn fx_pack(rgb: vec3f, alpha: f32) -> vec4f {
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)) * alpha, alpha);
}
fn fx_grade(rgb: vec3f, exposure: f32, contrast: f32, saturation: f32, warmth: f32, tint: f32) -> vec3f {
  let exposed = rgb * exp2(exposure);
  let contrasted = (exposed - vec3f(0.5)) * contrast + vec3f(0.5);
  let luminance = dot(contrasted, vec3f(0.2126, 0.7152, 0.0722));
  let saturated = mix(vec3f(luminance), contrasted, saturation);
  return saturated + vec3f(warmth * 0.12 + tint * 0.06, -tint * 0.10, -warmth * 0.12 + tint * 0.06);
}
fn fx_vignette(uv: vec2f, strength: f32, roundness: f32, softness: f32) -> f32 {
  let aspect = globals.resolution.x / max(globals.resolution.y, 1.0);
  let point = (uv - vec2f(0.5)) * 2.0 * vec2f(mix(1.0, aspect, roundness), 1.0);
  let radius = length(point) / sqrt(2.0);
  return 1.0 - strength * smoothstep(1.0 - max(softness, 0.0001), 1.0, radius);
}
fn fx_noise(uv: vec2f, seed: f32, speed: f32) -> f32 {
  let pixel = floor(uv * max(globals.resolution, vec2f(1.0)));
  // Tolerate f32 roundoff when seeking to an exact 30 fps frame boundary.
  let tick = floor(globals.time * 30.0 + 0.0001) * speed;
  let point = pixel + vec2f(seed + tick * 17.0, seed * 0.73 + tick * 3.0);
  return fract(sin(dot(point, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
}
`;

function rgb(hex: string): number[] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

/**
 * Compile one ordered shader, not a series of shader paints. Coordinate effects
 * sample the entire preceding stage at new UVs, preserving noncommutative order.
 * Straight RGB operations guard tiny alpha and re-premultiply their result.
 * At most 8 effects / 11 uniform buffers are accepted; complex repeated stacks
 * may reach the portable buffer limit first. Coordinate resampling is bounded
 * to 81 source samples (four RGB-split stages), even for neutral knob values.
 * An empty stack is a passthrough.
 * The result uses only the existing shaderPaint prelude and uniform contract.
 */
export function compileEffects(effects: readonly EffectSpec[]): CompiledEffects {
  if (!Array.isArray(effects)) throw new TypeError("compileEffects: expected an array of effect descriptions");
  if (effects.length > MAX_EFFECTS) throw new RangeError(`compileEffects: at most ${MAX_EFFECTS} effects are supported`);
  const uniforms: CompiledEffects["uniforms"] = {};
  const declarations: string[] = [];
  const stages = ["fn stage0(uv: vec2f) -> vec4f { return sampleSource(uv); }"];
  let binding = 0;
  let sourceSamples = 1;
  function uniform(index: number, suffix: string, value: number | number[]): string {
    const name = `fx_s${index}_${suffix}`;
    const type = typeof value === "number" ? "f32" : "vec4f";
    declarations.push(`@group(1) @binding(${binding++}) var<uniform> ${name}: ${type};`);
    uniforms[name] = value;
    return name;
  }
  for (let index = 0; index < effects.length; index++) {
    const effect: EffectSpec = effects[index];
    if (!effect || typeof effect !== "object" || !descriptions.has(effect)) {
      throw new TypeError(`compileEffects: effect ${index} must be created by an effect factory`);
    }
    if (effect.kind === "chromaticAberration") {
      sourceSamples *= 3;
      if (sourceSamples > MAX_EFFECT_SOURCE_SAMPLES) {
        throw new RangeError(`compileEffects: stack needs up to ${sourceSamples} source samples per pixel; maximum is ${MAX_EFFECT_SOURCE_SAMPLES}. Reduce chromaticAberration (RGB-split) stages.`);
      }
    }
    const previous = `stage${index}`;
    let body: string;
    switch (effect.kind) {
      case "colorGrade": {
        const p = effect.params;
        const u = uniform(index, "params", [p.exposure, p.contrast, p.saturation, p.warmth]);
        const t = uniform(index, "tint", [p.tint, 0, 0, 0]);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001) { return color; }
  return fx_pack(fx_grade(fx_straight(color), ${u}.x, ${u}.y, ${u}.z, ${u}.w, ${t}.x), color.a);`;
        break;
      }
      case "filmLook": {
        const p = effect.params;
        const u = uniform(index, "params", [p.warmth, p.grain, p.vignette, p.strength]);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001) { return color; }
  let original = fx_straight(color);
  var look = fx_grade(original, 0.0, 1.04, 0.96, ${u}.x, 0.0);
  look += vec3f(fx_noise(uv, 0.0, 1.0) * ${u}.y * 0.16);
  look *= fx_vignette(uv, ${u}.z, 0.5, 0.65);
  return fx_pack(mix(original, look, ${u}.w), color.a);`;
        break;
      }
      case "vignette": {
        const p = effect.params;
        const u = uniform(index, "params", [p.strength, p.roundness, p.softness, 0]);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001) { return color; }
  return fx_pack(fx_straight(color) * fx_vignette(uv, ${u}.x, ${u}.y, ${u}.z), color.a);`;
        break;
      }
      case "grain": {
        const p = effect.params;
        const u = uniform(index, "params", [p.amount, p.seed, p.speed, 0]);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001) { return color; }
  let noise = fx_noise(uv, ${u}.y, ${u}.z) * ${u}.x * 0.25;
  return fx_pack(fx_straight(color) + vec3f(noise), color.a);`;
        break;
      }
      case "chromaticAberration": {
        const u = uniform(index, "amount", effect.params.amount);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001 || ${u} == 0.0) { return color; }
  let offset = vec2f(${u} / max(globals.resolution.x, 1.0), 0.0);
  let red = fx_straight(${previous}(uv + offset));
  let blue = fx_straight(${previous}(uv - offset));
  return fx_pack(vec3f(red.r, fx_straight(color).g, blue.b), color.a);`;
        break;
      }
      case "pixelate": {
        const u = uniform(index, "size", effect.params.size);
        body = `if (${u} <= 1.0) { return ${previous}(uv); }
  let resolution = max(globals.resolution, vec2f(1.0));
  let snapped = (floor(uv * resolution / ${u}) + vec2f(0.5)) * ${u} / resolution;
  return ${previous}(clamp(snapped, vec2f(0.0), vec2f(1.0)));`;
        break;
      }
      case "scanlines": {
        const p = effect.params;
        const u = uniform(index, "params", [p.strength, p.spacing, 0, 0]);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001) { return color; }
  let band = 0.5 + 0.5 * cos(uv.y * globals.resolution.y * 6.28318530718 / ${u}.y);
  return fx_pack(fx_straight(color) * (1.0 - ${u}.x * band), color.a);`;
        break;
      }
      case "duotone": {
        const p = effect.params;
        const dark = uniform(index, "dark", [...rgb(p.dark), p.amount]);
        const light = uniform(index, "light", [...rgb(p.light), 0]);
        body = `let color = ${previous}(uv);
  if (color.a <= 0.000001) { return color; }
  let original = fx_straight(color);
  let luminance = clamp(dot(original, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  return fx_pack(mix(original, mix(${dark}.rgb, ${light}.rgb, luminance), ${dark}.a), color.a);`;
        break;
      }
    }
    stages.push(`fn stage${index + 1}(uv: vec2f) -> vec4f {\n  ${body}\n}`);
  }
  if (binding > MAX_EFFECT_UNIFORM_BUFFERS) {
    throw new RangeError(`compileEffects: stack needs ${binding} uniform buffers; portable maximum is ${MAX_EFFECT_UNIFORM_BUFFERS}. Use fewer colorGrade/duotone stages.`);
  }
  return {
    wgsl: `${declarations.join("\n")}\n${HELPERS}\n${stages.join("\n")}\n@fragment\nfn main(@location(0) uv: vec2f) -> @location(0) vec4f { return stage${effects.length}(uv); }\n`,
    uniforms,
  };
}

export type EffectsProps = Readonly<{
  effects: readonly EffectSpec[];
}> & Pick<ShaderPaintProps, "opacity">;

/** Place directly inside a video/image; the complete list becomes ONE paint. */
export function Effects(props: EffectsProps): JSX.Element {
  const compiled = createMemo(() => compileEffects(props.effects));
  return ShaderPaint({
    get wgsl() { return compiled().wgsl; },
    get uniforms() { return compiled().uniforms; },
    get opacity() { return props.opacity; },
  });
}

export type FilmLookProps = FilmLookOptions & Pick<ShaderPaintProps, "opacity">;

/** Convenience component, equivalent to Effects with one filmLook description. */
export function FilmLook(props: FilmLookProps): JSX.Element {
  return Effects({
    get effects() {
      return [filmLook({ warmth: props.warmth, grain: props.grain, vignette: props.vignette, strength: props.strength })];
    },
    get opacity() { return props.opacity; },
  });
}
