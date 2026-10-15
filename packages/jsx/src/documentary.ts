/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Group, Rect, Text } from "./elements";
import { motion } from "./motion-presets";
import { parseTime, TIME_FPS } from "./time";
import type { Animatable, Time } from "./types";

/** Colors use #RRGGBB. The font must be available on the rendering machine. */
export type DocumentaryTheme = {
  background: string; surface: string; text: string; muted: string; accent: string; fontFamily: string;
};
export const DOCUMENTARY_THEME: Readonly<DocumentaryTheme> = Object.freeze({
  background: "#101C2B", surface: "#1C2D42", text: "#F6F0E4", muted: "#C4C7CC", accent: "#F47B39", fontFamily: "Arial",
});
export type DocumentaryProps = {
  x?: number; y?: number; width?: number; height?: number;
  start?: Time;
  /** Absolute parent-timeline end. Mutually exclusive with duration. */
  end?: Time;
  /** Default 6 seconds. Does not infer reading time from the supplied text. */
  duration?: Time;
  theme?: Partial<DocumentaryTheme>;
  /** Default true: a short native fade/slide. False makes a static card. */
  animate?: boolean;
  /** Base typography in composition pixels, default 32. */
  fontSize?: number;
};
export type ChapterCardProps = DocumentaryProps & { title: string; subtitle?: string; chapter?: string };
export type LowerThirdProps = DocumentaryProps & { name: string; role?: string; source?: string };
export type SourceCardProps = DocumentaryProps & { title: string; source: string; detail?: string; date?: string; url?: string };
export type QuoteCardProps = DocumentaryProps & { quote: string; attribution: string; source?: string };
export type TimelineEvent = { date: string; title: string; detail?: string };
export type TimelineProps = DocumentaryProps & { events: readonly TimelineEvent[]; activeIndex?: number; title?: string };
export type EvidenceTarget = { x: number; y: number; width: number; height: number };
export type EvidenceCalloutProps = DocumentaryProps & {
  target: EvidenceTarget; label: string; detail?: string; source?: string;
  /** Auto prefers above, then below. Explicit positions must fit without covering the target. */
  labelPosition?: "auto" | "above" | "below" | "left" | "right";
};

type Layout = { x: number; y: number; width: number; height: number; start: number; end: number; frames: number; font: number; intro: number };
type Box = { x: number; y: number; width: number; height: number };
const ft = (frame: number): `${number}f` => `${frame}f`;
function positive(value: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be positive and finite`);
  return value;
}
function finite(value: number, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}
function clock(value: Time, label: string) {
  const seconds = parseTime(value);
  const frame = seconds === undefined ? NaN : Math.round(seconds * TIME_FPS);
  if (seconds === undefined || seconds < 0 || !Number.isSafeInteger(frame)) throw new RangeError(`${label} must be a nonnegative finite time`);
  return frame;
}
function text(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be nonempty caller-supplied text`);
  return value.trim();
}

/**
 * Conservative character-cell wrapping (1.1em per Unicode code point), not a
 * browser font measurement. No content is discarded: long words/URLs split,
 * and text beyond the explicit line budget throws instead of overflowing.
 */
export function wrapDocumentaryText(value: string, options: { width: number; fontSize: number; maxLines: number; label?: string }): string {
  const label = options.label ?? "text", content = text(value, label);
  const columns = Math.floor(positive(options.width, "text width") / (positive(options.fontSize, "fontSize") * 1.1));
  if (columns < 1 || !Number.isSafeInteger(options.maxLines) || options.maxLines < 1) throw new RangeError(`${label} has no readable text area; enlarge the box or reduce fontSize`);
  const lines: string[] = [];
  for (const paragraph of content.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const chars = Array.from(word);
      while (chars.length > columns) {
        if (line) { lines.push(line); line = ""; }
        lines.push(chars.splice(0, columns).join(""));
      }
      const tail = chars.join("");
      if (!tail) continue;
      if (line && Array.from(line).length + 1 + chars.length > columns) { lines.push(line); line = ""; }
      line += `${line ? " " : ""}${tail}`;
    }
    lines.push(line);
  }
  if (lines.length > options.maxLines) throw new RangeError(`${label} needs ${lines.length} lines but only ${options.maxLines} fit; shorten the text, enlarge the box or reduce fontSize`);
  return lines.join("\n");
}

function palette(input: Partial<DocumentaryTheme> | undefined): DocumentaryTheme {
  if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) throw new TypeError("theme must be an object");
  const result = { ...DOCUMENTARY_THEME };
  for (const key of Object.keys(input ?? {}) as (keyof DocumentaryTheme)[]) {
    if (!Object.hasOwn(DOCUMENTARY_THEME, key)) throw new TypeError(`Unknown documentary theme field: ${key}`);
    if (input?.[key] !== undefined) result[key] = input[key]!;
  }
  for (const key of Object.keys(result) as (keyof DocumentaryTheme)[]) {
    if (key === "fontFamily") text(result[key], "fontFamily");
    else if (!/^#[\da-f]{6}$/i.test(result[key])) throw new TypeError(`theme.${key} must be a #RRGGBB color`);
  }
  return result;
}
function layout(props: DocumentaryProps, defaults: Box): Layout {
  if (props.end !== undefined && props.duration !== undefined) throw new TypeError("Use end or duration, not both");
  const start = clock(props.start ?? 0, "start");
  const frames = props.end === undefined ? clock(props.duration ?? 6, "duration") : clock(props.end, "end") - start;
  if (frames < 1 || !Number.isSafeInteger(start + frames)) throw new RangeError("Component must last at least one safe frame");
  if (props.animate !== undefined && typeof props.animate !== "boolean") throw new TypeError("animate must be boolean");
  return {x: finite(props.x ?? defaults.x, "x"), y: finite(props.y ?? defaults.y, "y"), width: positive(props.width ?? defaults.width, "width"), height: positive(props.height ?? defaults.height, "height"), start, end: start + frames, frames, font: positive(props.fontSize ?? 32, "fontSize"), intro: Math.min(12, frames - 1)};
}
function rect(name: string, box: Box, fill: string, frames: number, width: Animatable<number> = box.width): JSX.Element {
  return Rect({name, ...box, width, fill, start: "0f", end: ft(frames)});
}
function label(name: string, value: string, box: Box, font: number, theme: DocumentaryTheme, frames: number, color = theme.text, bold = false): JSX.Element {
  const wrapped = wrapDocumentaryText(value, {width: box.width, fontSize: font, maxLines: Math.floor(box.height / (font * 1.35)), label: name});
  return Text({name, ...box, fontFamily: theme.fontFamily, fontSize: font, fontWeight: bold ? 700 : 400, fill: color, start: "0f", end: ft(frames), children: wrapped});
}
function component(name: string, props: DocumentaryProps, defaults: Box, build: (l: Layout, t: DocumentaryTheme) => JSX.Element[]): JSX.Element {
  const l = createMemo(() => layout(props, defaults)), t = createMemo(() => palette(props.theme));
  return Group({name,
    get x() { return l().x; }, get y() { return l().y; }, get width() { return l().width; }, get height() { return l().height; },
    get start() { return ft(l().start); }, get end() { return ft(l().end); },
    get opacity() { return props.animate === false || !l().intro ? 1 : motion.fadeIn({duration: ft(l().intro)}).opacity; },
    get offsetY() { return props.animate === false || !l().intro ? 0 : motion.slideIn({direction: "down", distance: 24, duration: ft(l().intro)}).offsetY; },
    get children() { return build(l(), t()); },
  });
}

export function ChapterCard(props: ChapterCardProps): JSX.Element {
  return component("ChapterCard", props, {x: 96, y: 96, width: 1728, height: 888}, (l, t) => {
    const p = l.width * .055, inner = l.width - p * 2;
    const nodes = [rect("Chapter background", {x: 0, y: 0, width: l.width, height: l.height}, t.background, l.frames)];
    if (props.chapter) nodes.push(label("Chapter label", props.chapter, {x: p, y: l.height * .14, width: inner, height: l.height * .10}, l.font, t, l.frames, t.accent, true));
    nodes.push(label("Chapter title", props.title, {x: p, y: l.height * .29, width: inner, height: l.height * .37}, l.font * 2.2, t, l.frames, t.text, true));
    nodes.push(rect("Chapter underline", {x: p, y: l.height * .70, width: inner * .25, height: 5}, t.accent, l.frames, props.animate === false || !l.intro ? inner * .25 : [{time: "0f", value: 0, easing: "easeOut"}, {time: ft(l.intro), value: inner * .25}]));
    if (props.subtitle) nodes.push(label("Chapter subtitle", props.subtitle, {x: p, y: l.height * .77, width: inner, height: l.height * .16}, l.font, t, l.frames, t.muted));
    return nodes;
  });
}

export function LowerThird(props: LowerThirdProps): JSX.Element {
  return component("LowerThird", props, {x: 96, y: 794, width: 1120, height: 190}, (l, t) => {
    const p = l.width * .035, inner = l.width - p * 2;
    const nodes = [rect("Lower third panel", {x: 0, y: 0, width: l.width, height: l.height}, t.background, l.frames), rect("Lower third accent", {x: 0, y: 0, width: 6, height: l.height}, t.accent, l.frames), label("Speaker name", props.name, {x: p, y: l.height * .12, width: inner, height: l.height * .40}, l.font * 1.4, t, l.frames, t.text, true)];
    if (props.role) nodes.push(label("Speaker role", props.role, {x: p, y: l.height * .53, width: inner, height: l.height * .23}, l.font * .85, t, l.frames, t.muted));
    if (props.source) nodes.push(label("Speaker source", props.source, {x: p, y: l.height * .78, width: inner, height: l.height * .18}, l.font * .65, t, l.frames, t.accent));
    return nodes;
  });
}

export function SourceCard(props: SourceCardProps): JSX.Element {
  return component("SourceCard", props, {x: 1104, y: 96, width: 720, height: 520}, (l, t) => {
    const p = l.width * .055, inner = l.width - p * 2;
    const nodes = [rect("Source panel", {x: 0, y: 0, width: l.width, height: l.height}, t.surface, l.frames), rect("Source rule", {x: p, y: l.height * .07, width: inner * .2, height: 4}, t.accent, l.frames), label("Source title", props.title, {x: p, y: l.height * .14, width: inner, height: l.height * .21}, l.font * 1.1, t, l.frames, t.text, true), label("Source provenance", props.source, {x: p, y: l.height * .40, width: inner, height: l.height * .16}, l.font * .8, t, l.frames, t.accent)];
    if (props.detail) nodes.push(label("Source detail", props.detail, {x: p, y: l.height * .59, width: inner, height: l.height * .20}, l.font * .8, t, l.frames, t.muted));
    const footer = [props.date, props.url].filter(Boolean).join(" • ");
    if (footer) nodes.push(label("Source date and URL", footer, {x: p, y: l.height * .82, width: inner, height: l.height * .15}, l.font * .6, t, l.frames, t.muted));
    return nodes;
  });
}

export function QuoteCard(props: QuoteCardProps): JSX.Element {
  return component("QuoteCard", props, {x: 192, y: 224, width: 1536, height: 632}, (l, t) => {
    const p = l.width * .05, inner = l.width - p * 2;
    const nodes = [rect("Quote panel", {x: 0, y: 0, width: l.width, height: l.height}, t.background, l.frames), rect("Quote accent", {x: p, y: l.height * .1, width: 6, height: l.height * .57}, t.accent, l.frames), label("Quoted text", props.quote, {x: p + 30, y: l.height * .10, width: inner - 30, height: l.height * .54}, l.font * 1.45, t, l.frames), label("Quote attribution", props.attribution, {x: p + 30, y: l.height * .72, width: inner - 30, height: l.height * .12}, l.font * .9, t, l.frames, t.accent, true)];
    if (props.source) nodes.push(label("Quote source", props.source, {x: p + 30, y: l.height * .86, width: inner - 30, height: l.height * .10}, l.font * .65, t, l.frames, t.muted));
    return nodes;
  });
}

export function Timeline(props: TimelineProps): JSX.Element {
  // Clock-driven getters may run every tick while selecting the same event.
  // Keep that semantic selection stable before building native entities.
  const activeIndex = createMemo(() => {
    if (!Array.isArray(props.events) || props.events.length < 2 || props.events.length > 6 || Array.from({length: props.events.length}, (_, index) => index).some(index => !Object.hasOwn(props.events, index))) throw new RangeError("Timeline requires two to six complete events");
    const active = props.activeIndex ?? 0;
    if (!Number.isSafeInteger(active) || active < 0 || active >= props.events.length) throw new RangeError("activeIndex must identify an event");
    return active;
  });
  return component("Timeline", props, {x: 96, y: 230, width: 1728, height: 620}, (l, t) => {
    const active = activeIndex();
    const p = l.width * .035, inner = l.width - p * 2, cell = inner / props.events.length;
    const nodes = [rect("Timeline panel", {x: 0, y: 0, width: l.width, height: l.height}, t.background, l.frames), rect("Timeline rail", {x: p + cell / 2, y: l.height * .4, width: inner - cell, height: 4}, t.muted, l.frames)];
    if (props.title) nodes.push(label("Timeline title", props.title, {x: p, y: l.height * .04, width: inner, height: l.height * .12}, l.font * 1.2, t, l.frames, t.text, true));
    props.events.forEach((event, index) => {
      if (!event || typeof event !== "object") throw new TypeError(`Timeline event ${index} must be an object`);
      const x = p + index * cell + 12, width = cell - 24, selected = index === active;
      nodes.push(label(`Event ${index + 1} date`, event.date, {x, y: l.height * .20, width, height: l.height * .14}, l.font * .65, t, l.frames, selected ? t.accent : t.muted));
      nodes.push(rect(`Event ${index + 1} marker`, {x: p + (index + .5) * cell - 8, y: l.height * .4 - 6, width: 16, height: 16}, selected ? t.accent : t.muted, l.frames));
      nodes.push(label(`Event ${index + 1} title`, event.title, {x, y: l.height * .47, width, height: l.height * .24}, l.font * .9, t, l.frames, selected ? t.text : t.muted, true));
      if (event.detail) nodes.push(label(`Event ${index + 1} detail`, event.detail, {x, y: l.height * .75, width, height: l.height * .20}, l.font * .65, t, l.frames, t.muted));
    });
    return nodes;
  });
}

/** Authored rectangle overlay; coordinates are supplied by the caller, not detected. */
export function EvidenceCallout(props: EvidenceCalloutProps): JSX.Element {
  return component("EvidenceCallout", props, {x: 0, y: 0, width: 1920, height: 1080}, (l, t) => {
    const target = props.target;
    if (!target || typeof target !== "object") throw new TypeError("EvidenceCallout requires an authored target rectangle");
    finite(target.x, "target.x"); finite(target.y, "target.y"); positive(target.width, "target.width"); positive(target.height, "target.height");
    if (target.x < 0 || target.y < 0 || target.x + target.width > l.width || target.y + target.height > l.height) throw new RangeError("Evidence target must fit within the component's local box");
    const stroke = Math.min(5, target.width / 2, target.height / 2), panelWidth = Math.min(680, l.width), panelHeight = Math.min(240, l.height);
    let x = Math.min(target.x, l.width - panelWidth);
    const above = target.y - panelHeight - 16, below = target.y + target.height + 16;
    const position = props.labelPosition ?? "auto";
    let y: number;
    switch (position) {
      case "auto": y = above >= 0 ? above : below + panelHeight <= l.height ? below : -1; break;
      case "above": y = above; break;
      case "below": y = below; break;
      case "right":
        x = target.x + target.width + 16;
        y = Math.max(0, Math.min(l.height - panelHeight, target.y + (target.height - panelHeight) / 2));
        break;
      case "left":
        x = target.x - panelWidth - 16;
        y = Math.max(0, Math.min(l.height - panelHeight, target.y + (target.height - panelHeight) / 2));
        break;
      default: throw new RangeError("labelPosition must be auto, above, below, left, or right");
    }
    const fits = x >= 0 && y >= 0 && x + panelWidth <= l.width && y + panelHeight <= l.height;
    const overlaps = x < target.x + target.width && x + panelWidth > target.x && y < target.y + target.height && y + panelHeight > target.y;
    if (!fits || overlaps) throw new RangeError(`EvidenceCallout needs room for labelPosition ${position} without covering the target; enlarge the box, move the target or choose another position`);
    const nodes = [rect("Evidence top edge", {x: target.x, y: target.y, width: target.width, height: stroke}, t.accent, l.frames), rect("Evidence bottom edge", {x: target.x, y: target.y + target.height - stroke, width: target.width, height: stroke}, t.accent, l.frames), rect("Evidence left edge", {x: target.x, y: target.y, width: stroke, height: target.height}, t.accent, l.frames), rect("Evidence right edge", {x: target.x + target.width - stroke, y: target.y, width: stroke, height: target.height}, t.accent, l.frames), rect("Evidence label panel", {x, y, width: panelWidth, height: panelHeight}, t.background, l.frames)];
    const p = panelWidth * .045, inner = panelWidth - p * 2;
    nodes.push(label("Evidence label", props.label, {x: x + p, y: y + panelHeight * .04, width: inner, height: panelHeight * .41}, l.font * 1.05, t, l.frames, t.accent, true));
    if (props.detail) nodes.push(label("Evidence detail", props.detail, {x: x + p, y: y + panelHeight * .50, width: inner, height: panelHeight * .23}, l.font * .8, t, l.frames));
    if (props.source) nodes.push(label("Evidence source", props.source, {x: x + p, y: y + panelHeight * .80, width: inner, height: panelHeight * .16}, l.font * .65, t, l.frames, t.muted));
    return nodes;
  });
}
