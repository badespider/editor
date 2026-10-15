/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Group, Rect, Text } from "./elements";
import { motion } from "./motion-presets";
import { parseTime, TIME_FPS } from "./time";
import { wrapDocumentaryText } from "./documentary";
import type { Animatable, Time } from "./types";

export type EducationTheme = {
  background: string; surface: string; text: string; muted: string;
  accent: string; success: string; fontFamily: string; monoFamily: string;
};
export const EDUCATION_THEME: Readonly<EducationTheme> = Object.freeze({
  background: "#101C2B", surface: "#1C2D42", text: "#F6F0E4", muted: "#BAC7D6",
  accent: "#54D6C7", success: "#75D99B", fontFamily: "Arial", monoFamily: "Consolas",
});
export type EducationBox = { x: number; y: number; width: number; height: number };
export type EducationProps = {
  x?: number; y?: number; width?: number; height?: number;
  start?: Time; end?: Time; duration?: Time;
  theme?: Partial<EducationTheme>; animate?: boolean; fontSize?: number;
};
export type EducationLayout = EducationBox & { start: number; end: number; frames: number; font: number; intro: number };
export const eduTime = (frame: number): `${number}f` => `${frame}f`;
export function educationNumber(value: number, label: string, min = -100000, max = 100000): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`${label} must be finite in ${min}..${max}`);
  return value;
}
export function educationText(value: string, label: string, max = 4096): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /\u0000/.test(value)) throw new TypeError(`${label} must be nonempty text of at most ${max} characters`);
  return value.trim();
}
export function educationFrames(value: Time, label: string, positive = false): number {
  if (typeof value === "string" && !/^(?:\d+(?:\.\d+)?f?|\d+:[0-5]?\d(?:\.\d+)?|\d+:[0-5]?\d:[0-5]?\d(?:\.\d+)?)$/i.test(value.trim())) throw new RangeError(`${label} must be seconds, frames or valid clock time`);
  const seconds = parseTime(value);
  const frames = seconds === undefined ? NaN : Math.round(seconds * TIME_FPS);
  if (seconds === undefined || seconds < 0 || !Number.isSafeInteger(frames) || frames < (positive ? 1 : 0) || frames > 108000) throw new RangeError(`${label} must round to ${positive ? 1 : 0}..108000 canonical 30fps frames`);
  return frames;
}
export function educationTheme(input?: Partial<EducationTheme>): EducationTheme {
  if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) throw new TypeError("education theme must be an object");
  const theme = { ...EDUCATION_THEME };
  for (const key of Object.keys(input ?? {}) as (keyof EducationTheme)[]) {
    if (!Object.hasOwn(theme, key)) throw new TypeError(`Unknown education theme field: ${key}`);
    if (input?.[key] !== undefined) theme[key] = input[key]!;
  }
  for (const [key, value] of Object.entries(theme)) {
    if (key.endsWith("Family")) educationText(value, key, 120);
    else if (!/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`theme.${key} must be a #RRGGBB color`);
  }
  return theme;
}
export function educationLayout(props: EducationProps, defaults: EducationBox): EducationLayout {
  if (props.end !== undefined && props.duration !== undefined) throw new TypeError("Use education end or duration, not both");
  const start = educationFrames(props.start ?? 0, "start");
  const frames = props.end === undefined ? educationFrames(props.duration ?? 6, "duration", true) : educationFrames(props.end, "end") - start;
  if (frames < 1 || start + frames > 108000) throw new RangeError("Education component must have a positive lifetime within 108000 frames");
  if (props.animate !== undefined && typeof props.animate !== "boolean") throw new TypeError("animate must be boolean");
  return {
    x: educationNumber(props.x ?? defaults.x, "x"), y: educationNumber(props.y ?? defaults.y, "y"),
    width: educationNumber(props.width ?? defaults.width, "width", 32, 4096), height: educationNumber(props.height ?? defaults.height, "height", 32, 4096),
    start, end: start + frames, frames, font: educationNumber(props.fontSize ?? 32, "fontSize", 8, 256), intro: Math.min(12, frames - 1),
  };
}
export function eduRect(name: string, box: EducationBox, fill: string, frames: number, width: Animatable<number> = box.width): JSX.Element {
  return Rect({ name, ...box, width, fill, start: "0f", end: eduTime(frames) });
}
export function eduText(name: string, value: string, box: EducationBox, font: number, theme: EducationTheme, frames: number, color = theme.text, bold = false, options?: { fontFamily?: string }): JSX.Element {
  const wrapped = wrapDocumentaryText(value, { width: box.width, fontSize: font, maxLines: Math.floor(box.height / (font * 1.35)), label: name });
  return Text({ name, ...box, fontFamily: options?.fontFamily ?? theme.fontFamily, fontSize: font, fontWeight: bold ? 700 : 400, fill: color, start: "0f", end: eduTime(frames), children: wrapped });
}
export function educationComponent(name: string, props: EducationProps, defaults: EducationBox, build: (layout: EducationLayout, theme: EducationTheme) => JSX.Element[]): JSX.Element {
  const layout = createMemo(() => educationLayout(props, defaults));
  const theme = createMemo(() => educationTheme(props.theme));
  return Group({ name,
    get x() { return layout().x; }, get y() { return layout().y; },
    get width() { return layout().width; }, get height() { return layout().height; },
    get start() { return eduTime(layout().start); }, get end() { return eduTime(layout().end); },
    get opacity() { return props.animate === false || !layout().intro ? 1 : motion.fadeIn({ duration: eduTime(layout().intro) }).opacity; },
    get offsetY() { return props.animate === false || !layout().intro ? 0 : motion.slideIn({ direction: "down", distance: 20, duration: eduTime(layout().intro) }).offsetY; },
    get children() { return build(layout(), theme()); },
  });
}
