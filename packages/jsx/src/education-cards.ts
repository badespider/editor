/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Text } from "./elements";
import { educationComponent, educationText, eduRect, eduText, eduTime } from "./education-core";
import type { EducationProps, EducationLayout, EducationTheme } from "./education-core";

export type LessonCardProps = EducationProps & { title: string; body: string; eyebrow?: string; footer?: string };
export type WorkedExampleStep = { label: string; expression: string; explanation?: string };
export type WorkedExampleProps = EducationProps & {
  title: string; steps: readonly WorkedExampleStep[];
  /** Zero-based authored highlight, default 0. Does not solve the example. */
  activeStep?: number;
  /** Default false. Reveal only steps through activeStep, keeping every authored row position. */
  revealThroughActive?: boolean;
};
export type CodeWalkthroughProps = EducationProps & {
  title: string; lines: readonly string[];
  /** One-based line numbers. Only changes emphasis; code is never executed. */
  highlightedLines?: readonly number[]; note?: string;
  /** One-based last visible line; omitted shows all. Hidden lines still validate and retain their rows. */
  visibleThroughLine?: number;
};
export type QuizCardProps = EducationProps & {
  question: string; choices: readonly string[];
  /** Zero-based authored answer. Undefined keeps the answer and explanation hidden. */
  answerIndex?: number; explanation?: string;
};

const DEFAULT_BOX = Object.freeze({x: 96, y: 96, width: 1728, height: 888});
function completeArray<T>(value: readonly T[], min: number, max: number, name: string): readonly T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || Array.from({length: value.length}, (_, index) => index).some(index => !Object.hasOwn(value, index))) {
    throw new RangeError(`${name} requires ${min}..${max} complete indexed entries`);
  }
  return value;
}
function indexIn(value: number, length: number, name: string, oneBased = false): number {
  const first = oneBased ? 1 : 0;
  if (!Number.isSafeInteger(value) || value < first || value >= length + first) throw new RangeError(`${name} must be an integer in ${first}..${length - 1 + first}`);
  return value;
}
function optionalText(value: string | undefined, name: string): string | undefined {
  return value === undefined ? undefined : educationText(value, name);
}
function base(name: string, l: EducationLayout, t: EducationTheme): JSX.Element[] {
  return [eduRect(`${name} panel`, {x: 0, y: 0, width: l.width, height: l.height}, t.background, l.frames),
    eduRect(`${name} accent`, {x: l.width * .05, y: l.height * .04, width: l.width * .12, height: 4}, t.accent, l.frames)];
}

export function LessonCard(props: LessonCardProps): JSX.Element {
  return educationComponent("LessonCard", props, DEFAULT_BOX, (l, t) => {
    const nodes = base("Lesson", l, t), p = l.width * .05, width = l.width - p * 2;
    const eyebrow = optionalText(props.eyebrow, "Lesson eyebrow"), footer = optionalText(props.footer, "Lesson footer");
    if (eyebrow !== undefined) nodes.push(eduText("Lesson eyebrow", eyebrow, {x: p, y: l.height * .09, width, height: l.height * .09}, l.font * .8, t, l.frames, t.accent, true));
    nodes.push(eduText("Lesson title", educationText(props.title, "Lesson title"), {x: p, y: l.height * (eyebrow ? .22 : .12), width, height: l.height * .18}, l.font * 1.6, t, l.frames, t.text, true));
    nodes.push(eduText("Lesson body", educationText(props.body, "Lesson body"), {x: p, y: l.height * .45, width, height: l.height * (footer ? .32 : .45)}, l.font, t, l.frames));
    if (footer !== undefined) nodes.push(eduText("Lesson footer", footer, {x: p, y: l.height * .85, width, height: l.height * .09}, l.font * .7, t, l.frames, t.muted));
    return nodes;
  });
}

export function WorkedExample(props: WorkedExampleProps): JSX.Element {
  const activeStep = createMemo(() => props.activeStep === undefined ? 0 : props.activeStep);
  const revealThroughActive = createMemo(() => {
    const value = props.revealThroughActive;
    if (value !== undefined && typeof value !== "boolean") throw new TypeError("revealThroughActive must be boolean");
    return value === true;
  });
  return educationComponent("WorkedExample", props, DEFAULT_BOX, (l, t) => {
    const steps = completeArray(props.steps, 1, 4, "WorkedExample.steps"), active = indexIn(activeStep(), steps.length, "activeStep");
    const reveal = revealThroughActive();
    const nodes = base("Worked example", l, t), p = l.width * .05, width = l.width - p * 2;
    nodes.push(eduText("Worked example title", educationText(props.title, "Worked example title"), {x: p, y: l.height * .08, width, height: l.height * .14}, l.font * 1.4, t, l.frames, t.text, true));
    const gap = l.height * .015, row = (l.height * .68 - gap * (steps.length - 1)) / steps.length;
    const markerWidth = Math.min(64, width * .08), textX = p + markerWidth + 20, textWidth = width - markerWidth - 40;
    steps.forEach((step, index) => {
      if (!step || typeof step !== "object" || Array.isArray(step)) throw new TypeError(`WorkedExample.steps[${index}] must be a step object`);
      const y = l.height * .25 + index * (row + gap), selected = index === active;
      const label = educationText(step.label, `Step ${index + 1} label`), expression = educationText(step.expression, `Step ${index + 1} expression`);
      const explanation = optionalText(step.explanation, `Step ${index + 1} explanation`);
      if (reveal && index > active) return;
      nodes.push(eduRect(`Step ${index + 1} panel`, {x: p, y, width, height: row}, selected ? t.surface : t.background, l.frames));
      nodes.push(eduRect(`Step ${index + 1} marker`, {x: p, y, width: 4, height: row}, selected ? t.accent : t.muted, l.frames));
      nodes.push(eduText(`Step ${index + 1} number`, String(index + 1), {x: p + 12, y: y + row * .33, width: markerWidth - 12, height: row * .4}, l.font * .9, t, l.frames, selected ? t.accent : t.muted, true));
      nodes.push(eduText(`Step ${index + 1} label`, label, {x: textX, y: y + row * .04, width: textWidth, height: row * .22}, l.font * .7, t, l.frames, selected ? t.accent : t.muted, true));
      nodes.push(eduText(`Step ${index + 1} expression`, expression, {x: textX, y: y + row * .29, width: textWidth, height: row * .38}, l.font * 1.15, t, l.frames, t.text, true, {fontFamily: t.monoFamily}));
      if (explanation !== undefined) nodes.push(eduText(`Step ${index + 1} explanation`, explanation, {x: textX, y: y + row * .72, width: textWidth, height: row * .23}, l.font * .66, t, l.frames, t.muted));
    });
    return nodes;
  });
}

/** Literal single-line code. Conservatively budget tabs at four-column tab stops. */
function codeLine(value: string, index: number, width: number, height: number, font: number): string {
  const name = `Code line ${index + 1}`;
  if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u0008\u000A-\u001F\u007F\u2028\u2029]/.test(value)) throw new TypeError(`${name} must be a literal single line of at most 4096 characters`);
  let columns = 0;
  for (const character of value) columns += character === "\t" ? 4 - columns % 4 : 1;
  if (height < font * 1.35 || width < font * 1.1 || columns * font * 1.1 > width) throw new RangeError(`${name} does not fit without wrapping; shorten the line, enlarge the box or reduce fontSize`);
  return value;
}

export function CodeWalkthrough(props: CodeWalkthroughProps): JSX.Element {
  const visibleThroughLine = createMemo(() => props.visibleThroughLine);
  const highlightedLines = createMemo<readonly number[]>(() => {
    const input = props.highlightedLines;
    if (input === undefined) return [];
    const values = Array.from(completeArray(input, 0, 10, "highlightedLines"));
    const unique = new Set<number>();
    for (const value of values) {
      indexIn(value, 10, "highlightedLines entry", true);
      if (unique.has(value)) throw new RangeError("highlightedLines must not repeat a line number");
      unique.add(value);
    }
    return values.sort((a, b) => a - b);
  }, [], {equals: (previous, next) => previous.length === next.length && previous.every((value, index) => value === next[index])});
  return educationComponent("CodeWalkthrough", props, DEFAULT_BOX, (l, t) => {
    const lines = completeArray(props.lines, 1, 10, "CodeWalkthrough.lines"), highlights = highlightedLines();
    const suppliedLimit = visibleThroughLine();
    const lastVisibleLine = suppliedLimit === undefined ? lines.length : indexIn(suppliedLimit, lines.length, "visibleThroughLine", true);
    const selected = new Set<number>();
    for (const number of highlights) {
      indexIn(number, lines.length, "highlightedLines entry", true);
      selected.add(number);
    }
    const note = optionalText(props.note, "Code note"), nodes = base("Code", l, t), p = l.width * .05, width = l.width - p * 2;
    nodes.push(eduText("Code title", educationText(props.title, "Code title"), {x: p, y: l.height * .08, width, height: l.height * .14}, l.font * 1.4, t, l.frames, t.text, true));
    const row = l.height * (note === undefined ? .69 : .58) / lines.length, font = l.font * .85;
    const gutter = Math.max(l.font * 2, width * .055), textWidth = width - gutter - 24;
    lines.forEach((line, index) => {
      const y = l.height * .24 + index * row, height = row * .76;
      const literal = codeLine(line, index, textWidth, height, font), emphasized = selected.has(index + 1);
      if (index + 1 > lastVisibleLine) return;
      nodes.push(eduRect(`Code line ${index + 1} panel`, {x: p, y, width, height: row * .92}, emphasized ? t.surface : t.background, l.frames));
      if (emphasized) nodes.push(eduRect(`Code line ${index + 1} marker`, {x: p, y, width: 4, height: row * .92}, t.accent, l.frames));
      nodes.push(eduText(`Code line ${index + 1} number`, String(index + 1), {x: p + 12, y: y + row * .12, width: gutter - 20, height}, l.font * .7, t, l.frames, emphasized ? t.accent : t.muted, false, {fontFamily: t.monoFamily}));
      nodes.push(Text({name: `Code line ${index + 1}`, x: p + gutter, y: y + row * .12, width: textWidth, height, fontFamily: t.monoFamily, fontSize: font, fill: t.text, start: "0f", end: eduTime(l.frames), children: literal}));
    });
    if (note !== undefined) nodes.push(eduText("Code note", note, {x: p, y: l.height * .86, width, height: l.height * .09}, l.font * .7, t, l.frames, t.muted));
    return nodes;
  });
}

export function QuizCard(props: QuizCardProps): JSX.Element {
  const answerIndex = createMemo(() => props.answerIndex);
  return educationComponent("QuizCard", props, DEFAULT_BOX, (l, t) => {
    const choices = completeArray(props.choices, 2, 4, "QuizCard.choices");
    const suppliedAnswer = answerIndex();
    const answer = suppliedAnswer === undefined ? undefined : indexIn(suppliedAnswer, choices.length, "answerIndex");
    const explanation = optionalText(props.explanation, "Quiz explanation"), nodes = base("Quiz", l, t), p = l.width * .05, width = l.width - p * 2;
    nodes.push(eduText("Quiz question", educationText(props.question, "Quiz question"), {x: p, y: l.height * .09, width, height: l.height * .20}, l.font * 1.4, t, l.frames, t.text, true));
    const gap = l.height * .015, row = (l.height * (explanation === undefined ? .55 : .39) - gap * (choices.length - 1)) / choices.length;
    // Keep all six Answer characters on one line after the label's 12px inset.
    const badgeFont = l.font * .7, badge = Math.max(l.font * 5, badgeFont * 1.1 * 6 + 24);
    const marker = Math.max(l.font * 2, width * .055), textWidth = width - marker - badge - 24;
    choices.forEach((choice, index) => {
      const y = l.height * .34 + index * (row + gap), isAnswer = index === answer;
      nodes.push(eduRect(`Choice ${index + 1} panel`, {x: p, y, width, height: row}, t.surface, l.frames));
      nodes.push(eduRect(`Choice ${index + 1} marker`, {x: p, y, width: 4, height: row}, isAnswer ? t.success : t.muted, l.frames));
      nodes.push(eduText(`Choice ${index + 1} letter`, String.fromCharCode(65 + index), {x: p + 12, y: y + row * .14, width: marker - 20, height: row * .72}, l.font, t, l.frames, isAnswer ? t.success : t.accent, true));
      nodes.push(eduText(`Choice ${index + 1}`, educationText(choice, `Choice ${index + 1}`), {x: p + marker, y: y + row * .14, width: textWidth, height: row * .72}, l.font, t, l.frames));
      if (isAnswer) nodes.push(eduText("Quiz answer label", "Answer", {x: p + width - badge, y: y + row * .14, width: badge - 12, height: row * .72}, badgeFont, t, l.frames, t.success, true));
    });
    if (answer !== undefined && explanation !== undefined) nodes.push(eduText("Quiz explanation", explanation, {x: p, y: l.height * .80, width, height: l.height * .14}, l.font * .8, t, l.frames, t.success));
    return nodes;
  });
}
