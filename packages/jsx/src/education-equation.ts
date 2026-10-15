/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { JSX } from "solid-js";
import { Rect, Text } from "./elements";
import { educationComponent, educationNumber, educationText, eduRect, eduText, eduTime } from "./education-core";
import type { EducationProps } from "./education-core";

/** Native math layout, not a LaTeX parser or symbolic calculator. */
export type MathExpression = string
  | Readonly<{ type: "row"; items: readonly MathExpression[] }>
  | Readonly<{ type: "fraction"; numerator: MathExpression; denominator: MathExpression }>
  | Readonly<{ type: "power"; base: MathExpression; exponent: MathExpression }>
  | Readonly<{ type: "root"; radicand: MathExpression }>;
export type MathTextPart = Readonly<{ type: "text"; text: string; x: number; y: number; width: number; height: number; fontSize: number }>;
/** Native rectangle; optional rotation uses degrees around its center, as in Rect. */
export type MathRulePart = Readonly<{ type: "rule"; x: number; y: number; width: number; height: number; rotation?: number }>;
export type MathExpressionLayout = Readonly<{ width: number; height: number; baseline: number; parts: readonly (MathTextPart | MathRulePart)[] }>;
export type EquationVariable = Readonly<{ symbol: string; meaning: string; unit?: string }>;
export type EquationCardProps = EducationProps & {
  title: string; equation: MathExpression; caption?: string;
  variables?: readonly EquationVariable[];
  /** Base math size in pixels, default twice fontSize. Nested parts scale from it. */
  mathSize?: number;
};

function mathStroke(from: {x: number; y: number}, to: {x: number; y: number}, thickness: number): MathRulePart {
  const width = Math.hypot(to.x - from.x, to.y - from.y);
  return {type: "rule", x: (from.x + to.x - width) / 2, y: (from.y + to.y - thickness) / 2,
    width, height: thickness, rotation: Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI};
}

/** Conservative native glyph boxes; explicit fractions, roots and superscripts remain editable. */
export function layoutMathExpression(expression: MathExpression, fontSize = 64): MathExpressionLayout {
  educationNumber(fontSize, "math fontSize", 12, 256);
  let count = 0;
  const shift = (layout: MathExpressionLayout, x: number, y: number) => layout.parts.map(part => ({ ...part, x: part.x + x, y: part.y + y }));
  const walk = (value: MathExpression, font: number, depth: number): MathExpressionLayout => {
    if (++count > 128 || depth > 8 || font < 8) throw new RangeError("Math expression exceeds 128 nodes, 8 levels or minimum 8px nested type; simplify or enlarge mathSize");
    if (typeof value === "string") {
      const content = educationText(value, "math text", 120);
      if (/[\r\n\t]/.test(content)) throw new TypeError("Math text must be one line; use row/fraction/power/root structure");
      const width = Array.from(content).length * font * 1.08, height = font * 1.35;
      return { width, height, baseline: font, parts: [{ type: "text", text: content, x: 0, y: 0, width, height, fontSize: font }] };
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Expected math text or a row/fraction/power/root node");
    if (value.type === "row") {
      if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 24 || Array.from({length: value.items.length}, (_, index) => index).some(index => !Object.hasOwn(value.items, index))) throw new RangeError("Math row needs 1..24 complete items");
      const items = Array.from(value.items, item => walk(item, font, depth + 1));
      const baseline = Math.max(...items.map(item => item.baseline));
      const height = baseline + Math.max(...items.map(item => item.height - item.baseline));
      let x = 0;
      const parts = items.flatMap(item => { const parts = shift(item, x, baseline - item.baseline); x += item.width + font * .12; return parts; });
      return { width: x - font * .12, height, baseline, parts };
    }
    if (value.type === "fraction") {
      const numerator = walk(value.numerator, font * .8, depth + 1), denominator = walk(value.denominator, font * .8, depth + 1);
      const gap = font * .14, line = Math.max(2, font * .035), width = Math.max(numerator.width, denominator.width) + font * .32;
      const ruleY = numerator.height + gap;
      const parts = [
        ...shift(numerator, (width - numerator.width) / 2, 0),
        { type: "rule" as const, x: 0, y: ruleY, width, height: line },
        ...shift(denominator, (width - denominator.width) / 2, ruleY + line + gap),
      ];
      return { width, height: numerator.height + denominator.height + gap * 2 + line, baseline: ruleY + font * .32, parts };
    }
    if (value.type === "power") {
      const base = walk(value.base, font, depth + 1), exponent = walk(value.exponent, font * .58, depth + 1);
      const rise = font * .42, height = Math.max(base.height + rise, exponent.height);
      return { width: base.width + exponent.width + font * .04, height, baseline: base.baseline + rise,
        parts: [...shift(base, 0, rise), ...shift(exponent, base.width + font * .04, 0)] };
    }
    if (value.type === "root") {
      const inside = walk(value.radicand, font, depth + 1), thickness = Math.max(2, font * .04);
      const signWidth = Math.max(font * .7, thickness * 6), gap = Math.max(font * .16, thickness * 2);
      const top = thickness + gap, bottom = top + inside.height, innerX = signWidth + gap;
      const right = innerX + inside.width + gap / 2, barY = thickness / 2;
      // A font glyph cannot stretch to enclose tall fractions. These connected
      // strokes share endpoints and scale to the complete radicand's box.
      const hookStart = {x: thickness / 2, y: bottom - font * .28};
      const hookShoulder = {x: signWidth * .22, y: bottom - font * .38};
      const hookBottom = {x: signWidth * .45, y: bottom}, barStart = {x: signWidth, y: barY};
      return { width: right, height: bottom + thickness / 2, baseline: inside.baseline + top,
        parts: [
          mathStroke(hookStart, hookShoulder, thickness), mathStroke(hookShoulder, hookBottom, thickness), mathStroke(hookBottom, barStart, thickness),
          { type: "rule", x: signWidth - thickness / 2, y: 0, width: right - signWidth + thickness / 2, height: thickness },
          ...shift(inside, innerX, top),
        ] };
    }
    throw new TypeError("Unknown math expression type; use row, fraction, power or root");
  };
  const layout = walk(expression, fontSize, 0);
  if (!Number.isFinite(layout.width) || !Number.isFinite(layout.height)) throw new RangeError("Math expression dimensions must be finite");
  return Object.freeze({ ...layout, parts: Object.freeze(layout.parts.map(part => Object.freeze(part))) });
}

export function EquationCard(props: EquationCardProps): JSX.Element {
  return educationComponent("EquationCard", props, { x: 96, y: 96, width: 1728, height: 888 }, (l, t) => {
    const pad = l.width * .05, inner = l.width - pad * 2;
    const equation = layoutMathExpression(props.equation, props.mathSize ?? l.font * 2);
    const mathBox = { x: pad, y: l.height * .22, width: inner, height: l.height * .35 };
    if (equation.width > mathBox.width || equation.height > mathBox.height) throw new RangeError("Equation does not fit its math area; enlarge the card, simplify the expression or reduce mathSize");
    const nodes: JSX.Element[] = [
      eduRect("Equation panel", { x: 0, y: 0, width: l.width, height: l.height }, t.background, l.frames),
      eduText("Equation title", props.title, { x: pad, y: l.height * .05, width: inner, height: l.height * .12 }, l.font * 1.2, t, l.frames, t.accent, true),
    ];
    const x = mathBox.x + (mathBox.width - equation.width) / 2, y = mathBox.y + (mathBox.height - equation.height) / 2;
    equation.parts.forEach((part, index) => {
      const box = { x: x + part.x, y: y + part.y, width: part.width, height: part.height };
      if (part.type === "rule") nodes.push(Rect({name: `Math rule ${index + 1}`, ...box, rotation: part.rotation ?? 0,
        fill: t.text, start: "0f", end: eduTime(l.frames)}));
      else nodes.push(Text({ name: `Math text ${index + 1}`, ...box, fontFamily: t.fontFamily, fontSize: part.fontSize,
        fill: t.text, textAlign: "center", start: "0f", end: eduTime(l.frames), children: part.text }));
    });
    if (props.caption) nodes.push(eduText("Equation caption", props.caption, { x: pad, y: l.height * .59, width: inner, height: l.height * .08 }, l.font * .8, t, l.frames, t.muted));
    const variables = props.variables;
    if (variables !== undefined) {
      if (!Array.isArray(variables) || variables.length < 1 || variables.length > 4 || Array.from({length: variables.length}, (_, index) => index).some(index => !Object.hasOwn(variables, index))) throw new RangeError("Equation variables needs 1..4 complete entries");
      const cell = l.height * .26 / variables.length;
      Array.from(variables).forEach((variable, index) => {
        if (!variable || typeof variable !== "object") throw new TypeError("Equation variables must be complete objects");
        const content = `${educationText(variable.symbol, "variable symbol", 32)} — ${educationText(variable.meaning, "variable meaning", 160)}${variable.unit === undefined ? "" : ` (${educationText(variable.unit, "variable unit", 32)})`}`;
        nodes.push(eduText(`Variable ${index + 1}`, content, { x: pad, y: l.height * .70 + index * cell, width: inner, height: cell * .9 }, l.font * .8, t, l.frames));
      });
    }
    return nodes;
  });
}
