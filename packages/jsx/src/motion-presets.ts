/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { parseTime, TIME_FPS } from "./time";
import type { Easing, Keyframe, PatchProps, Time } from "./types";

/** Spread onto a visual element. Times are local to the element, at TIME_FPS. */
export type MotionPreset = Pick<PatchProps, "opacity" | "offsetX" | "offsetY" | "scale">;

/** Source clock of a trimmed clip; placement and other timing props are not copied. */
export type MotionClipClock = Pick<PatchProps, "sourceIn">;

export type MotionTimingOptions = {
  /** Positive duration, rounded to the nearest canonical frame. Default 0.4s. */
  duration?: Time;
  /** Nonnegative local delay. The initial value holds until this point. */
  delay?: Time;
};

export type PopInOptions = MotionTimingOptions & {
  /** Initial uniform scale, at least 0.001. Default 0.82. */
  fromScale?: number;
};

export type SlideInOptions = MotionTimingOptions & {
  /** The edge to enter from. Default "left". */
  direction?: "left" | "right" | "up" | "down";
  /** Positive render-time translation in composition pixels. Default 64. */
  distance?: number;
  /** Native segment easing. Default "easeOut". */
  easing?: Easing;
};

export type FadeOutOptions = {
  /** Nonnegative local time at which the fade begins; no clip duration is inferred. */
  at: Time;
  /** Positive fade duration. Default 0.4s. */
  duration?: Time;
};

export type SlowZoomOptions = {
  duration: Time;
  /** Positive uniform starting scale, at least 0.001. Default 1. */
  from?: number;
  /** Positive uniform ending scale, at least 0.001. Default 1.08. */
  to?: number;
};

export type FloatOptions = {
  duration: Time;
  /** Positive excursion in each vertical direction, in pixels. Default 12. */
  distance?: number;
  /** Whole cycles, 1–1000. At least four frames per cycle are required. Default 2. */
  cycles?: number;
};

export type RevealOptions = {
  /** Complete visible window, including delay, entrance, reading hold and exit. */
  duration: Time;
  /** Defaults to 12 frames. Decelerates into a stable reading pose. */
  enterDuration?: Time;
  /** Defaults to 8 frames. Accelerates away; ends on the final visible frame. */
  exitDuration?: Time;
  /** Defaults to 3 frames, so the first motion does not jump at the cut. */
  delay?: Time;
  /** Entry edge, as in slideIn; exit continues in the same travel direction. */
  direction?: "left" | "right" | "up" | "down" | "none";
  /** Entry excursion; the exit travels 65% as far. Default 24px; zero is valid. */
  distance?: number;
};

const PROPERTIES = new Set(["opacity", "offsetX", "offsetY", "scale"]);
const NAMED_EASINGS = new Set(["linear", "easeIn", "easeOut", "easeInOut", "gentle", "snappy", "bouncy", "strong"]);

function frames(value: Time, label: string, allowZero = false): number {
  if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !/^-?(?:\d+(?:\.\d+)?f?|\d+:\d+(?:\.\d+)?|\d+:\d+:\d+(?:\.\d+)?)$/i.test(value.trim())) {
    throw new RangeError(`${label} must be a finite time in seconds, frames, or clock notation`);
  }
  const seconds = parseTime(value);
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0 || !allowZero && seconds === 0) {
    throw new RangeError(`${label} must be a ${allowZero ? "nonnegative" : "positive"} finite time`);
  }
  const result = Math.round(seconds * TIME_FPS);
  if (!Number.isSafeInteger(result) || result < (allowZero ? 0 : 1)) {
    throw new RangeError(`${label} must round to ${allowZero ? "a nonnegative" : "at least one"} safe frame`);
  }
  return result;
}

function positive(value: number, label: string, minimum = Number.MIN_VALUE): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${label} must be finite and ${minimum === Number.MIN_VALUE ? "greater than zero" : `at least ${minimum}`}`);
  }
  return value;
}

function nativeEasing(value: Easing): Easing {
  if (typeof value === "string") {
    const normalized = value.trim();
    if (NAMED_EASINGS.has(normalized)) return normalized as Easing;
    const match = /^(cubicBezier|spring|steps)\(([^()]*)\)$/.exec(normalized);
    if (match) {
      const parts = match[2].split(",").map(part => part.trim());
      const descriptor = `${match[1]}(${parts.join(",")})` as Easing;
      if (match[1] === "steps") {
        if (/^\d+$/.test(parts[0]) && (parts.length === 1 || parts.length === 2 && /^(true|false)$/.test(parts[1]))) {
          const count = Number(parts[0]);
          if (Number.isSafeInteger(count) && count > 0) return descriptor;
        }
      } else if (parts.every(part => /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(part))) {
        // The host accepts decimal descriptors, not JavaScript exponent notation.
        const numbers = parts.map(Number);
        if (numbers.every(Number.isFinite)) {
          if (match[1] === "cubicBezier" && numbers.length === 4 && numbers[0] >= 0 && numbers[0] <= 1 && numbers[2] >= 0 && numbers[2] <= 1) return descriptor;
          if (match[1] === "spring" && numbers.length === 2 && numbers[0] >= 0 && numbers[0] <= 1 && numbers[1] > 0) return descriptor;
        }
      }
    }
  }
  throw new RangeError("easing must be a supported native easing name or descriptor");
}

function time(frame: number): `${number}f` {
  return `${frame}f`;
}

function track(from: number, to: number, start: number, duration: number, easing: Easing): Keyframe<number>[] {
  const end = start + duration;
  if (!Number.isSafeInteger(end)) throw new RangeError("motion end must be a safe frame");
  return [
    ...(start ? [{ time: time(0), value: from }] : []),
    { time: time(start), value: from, easing },
    { time: time(end), value: to },
  ];
}

function timing(options: MotionTimingOptions) {
  return {
    duration: frames(options.duration ?? 0.4, "duration"),
    delay: frames(options.delay ?? 0, "delay", true),
  };
}

function popIn(options: PopInOptions = {}): MotionPreset {
  const { duration, delay } = timing(options);
  return {
    opacity: track(0, 1, delay, Math.max(1, Math.round(duration / 2)), "easeOut"),
    scale: track(positive(options.fromScale ?? 0.82, "fromScale", 0.001), 1, delay, duration, "bouncy"),
  };
}

function captionPop(options: PopInOptions = {}): MotionPreset {
  return popIn({ ...options, duration: options.duration ?? "9f", fromScale: options.fromScale ?? 0.9 });
}

function slideIn(options: SlideInOptions = {}): MotionPreset {
  const { duration, delay } = timing(options);
  const distance = positive(options.distance ?? 64, "distance");
  const easing = nativeEasing(options.easing ?? "easeOut");
  switch (options.direction ?? "left") {
    case "left": return { offsetX: track(-distance, 0, delay, duration, easing) };
    case "right": return { offsetX: track(distance, 0, delay, duration, easing) };
    case "up": return { offsetY: track(-distance, 0, delay, duration, easing) };
    case "down": return { offsetY: track(distance, 0, delay, duration, easing) };
    default: throw new RangeError("direction must be left, right, up, or down");
  }
}

function fadeIn(options: MotionTimingOptions = {}): MotionPreset {
  const { duration, delay } = timing(options);
  return { opacity: track(0, 1, delay, duration, "easeOut") };
}

function fadeOut(options: FadeOutOptions): MotionPreset {
  return { opacity: track(1, 0, frames(options?.at, "at", true), frames(options?.duration ?? 0.4, "duration"), "easeIn") };
}

function slowZoom(options: SlowZoomOptions): MotionPreset {
  return { scale: track(positive(options?.from ?? 1, "from", 0.001), positive(options?.to ?? 1.08, "to", 0.001), 0, frames(options?.duration, "duration"), "linear") };
}

function float(options: FloatOptions): MotionPreset {
  const duration = frames(options?.duration, "duration");
  const distance = positive(options?.distance ?? 12, "distance");
  const cycles = options?.cycles ?? 2;
  if (!Number.isSafeInteger(cycles) || cycles < 1 || cycles > 1000) throw new RangeError("cycles must be an integer from 1 to 1000");
  if (duration < cycles * 4) throw new RangeError("float duration requires at least four frames per cycle");
  const quarters = cycles * 4;
  const values = [0, -distance, 0, distance];
  const offsetY: Keyframe<number>[] = Array.from({ length: quarters + 1 }, (_, index) => ({
    time: time(Math.round(index * duration / quarters)),
    value: values[index % 4],
    ...(index < quarters ? { easing: "easeInOut" as const } : {}),
  }));
  return { offsetY };
}

/** One finite build/hold/resolve beat, without competing opacity tracks. */
function reveal(options: RevealOptions): MotionPreset {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("motion.reveal expects options with a duration");
  const duration = frames(options.duration, "duration");
  const enter = frames(options.enterDuration ?? "12f", "enterDuration");
  const exit = frames(options.exitDuration ?? "8f", "exitDuration");
  const delay = frames(options.delay ?? "3f", "delay", true);
  const last = duration - 1, entered = delay + enter, leaving = last - exit;
  if (!Number.isSafeInteger(entered) || leaving <= entered) throw new RangeError("motion.reveal needs a full reading-hold frame between entrance and exit; increase duration or shorten delay/enterDuration/exitDuration");
  const direction = options.direction ?? "down";
  if (!["left", "right", "up", "down", "none"].includes(direction)) throw new RangeError("direction must be left, right, up, down or none");
  const distance = positive(options.distance ?? 24, "distance", 0);
  const phaseTrack = (from: number, rest: number, to: number): Keyframe<number>[] => [
    ...(delay ? [{ time: time(0), value: from, easing: "linear" as const }] : []),
    { time: time(delay), value: from, easing: "easeOut" },
    { time: time(entered), value: rest, easing: "linear" },
    { time: time(leaving), value: rest, easing: "easeIn" },
    { time: time(last), value: to },
  ];
  const result: MotionPreset = { opacity: phaseTrack(0, 1, 0) };
  if (direction !== "none" && distance > 0) {
    const sign = direction === "left" || direction === "up" ? -1 : 1;
    result[direction === "left" || direction === "right" ? "offsetX" : "offsetY"] = phaseTrack(sign * distance, 0, -sign * distance * .65);
  }
  return result;
}

/**
 * Combine disjoint motion tracks. A repeated property is an error even when
 * its time ranges do not overlap; author one explicit track for that case.
 * Native `animations` are excluded because their property ownership is implicit.
 */
function combine(...presets: MotionPreset[]): MotionPreset {
  const result: MotionPreset = {};
  for (const preset of presets) {
    if (!preset || typeof preset !== "object" || Array.isArray(preset)) throw new TypeError("motion.combine expects motion preset objects");
    for (const key of Object.keys(preset)) {
      if (!PROPERTIES.has(key)) throw new TypeError(`motion.combine does not support ${key}; use native keyframe motion properties`);
      const property = key as keyof MotionPreset;
      if (Object.hasOwn(result, property)) throw new Error(`motion.combine cannot combine overlapping ${property} tracks`);
      const value = preset[property];
      if (value === undefined) throw new TypeError(`motion.combine requires a value for ${property}`);
      const checkValue = (number: number) => {
        if (typeof number !== "number" || !Number.isFinite(number)) throw new RangeError(`${property} values must be finite numbers`);
        if (property === "scale" && number < 0.001) throw new RangeError("scale values must be at least 0.001");
        if (property === "opacity" && (number < 0 || number > 1)) throw new RangeError("opacity values must be between zero and one");
      };
      if (Array.isArray(value)) {
        if (!value.length) throw new RangeError(`${property} track must not be empty`);
        let previous = -1;
        result[property] = Array.from(value, keyframe => {
          const frame = frames(keyframe?.time, `${property} keyframe time`, true);
          if (frame <= previous) throw new RangeError(`${property} keyframe times must increase strictly after frame rounding`);
          previous = frame;
          checkValue(keyframe.value);
          return { time: time(frame), value: keyframe.value, ...(keyframe.easing === undefined ? {} : { easing: nativeEasing(keyframe.easing) }) };
        });
      } else {
        checkValue(value);
        result[property] = value;
      }
    }
  }
  return result;
}

/**
 * Offset clip-start-relative presets into a media element's existing source
 * clock. Use for every preset on a clip with sourceIn, including float/zoom.
 * The clip's placement, source range, motion delays and durations stay intact.
 */
function forClip(clock: MotionClipClock, ...presets: MotionPreset[]): MotionPreset {
  if (!clock || typeof clock !== "object" || Array.isArray(clock)) throw new TypeError("motion.forClip expects a clip clock object");
  const sourceIn = frames(clock.sourceIn ?? 0, "sourceIn", true);
  const result = combine(...presets);
  for (const key of Object.keys(result)) {
    const property = key as keyof MotionPreset;
    const value = result[property];
    if (!Array.isArray(value)) continue;
    result[property] = value.map(keyframe => {
      const shifted = sourceIn + frames(keyframe.time, `${property} keyframe time`, true);
      if (!Number.isSafeInteger(shifted)) throw new RangeError("motion.forClip keyframe end must be a safe frame");
      return { ...keyframe, time: time(shifted) };
    });
  }
  return result;
}

/** Ready-made motion expressed as editable native keyframe properties. */
export const motion = { popIn, captionPop, slideIn, fadeIn, fadeOut, slowZoom, float, reveal, combine, forClip };
