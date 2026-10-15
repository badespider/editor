/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo, mergeProps } from "solid-js";
import type { JSX } from "solid-js";
import { ColorStop, Group, LinearGradientPaint, Rect, Text } from "./elements";
import { educationFrames, educationLayout, educationNumber, educationText, educationTheme, eduRect, eduText, eduTime } from "./education-core";
import type { EducationBox, EducationLayout, EducationProps, EducationTheme } from "./education-core";
import { motion } from "./motion-presets";
import type { Keyframe, Time } from "./types";

/** Boxes and typography are authored in composition pixels, not inferred from the scene format. */
export type CreativeProps = EducationProps;
export type CreativeBox = EducationBox;
export type BackdropProps = CreativeProps & {
  kind?: "solid" | "grid" | "dots" | "gradient";
  /** Unsigned 32-bit seed. No wall clock, random source, texture or remote asset. */
  seed?: number; spacing?: number;
  /** Pattern opacity, 0..0.25. Default 0.12; does not certify contrast over arbitrary content. */
  strength?: number; gradientAngle?: number;
};
export type PanelLayoutOptions = {
  width: number; height: number; direction?: "columns" | "stack";
  /** Fraction of usable length assigned to the first panel, 0.2..0.8. */
  ratio?: number; gap?: number; padding?: number;
};
export type PanelSlotBox = CreativeBox & { start: "0f"; end: `${number}f` };
export type PanelLayoutProps = CreativeProps & Omit<PanelLayoutOptions, "width" | "height"> & {
  first: (box: PanelSlotBox) => JSX.Element; second: (box: PanelSlotBox) => JSX.Element;
};
export type StoryBeatCardProps = CreativeProps & {
  eyebrow?: string; title: string; body: string; source?: string;
  /** Authored still hold, default 3s. The animated entrance/exit must also fit. */
  minHold?: Time;
};
export type KineticTextProps = CreativeProps & {
  text: string;
  /** Time until the last word appears, default 1s. First word appears at local frame 0. */
  revealDuration?: Time;
  /** Fully revealed still reading hold, default 2s; not a reading-speed estimate. */
  minHold?: Time;
  /** Complete, unique one-based word indices. Prose whitespace is normalized. */
  emphasisWords?: readonly number[];
};
const CARD_BOX = Object.freeze({x: 96, y: 96, width: 1728, height: 888});
const FULL_BOX = Object.freeze({x: 0, y: 0, width: 1920, height: 1080});
function layout(props: CreativeProps, defaults: CreativeBox, font = 32): EducationLayout {
  // Only read geometry/timing here: spreading a component's props would also
  // subscribe this memo to unrelated clock-derived text/selection getters.
  const result = educationLayout({x: props.x, y: props.y, width: props.width, height: props.height,
    start: props.start, end: props.end, duration: props.duration, animate: props.animate, fontSize: props.fontSize ?? font}, defaults);
  if (result.width * result.height > 8_388_608) throw new RangeError("Creative box exceeds the 8-megapixel limit");
  return result;
}
function themed(props: CreativeProps): EducationTheme { return educationTheme(props.theme); }
function integer(value: number, label: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new RangeError(`${label} must be an integer in ${min}..${max}`);
  return value;
}
function authoredText(value: string, label: string, max: number): string {
  const result = educationText(value, label, max);
  if (/[\u0000-\u0008\u000B-\u001F\u007F]/.test(result)) throw new TypeError(`${label} contains unsupported control characters`);
  return result;
}
function wordIndices(value: readonly number[] | undefined): readonly number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 96 || Array.from({length: value.length}, (_, index) => index).some(index => !Object.hasOwn(value, index))) throw new RangeError("KineticText.emphasisWords must be a complete array of word indices");
  return Array.from(value);
}
function hash(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0;
  value ^= value >>> 16; value = Math.imul(value, 0x85EBCA6B); value ^= value >>> 13;
  return (value >>> 0) / 0x100000000;
}
function backdrop(props: BackdropProps) {
  const l = layout(props, FULL_BOX), theme = themed(props), kind = props.kind ?? "solid";
  if (!["solid", "grid", "dots", "gradient"].includes(kind)) throw new TypeError("Backdrop.kind must be solid, grid, dots or gradient");
  const seed = integer(props.seed ?? 0, "Backdrop.seed", 0, 0xFFFFFFFF);
  const spacing = educationNumber(props.spacing ?? 96, "Backdrop.spacing", 24, 1024);
  const strength = educationNumber(props.strength ?? .12, "Backdrop.strength", 0, .25);
  const angle = educationNumber(props.gradientAngle ?? 90, "Backdrop.gradientAngle", 0, 360);
  const columns = Math.ceil(l.width / spacing), rows = Math.ceil(l.height / spacing);
  const count = kind === "dots" ? columns * rows : kind === "grid" ? columns + rows : 0;
  if (count > 512) throw new RangeError("Backdrop pattern exceeds 512 marks; increase spacing or reduce the box");
  const marks: CreativeBox[] = [];
  if (kind === "grid") {
    const phaseX = hash(seed, 0) * spacing, phaseY = hash(seed, 1) * spacing;
    for (let x = phaseX; x <= l.width - 1; x += spacing) marks.push({x, y: 0, width: 1, height: l.height});
    for (let y = phaseY; y <= l.height - 1; y += spacing) marks.push({x: 0, y, width: l.width, height: 1});
  } else if (kind === "dots") {
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const x = (column + .5 + (hash(seed, index * 2) - .5) * .3) * spacing - 2;
      const y = (row + .5 + (hash(seed, index * 2 + 1) - .5) * .3) * spacing - 2;
      if (x >= 0 && y >= 0 && x + 4 <= l.width && y + 4 <= l.height) marks.push({x, y, width: 4, height: 4});
    }
  }
  return {l, theme, kind, strength, angle, marks};
}
/** Deterministic local pattern boxes. Useful for checking bounds and authoring previews. */
export function getBackdropPattern(props: BackdropProps): readonly Readonly<CreativeBox>[] {
  return Object.freeze(backdrop(props).marks.map(mark => Object.freeze(mark)));
}
/** Native shape/paint background. Patterns deliberately stay static and subdued. */
export function Backdrop(props: BackdropProps): JSX.Element {
  const data = createMemo(() => backdrop(props));
  return Group({name: "Backdrop", get x(){return data().l.x;}, get y(){return data().l.y;},
    get width(){return data().l.width;}, get height(){return data().l.height;}, get start(){return eduTime(data().l.start);}, get end(){return eduTime(data().l.end);},
    get children(){
      const {l, theme, kind, strength, angle, marks} = data();
      const background = Rect({name: "Backdrop field", x: 0, y: 0, width: l.width, height: l.height, fill: theme.background, start: "0f", end: eduTime(l.frames),
        children: kind === "gradient" ? LinearGradientPaint({rotation: angle, children: [ColorStop({offset: 0, color: theme.background}), ColorStop({offset: 1, color: theme.surface})]}) : undefined});
      return [background, ...marks.map((mark, index) => Rect({name: `Backdrop mark ${index + 1}`, ...mark, fill: theme.accent, opacity: strength, cornerRadius: kind === "dots" ? 2 : 0, start: "0f", end: eduTime(l.frames)}))];
    },
  });
}

/** Authored two-panel geometry. There is no automatic reflow between formats. */
export function getPanelLayout(options: PanelLayoutOptions): Readonly<{first: Readonly<CreativeBox>; second: Readonly<CreativeBox>}> {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Panel layout requires authored dimensions");
  const width = educationNumber(options.width, "Panel width", 128, 4096), height = educationNumber(options.height, "Panel height", 128, 4096);
  if (width * height > 8_388_608) throw new RangeError("Panel box exceeds the 8-megapixel limit");
  const direction = options.direction ?? "columns";
  if (direction !== "columns" && direction !== "stack") throw new TypeError("Panel direction must be columns or stack");
  const ratio = educationNumber(options.ratio ?? .5, "Panel ratio", .2, .8);
  const padding = educationNumber(options.padding ?? 0, "Panel padding", 0, Math.min(width, height) / 4);
  const gap = educationNumber(options.gap ?? 32, "Panel gap", 0, Math.min(width, height) / 2);
  const innerW = width - padding * 2, innerH = height - padding * 2;
  const available = (direction === "columns" ? innerW : innerH) - gap, firstLength = available * ratio, secondLength = available - firstLength;
  const first = {x: padding, y: padding, width: direction === "columns" ? firstLength : innerW, height: direction === "columns" ? innerH : firstLength};
  const second = {x: direction === "columns" ? padding + firstLength + gap : padding, y: direction === "columns" ? padding : padding + firstLength + gap, width: direction === "columns" ? secondLength : innerW, height: direction === "columns" ? innerH : secondLength};
  if ([first, second].some(box => box.width < 64 || box.height < 64)) throw new RangeError("Both panels need at least 64px per dimension; reduce padding/gap or change ratio");
  return Object.freeze({first: Object.freeze(first), second: Object.freeze(second)});
}
/** Two editable native panel Groups. Slots receive their own local, explicitly timed box. */
export function PanelLayout(props: PanelLayoutProps): JSX.Element {
  const first = createMemo(() => props.first), second = createMemo(() => props.second);
  const data = createMemo(() => {
    const l = layout(props, CARD_BOX), theme = themed(props);
    if (typeof first() !== "function" || typeof second() !== "function") throw new TypeError("PanelLayout requires first and second slot functions");
    return {l, theme, panels: getPanelLayout({direction: props.direction, ratio: props.ratio, gap: props.gap, padding: props.padding, width: l.width, height: l.height})};
  });
  return Group({name: "PanelLayout", get x(){return data().l.x;}, get y(){return data().l.y;}, get width(){return data().l.width;}, get height(){return data().l.height;}, get start(){return eduTime(data().l.start);}, get end(){return eduTime(data().l.end);},
    get children(){
      const {l, theme, panels} = data();
      return (["first", "second"] as const).map(key => {
        const box = panels[key];
        return Group({name: `Panel ${key}`, ...box, start: "0f", end: eduTime(l.frames), children: [
          eduRect(`Panel ${key} field`, {x: 0, y: 0, width: box.width, height: box.height}, theme.surface, l.frames),
          (key === "first" ? first() : second())({x: 0, y: 0, width: box.width, height: box.height, start: "0f", end: eduTime(l.frames)}),
        ]});
      });
    },
  });
}

/** A single authored setup/action/payoff beat; source wording comes from the caller. */
export function StoryBeatCard(props: StoryBeatCardProps): JSX.Element {
  const title = createMemo(() => authoredText(props.title, "StoryBeatCard.title", 512));
  const body = createMemo(() => authoredText(props.body, "StoryBeatCard.body", 2048));
  const eyebrow = createMemo(() => props.eyebrow === undefined ? undefined : authoredText(props.eyebrow, "StoryBeatCard.eyebrow", 160));
  const source = createMemo(() => props.source === undefined ? undefined : authoredText(props.source, "StoryBeatCard.source", 512));
  const hold = createMemo(() => props.minHold);
  const data = createMemo(() => {
    const l = layout(props, CARD_BOX), theme = themed(props);
    const minHold = educationFrames(hold() ?? 3, "StoryBeatCard.minHold", true);
    const reveal = props.animate === false ? {opacity: 1, offsetY: 0} : motion.reveal({duration: eduTime(l.frames), minHold: eduTime(minHold), direction: "down", distance: 16});
    return {l, theme, reveal};
  });
  return Group({name: "StoryBeatCard", get x(){return data().l.x;}, get y(){return data().l.y;}, get width(){return data().l.width;}, get height(){return data().l.height;}, get start(){return eduTime(data().l.start);}, get end(){return eduTime(data().l.end);},
    get opacity(){return data().reveal.opacity;}, get offsetY(){return data().reveal.offsetY;},
    get children(){
      const {l, theme} = data(), p = l.width * .06, width = l.width - p * 2;
      const nodes = [eduRect("Story beat field", {x: 0, y: 0, width: l.width, height: l.height}, theme.background, l.frames),
        eduRect("Story beat rule", {x: p, y: l.height * .05, width: l.width * .12, height: 4}, theme.accent, l.frames),
        eduText("Story beat title", title(), {x: p, y: l.height * .22, width, height: l.height * .21}, l.font * 1.5, theme, l.frames, theme.text, true),
        eduText("Story beat body", body(), {x: p, y: l.height * .49, width, height: l.height * .30}, l.font, theme, l.frames),
      ];
      if (eyebrow() !== undefined) nodes.push(eduText("Story beat eyebrow", eyebrow()!, {x: p, y: l.height * .10, width, height: l.height * .08}, l.font * .7, theme, l.frames, theme.accent, true));
      if (source() !== undefined) nodes.push(eduText("Story beat source", source()!, {x: p, y: l.height * .87, width, height: l.height * .08}, l.font * .65, theme, l.frames, theme.muted));
      return nodes;
    },
  });
}

export type KineticWord = Readonly<CreativeBox & {text: string; index: number; onsetFrame: number; emphasis: boolean}>;
export type KineticMeasure = (text: string, weight: 400 | 700) => number;
export type ValidatedKineticText = Readonly<{layout: Readonly<EducationLayout>; theme: Readonly<EducationTheme>; words: readonly KineticWord[]; revealFrames: number; holdFrames: number; animate: boolean; measurement: "native" | "provided" | "conservative"}>;
type KineticMeasureContext = {font: string; measureText(value: string): {width: number}};
function localKineticMeasure(fontFamily: string, fontSize: number): KineticMeasure | undefined {
  const Canvas = (globalThis as typeof globalThis & {OffscreenCanvas?: new (width: number, height: number) => {getContext(type: "2d"): KineticMeasureContext | null}}).OffscreenCanvas;
  if (!Canvas) return undefined;
  let context: KineticMeasureContext | null;
  try { context = new Canvas(1, 1).getContext("2d"); } catch { return undefined; }
  if (!context) return undefined;
  const ctx = context;
  return (value, weight) => {
    ctx.font = `${weight} ${fontSize}px ${fontFamily}`;
    return ctx.measureText(value).width;
  };
}
/** Complete text is laid out before reveal. Future words keep their authored positions. */
export function validateKineticText(props: KineticTextProps, measure?: KineticMeasure): ValidatedKineticText {
  const l = layout(props, CARD_BOX, 64), theme = themed(props), content = authoredText(props.text, "KineticText.text", 2048);
  const holdFrames = educationFrames(props.minHold ?? 2, "KineticText.minHold", true), requestedReveal = educationFrames(props.revealDuration ?? 1, "KineticText.revealDuration", true);
  const lineHeight = l.font * 1.5;
  const paragraphs = content.split(/\r?\n/).map(line => line.split(/\s+/).filter(Boolean));
  const total = paragraphs.reduce((sum, words) => sum + words.length, 0);
  integer(total, "KineticText word count", 1, 96);
  const emphasis = wordIndices(props.emphasisWords);
  for (const index of emphasis) integer(index, "KineticText emphasis word", 1, total);
  if (new Set(emphasis).size !== emphasis.length) throw new RangeError("KineticText.emphasisWords must be unique");
  const animate = props.animate !== false, revealFrames = total === 1 ? 0 : requestedReveal;
  if (animate && revealFrames + holdFrames > l.frames - 1) throw new RangeError("KineticText reveal and complete reading hold must fit before the last visible frame; increase duration or shorten reveal/minHold");
  const nativeMeasure = measure === undefined ? localKineticMeasure(theme.fontFamily, l.font) : undefined;
  const glyphMeasure = measure ?? nativeMeasure ?? (value => Array.from(value).length * l.font * 1.1);
  const widths = new Map<string, number>();
  const measured = (value: string, weight: 400 | 700): number => {
    const key = `${weight}:${value}`;
    let width = widths.get(key);
    if (width === undefined) {
      width = educationNumber(glyphMeasure(value, weight), "KineticText measured width", .001, 1_000_000);
      widths.set(key, width);
    }
    return width;
  };
  const words: KineticWord[] = [];
  let row = 0;
  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) row++;
    let advance = 0, gap = 0;
    for (const word of paragraph) {
      const index = words.length + 1, emphasized = emphasis.includes(index), weight = emphasized ? 700 : 400;
      const glyphWidth = measured(word, weight), width = glyphWidth + 2;
      if (width > l.width) throw new RangeError("KineticText contains a word wider than its box; enlarge the box or shorten the word");
      let x = advance + gap;
      if (advance > 0 && x + width > l.width) { row++; x = 0; }
      if ((row + 1) * lineHeight > l.height + .000001) throw new RangeError("KineticText.text exceeds its readable line/height budget; shorten the text, enlarge the box or reduce fontSize");
      words.push(Object.freeze({x, y: row * lineHeight, width, height: l.font * 1.35, text: word, index, onsetFrame: total === 1 ? 0 : Math.round((index - 1) * revealFrames / (total - 1)), emphasis: emphasized}));
      // The text box gets a rounding guard, but spacing uses actual advances.
      advance = x + glyphWidth; gap = measured(" ", weight);
    }
  });
  return Object.freeze({layout: Object.freeze(l), theme: Object.freeze(theme), words: Object.freeze(words), revealFrames, holdFrames, animate, measurement: measure ? "provided" : nativeMeasure ? "native" : "conservative"});
}
/** Native local keyframes: no ticker callback, timers, DOM, per-tick allocation or layout changes. */
export function KineticText(props: KineticTextProps): JSX.Element {
  const text = createMemo(() => props.text), reveal = createMemo(() => props.revealDuration), hold = createMemo(() => props.minHold);
  const emphasis = createMemo(() => wordIndices(props.emphasisWords), [], {equals: (a, b) => a.length === b.length && a.every((value, index) => value === b[index])});
  const normalized = mergeProps(props, {get text(){return text();}, get revealDuration(){return reveal();}, get minHold(){return hold();}, get emphasisWords(){return emphasis();}});
  const data = createMemo(() => validateKineticText(normalized));
  return Group({name: "KineticText", get x(){return data().layout.x;}, get y(){return data().layout.y;}, get width(){return data().layout.width;}, get height(){return data().layout.height;}, get start(){return eduTime(data().layout.start);}, get end(){return eduTime(data().layout.end);},
    get children(){
      const {layout: l, theme, words, animate} = data();
      return words.map(word => {
        const opacity: number | Keyframe<number>[] = !animate || word.onsetFrame === 0 ? 1 : [{time: "0f", value: 0, easing: "steps(1)"}, {time: eduTime(word.onsetFrame), value: 1}];
        return Text({name: `Kinetic word ${word.index}`, x: word.x, y: word.y, width: word.width, height: word.height, fontSize: l.font, fontFamily: theme.fontFamily, fontWeight: word.emphasis ? 700 : 400, fill: word.emphasis ? theme.accent : theme.text, opacity, start: "0f", end: eduTime(l.frames), children: word.text});
      });
    },
  });
}
