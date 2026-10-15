/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { colorGrade, grain, vignette, chromaticAberration, EFFECT_CATALOG } from "./effects";
import type { EffectSpec } from "./effects";

export type LookName = "documentary" | "clean-teaching" | "archive" | "night-tech";
export type LookOptions = Readonly<{ strength?: number; seed?: number }>;
export type LookPreset = Readonly<{ title: string; purpose: string; usesSeed: boolean }>;

/** Curated authoring choices, not camera, film-stock or historical simulations. */
export const LOOK_PRESETS: Readonly<Record<LookName, LookPreset>> = Object.freeze({
  documentary: Object.freeze({
    title: "Documentary",
    purpose: "Restrained warmth, fine grain and soft edge shading for documentary graphics.",
    usesSeed: true,
  }),
  "clean-teaching": Object.freeze({
    title: "Clean teaching",
    purpose: "Light contrast and restrained saturation without decorative grain or channel offsets.",
    usesSeed: false,
  }),
  archive: Object.freeze({
    title: "Archive",
    purpose: "An authored warm, muted grain treatment; it does not date or authenticate footage.",
    usesSeed: true,
  }),
  "night-tech": Object.freeze({
    title: "Night tech",
    purpose: "Cool balance with a controlled subpixel channel offset for technology graphics.",
    usesSeed: false,
  }),
});

const NEUTRAL: readonly EffectSpec[] = Object.freeze([]);

function readOptions(options: LookOptions | undefined): { strength: number; seed: number } {
  if (options !== undefined && (options === null || typeof options !== "object" || Array.isArray(options)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(options)))) {
    throw new TypeError("createLook: options must be a plain object");
  }
  const values = options ?? {};
  for (const key of Reflect.ownKeys(values)) {
    if (key !== "strength" && key !== "seed") throw new TypeError(`createLook.${String(key)}: unknown option`);
  }
  const suppliedStrength = values.strength;
  const strength = suppliedStrength === undefined ? 1 : suppliedStrength;
  if (typeof strength !== "number" || !Number.isFinite(strength)) throw new TypeError("createLook.strength: expected a finite number");
  if (strength < 0 || strength > 1) throw new RangeError("createLook.strength: expected 0..1");
  const suppliedSeed = values.seed;
  const seed = suppliedSeed === undefined ? 0 : suppliedSeed;
  if (typeof seed !== "number" || !Number.isFinite(seed)) throw new TypeError("createLook.seed: expected a finite integer");
  const seedControl = EFFECT_CATALOG.grain.parameters.seed;
  if (!Number.isSafeInteger(seed) || seed < seedControl.min || seed > seedControl.max) {
    throw new RangeError(`createLook.seed: expected an integer in ${seedControl.min}..${seedControl.max}`);
  }
  return { strength, seed };
}

/**
 * Return one frozen, ordered native effect stack. Strength defaults to 1 and
 * scales the treatment from neutral; strength 0 returns an empty passthrough.
 * Seed defaults to 0, accepts integers -65536..65536 and only changes the grain
 * in documentary/archive. It is validated for every look, even at strength 0.
 * Grain uses the existing local-playhead clock; this function has no clock or
 * random source. Each stack contains at most three effects and four effect
 * uniform buffers.
 * Unknown names/options and invalid values reject rather than silently clamp.
 */
export function createLook(name: LookName, options?: LookOptions): readonly EffectSpec[] {
  if (typeof name !== "string" || !Object.hasOwn(LOOK_PRESETS, name)) {
    throw new TypeError("createLook: unknown look; use documentary, clean-teaching, archive or night-tech");
  }
  const { strength: s, seed } = readOptions(options);
  if (s === 0) return NEUTRAL;
  switch (name) {
    case "documentary": return Object.freeze([
      colorGrade({ contrast: 1 + .05 * s, saturation: 1 - .04 * s, warmth: .10 * s }),
      grain({ amount: .018 * s, seed, speed: 1 }),
      vignette({ strength: .10 * s, roundness: .25, softness: .8 }),
    ]);
    case "clean-teaching": return Object.freeze([
      colorGrade({ contrast: 1 + .04 * s, saturation: 1 - .02 * s }),
    ]);
    case "archive": return Object.freeze([
      colorGrade({ exposure: -.08 * s, contrast: 1 + .03 * s, saturation: 1 - .42 * s, warmth: .22 * s }),
      grain({ amount: .055 * s, seed, speed: 1 }),
    ]);
    case "night-tech": return Object.freeze([
      colorGrade({ contrast: 1 + .06 * s, saturation: 1 - .05 * s, warmth: -.14 * s, tint: .02 * s }),
      chromaticAberration({ amount: .75 * s }),
    ]);
  }
}
