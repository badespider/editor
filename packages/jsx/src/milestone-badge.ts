/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Rect, Text } from "./elements";
import { educationFrames, educationNumber, eduTime } from "./education-core";
import { wrapDocumentaryText } from "./documentary";
import type { Keyframe, Time } from "./types";

export type MilestoneBadgeProps = Readonly<{
  /** Caller-authored display, not an inferred count or verified measurement. */
  value: string; label: string;
  labelSide?: "left" | "right" | "below";
  key?: string; name?: string;
  x?: number; y?: number; width?: number; height?: number;
  start?: Time; end?: Time; duration?: Time;
  /** Dot-to-circle expansion and value reveal. Default 12 canonical frames. */
  popDuration?: Time;
  /** Local onset of the six-frame context-label reveal. Default 4 frames. */
  labelDelay?: Time;
  /** Minimum complete still reading hold after all reveals, default 2 seconds. */
  minHold?: Time;
  fontFamily?: string; fontSize?: number; labelFontSize?: number;
  /** Circle fill; default turquoise. The optional outer background is otherwise transparent. */
  color?: string; backgroundColor?: string; textColor?: string;
  /** False shows the complete badge and label at frame zero, without decorative movement. */
  animate?: boolean;
}>;
export type MilestoneBadgeBox = Readonly<{x: number; y: number; width: number; height: number}>;
export type MilestoneBadgeTrack = number | readonly Readonly<Keyframe<number>>[];
export type MilestoneBadgeLayout = Readonly<{
  x: number; y: number; width: number; height: number;
  startFrame: number; endFrame: number; frames: number;
  value: string; label: string; labelSide: "left" | "right" | "below";
  fontFamily: string; fontSize: number; labelFontSize: number;
  color: string; backgroundColor?: string; textColor: string;
  circle: MilestoneBadgeBox; valueBox: MilestoneBadgeBox; labelBox: MilestoneBadgeBox;
  popFrames: number; labelFrame: number; labelRevealFrames: number; settledFrame: number; holdFrames: number;
  circleScale: MilestoneBadgeTrack; valueOpacity: MilestoneBadgeTrack; valueOffsetY: MilestoneBadgeTrack;
  labelOpacity: MilestoneBadgeTrack; labelOffsetX: MilestoneBadgeTrack; labelOffsetY: MilestoneBadgeTrack;
  animate: boolean;
}>;
const FIELDS = ["value", "label", "labelSide", "key", "name", "x", "y", "width", "height", "start", "end", "duration", "popDuration", "labelDelay", "minHold", "fontFamily", "fontSize", "labelFontSize", "color", "backgroundColor", "textColor", "animate"];
function line(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || Array.from(value).length > max || /[\u0000-\u001F\u007F]/.test(value)) throw new TypeError(`${label} must be nonempty single-line text of at most ${max} characters`);
  return value.trim();
}
function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`${label} must be a #RRGGBB color`);
  return value;
}
function track(keys: Keyframe<number>[]): MilestoneBadgeTrack { return Object.freeze(keys.map(key => Object.freeze(key))); }
function reveal(start: number, end: number, from: number, to: number): MilestoneBadgeTrack {
  const keys: Keyframe<number>[] = [{time: "0f", value: from, easing: start ? "linear" : "easeOut"}];
  if (start) keys.push({time: eduTime(start), value: from, easing: "easeOut"});
  keys.push({time: eduTime(end), value: to});
  return track(keys);
}
function nativeTrack(value: MilestoneBadgeTrack): number | Keyframe<number>[] { return typeof value === "number" ? value : value.map(key => ({...key})); }

/** Bounded immutable geometry and local native tracks, without media or wall-clock state. */
export function getMilestoneBadgeLayout(props: MilestoneBadgeProps): MilestoneBadgeLayout {
  if (!props || typeof props !== "object" || Array.isArray(props)) throw new TypeError("MilestoneBadge requires an object");
  for (const key of Object.keys(props)) if (!FIELDS.includes(key)) throw new TypeError(`Unknown MilestoneBadge field: ${key}`);
  if (props.key !== undefined) line(props.key, "MilestoneBadge.key", 120);
  if (props.name !== undefined) line(props.name, "MilestoneBadge.name", 160);
  const value = line(props.value, "MilestoneBadge.value", 16), label = line(props.label, "MilestoneBadge.label", 80);
  const labelSide = props.labelSide ?? "right";
  if (!["left", "right", "below"].includes(labelSide)) throw new TypeError("MilestoneBadge.labelSide must be left, right or below");
  if (props.animate !== undefined && typeof props.animate !== "boolean") throw new TypeError("MilestoneBadge.animate must be boolean");
  if (props.end !== undefined && props.duration !== undefined) throw new TypeError("Use MilestoneBadge.end or duration, not both");
  const width = educationNumber(props.width ?? 1100, "MilestoneBadge.width", 128, 4096), height = educationNumber(props.height ?? 420, "MilestoneBadge.height", 128, 4096);
  if (width * height > 8_388_608) throw new RangeError("MilestoneBadge box exceeds the 8-megapixel limit");
  const x = educationNumber(props.x ?? 0, "MilestoneBadge.x"), y = educationNumber(props.y ?? 0, "MilestoneBadge.y");
  const startFrame = educationFrames(props.start ?? 0, "MilestoneBadge.start");
  const frames = props.end === undefined ? educationFrames(props.duration ?? 5, "MilestoneBadge.duration", true) : educationFrames(props.end, "MilestoneBadge.end") - startFrame;
  if (frames < 1 || startFrame + frames > 108000) throw new RangeError("MilestoneBadge needs a positive lifetime within 108000 frames");
  const popFrames = educationFrames(props.popDuration ?? "12f", "MilestoneBadge.popDuration", true);
  if (popFrames < 2) throw new RangeError("MilestoneBadge.popDuration needs at least two frames for its peak and settle");
  const labelFrame = educationFrames(props.labelDelay ?? "4f", "MilestoneBadge.labelDelay"), labelRevealFrames = 6;
  const holdFrames = educationFrames(props.minHold ?? 2, "MilestoneBadge.minHold", true), animate = props.animate !== false;
  const settledFrame = animate ? Math.max(popFrames, labelFrame + labelRevealFrames) : 0;
  if (frames - settledFrame < holdFrames) throw new RangeError(`MilestoneBadge final reading hold has ${frames - settledFrame} frames but minHold requires ${holdFrames}`);
  const padding = Math.min(width, height) * .06, gap = Math.min(width, height) * .05;
  const innerWidth = width - 2 * padding, innerHeight = height - 2 * padding;
  const diameter = labelSide === "below" ? Math.min(innerWidth, innerHeight * .66) : Math.min(innerHeight, innerWidth * .44);
  const circle = Object.freeze({x: labelSide === "below" ? (width - diameter) / 2 : labelSide === "left" ? width - padding - diameter : padding, y: labelSide === "below" ? padding : (height - diameter) / 2, width: diameter, height: diameter});
  const labelBox = Object.freeze(labelSide === "below" ? {x: padding, y: padding + diameter + gap, width: innerWidth, height: innerHeight - diameter - gap} : {x: labelSide === "left" ? padding : padding + diameter + gap, y: padding, width: innerWidth - diameter - gap, height: innerHeight});
  if (labelBox.width < 32 || labelBox.height < 32) throw new RangeError("MilestoneBadge needs a larger box for its context label");
  // A centered inscribed box keeps all four value-box corners within the circle.
  const valueBox = Object.freeze({x: circle.x + diameter * .17, y: circle.y + diameter * .25, width: diameter * .66, height: diameter * .5});
  const fitFont = Math.min(valueBox.width / (Array.from(value).length * 1.1), valueBox.height / 1.35, 512);
  const fontSize = educationNumber(props.fontSize ?? fitFont, "MilestoneBadge.fontSize", 8, 512);
  if (fontSize > fitFont + .000001) throw new RangeError("MilestoneBadge value cannot fit inside its circle; shorten it, enlarge the box or reduce fontSize");
  const labelFontSize = educationNumber(props.labelFontSize ?? Math.min(48, Math.max(20, fontSize * .65)), "MilestoneBadge.labelFontSize", 8, 256);
  const wrappedLabel = wrapDocumentaryText(label, {width: labelBox.width, fontSize: labelFontSize, maxLines: Math.floor(labelBox.height / (labelFontSize * 1.35)), label: "MilestoneBadge label"});
  const fontFamily = line(props.fontFamily ?? "Arial", "MilestoneBadge.fontFamily", 120);
  const circleColor = color(props.color ?? "#57D6C7", "MilestoneBadge.color"), textColor = color(props.textColor ?? "#101C2B", "MilestoneBadge.textColor");
  const backgroundColor = props.backgroundColor === undefined ? undefined : color(props.backgroundColor, "MilestoneBadge.backgroundColor");
  const peakFrame = Math.max(1, Math.min(popFrames - 1, Math.round(popFrames * .8))), valueFrame = Math.max(1, Math.floor(popFrames * .55));
  const circleScale = animate ? track([{time: "0f", value: .025, easing: "easeOut"}, {time: eduTime(peakFrame), value: 1.06, easing: "easeInOut"}, {time: eduTime(popFrames), value: 1}]) : 1;
  const labelTravel = labelSide === "below" ? labelBox.height : Math.min(labelBox.width, Array.from(label).length * labelFontSize * 1.1);
  const labelOffsetX = !animate || labelSide === "below" ? 0 : reveal(labelFrame, labelFrame + labelRevealFrames, labelSide === "left" ? labelTravel : -labelTravel, 0);
  const labelOffsetY = animate && labelSide === "below" ? reveal(labelFrame, labelFrame + labelRevealFrames, -labelTravel, 0) : 0;
  return Object.freeze({x, y, width, height, startFrame, endFrame: startFrame + frames, frames, value, label: wrappedLabel, labelSide, fontFamily, fontSize, labelFontSize, color: circleColor, backgroundColor, textColor, circle, valueBox, labelBox, popFrames, labelFrame, labelRevealFrames, settledFrame, holdFrames, circleScale, valueOpacity: animate ? reveal(valueFrame, popFrames, 0, 1) : 1, valueOffsetY: animate ? reveal(valueFrame, popFrames, valueBox.height, 0) : 0, labelOpacity: animate ? reveal(labelFrame, labelFrame + labelRevealFrames, 0, 1) : 1, labelOffsetX, labelOffsetY, animate});
}

/** Dot expands into an editable circle; value and context reveal in independent fixed masks. */
export function MilestoneBadge(props: MilestoneBadgeProps): JSX.Element {
  const data = createMemo(() => getMilestoneBadgeLayout(props), undefined, {equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)});
  return Rect({get key(){return props.key;}, get name(){return props.name ?? "MilestoneBadge";}, get x(){return data().x;}, get y(){return data().y;}, get width(){return data().width;}, get height(){return data().height;}, clipToBox: true, get start(){return eduTime(data().startFrame);}, get end(){return eduTime(data().endFrame);},
    get children(){
      const d = data(), end = eduTime(d.frames);
      return [
        ...(d.backgroundColor === undefined ? [] : [Rect({name: "Milestone background", x: 0, y: 0, width: d.width, height: d.height, fill: d.backgroundColor, start: "0f", end})]),
        Rect({name: "Milestone label viewport", ...d.labelBox, start: "0f", end, clipToBox: true, children: Text({name: "Milestone context", x: 0, y: 0, width: d.labelBox.width, height: d.labelBox.height, start: "0f", end, fontFamily: d.fontFamily, fontSize: d.labelFontSize, textAlign: d.labelSide === "left" ? "right" : d.labelSide === "below" ? "center" : "left", textBaseline: "middle", fill: d.textColor, opacity: nativeTrack(d.labelOpacity), offsetX: nativeTrack(d.labelOffsetX), offsetY: nativeTrack(d.labelOffsetY), children: d.label})}),
        Rect({name: "Milestone circle", ...d.circle, start: "0f", end, cornerRadius: d.circle.width / 2, fill: d.color, scale: nativeTrack(d.circleScale), children: Rect({name: "Milestone value viewport", x: d.valueBox.x - d.circle.x, y: d.valueBox.y - d.circle.y, width: d.valueBox.width, height: d.valueBox.height, start: "0f", end, clipToBox: true, children: Text({name: "Milestone value", x: 0, y: 0, width: d.valueBox.width, height: d.valueBox.height, start: "0f", end, fontFamily: d.fontFamily, fontSize: d.fontSize, fontWeight: 700, textAlign: "center", textBaseline: "middle", fill: d.textColor, opacity: nativeTrack(d.valueOpacity), offsetY: nativeTrack(d.valueOffsetY), children: d.value})})}),
      ];
    },
  });
}
