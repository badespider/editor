/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Rect, Text } from "./elements";
import { educationFrames, educationNumber, eduTime } from "./education-core";
import type { Keyframe, Time } from "./types";

export type CounterEcho = Readonly<{
  color?: string; opacity?: number; scale?: number; offsetX?: number; offsetY?: number;
}>;
export type CounterRevealProps = Readonly<{
  /** Authored displayed values, not a measured trend or inferred intermediate data. */
  values: readonly (string | number)[];
  key?: string; name?: string;
  x?: number; y?: number; width?: number; height?: number;
  start?: Time; end?: Time; duration?: Time;
  /** Uniform interval between successive value onsets. Default 6 frames. */
  stepDuration?: Time;
  /** One interval per change; alternative to stepDuration, permitting fast-to-slow runs. */
  stepDurations?: readonly Time[];
  /** Sliding time at each change. Default 4 frames; cannot exceed a step interval. */
  revealDuration?: Time;
  /** Minimum fully settled final hold, default 1 second. Authored, not a reading-speed estimate. */
  minHold?: Time;
  direction?: "up" | "down";
  fontFamily?: string; fontSize?: number; fontWeight?: number | "normal" | "bold";
  color?: string; cellGap?: number; rowHeight?: number;
  /** Independent native glyph multipliers; cells retain their fixed tabular geometry. */
  glyphScaleX?: number; glyphScaleY?: number;
  /** Optional larger pale duplicate below the foreground; clipped to the component box. */
  echo?: false | CounterEcho;
  /** False keeps all authored value changes/times, swapping instantly without sliding. */
  animate?: boolean;
}>;
export type CounterGlyphRun = Readonly<{
  column: number; valueIndex: number; character: string;
  startFrame: number; endFrame: number;
  offsetY: number | readonly Readonly<Keyframe<number>>[];
}>;
export type CounterRevealLayout = Readonly<{
  x: number; y: number; width: number; height: number;
  startFrame: number; endFrame: number; frames: number;
  values: readonly string[]; onsets: readonly number[];
  columns: number; cellWidth: number; cellGap: number; rowWidth: number; rowX: number; rowHeight: number; rowY: number;
  fontFamily: string; fontSize: number; fontWeight: number | "normal" | "bold";
  color: string; glyphScaleX: number; glyphScaleY: number;
  revealFrames: number; settledFrame: number; holdFrames: number; animate: boolean;
  echo: false | Readonly<Required<CounterEcho>>;
  runs: readonly CounterGlyphRun[];
}>;

function object(value: unknown, label: string, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(`Unknown ${label} field: ${key}`);
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001F\u007F]/.test(value)) throw new TypeError(`${label} must be nonempty single-line text of at most ${max} characters`);
  return value.trim();
}
function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`${label} must be a #RRGGBB color`);
  return value;
}
function array(value: unknown, label: string, minimum: number, maximum: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || Array.from({length: value.length}, (_, i) => i).some(i => !Object.hasOwn(value, i))) throw new RangeError(`${label} must be a complete array of ${minimum}..${maximum} items`);
}
function values(input: readonly (string | number)[]): readonly string[] {
  array(input, "CounterReveal.values", 1, 48);
  return Object.freeze(input.map((value, index) => {
    if (typeof value === "number" && !Number.isSafeInteger(value)) throw new RangeError(`CounterReveal.values[${index}] must be a safe integer; supply formatted decimals as strings`);
    const literal = text(typeof value === "number" ? String(value) : value, `CounterReveal.values[${index}]`, 16);
    if (!/[0-9]/.test(literal) || !/^[A-Za-z0-9$€£¥ .,:%+\-/−]+$/.test(literal)) throw new TypeError("Counter values need a digit and may contain numeric punctuation, currency and short ASCII unit labels");
    return literal;
  }));
}
function frozenTrack(keys: Keyframe<number>[]): readonly Readonly<Keyframe<number>>[] {
  return Object.freeze(keys.map(key => Object.freeze(key)));
}

/** Pure, immutable layout/timing contract. No timers, random source, media or remote assets. */
export function getCounterRevealLayout(props: CounterRevealProps): CounterRevealLayout {
  object(props, "CounterReveal", ["values", "key", "name", "x", "y", "width", "height", "start", "end", "duration", "stepDuration", "stepDurations", "revealDuration", "minHold", "direction", "fontFamily", "fontSize", "fontWeight", "color", "cellGap", "rowHeight", "glyphScaleX", "glyphScaleY", "echo", "animate"]);
  if (props.key !== undefined) text(props.key, "CounterReveal.key", 120);
  if (props.name !== undefined) text(props.name, "CounterReveal.name", 160);
  if (props.end !== undefined && props.duration !== undefined) throw new TypeError("Use CounterReveal.end or duration, not both");
  if (props.stepDuration !== undefined && props.stepDurations !== undefined) throw new TypeError("Use stepDuration or stepDurations, not both");
  if (props.animate !== undefined && typeof props.animate !== "boolean") throw new TypeError("CounterReveal.animate must be boolean");
  const literalValues = values(props.values), columns = Math.max(...literalValues.map(value => value.length));
  const x = educationNumber(props.x ?? 0, "CounterReveal.x"), y = educationNumber(props.y ?? 0, "CounterReveal.y");
  const width = educationNumber(props.width ?? 1400, "CounterReveal.width", 32, 4096), height = educationNumber(props.height ?? 500, "CounterReveal.height", 32, 4096);
  if (width * height > 8_388_608) throw new RangeError("CounterReveal box exceeds the 8-megapixel limit");
  const startFrame = educationFrames(props.start ?? 0, "CounterReveal.start");
  const frames = props.end === undefined ? educationFrames(props.duration ?? 6, "CounterReveal.duration", true) : educationFrames(props.end, "CounterReveal.end") - startFrame;
  if (frames < 1 || startFrame + frames > 108000) throw new RangeError("CounterReveal needs a positive lifetime within 108000 frames");
  const animate = props.animate !== false, revealFrames = educationFrames(props.revealDuration ?? "4f", "CounterReveal.revealDuration", true);
  const holdFrames = educationFrames(props.minHold ?? 1, "CounterReveal.minHold", true);
  let intervals: number[];
  if (props.stepDurations !== undefined) {
    array(props.stepDurations, "CounterReveal.stepDurations", literalValues.length - 1, literalValues.length - 1);
    intervals = props.stepDurations.map(value => educationFrames(value, "CounterReveal.stepDurations entry", true));
  } else {
    const step = educationFrames(props.stepDuration ?? "6f", "CounterReveal.stepDuration", true);
    intervals = Array.from({length: literalValues.length - 1}, () => step);
  }
  if (intervals.some(interval => interval < revealFrames) && animate) throw new RangeError("CounterReveal revealDuration must fit every step interval");
  const onsets = [0];
  for (const interval of intervals) onsets.push(onsets[onsets.length - 1] + interval);
  const settledFrame = onsets[onsets.length - 1] + (animate && literalValues.length > 1 ? revealFrames : 0);
  if (frames - settledFrame < holdFrames) throw new RangeError(`CounterReveal final reading hold has ${frames - settledFrame} frames but minHold requires ${holdFrames}`);
  const direction = props.direction ?? "up";
  if (direction !== "up" && direction !== "down") throw new TypeError("CounterReveal.direction must be up or down");
  const cellGap = educationNumber(props.cellGap ?? 0, "CounterReveal.cellGap", 0, 256);
  const availableCellWidth = (width - cellGap * (columns - 1)) / columns;
  if (availableCellWidth < 16) throw new RangeError("CounterReveal cells need at least 16px; reduce the gap or enlarge the box");
  const rowHeight = educationNumber(props.rowHeight ?? height * .5, "CounterReveal.rowHeight", 16, height);
  const glyphScaleX = educationNumber(props.glyphScaleX ?? 1, "CounterReveal.glyphScaleX", .1, 4), glyphScaleY = educationNumber(props.glyphScaleY ?? 1, "CounterReveal.glyphScaleY", .1, 4);
  // A conservative em budget prevents inadvertent cropping inside each reveal mask.
  // Actual fonts still require rendered review; this is not a glyph-metric guarantee.
  const fitFont = Math.min(availableCellWidth / (1.2 * glyphScaleX), rowHeight / (1.4 * glyphScaleY), 2048);
  const fontSize = educationNumber(props.fontSize ?? fitFont, "CounterReveal.fontSize", 8, 2048);
  if (fontSize > fitFont + .000001) throw new RangeError("CounterReveal font exceeds its conservative cell budget; enlarge the cell/row or reduce fontSize/glyph scale");
  // The outer box supplies placement/clipping, not letter spacing. Stretching a
  // short token across that box moves its enlarged echo entirely off-canvas.
  // Keep tabular em cells together and center the resulting run instead.
  const cellWidth = Math.min(availableCellWidth, Math.max(16, fontSize * 1.2 * glyphScaleX));
  const rowWidth = cellWidth * columns + cellGap * (columns - 1), rowX = (width - rowWidth) / 2;
  const fontFamily = text(props.fontFamily ?? "Arial", "CounterReveal.fontFamily", 120), fontWeight = props.fontWeight ?? 700;
  if (fontWeight !== "normal" && fontWeight !== "bold" && (typeof fontWeight !== "number" || !Number.isInteger(fontWeight) || fontWeight < 100 || fontWeight > 900)) throw new RangeError("CounterReveal.fontWeight must be 100..900, normal or bold");
  const foreground = color(props.color ?? "#F06032", "CounterReveal.color");
  let echo: CounterRevealLayout["echo"] = false;
  if (props.echo !== undefined && props.echo !== false) {
    object(props.echo, "CounterReveal.echo", ["color", "opacity", "scale", "offsetX", "offsetY"]);
    echo = Object.freeze({color: color(props.echo.color ?? foreground, "CounterReveal.echo.color"), opacity: educationNumber(props.echo.opacity ?? .12, "CounterReveal.echo.opacity", 0, 1), scale: educationNumber(props.echo.scale ?? 2.6, "CounterReveal.echo.scale", .5, 4), offsetX: educationNumber(props.echo.offsetX ?? 0, "CounterReveal.echo.offsetX", -width, width), offsetY: educationNumber(props.echo.offsetY ?? 0, "CounterReveal.echo.offsetY", -height, height)});
  }
  const aligned = literalValues.map(value => value.padStart(columns, " ")), runs: CounterGlyphRun[] = [];
  const travel = rowHeight * (direction === "up" ? 1 : -1);
  for (let column = 0; column < columns; column++) {
    let first = 0;
    for (let next = 1; next <= aligned.length; next++) {
      if (next < aligned.length && aligned[next][column] === aligned[first][column]) continue;
      const start = onsets[first], outgoing = next < aligned.length ? onsets[next] : undefined;
      const end = outgoing === undefined ? frames : outgoing + (animate ? revealFrames : 0);
      const keys: Keyframe<number>[] = [{time: "0f", value: animate && first > 0 ? travel : 0, easing: "easeOut"}];
      if (animate && first > 0) keys.push({time: eduTime(revealFrames), value: 0, easing: "linear"});
      if (animate && outgoing !== undefined) {
        const at = outgoing - start;
        if (at > (first > 0 ? revealFrames : 0)) keys.push({time: eduTime(at), value: 0, easing: "easeIn"});
        else keys[keys.length - 1].easing = "easeIn";
        keys.push({time: eduTime(at + revealFrames), value: -travel});
      }
      if (aligned[first][column] !== " ") runs.push(Object.freeze({column, valueIndex: first, character: aligned[first][column], startFrame: start, endFrame: end, offsetY: keys.length === 1 ? 0 : frozenTrack(keys)}));
      first = next;
    }
  }
  if (runs.length > 512) throw new RangeError("CounterReveal exceeds 512 editable glyph runs; shorten the sequence or split the beat");
  return Object.freeze({x, y, width, height, startFrame, endFrame: startFrame + frames, frames, values: literalValues, onsets: Object.freeze(onsets), columns, cellWidth, cellGap, rowWidth, rowX, rowHeight, rowY: (height - rowHeight) / 2, fontFamily, fontSize, fontWeight, color: foreground, glyphScaleX, glyphScaleY, revealFrames, settledFrame, holdFrames, animate, echo, runs: Object.freeze(runs)});
}

/** Editable tabular cells, fixed native clipping boxes and local native tracks. */
export function CounterReveal(props: CounterRevealProps): JSX.Element {
  const data = createMemo(() => getCounterRevealLayout(props), undefined, {equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)});
  return Rect({
    get key(){return props.key;}, get name(){return props.name ?? "CounterReveal";},
    get x(){return data().x;}, get y(){return data().y;}, get width(){return data().width;}, get height(){return data().height;},
    get start(){return eduTime(data().startFrame);}, get end(){return eduTime(data().endFrame);}, clipToBox: true,
    get children(){
      const d = data();
      const row = (kind: "Foreground" | "Echo") => {
        const echo = kind === "Echo" && d.echo ? d.echo : undefined;
        return Rect({name: `Counter ${kind.toLowerCase()} row`, x: d.rowX + (echo?.offsetX ?? 0), y: d.rowY + (echo?.offsetY ?? 0), width: d.rowWidth, height: d.rowHeight, scale: echo?.scale ?? 1, opacity: echo?.opacity ?? 1, start: "0f", end: eduTime(d.frames),
          children: Array.from({length: d.columns}, (_, column) => Rect({name: `${kind} counter cell ${column + 1}`, x: column * (d.cellWidth + d.cellGap), y: 0, width: d.cellWidth, height: d.rowHeight, clipToBox: true, start: "0f", end: eduTime(d.frames),
            children: d.runs.filter(run => run.column === column).map(run => Text({name: `${kind} counter cell ${column + 1} value ${run.valueIndex + 1}`, x: 0, y: 0, width: d.cellWidth, height: d.rowHeight, start: eduTime(run.startFrame), end: eduTime(run.endFrame), offsetY: typeof run.offsetY === "number" ? run.offsetY : run.offsetY.map(key => ({...key})), fontFamily: d.fontFamily, fontSize: d.fontSize, fontWeight: d.fontWeight, scaleX: d.glyphScaleX, scaleY: d.glyphScaleY, textAlign: "center", textBaseline: "middle", fill: echo?.color ?? d.color, children: run.character})),
          })),
        });
      };
      return [...(d.echo ? [row("Echo")] : []), row("Foreground")];
    },
  });
}
