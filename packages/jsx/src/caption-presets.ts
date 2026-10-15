/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Group, Rect, Text } from "./elements";
import { useTicker } from "./renderer";
import { parseTime, TIME_FPS } from "./time";
import type { Time } from "./types";

export type AuthoredCaptionPreset = "clean" | "boxed" | "karaoke";
export type CaptionBox = Readonly<{ x: number; y: number; width: number; height: number }>;
export type CaptionInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;
export type CaptionWord = Readonly<{ text: string; start: Time; end: Time }>;
export type CaptionCue = Readonly<{ text: string; start: Time; end: Time; words?: readonly CaptionWord[] }>;
export type CaptionSafeLayoutOptions = {
  width: number; height: number; fontSize?: number; maxLines?: number;
  position?: "top" | "bottom"; padding?: number; insets?: Partial<CaptionInsets>;
};
export type CaptionSafeLayout = CaptionBox & Readonly<{
  protectedArea: CaptionBox; safeArea: CaptionBox; insets: CaptionInsets;
  fontSize: number; maxLines: number; padding: number;
}>;
export type CaptionTrackProps = {
  cues: readonly CaptionCue[];
  /** Parent/scene placement. Cue and word times are relative to the track, not each cue. */
  start?: Time;
  /** Defaults to the final cue's end. Every native leaf receives an explicit lifetime. */
  duration?: Time;
  preset?: AuthoredCaptionPreset;
  canvasWidth?: number; canvasHeight?: number;
  x?: number; y?: number; width?: number; height?: number;
  fontSize?: number; fontFamily?: string; maxLines?: number; padding?: number;
  textAlign?: "left" | "center"; textColor?: string; highlightColor?: string;
  backgroundColor?: string; backgroundOpacity?: number;
};
export type CaptionMeasure = (text: string) => number;
export const MAX_CAPTION_CUES = 500;
export const MAX_CAPTION_WORDS = 4096;
const frameTime = (frame: number): `${number}f` => `${frame}f`;
function number(value: number, name: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} must be finite in ${min}..${max}`);
  return value;
}
function frames(value: Time, name: string, positive = false): number {
  if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !/^(?:\d+(?:\.\d+)?f?|\d+:[0-5]?\d(?:\.\d+)?|\d+:[0-5]?\d:[0-5]?\d(?:\.\d+)?)$/i.test(value.trim())) throw new TypeError(`${name} must be seconds, frames or a valid clock time`);
  const seconds = parseTime(value), result = seconds === undefined ? NaN : Math.round(seconds * TIME_FPS);
  if (seconds === undefined || seconds < 0 || !Number.isSafeInteger(result) || result < (positive ? 1 : 0) || result > 108000) throw new RangeError(`${name} must round to ${positive ? 1 : 0}..108000 canonical 30fps frames`);
  return result;
}
function complete(value: unknown, name: string, min: number, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || Array.from({length: value.length}, (_, i) => i).some(i => !Object.hasOwn(value, i))) throw new RangeError(`${name} requires ${min}..${max} complete own indexed entries`);
}
function lineCount(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 3) throw new RangeError("maxLines must be 1, 2 or 3");
  return value;
}
function color(value: string, name: string): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`${name} must be #RRGGBB`);
  return value;
}
function literal(value: string, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024 || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(value)) throw new TypeError(`${name} must be nonempty literal text of at most 1024 characters`);
  return value; // Punctuation, capitalization, whitespace and authored newlines are content.
}
function fields(value: object, allowed: readonly string[], name: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`Unknown ${name} field: ${key}`);
}

/** Starting guides, not a platform guarantee or subject detector. Insets are overrideable. */
export function captionSafeLayout(options: CaptionSafeLayoutOptions): CaptionSafeLayout {
  const width = number(options.width, "canvas width", 320, 8192), height = number(options.height, "canvas height", 180, 8192);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 16777216) throw new RangeError("caption canvas must use integer dimensions within 16 megapixels");
  const portrait = height > width;
  const fontSize = number(options.fontSize ?? (portrait ? 56 : 44), "fontSize", 8, 256);
  const maxLines = lineCount(options.maxLines ?? 2), padding = number(options.padding ?? 20, "padding", 0, 256);
  const defaults = portrait ? {top: height * .075, right: width * .15, bottom: height * .17, left: width * .067} : {top: height * .07, right: width * .05, bottom: height * .10, left: width * .05};
  if (options.insets !== undefined && (!options.insets || typeof options.insets !== "object" || Array.isArray(options.insets))) throw new TypeError("caption insets must be an object");
  for (const key of Object.keys(options.insets ?? {})) if (!Object.hasOwn(defaults, key)) throw new TypeError(`Unknown caption inset: ${key}`);
  const insets = Object.freeze({top: number(options.insets?.top ?? defaults.top, "insets.top", 0, height), right: number(options.insets?.right ?? defaults.right, "insets.right", 0, width), bottom: number(options.insets?.bottom ?? defaults.bottom, "insets.bottom", 0, height), left: number(options.insets?.left ?? defaults.left, "insets.left", 0, width)});
  const safeArea = Object.freeze({x: insets.left, y: insets.top, width: width - insets.left - insets.right, height: height - insets.top - insets.bottom});
  const boxHeight = fontSize * 1.35 * maxLines + padding * 2;
  if (safeArea.width <= padding * 2 || boxHeight > safeArea.height) throw new RangeError("caption safe area cannot fit the requested font/lines; revise insets or dimensions");
  const position = options.position ?? "bottom";
  if (position !== "top" && position !== "bottom") throw new TypeError("caption position must be top or bottom");
  const box = Object.freeze({x: safeArea.x, y: position === "top" ? safeArea.y : safeArea.y + safeArea.height - boxHeight, width: safeArea.width, height: boxHeight});
  return Object.freeze({...box, protectedArea: box, safeArea, insets, fontSize, maxLines, padding});
}

export type CaptionLine = Readonly<{ text: string; startIndex: number; endIndex: number; x: number; y: number; width: number }>;
export type CaptionWordLayout = Readonly<{ text: string; startFrame: number; endFrame: number; x: number; y: number; width: number }>;
type ValidatedCue = Readonly<{ text: string; startFrame: number; endFrame: number; lines: readonly CaptionLine[]; words: readonly CaptionWordLayout[] }>;
export type ValidatedCaptionTrack = Readonly<{
  cues: readonly ValidatedCue[]; startFrame: number; durationFrames: number;
  preset: AuthoredCaptionPreset; canvasWidth: number; canvasHeight: number; box: CaptionBox;
  fontSize: number; fontFamily: string; maxLines: number; padding: number; textAlign: "left" | "center";
  textColor: string; highlightColor: string; backgroundColor: string; backgroundOpacity: number;
}>;

/** Pure layout with an optional caller-supplied glyph measurer; fallback is conservative 1.1em cells. */
export function layoutCaptionText(text: string, options: {width: number; height: number; fontSize: number; padding: number; maxLines: number; textAlign: "left" | "center"}, measure: CaptionMeasure = value => Array.from(value).length * options.fontSize * 1.1): readonly CaptionLine[] {
  literal(text, "caption text");
  number(options.width, "caption layout width", 1, 8192); number(options.height, "caption layout height", 1, 8192);
  number(options.fontSize, "caption layout fontSize", 8, 256); number(options.padding, "caption layout padding", 0, 256); lineCount(options.maxLines);
  if (options.textAlign !== "left" && options.textAlign !== "center" || options.width <= options.padding * 2) throw new RangeError("caption layout needs a valid alignment and positive inner width");
  const inner = options.width - options.padding * 2, lineHeight = options.fontSize * 1.35;
  const measured = (value: string) => number(measure(value), "caption measured width", 0, 1000000);
  const rows: {text: string; startIndex: number; endIndex: number; width: number}[] = [];
  let paragraphStart = 0;
  for (const paragraph of text.split("\n")) {
    let line = "", start = paragraphStart;
    for (const match of paragraph.matchAll(/\s+|\S+/gu)) {
      const token = match[0], index = paragraphStart + match.index;
      if (measured(token) > inner) throw new RangeError("Caption word or whitespace does not fit; widen the box, shorten the authored cue or reduce fontSize");
      if (line && measured(line + token) > inner) {
        rows.push({text: line, startIndex: start, endIndex: index, width: measured(line)});
        line = ""; start = index;
      }
      line += token;
    }
    rows.push({text: line, startIndex: start, endIndex: paragraphStart + paragraph.length, width: measured(line)});
    paragraphStart += paragraph.length + 1;
  }
  if (rows.length > options.maxLines || rows.length * lineHeight > options.height - options.padding * 2 + .000001) throw new RangeError("Caption text exceeds its line/height budget; shorten the cue, enlarge the box or reduce fontSize");
  const top = options.padding + (options.height - options.padding * 2 - rows.length * lineHeight) / 2;
  return Object.freeze(rows.map((row, i) => Object.freeze({...row, x: options.padding + (options.textAlign === "center" ? (inner - row.width) / 2 : 0), y: top + i * lineHeight})));
}

/** Validates and snapshots authored timing; does not transcribe, correct or authenticate speech. */
export function validateCaptionTrackOptions(props: CaptionTrackProps, measure?: CaptionMeasure): ValidatedCaptionTrack {
  if (!props || typeof props !== "object" || Array.isArray(props)) throw new TypeError("CaptionTrack requires options");
  fields(props, ["cues", "start", "duration", "preset", "canvasWidth", "canvasHeight", "x", "y", "width", "height", "fontSize", "fontFamily", "maxLines", "padding", "textAlign", "textColor", "highlightColor", "backgroundColor", "backgroundOpacity"], "caption option");
  const safe = captionSafeLayout({width: props.canvasWidth ?? 1920, height: props.canvasHeight ?? 1080, fontSize: props.fontSize, maxLines: props.maxLines, padding: props.padding});
  const box = Object.freeze({x: number(props.x ?? safe.x, "caption x", 0, props.canvasWidth ?? 1920), y: number(props.y ?? safe.y, "caption y", 0, props.canvasHeight ?? 1080), width: number(props.width ?? safe.width, "caption width", 1, 8192), height: number(props.height ?? safe.height, "caption height", 1, 8192)});
  const canvasWidth = props.canvasWidth ?? 1920, canvasHeight = props.canvasHeight ?? 1080;
  if (box.x + box.width > canvasWidth || box.y + box.height > canvasHeight || box.width <= safe.padding * 2 || box.height < safe.fontSize * 1.35 + safe.padding * 2) throw new RangeError("caption box must fit the canvas and at least one readable line");
  const preset = props.preset ?? "clean", textAlign = props.textAlign ?? "center";
  if (preset !== "clean" && preset !== "boxed" && preset !== "karaoke") throw new TypeError("caption preset must be clean, boxed or karaoke");
  if (textAlign !== "left" && textAlign !== "center") throw new TypeError("caption textAlign must be left or center");
  const fontFamily = props.fontFamily ?? "Arial";
  if (typeof fontFamily !== "string" || !fontFamily.trim() || fontFamily.length > 120 || /[\r\n\u0000]/.test(fontFamily)) throw new TypeError("caption fontFamily must be a local font family");
  const startFrame = frames(props.start ?? 0, "caption start");
  complete(props.cues, "caption cues", 1, MAX_CAPTION_CUES);
  let previous = 0, wordCount = 0, textCount = 0;
  const cues = props.cues.map((cue, index) => {
    if (!cue || typeof cue !== "object" || Array.isArray(cue)) throw new TypeError(`caption cue ${index} must be an authored object`);
    fields(cue, ["text", "start", "end", "words"], "caption cue");
    const content = literal(cue.text, `caption cue ${index}.text`);
    if ((textCount += content.length) > 65536) throw new RangeError("caption track text exceeds 65536 characters");
    const start = frames(cue.start, `cue ${index}.start`), end = frames(cue.end, `cue ${index}.end`, true);
    if (end <= start || start < previous) throw new RangeError(`caption cue ${index} must be positive, ordered and non-overlapping after frame rounding`);
    previous = end;
    const lines = layoutCaptionText(content, {...box, fontSize: safe.fontSize, padding: safe.padding, maxLines: safe.maxLines, textAlign}, measure);
    const words: CaptionWordLayout[] = [];
    if (preset === "karaoke" && cue.words === undefined) throw new TypeError(`karaoke cue ${index} requires authored word times`);
    if (cue.words !== undefined) {
      complete(cue.words, `cue ${index}.words`, 1, 128);
      if ((wordCount += cue.words.length) > MAX_CAPTION_WORDS) throw new RangeError(`caption words exceed ${MAX_CAPTION_WORDS}`);
      let cursor = 0, last = start;
      for (const [wordIndex, word] of cue.words.entries()) {
        if (!word || typeof word !== "object" || Array.isArray(word)) throw new TypeError(`cue ${index} word ${wordIndex} must be an object`);
        fields(word, ["text", "start", "end"], "caption word");
        const token = literal(word.text, `cue ${index} word ${wordIndex}.text`);
        if (/\s/u.test(token)) throw new TypeError("caption word text must be one literal token without whitespace");
        while (/\s/u.test(content[cursor] ?? "") && cursor < content.length) cursor++;
        if (content.slice(cursor, cursor + token.length) !== token) throw new RangeError(`cue ${index} words must match the complete literal cue text, including punctuation and case`);
        const wordStart = frames(word.start, `cue ${index} word ${wordIndex}.start`), wordEnd = frames(word.end, `cue ${index} word ${wordIndex}.end`, true);
        if (wordStart < start || wordEnd > end || wordEnd <= wordStart || wordStart < last) throw new RangeError(`cue ${index} word times must share the track clock, stay inside the cue and not overlap`);
        last = wordEnd;
        const line = lines.find(line => cursor >= line.startIndex && cursor + token.length <= line.endIndex);
        if (!line) throw new RangeError("caption token crosses a line boundary; author separate timed words");
        const glyphMeasure = measure ?? (value => Array.from(value).length * safe.fontSize * 1.1);
        const prefixWidth = number(glyphMeasure(line.text.slice(0, cursor - line.startIndex)), "caption prefix width", 0, box.width);
        const tokenWidth = number(glyphMeasure(token), "caption token width", 0, box.width);
        words.push(Object.freeze({text: token, startFrame: wordStart, endFrame: wordEnd, x: line.x + prefixWidth, y: line.y, width: tokenWidth}));
        cursor += token.length;
      }
      if (content.slice(cursor).trim()) throw new RangeError(`cue ${index} words must cover its complete literal text`);
    }
    return Object.freeze({text: content, startFrame: start, endFrame: end, lines, words: Object.freeze(words)});
  });
  const durationFrames = props.duration === undefined ? previous : frames(props.duration, "caption duration", true);
  if (durationFrames < previous || startFrame + durationFrames > 108000) throw new RangeError("caption duration must contain all cues within 108000 scene frames");
  return Object.freeze({cues: Object.freeze(cues), startFrame, durationFrames, preset, canvasWidth, canvasHeight, box,
    fontSize: safe.fontSize, fontFamily, maxLines: safe.maxLines, padding: safe.padding, textAlign,
    textColor: color(props.textColor ?? "#FFFFFF", "textColor"), highlightColor: color(props.highlightColor ?? "#54D6C7", "highlightColor"),
    backgroundColor: color(props.backgroundColor ?? "#101C2B", "backgroundColor"), backgroundOpacity: number(props.backgroundOpacity ?? .88, "backgroundOpacity", 0, 1)});
}

export type CaptionTrackState = Readonly<{cueIndex: number; wordIndex: number}>;
/** Absolute canonical scene frame in, track placement subtracted once; end boundaries are exclusive. */
export function getCaptionTrackState(options: ValidatedCaptionTrack, sceneFrame: number): CaptionTrackState {
  if (!Number.isFinite(sceneFrame)) throw new TypeError("caption scene frame must be finite");
  const local = Math.floor(sceneFrame) - options.startFrame;
  const cueIndex = options.cues.findIndex(cue => local >= cue.startFrame && local < cue.endFrame);
  const wordIndex = cueIndex < 0 ? -1 : options.cues[cueIndex].words.findIndex(word => local >= word.startFrame && local < word.endFrame);
  return {cueIndex, wordIndex};
}

type MeasureContext = {font: string; measureText(value: string): {width: number}};
function localMeasure(fontFamily: string, fontSize: number): CaptionMeasure | undefined {
  const Canvas = (globalThis as typeof globalThis & {OffscreenCanvas?: new (width: number, height: number) => {getContext(type: "2d"): MeasureContext | null}}).OffscreenCanvas;
  if (!Canvas) return undefined;
  const context = new Canvas(1, 1).getContext("2d");
  if (!context) return undefined;
  context.font = `700 ${fontSize}px ${fontFamily}`;
  return value => context.measureText(value).width;
}

/** Native editable text/shapes from supplied cues. Direct scene child; use the same start as its scene placement. */
export function CaptionTrack(props: CaptionTrackProps): JSX.Element {
  const options = createMemo(() => {
    const fontSize = props.fontSize ?? ((props.canvasHeight ?? 1080) > (props.canvasWidth ?? 1920) ? 56 : 44);
    return validateCaptionTrackOptions(props, localMeasure(props.fontFamily ?? "Arial", fontSize));
  });
  const ticker = useTicker();
  const selection = createMemo(() => getCaptionTrackState(options(), Math.floor(ticker.time() * TIME_FPS + .0001)), undefined,
    {equals: (a, b) => a.cueIndex === b.cueIndex && a.wordIndex === b.wordIndex});
  return Group({name: "Authored caption track",
    get x() {return options().box.x;}, get y() {return options().box.y;},
    get width() {return options().box.width;}, get height() {return options().box.height;},
    get start() {return frameTime(options().startFrame);}, get end() {return frameTime(options().startFrame + options().durationFrames);},
    get children() {
      const current = options();
      return current.cues.map((cue, cueIndex) => {
        const duration = cue.endFrame - cue.startFrame;
        const nodes: JSX.Element[] = [];
        if (current.preset !== "clean") nodes.push(Rect({name: `Caption ${cueIndex + 1} background`, x: 0, y: 0, width: current.box.width, height: current.box.height, fill: current.backgroundColor, opacity: current.backgroundOpacity, start: "0f", end: frameTime(duration)}));
        if (current.preset === "karaoke") cue.words.forEach((word, wordIndex) => nodes.push(Text({name: `Caption ${cueIndex + 1} word ${wordIndex + 1}`, x: word.x, y: word.y, width: Math.min(current.box.width - word.x, word.width + 1), height: current.fontSize * 1.35, fontSize: current.fontSize, fontFamily: current.fontFamily, fontWeight: 700, textAlign: "left", textBaseline: "top", start: "0f", end: frameTime(duration), children: word.text,
          get fill() {const active = selection(); return active.cueIndex === cueIndex && active.wordIndex === wordIndex ? current.highlightColor : current.textColor;}})));
        else cue.lines.forEach((line, lineIndex) => nodes.push(Text({name: `Caption ${cueIndex + 1} line ${lineIndex + 1}`, x: current.padding, y: line.y, width: current.box.width - current.padding * 2, height: current.fontSize * 1.35, fontSize: current.fontSize, fontFamily: current.fontFamily, fontWeight: 700, textAlign: current.textAlign, textBaseline: "top", fill: current.textColor, start: "0f", end: frameTime(duration), children: line.text})));
        return Group({name: `Caption cue ${cueIndex + 1}`, x: 0, y: 0, width: current.box.width, height: current.box.height, start: frameTime(cue.startFrame), end: frameTime(cue.endFrame), children: nodes});
      });
    },
  });
}
