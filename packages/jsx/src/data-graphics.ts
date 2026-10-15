/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo, mergeProps } from "solid-js";
import type { JSX } from "solid-js";
import { Group, Rect, Text } from "./elements";
import { educationLayout, educationNumber, educationText, educationTheme, eduTime } from "./education-core";
import type { EducationBox, EducationLayout, EducationProps, EducationTheme } from "./education-core";
import { motion } from "./motion-presets";
import { wrapDocumentaryText } from "./documentary";

/** A source credit is caller-authored provenance, not an automatic fact check. */
export type DataDisclosure = Readonly<{ kind: "illustrative"; text?: string }> | Readonly<{ kind: "source"; text: string }>;
export type DataDomain = readonly [minimum: number, maximum: number];
export type DataBar = Readonly<{ label: string; value: number; color?: string }>;
export type TrendPoint = Readonly<{ x: number; y: number }>;
export type DataBarsProps = EducationProps & Readonly<{
  title: string; data: readonly DataBar[]; valueDomain: DataDomain;
  /** Bars measure from zero. Truncated and nonzero-baseline bars are rejected. */
  baseline: 0; unit: string; disclosure: DataDisclosure; valueDecimals?: number;
}>;
export type TrendLineProps = EducationProps & Readonly<{
  title: string; points: readonly (TrendPoint | null)[];
  xDomain: DataDomain; yDomain: DataDomain; xLabel: string; yLabel: string;
  xUnit: string; yUnit: string; disclosure: DataDisclosure; color?: string;
}>;
export type MetricCardProps = EducationProps & Readonly<{
  title: string; value: number; unit: string; disclosure: DataDisclosure;
  comparison?: Readonly<{ label: string; value: number }>; valueDecimals?: number;
}>;

type TextPart = Readonly<{ name: string; value: string; box: EducationBox; font: number; color: string; bold: boolean; align: "left" | "center" | "right" }>;
type RectPart = Readonly<{ name: string; box: EducationBox; color: string; rotation?: number; radius?: number }>;
type Layout = Readonly<{ layout: Readonly<EducationLayout>; theme: Readonly<EducationTheme>; texts: readonly TextPart[]; rects: readonly RectPart[] }>;
export type DataBarsLayout = Layout & Readonly<{ baselineX: number; bars: readonly Readonly<{ label: string; value: number; x: number; y: number; width: number; height: number }>[] }>;
export type TrendLineLayout = Layout & Readonly<{ plot: Readonly<EducationBox>; points: readonly (TrendPoint | null)[]; segments: readonly Readonly<{ from: TrendPoint; to: TrendPoint; rotation: number; length: number }>[] }>;
export type MetricCardLayout = Layout;
const DEFAULT_BOX = Object.freeze({ x: 96, y: 96, width: 1728, height: 888 });
const commonKeys = ["x", "y", "width", "height", "start", "end", "duration", "theme", "animate", "fontSize"];
const n = (value: number, name: string, min = -1e12, max = 1e12) => educationNumber(value, name, min, max);

function record(value: unknown, name: string, allowed: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new TypeError(`Unknown ${name} field: ${key}`);
}
function entries<T>(value: readonly T[], name: string, min: number, max: number): readonly T[] {
  if (!Array.isArray(value) || value.length < min || value.length > max || Array.from({ length: value.length }, (_, i) => i).some(i => !Object.hasOwn(value, i))) {
    throw new RangeError(`${name} requires ${min}..${max} complete indexed entries`);
  }
  return value;
}
function line(value: string, name: string, max = 80): string {
  const result = educationText(value, name, max);
  if (/[\r\n\u0000-\u001f\u007f]/.test(result)) throw new TypeError(`${name} must be one line without control characters`);
  return result;
}
function color(value: string, name: string): string {
  if (typeof value !== "string" || !/^#[a-f\d]{6}$/i.test(value)) throw new TypeError(`${name} must be #RRGGBB`);
  return value;
}
function domain(value: DataDomain, name: string): DataDomain {
  entries(value, name, 2, 2);
  const a = n(value[0], `${name}[0]`), b = n(value[1], `${name}[1]`);
  if (b - a < 1e-9) throw new RangeError(`${name} must increase by at least 1e-9`);
  return Object.freeze([a, b] as const);
}
export function dataDisclosureText(value: DataDisclosure): string {
  record(value, "disclosure", ["kind", "text"]);
  if (value.kind === "illustrative") return `ILLUSTRATIVE / ${value.text === undefined ? "Authored example" : line(value.text, "illustrative disclosure", 160)}`;
  if (value.kind === "source") return `SOURCE / ${line(value.text, "source disclosure", 160)}`;
  throw new TypeError("disclosure.kind must be illustrative or source");
}
/** Exact round-trip number text by default. Explicit decimal formatting rounds display only. */
export function formatDataValue(value: number, decimals?: number): string {
  n(value, "data value");
  if (decimals === undefined) return Object.is(value, -0) ? "0" : String(value);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) throw new RangeError("valueDecimals must be an integer in 0..6");
  const rounded = Number(value.toFixed(decimals));
  return Object.is(rounded, -0) ? "0" : rounded.toFixed(decimals).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}
function displayedValue(value: number, decimals?: number): string {
  const formatted = formatDataValue(value, decimals);
  return decimals !== undefined && Number(formatted) !== value ? `≈${formatted}` : formatted;
}
function base(props: EducationProps): { layout: Readonly<EducationLayout>; theme: Readonly<EducationTheme> } {
  const layout = educationLayout(mergeProps({ fontSize: 40, animate: false }, props), DEFAULT_BOX);
  if (layout.width < 480 || layout.height < 480) throw new RangeError("Data graphics require width and height at least 480; use a larger readable card");
  return { layout: Object.freeze(layout), theme: Object.freeze(educationTheme(props.theme)) };
}
function text(name: string, value: string, box: EducationBox, font: number, color: string, bold = false, align: TextPart["align"] = "left"): TextPart {
  const wrapped = wrapDocumentaryText(value, { width: box.width, fontSize: font, maxLines: Math.floor(box.height / (font * 1.35)), label: name });
  return Object.freeze({ name, value: wrapped, box: Object.freeze(box), font, color, bold, align });
}
function rect(name: string, box: EducationBox, color: string, rotation?: number, radius?: number): RectPart {
  return Object.freeze({ name, box: Object.freeze(box), color, ...(rotation === undefined ? {} : { rotation }), ...(radius === undefined ? {} : { radius }) });
}
function commonTexts(layout: EducationLayout, theme: EducationTheme, title: string, disclosure: DataDisclosure): TextPart[] {
  const p = layout.width * .05, width = layout.width - p * 2;
  return [text("Data title", line(title, "title", 120), { x: p, y: layout.height * .055, width, height: layout.height * .15 }, layout.font * 1.3, theme.text, true),
    text("Data disclosure", dataDisclosureText(disclosure), { x: p, y: layout.height * .90, width, height: layout.height * .09 }, Math.max(24, layout.font * .7), theme.muted)];
}
function finish<T extends Layout>(value: T): T {
  for (const part of value.texts) {
    const b = part.box;
    if (b.x < 0 || b.y < 0 || b.width <= 0 || b.height <= 0 || b.x + b.width > value.layout.width + 1e-8 || b.y + b.height > value.layout.height + 1e-8) {
      throw new RangeError(`${part.name} leaves the readable card; use shorter values, scaled units or a larger card`);
    }
  }
  Object.freeze(value.texts); Object.freeze(value.rects);
  return Object.freeze(value);
}

/** Native horizontal bars share one explicit linear scale and a visible zero baseline. */
export function getDataBarsLayout(props: DataBarsProps): DataBarsLayout {
  record(props, "DataBars", [...commonKeys, "title", "data", "valueDomain", "baseline", "unit", "disclosure", "valueDecimals"]);
  const { layout: l, theme: t } = base(props), d = domain(props.valueDomain, "valueDomain");
  if (props.baseline !== 0 || d[0] > 0 || d[1] < 0) throw new RangeError("DataBars requires baseline:0 and a valueDomain containing zero");
  const unit = line(props.unit, "unit", 24), data = entries(props.data, "data", 1, 8), labels = new Set<string>();
  const values = data.map((entry, index) => {
    record(entry, `data[${index}]`, ["label", "value", "color"]);
    const label = line(entry.label, `data[${index}].label`, 64);
    if (labels.has(label)) throw new RangeError(`Duplicate bar label: ${label}`); labels.add(label);
    return Object.freeze({ label, value: n(entry.value, `data[${index}].value`, d[0], d[1]), color: color(entry.color ?? t.accent, `data[${index}].color`), display: displayedValue(entry.value, props.valueDecimals) });
  });
  const texts = commonTexts(l, t, props.title, props.disclosure), p = l.width * .05, inner = l.width - p * 2;
  const labelWidth = inner * .25, valueWidth = Math.max(l.font * 2.5, ...values.map(v => Array.from(v.display).length * l.font * 1.1));
  const left = p + labelWidth + 24, right = l.width - p - valueWidth - 24, span = right - left;
  if (span < 120) throw new RangeError("Bar labels and values leave too little scale width; shorten labels, change display units or enlarge the card");
  const project = (value: number) => left + (value - d[0]) / (d[1] - d[0]) * span;
  const baselineX = project(0), top = l.height * .31, row = l.height * .48 / values.length;
  if (row < l.font * 1.5) throw new RangeError("Bar rows do not leave readable label space; use fewer bars or a taller card");
  const baselinePadding = Math.min(8, l.height * .01);
  const rects: RectPart[] = [rect("Data panel", { x: 0, y: 0, width: l.width, height: l.height }, t.background),
    rect("Zero baseline", { x: baselineX - 1, y: top - baselinePadding, width: 2, height: row * values.length + baselinePadding * 2 }, t.muted)];
  const tickFont = Math.max(24, l.font * .7), tickHeight = tickFont * 1.35;
  const scaleLabels: TextPart[] = [];
  for (const value of [...new Set([d[0], 0, d[1]])]) {
    const label = formatDataValue(value), tickWidth = Array.from(label).length * tickFont * 1.1 + 8;
    const at = project(value);
    const part = text(`Scale ${label}`, label, { x: at - tickWidth / 2, y: l.height * .24, width: tickWidth, height: tickHeight }, tickFont, t.muted, false, "center");
    if (scaleLabels.some(prior => part.box.x < prior.box.x + prior.box.width + 8 && part.box.x + part.box.width + 8 > prior.box.x)) throw new RangeError("Bar scale labels overlap; choose a readable domain, scaled units or a wider card");
    scaleLabels.push(part); texts.push(part);
  }
  const bars = values.map((entry, index) => {
    const centerY = top + (index + .5) * row, at = project(entry.value), width = Math.abs(at - baselineX), x = Math.min(at, baselineX), height = Math.min(38, row * .32);
    if (width > 0) rects.push(rect(`Bar ${index + 1}`, { x, y: centerY - height / 2, width, height }, entry.color));
    texts.push(text(`Bar ${index + 1} label`, entry.label, { x: p, y: centerY - row * .4, width: labelWidth, height: row * .8 }, l.font, t.text));
    texts.push(text(`Bar ${index + 1} value`, entry.display, { x: right + 24, y: centerY - l.font * .675, width: valueWidth, height: l.font * 1.35 }, l.font, t.text, true));
    return Object.freeze({ label: entry.label, value: entry.value, x, y: centerY - height / 2, width, height });
  });
  // The unit describes the entire scale, not a numeric column. Its full-width
  // band leaves room for two portrait lines without colliding with the footer.
  texts.push(text("Bar unit", `Value (${unit}) / zero baseline`, { x: p, y: l.height * .805, width: inner, height: l.height * .085 }, Math.max(24, l.font * .8), t.text));
  return finish({ layout: l, theme: t, texts, rects, baselineX, bars: Object.freeze(bars) });
}

function trendPoints(input: readonly (TrendPoint | null)[]): readonly (TrendPoint | null)[] {
  let previous = -Infinity, count = 0;
  const points = entries(input, "points", 2, 128).map((point, index) => {
    if (point === null) return null;
    record(point, `points[${index}]`, ["x", "y"]);
    const x = n(point.x, `points[${index}].x`), y = n(point.y, `points[${index}].y`);
    if (x <= previous) throw new RangeError("Trend x values must increase strictly, including across explicit gaps");
    previous = x; count++;
    return Object.freeze({ x, y });
  });
  if (count < 2) throw new RangeError("TrendLine requires at least two authored finite points");
  return Object.freeze(points);
}
/** Exact indexed lookup. Null is an authored gap, never an interpolated measurement. */
export function sampleTrendPoint(points: readonly (TrendPoint | null)[], index: number): TrendPoint | null {
  const snapshot = trendPoints(points);
  if (!Number.isInteger(index) || index < 0 || index >= snapshot.length) throw new RangeError("Trend sample index must name an authored entry");
  return snapshot[index];
}
function ticks(d: DataDomain): readonly string[] {
  const values = Array.from({ length: 5 }, (_, i) => d[0] + (d[1] - d[0]) * i / 4);
  for (let precision = 6; precision <= 15; precision++) {
    const labels = values.map(value => value === 0 ? "0" : String(Number(value.toPrecision(precision))));
    if (new Set(labels).size === labels.length) return labels;
  }
  throw new RangeError("Axis tick labels cannot distinguish this range; use scaled units");
}

/** An editable polyline, not a fitted curve, interpolation service, or live data feed. */
export function getTrendLineLayout(props: TrendLineProps): TrendLineLayout {
  record(props, "TrendLine", [...commonKeys, "title", "points", "xDomain", "yDomain", "xLabel", "yLabel", "xUnit", "yUnit", "disclosure", "color"]);
  const { layout: l, theme: t } = base(props), xd = domain(props.xDomain, "xDomain"), yd = domain(props.yDomain, "yDomain"), raw = trendPoints(props.points);
  const xLabel = `${line(props.xLabel, "xLabel", 64)} (${line(props.xUnit, "xUnit", 24)})`, yLabel = `${line(props.yLabel, "yLabel", 64)} (${line(props.yUnit, "yUnit", 24)})`;
  const actualColor = color(props.color ?? t.accent, "TrendLine.color"), texts = commonTexts(l, t, props.title, props.disclosure);
  const p = l.width * .05, tickFont = Math.max(24, l.font * .75), tickHeight = tickFont * 1.35, xt = ticks(xd), yt = ticks(yd);
  const xTickWidth = Math.max(...xt.map(label => Array.from(label).length * tickFont * 1.1 + 8));
  const yTickWidth = Math.max(...yt.map(label => Array.from(label).length * tickFont * 1.1 + 8));
  const left = p + Math.max(yTickWidth + 16, xTickWidth / 2), right = l.width - p - xTickWidth / 2;
  const plot = Object.freeze({ x: left, y: l.height * .34, width: right - left, height: l.height * .395 });
  if (plot.width < 160 || xTickWidth + 8 > plot.width / 4 || plot.height / 4 < tickHeight + 4) throw new RangeError("Trend axes need more readable space; use a wider/taller card, smaller font or scaled units");
  const project = (point: TrendPoint): TrendPoint => Object.freeze({ x: plot.x + (point.x - xd[0]) / (xd[1] - xd[0]) * plot.width, y: plot.y + plot.height - (point.y - yd[0]) / (yd[1] - yd[0]) * plot.height });
  for (const point of raw) if (point) { n(point.x, "point.x within xDomain", xd[0], xd[1]); n(point.y, "point.y within yDomain", yd[0], yd[1]); }
  const rects: RectPart[] = [rect("Data panel", { x: 0, y: 0, width: l.width, height: l.height }, t.background), rect("Trend plot", plot, t.surface)];
  for (let i = 0; i < 5; i++) {
    const x = plot.x + plot.width * i / 4, y = plot.y + plot.height - plot.height * i / 4;
    rects.push(rect(`Trend grid x ${i}`, { x: x - .5, y: plot.y, width: 1, height: plot.height }, t.muted));
    rects.push(rect(`Trend grid y ${i}`, { x: plot.x, y: y - .5, width: plot.width, height: 1 }, t.muted));
    texts.push(text(`Trend x tick ${i}`, xt[i], { x: x - xTickWidth / 2, y: plot.y + plot.height + 12, width: xTickWidth, height: tickHeight }, tickFont, t.muted, false, "center"));
    texts.push(text(`Trend y tick ${i}`, yt[i], { x: p, y: y - tickHeight / 2, width: yTickWidth, height: tickHeight }, tickFont, t.muted, false, "right"));
  }
  const zeroY = yd[0] <= 0 && yd[1] >= 0 ? project({ x: xd[0], y: 0 }).y : plot.y + plot.height;
  const zeroX = xd[0] <= 0 && xd[1] >= 0 ? project({ x: 0, y: yd[0] }).x : plot.x;
  rects.push(rect("Trend x axis", { x: plot.x, y: zeroY - 1, width: plot.width, height: 2 }, t.text));
  rects.push(rect("Trend y axis", { x: zeroX - 1, y: plot.y, width: 2, height: plot.height }, t.text));
  const points = Object.freeze(raw.map(point => point === null ? null : project(point)));
  const segments: { from: TrendPoint; to: TrendPoint; rotation: number; length: number }[] = [];
  points.forEach((point, index) => {
    if (!point) return;
    const prior = points[index - 1];
    if (prior) {
      const length = Math.hypot(point.x - prior.x, point.y - prior.y), rotation = Math.atan2(point.y - prior.y, point.x - prior.x) * 180 / Math.PI;
      const segment = Object.freeze({ from: prior, to: point, length, rotation }); segments.push(segment);
      rects.push(rect(`Trend segment ${index}`, { x: (point.x + prior.x - length) / 2, y: (point.y + prior.y) / 2 - 2, width: length, height: 4 }, actualColor, rotation));
    }
    rects.push(rect(`Trend point ${index + 1}`, { x: point.x - 6, y: point.y - 6, width: 12, height: 12 }, actualColor, undefined, 6));
  });
  texts.push(text("Trend y unit", yLabel, { x: plot.x, y: l.height * .23, width: plot.width, height: l.height * .08 }, l.font, t.text));
  texts.push(text("Trend x unit", xLabel, { x: plot.x, y: l.height * .815, width: plot.width, height: Math.max(l.font * 1.35, l.height * .065) }, l.font, t.text, false, "center"));
  return finish({ layout: l, theme: t, texts, rects, plot, points, segments: Object.freeze(segments) });
}

export function getMetricCardLayout(props: MetricCardProps): MetricCardLayout {
  record(props, "MetricCard", [...commonKeys, "title", "value", "unit", "disclosure", "comparison", "valueDecimals"]);
  const { layout: l, theme: t } = base(props), texts = commonTexts(l, t, props.title, props.disclosure), p = l.width * .05, width = l.width - 2 * p;
  const unit = line(props.unit, "unit", 24), value = displayedValue(props.value, props.valueDecimals);
  texts.push(text("Metric value", `${value} ${unit}`, { x: p, y: l.height * .29, width, height: l.height * .28 }, l.font * 3, t.text, true));
  if (props.comparison !== undefined) {
    record(props.comparison, "comparison", ["label", "value"]);
    texts.push(text("Metric comparison label", line(props.comparison.label, "comparison.label", 80), { x: p, y: l.height * .63, width, height: l.height * .08 }, l.font * .85, t.muted));
    texts.push(text("Metric comparison value", `${displayedValue(props.comparison.value, props.valueDecimals)} ${unit}`, { x: p, y: l.height * .73, width, height: l.height * .11 }, l.font * 1.3, t.text, true));
  }
  return finish({ layout: l, theme: t, texts, rects: [rect("Data panel", { x: 0, y: 0, width: l.width, height: l.height }, t.background)] });
}

function nativeCard(name: string, props: EducationProps, read: () => Layout): JSX.Element {
  const boxEqual = (a: EducationBox, b: EducationBox) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
  const options = createMemo(read, undefined, { equals: (a, b) => !!a &&
    boxEqual(a.layout, b.layout) && a.layout.start === b.layout.start && a.layout.end === b.layout.end && a.layout.frames === b.layout.frames &&
    a.layout.intro === b.layout.intro && a.theme.fontFamily === b.theme.fontFamily &&
    a.texts.length === b.texts.length && a.texts.every((part, i) => { const next = b.texts[i]; return part.name === next.name && part.value === next.value && boxEqual(part.box, next.box) && part.font === next.font && part.color === next.color && part.bold === next.bold && part.align === next.align; }) &&
    a.rects.length === b.rects.length && a.rects.every((part, i) => { const next = b.rects[i]; return part.name === next.name && boxEqual(part.box, next.box) && part.color === next.color && part.rotation === next.rotation && part.radius === next.radius; }),
  });
  const animate = createMemo(() => props.animate === true);
  return Group({ name,
    get x() { return options().layout.x; }, get y() { return options().layout.y; },
    get width() { return options().layout.width; }, get height() { return options().layout.height; },
    get start() { return eduTime(options().layout.start); }, get end() { return eduTime(options().layout.end); },
    get opacity() { const l = options().layout; return animate() && l.intro ? motion.fadeIn({ duration: eduTime(l.intro) }).opacity : 1; },
    get children() {
      const { layout: l, theme: t, rects, texts } = options();
      return [
        ...rects.map(part => Rect({ name: part.name, ...part.box, fill: part.color, start: "0f", end: eduTime(l.frames), ...(part.rotation === undefined ? {} : { rotation: part.rotation }), ...(part.radius === undefined ? {} : { cornerRadius: part.radius }) })),
        ...texts.map(part => Text({ name: part.name, ...part.box, fontFamily: t.fontFamily, fontSize: part.font, fontWeight: part.bold ? 700 : 400, fill: part.color, textAlign: part.align, start: "0f", end: eduTime(l.frames), children: part.value })),
      ];
    },
  });
}
/** Static authored quantities; optional animate:true fades the card, never its measured values. */
export function DataBars(props: DataBarsProps): JSX.Element { return nativeCard("DataBars", props, () => getDataBarsLayout(props)); }
export function TrendLine(props: TrendLineProps): JSX.Element { return nativeCard("TrendLine", props, () => getTrendLineLayout(props)); }
export function MetricCard(props: MetricCardProps): JSX.Element { return nativeCard("MetricCard", props, () => getMetricCardLayout(props)); }
