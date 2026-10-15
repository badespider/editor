/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Surface } from "./elements";
import { useTicker } from "./renderer";
import { TIME_FPS } from "./time";
import type { Time } from "./types";
import { educationFrames, educationNumber, educationText, educationTheme } from "./education-core";
import type { EducationTheme } from "./education-core";
import type { MapDrawingContext } from "./documentary-map";

export type DiagramDrawingContext = MapDrawingContext;
export type DiagramPoint = Readonly<{ x: number; y: number }>;
export type DiagramDomain = readonly [minimum: number, maximum: number];
export type EducationDiagramOptions = Readonly<{
  x?: number; y?: number; width: number; height: number;
  /** Parent-local placement; these components use the direct scene-child clock. */
  start?: Time; duration?: Time; revealDuration?: Time;
  title?: string; theme?: Partial<EducationTheme>;
}>;
export type CartesianSeries = Readonly<{ label: string; points: readonly DiagramPoint[]; color?: string }>;
export type CartesianPlotOptions = EducationDiagramOptions & Readonly<{
  series: readonly CartesianSeries[]; xDomain: DiagramDomain; yDomain: DiagramDomain;
  xLabel: string; yLabel: string; xUnit?: string; yUnit?: string; marker?: boolean;
}>;
export type DiagramVector = DiagramPoint & Readonly<{ label: string; unit?: string }>;
export type VectorDiagramOptions = EducationDiagramOptions & Readonly<{
  origin: DiagramPoint; vectors: readonly DiagramVector[];
  xDomain: DiagramDomain; yDomain: DiagramDomain; xLabel: string; yLabel: string;
  /** A shared unit can replace per-vector units. Use "1" for dimensionless vectors. */
  unit?: string;
}>;
export type FlowNode = DiagramPoint & Readonly<{ id: string; label: string }>;
export type FlowEdge = Readonly<{ id: string; from: string; to: string; label?: string }>;
export type FlowDiagramOptions = EducationDiagramOptions & Readonly<{
  /** Authored normalized node positions, 0..1. This is not an automatic layout. */
  nodes: readonly FlowNode[]; edges: readonly FlowEdge[];
  /** Connected directed edge IDs, in packet order; empty/omitted means no packet. */
  packetPath?: readonly string[];
}>;

type Base = Readonly<{
  x: number; y: number; width: number; height: number; title: string;
  startFrame: number; durationFrames: number; revealFrames: number; theme: Readonly<EducationTheme>;
}>;
type Axes = Readonly<{ xDomain: DiagramDomain; yDomain: DiagramDomain; xLabel: string; yLabel: string }>;
export type ValidatedCartesianPlotOptions = Base & Axes & Readonly<{ kind: "plot"; series: readonly CartesianSeries[]; marker: boolean }>;
export type ValidatedVectorDiagramOptions = Base & Axes & Readonly<{ kind: "vectors"; origin: DiagramPoint; vectors: readonly Required<DiagramVector>[]; unit: string }>;
export type ValidatedFlowDiagramOptions = Base & Readonly<{ kind: "flow"; nodes: readonly FlowNode[]; edges: readonly Required<FlowEdge>[]; packetPath: readonly string[] }>;
export type ValidatedEducationDiagram = ValidatedCartesianPlotOptions | ValidatedVectorDiagramOptions | ValidatedFlowDiagramOptions;
type Box = { x: number; y: number; width: number; height: number };
const number = (v: number, label: string, min = -1e12, max = 1e12) => educationNumber(v, label, min, max);
function line(value: string, label: string, max = 80): string {
  const result = educationText(value, label, max);
  if (/[\r\n]/.test(result)) throw new TypeError(`${label} must be a single line`);
  return result;
}
function base(options: EducationDiagramOptions, title: string): Base {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Diagram options must be an object");
  const width = number(options.width, "diagram.width", 480, 4096), height = number(options.height, "diagram.height", 300, 4096);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 8388608) throw new RangeError("Diagram canvas must use integer dimensions within 8 megapixels");
  const startFrame = educationFrames(options.start ?? 0, "diagram.start");
  const durationFrames = educationFrames(options.duration ?? 6, "diagram.duration", true);
  if (startFrame + durationFrames > 108000) throw new RangeError("Diagram lifetime exceeds 108000 canonical frames");
  const revealFrames = options.revealDuration === undefined ? Math.max(1, Math.round(durationFrames * 0.75)) : educationFrames(options.revealDuration, "diagram.revealDuration", true);
  if (revealFrames > durationFrames) throw new RangeError("diagram.revealDuration cannot exceed duration");
  return Object.freeze({ x: number(options.x ?? 0, "diagram.x", -100000, 100000), y: number(options.y ?? 0, "diagram.y", -100000, 100000), width, height, startFrame, durationFrames, revealFrames, title: line(options.title ?? title, "diagram.title", 100), theme: Object.freeze(educationTheme(options.theme)) });
}
function domain(input: DiagramDomain, label: string): DiagramDomain {
  if (!Array.isArray(input) || input.length !== 2) throw new TypeError(`${label} must be [minimum,maximum]`);
  const a = number(input[0], label), b = number(input[1], label);
  if (b - a < 1e-9) throw new RangeError(`${label} must increase by at least 1e-9`);
  return Object.freeze([a, b] as const);
}
function point(p: DiagramPoint, label: string, xDomain: DiagramDomain, yDomain: DiagramDomain): DiagramPoint {
  if (!p || typeof p !== "object") throw new TypeError(`${label} must contain numeric x/y`);
  const x = number(p.x, `${label}.x`, xDomain[0], xDomain[1]), y = number(p.y, `${label}.y`, yDomain[0], yDomain[1]);
  return Object.freeze({ x, y });
}
function axes(options: Pick<CartesianPlotOptions, "xDomain" | "yDomain" | "xLabel" | "yLabel" | "xUnit" | "yUnit">): Axes {
  const xUnit = options.xUnit === undefined ? "" : line(options.xUnit, "xUnit", 24);
  const yUnit = options.yUnit === undefined ? "" : line(options.yUnit, "yUnit", 24);
  return { xDomain: domain(options.xDomain, "xDomain"), yDomain: domain(options.yDomain, "yDomain"), xLabel: `${line(options.xLabel, "xLabel", 64)}${xUnit ? ` (${xUnit})` : ""}`, yLabel: `${line(options.yLabel, "yLabel", 64)}${yUnit ? ` (${yUnit})` : ""}` };
}

/** No expressions are evaluated. Split discontinuities into separate finite-point series. */
export function validateCartesianPlotOptions(options: CartesianPlotOptions): ValidatedCartesianPlotOptions {
  const common = base(options, "Cartesian plot"), a = axes(options);
  if (!Array.isArray(options.series) || options.series.length < 1 || options.series.length > 8) throw new RangeError("plot.series must contain 1..8 explicit series");
  let count = 0;
  const series = Object.freeze(Array.from(options.series, (s: CartesianSeries, index) => {
    if (!s || !Array.isArray(s.points) || s.points.length < 2 || s.points.length > 2048 || (count += s.points.length) > 8192) throw new RangeError("Each plot series needs 2..2048 finite points, at most 8192 total");
    const color = s.color ?? [common.theme.accent, common.theme.success, common.theme.muted, "#E6BA73"][index % 4];
    if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) throw new TypeError("Series color must be #RRGGBB");
    const points = Object.freeze(Array.from(s.points, (p, i) => point(p, `series[${index}].points[${i}]`, a.xDomain, a.yDomain)));
    if (!points.some(p => p.x !== points[0].x || p.y !== points[0].y)) throw new RangeError("A curve needs at least two distinct points");
    return Object.freeze({ label: line(s.label, "series.label", 64), points, color });
  }));
  if (options.marker !== undefined && typeof options.marker !== "boolean") throw new TypeError("plot.marker must be boolean");
  return Object.freeze({ ...common, ...a, kind: "plot", series, marker: options.marker ?? true });
}

/** Authored vectors share units and equal screen scales; no force integration/simulation. */
export function validateVectorDiagramOptions(options: VectorDiagramOptions): ValidatedVectorDiagramOptions {
  const common = base(options, "Vector diagram");
  if (!Array.isArray(options.vectors) || options.vectors.length < 1 || options.vectors.length > 12) throw new RangeError("vectors must contain 1..12 authored vectors");
  const unit = line(options.unit ?? options.vectors[0]?.unit ?? "", "vector unit", 24);
  const a = axes({ ...options, xUnit: unit, yUnit: unit });
  const origin = point(options.origin, "origin", a.xDomain, a.yDomain);
  const vectors = Object.freeze(Array.from(options.vectors, (v: DiagramVector, i) => {
    if (!v || typeof v !== "object") throw new TypeError(`vectors[${i}] must contain x/y,label and unit`);
    const x = number(v.x, `vectors[${i}].x`), y = number(v.y, `vectors[${i}].y`);
    if (Math.hypot(x, y) < 1e-9) throw new RangeError("A zero-length vector has no directed arrow");
    point({ x: origin.x + x, y: origin.y + y }, `vectors[${i}] endpoint`, a.xDomain, a.yDomain);
    const actualUnit = line(v.unit ?? unit, "vector unit", 24);
    if (actualUnit !== unit) throw new TypeError("Vectors in one diagram must share a unit; convert values explicitly first");
    return Object.freeze({ x, y, label: line(v.label, "vector label", 48), unit });
  }));
  return Object.freeze({ ...common, ...a, kind: "vectors", origin, vectors, unit });
}

function flowGeometry(options: Pick<ValidatedFlowDiagramOptions, "width" | "height" | "nodes">) {
  const nodeWidth = Math.max(116, Math.min(220, options.width / 5));
  const nodeHeight = Math.max(60, Math.min(100, options.height / 7));
  const left = nodeWidth / 2 + 28, right = options.width - left;
  const top = Math.max(90, options.height * 0.18) + nodeHeight / 2, bottom = options.height - 48 - nodeHeight / 2;
  const nodes = options.nodes.map(node => ({ ...node, cx: left + node.x * (right - left), cy: top + node.y * (bottom - top), width: nodeWidth, height: nodeHeight }));
  return { nodes, nodeWidth, nodeHeight };
}
export function validateFlowDiagramOptions(options: FlowDiagramOptions): ValidatedFlowDiagramOptions {
  const common = base(options, "Flow diagram");
  if (!Array.isArray(options.nodes) || options.nodes.length < 2 || options.nodes.length > 24) throw new RangeError("flow.nodes must contain 2..24 authored nodes");
  const ids = new Set<string>();
  const nodes = Object.freeze(Array.from(options.nodes, (n: FlowNode) => {
    if (!n || typeof n !== "object") throw new TypeError("Flow nodes need id,label,x,y");
    const id = line(n.id, "node.id", 64);
    if (ids.has(id)) throw new TypeError(`Duplicate flow node ID: ${id}`); ids.add(id);
    return Object.freeze({ id, label: line(n.label, `node ${id} label`, 64), x: number(n.x, `node ${id}.x`, 0, 1), y: number(n.y, `node ${id}.y`, 0, 1) });
  }));
  if (!Array.isArray(options.edges) || options.edges.length < 1 || options.edges.length > 64) throw new RangeError("flow.edges must contain 1..64 directed edges");
  const edgeIds = new Set<string>(), pairs = new Set<string>();
  const edges = Object.freeze(Array.from(options.edges, (e: FlowEdge) => {
    if (!e || typeof e !== "object") throw new TypeError("Flow edges need id,from,to");
    const id = line(e.id, "edge.id", 64), from = line(e.from, "edge.from", 64), to = line(e.to, "edge.to", 64);
    if (edgeIds.has(id)) throw new TypeError(`Duplicate flow edge ID: ${id}`); edgeIds.add(id);
    if (!ids.has(from) || !ids.has(to) || from === to) throw new TypeError(`Edge ${id} must connect two distinct existing nodes`);
    const pair = JSON.stringify([from, to]); if (pairs.has(pair)) throw new TypeError("Duplicate directed edge; combine its label instead"); pairs.add(pair);
    return Object.freeze({ id, from, to, label: e.label === undefined ? "" : line(e.label, `edge ${id} label`, 32) });
  }));
  if (options.packetPath !== undefined && (!Array.isArray(options.packetPath) || options.packetPath.length > 128)) throw new RangeError("packetPath must contain at most 128 directed edge IDs");
  const packetPath = Object.freeze(Array.from(options.packetPath ?? [], (id: string) => line(id, "packetPath edge ID", 64)));
  let previous: Required<FlowEdge> | undefined;
  for (const id of packetPath) {
    const edge = edges.find(e => e.id === id);
    if (!edge) throw new TypeError(`Packet path references unknown edge: ${id}`);
    if (previous && previous.to !== edge.from) throw new TypeError("Packet path must follow connected directed edges in order"); previous = edge;
  }
  const geometry = flowGeometry({ ...common, nodes });
  for (let i = 0; i < geometry.nodes.length; i++) for (let j = i + 1; j < geometry.nodes.length; j++) {
    const a = geometry.nodes[i], b = geometry.nodes[j];
    if (Math.abs(a.cx - b.cx) < geometry.nodeWidth + 20 && Math.abs(a.cy - b.cy) < geometry.nodeHeight + 20) throw new RangeError(`Flow nodes ${a.id}/${b.id} overlap; author a wider or more separated layout`);
  }
  return Object.freeze({ ...common, kind: "flow", nodes, edges, packetPath });
}

export function diagramProgress(options: Pick<Base, "revealFrames">, localFrame: number): number {
  number(localFrame, "diagram local frame", -108000, 108000);
  return localFrame < 0 ? 0 : Math.min(1, options.revealFrames === 1 ? 1 : localFrame / (options.revealFrames - 1));
}
function revealPoints(points: readonly DiagramPoint[], progress: number, metric: (a: DiagramPoint, b: DiagramPoint) => number): readonly DiagramPoint[] {
  if (progress >= 1) return points;
  const distances = points.slice(1).map((p, i) => metric(points[i], p));
  let remaining = distances.reduce((a, b) => a + b, 0) * progress;
  const result: DiagramPoint[] = [points[0]];
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i], a = points[i], b = points[i + 1];
    if (d === 0 || remaining >= d) { result.push(b); remaining -= d; continue; }
    if (remaining > 0) result.push({ x: a.x + (b.x - a.x) * remaining / d, y: a.y + (b.y - a.y) * remaining / d });
    break;
  }
  return result;
}
export type CartesianPlotFrame = Readonly<{ progress: number; series: readonly Readonly<{ label: string; color: string; points: readonly DiagramPoint[]; marker: DiagramPoint }>[] }>;
export function getCartesianPlotFrame(options: ValidatedCartesianPlotOptions, localFrame: number): CartesianPlotFrame {
  const progress = diagramProgress(options, localFrame), dx = options.xDomain[1] - options.xDomain[0], dy = options.yDomain[1] - options.yDomain[0];
  return { progress, series: options.series.map(s => {
    const points = revealPoints(s.points, progress, (a, b) => Math.hypot((b.x - a.x) / dx, (b.y - a.y) / dy));
    return { label: s.label, color: s.color!, points, marker: points[points.length - 1] };
  }) };
}
export type VectorDiagramFrame = Readonly<{ progress: number; vectors: readonly Readonly<{ label: string; unit: string; end: DiagramPoint }>[] }>;
export function getVectorDiagramFrame(options: ValidatedVectorDiagramOptions, localFrame: number): VectorDiagramFrame {
  const progress = diagramProgress(options, localFrame);
  return { progress, vectors: options.vectors.map(v => ({ label: v.label, unit: v.unit, end: { x: options.origin.x + v.x * progress, y: options.origin.y + v.y * progress } })) };
}
export type FlowDiagramFrame = Readonly<{ progress: number; packet?: Readonly<{ edgeId: string; edgeIndex: number; x: number; y: number }> }>;
export function getFlowDiagramFrame(options: ValidatedFlowDiagramOptions, localFrame: number): FlowDiagramFrame {
  const progress = diagramProgress(options, localFrame);
  if (!options.packetPath.length) return { progress };
  const { nodes } = flowGeometry(options);
  const segments = options.packetPath.map(id => { const edge = options.edges.find(e => e.id === id)!; const a = nodes.find(n => n.id === edge.from)!, b = nodes.find(n => n.id === edge.to)!; return { edge, a, b, length: Math.hypot(b.cx - a.cx, b.cy - a.cy) }; });
  let remaining = progress * segments.reduce((sum, s) => sum + s.length, 0);
  for (let i = 0; i < segments.length; i++) {
    const { edge, a, b, length } = segments[i];
    if (remaining > length && i < segments.length - 1) { remaining -= length; continue; }
    const t = Math.min(1, remaining / length);
    return { progress, packet: { edgeId: edge.id, edgeIndex: i, x: a.cx + (b.cx - a.cx) * t, y: a.cy + (b.cy - a.cy) * t } };
  }
  throw new Error("Validated packet path has no segments");
}

export type DiagramArrow = Readonly<{ from: DiagramPoint; to: DiagramPoint; head: readonly [DiagramPoint, DiagramPoint, DiagramPoint] }>;
export function diagramArrowGeometry(from: DiagramPoint, to: DiagramPoint, headSize = 12): DiagramArrow {
  number(from.x, "arrow.from.x"); number(from.y, "arrow.from.y"); number(to.x, "arrow.to.x"); number(to.y, "arrow.to.y"); number(headSize, "arrow headSize", 1, 64);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (distance < 1e-9) throw new RangeError("Arrow endpoints must be distinct");
  const size = Math.min(headSize, distance * 0.4), ux = (to.x - from.x) / distance, uy = (to.y - from.y) / distance;
  return { from, to, head: [to, { x: to.x - ux * size - uy * size * 0.5, y: to.y - uy * size + ux * size * 0.5 }, { x: to.x - ux * size + uy * size * 0.5, y: to.y - uy * size - ux * size * 0.5 }] };
}

const fonts = (options: Base) => ({ body: Math.max(14, Math.min(26, options.width / 44)), title: Math.max(24, Math.min(42, options.width / 28)) });
const font = (size: number, family: string, bold = false) => `${bold ? "bold " : ""}${size}px ${family}`;
const titleY = (options: Base) => Math.max(34, options.height * 0.065);
const legendY = (options: Base) => Math.max(77, titleY(options) + fonts(options).title / 2 + fonts(options).body / 2 + 12);
function fit(ctx: DiagramDrawingContext, value: string, width: number, label: string): void {
  if (ctx.measureText(value).width > width) throw new RangeError(`${label} does not fit; shorten the label or use a wider diagram`);
}
function compact(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  return Math.abs(value) >= 1e5 || Math.abs(value) < 0.001 ? value.toExponential(2) : Number(value.toPrecision(4)).toString();
}
function axesBox(options: Base & Axes & { kind: "plot" | "vectors" }, equalScale = false): Box {
  const left = Math.max(78, options.width * 0.085), right = Math.max(40, options.width * 0.04);
  const top = Math.max(options.kind === "plot" ? Math.max(130, legendY(options) + fonts(options).body + 37) : 104, options.height * 0.2);
  const bottom = Math.max(74, options.height * 0.13);
  const box = { x: left, y: top, width: options.width - left - right, height: options.height - top - bottom };
  if (!equalScale) return box;
  const dx = options.xDomain[1] - options.xDomain[0], dy = options.yDomain[1] - options.yDomain[0];
  const scale = Math.min(box.width / dx, box.height / dy);
  return { x: box.x + (box.width - dx * scale) / 2, y: box.y + (box.height - dy * scale) / 2, width: dx * scale, height: dy * scale };
}
function project(p: DiagramPoint, options: Axes, box: Box): DiagramPoint {
  return { x: box.x + (p.x - options.xDomain[0]) / (options.xDomain[1] - options.xDomain[0]) * box.width, y: box.y + box.height - (p.y - options.yDomain[0]) / (options.yDomain[1] - options.yDomain[0]) * box.height };
}
function beginCard(ctx: DiagramDrawingContext, options: Base): void {
  ctx.fillStyle = options.theme.background; ctx.fillRect(0, 0, options.width, options.height);
  ctx.fillStyle = options.theme.text; ctx.font = font(fonts(options).title, options.theme.fontFamily, true); ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(options.title, 28, titleY(options));
}
function checkTitle(ctx: DiagramDrawingContext, options: Base): void {
  ctx.font = font(fonts(options).title, options.theme.fontFamily, true); fit(ctx, options.title, options.width - 56, "Diagram title");
}
function checkAxes(ctx: DiagramDrawingContext, options: Base & Axes, box: Box): void {
  if (box.width < 120 || box.height < 70) throw new RangeError("Axis domains leave too little drawable area; use balanced domains or a larger diagram");
  ctx.font = font(fonts(options).body, options.theme.fontFamily);
  fit(ctx, options.xLabel, box.width, "x axis label"); fit(ctx, options.yLabel, box.width, "y axis label");
  ctx.font = font(fonts(options).body * 0.8, options.theme.fontFamily);
  for (let i = 0; i <= 5; i++) fit(ctx, compact(options.yDomain[0] + (options.yDomain[1] - options.yDomain[0]) * i / 5), box.x - 12, "y tick label");
}
function drawAxes(ctx: DiagramDrawingContext, options: Base & Axes, box: Box): void {
  const { body } = fonts(options);
  ctx.fillStyle = options.theme.surface; ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = options.theme.muted; ctx.lineWidth = 0.65; ctx.beginPath();
  for (let i = 0; i <= 5; i++) {
    const x = box.x + box.width * i / 5, y = box.y + box.height * i / 5;
    ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.height); ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.width, y);
  }
  ctx.stroke(); ctx.font = font(body * 0.8, options.theme.fontFamily); ctx.fillStyle = options.theme.muted; ctx.textBaseline = "middle";
  for (let i = 0; i <= 5; i++) {
    ctx.textAlign = "center"; ctx.fillText(compact(options.xDomain[0] + (options.xDomain[1] - options.xDomain[0]) * i / 5), box.x + box.width * i / 5, box.y + box.height + 20);
    ctx.textAlign = "right"; ctx.fillText(compact(options.yDomain[0] + (options.yDomain[1] - options.yDomain[0]) * i / 5), box.x - 10, box.y + box.height - box.height * i / 5);
  }
  ctx.strokeStyle = options.theme.text; ctx.lineWidth = 1.8; ctx.beginPath();
  const xAxis = options.yDomain[0] <= 0 && options.yDomain[1] >= 0 ? project({ x: options.xDomain[0], y: 0 }, options, box).y : box.y + box.height;
  const yAxis = options.xDomain[0] <= 0 && options.xDomain[1] >= 0 ? project({ x: 0, y: options.yDomain[0] }, options, box).x : box.x;
  ctx.moveTo(box.x, xAxis); ctx.lineTo(box.x + box.width, xAxis); ctx.moveTo(yAxis, box.y); ctx.lineTo(yAxis, box.y + box.height); ctx.stroke();
  ctx.fillStyle = options.theme.text; ctx.font = font(body, options.theme.fontFamily); ctx.textAlign = "center"; ctx.fillText(options.xLabel, box.x + box.width / 2, options.height - 24);
  ctx.textAlign = "left"; ctx.fillText(options.yLabel, box.x, box.y - 25);
}
function path(ctx: DiagramDrawingContext, points: readonly DiagramPoint[]): void {
  ctx.beginPath(); points.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
}
function arrow(ctx: DiagramDrawingContext, from: DiagramPoint, to: DiagramPoint, color: string, lineWidth: number): void {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 1) return;
  const geometry = diagramArrowGeometry(from, to, Math.max(8, lineWidth * 3));
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lineWidth; ctx.lineCap = "round";
  path(ctx, [from, to]); ctx.beginPath(); geometry.head.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.closePath(); ctx.fill();
}

/** Piecewise straight segments only: no interpolation through NaN/gaps or expression evaluation. */
export function drawCartesianPlotFrame(ctx: DiagramDrawingContext, options: ValidatedCartesianPlotOptions, localFrame: number): CartesianPlotFrame {
  const state = getCartesianPlotFrame(options, localFrame), box = axesBox(options), { body } = fonts(options);
  ctx.save();
  try {
    checkTitle(ctx, options); checkAxes(ctx, options, box); ctx.font = font(body, options.theme.fontFamily);
    const widths = options.series.map(s => ctx.measureText(s.label).width + 40);
    if (widths.reduce((a, b) => a + b, 0) > options.width - 56) throw new RangeError("Plot legend does not fit; shorten series labels or use a wider plot");
    beginCard(ctx, options); drawAxes(ctx, options, box);
    let legendX = 28; ctx.font = font(body, options.theme.fontFamily); ctx.textAlign = "left";
    options.series.forEach((s, i) => { ctx.fillStyle = s.color!; ctx.fillRect(legendX, legendY(options) - 2, 18, 4); ctx.fillStyle = options.theme.text; ctx.fillText(s.label, legendX + 25, legendY(options)); legendX += widths[i]; });
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip(); ctx.lineWidth = Math.max(3, options.width / 350); ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const s of state.series) { ctx.strokeStyle = s.color; path(ctx, s.points.map(p => project(p, options, box))); }
    ctx.restore();
    if (options.marker) for (const s of state.series) { const p = project(s.marker, options, box); ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, options.width / 180), 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); }
  } finally { ctx.restore(); }
  return state;
}

export function drawVectorDiagramFrame(ctx: DiagramDrawingContext, options: ValidatedVectorDiagramOptions, localFrame: number): VectorDiagramFrame {
  const state = getVectorDiagramFrame(options, localFrame), box = axesBox(options, true), { body } = fonts(options);
  const colors = [options.theme.accent, options.theme.success, options.theme.text, "#E6BA73"];
  const labels = options.vectors.map(v => `${v.label} (${compact(v.x)}, ${compact(v.y)}) ${v.unit}`);
  ctx.save();
  try {
    checkTitle(ctx, options); checkAxes(ctx, options, box); ctx.font = font(body, options.theme.fontFamily, true);
    labels.forEach(label => fit(ctx, label, box.width - 12, "Vector label"));
    beginCard(ctx, options); drawAxes(ctx, options, box);
    const origin = project(options.origin, options, box);
    state.vectors.forEach((v, i) => arrow(ctx, origin, project(v.end, options, box), colors[i % colors.length], Math.max(3, options.width / 300)));
    ctx.beginPath(); ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2); ctx.fillStyle = options.theme.text; ctx.fill();
    ctx.font = font(body, options.theme.fontFamily, true); ctx.textAlign = "left";
    options.vectors.forEach((v, i) => {
      const endpoint = project({ x: options.origin.x + v.x, y: options.origin.y + v.y }, options, box), labelWidth = ctx.measureText(labels[i]).width;
      const x = Math.max(box.x + 6, Math.min(box.x + box.width - labelWidth - 6, endpoint.x + 12));
      const y = Math.max(box.y + body, Math.min(box.y + box.height - body, endpoint.y - 15));
      ctx.fillStyle = options.theme.surface; ctx.fillRect(x - 4, y - body * 0.65, labelWidth + 8, body * 1.3); ctx.fillStyle = colors[i % colors.length]; ctx.fillText(labels[i], x, y);
    });
  } finally { ctx.restore(); }
  return state;
}

function wrappedNode(ctx: DiagramDrawingContext, label: string, width: number): string[] {
  const words = label.split(/\s+/), result: string[] = []; let current = "";
  for (const word of words) {
    fit(ctx, word, width, "Flow node word");
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > width) { result.push(current); current = word; } else current = next;
  }
  if (current) result.push(current);
  if (result.length > 2) throw new RangeError("Flow node label needs more than two lines; shorten it or use a wider diagram");
  return result;
}
export function drawFlowDiagramFrame(ctx: DiagramDrawingContext, options: ValidatedFlowDiagramOptions, localFrame: number): FlowDiagramFrame {
  const state = getFlowDiagramFrame(options, localFrame), geometry = flowGeometry(options), { body } = fonts(options);
  ctx.save();
  try {
    checkTitle(ctx, options); ctx.font = font(body, options.theme.fontFamily, true);
    const labels = geometry.nodes.map(n => wrappedNode(ctx, n.label, n.width - 24));
    const edges = options.edges.map(edge => {
      const a = geometry.nodes.find(n => n.id === edge.from)!, b = geometry.nodes.find(n => n.id === edge.to)!, dx = b.cx - a.cx, dy = b.cy - a.cy, length = Math.hypot(dx, dy);
      const trim = Math.min(Math.abs(dx) < 1e-9 ? Infinity : a.width / 2 / Math.abs(dx), Math.abs(dy) < 1e-9 ? Infinity : a.height / 2 / Math.abs(dy));
      const from = { x: a.cx + dx * trim, y: a.cy + dy * trim }, to = { x: b.cx - dx * trim, y: b.cy - dy * trim };
      if (edge.label) fit(ctx, edge.label, Math.max(1, length * (1 - 2 * trim) - 20), `Edge ${edge.id} label`);
      return { edge, from, to, middle: { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 } };
    });
    beginCard(ctx, options); ctx.font = font(body, options.theme.fontFamily); ctx.textAlign = "center";
    for (const { edge, from, to, middle } of edges) {
      arrow(ctx, from, to, options.theme.muted, Math.max(2, options.width / 500));
      if (edge.label) { const w = ctx.measureText(edge.label).width; ctx.fillStyle = options.theme.background; ctx.fillRect(middle.x - w / 2 - 6, middle.y - body - 8, w + 12, body + 6); ctx.fillStyle = options.theme.muted; ctx.fillText(edge.label, middle.x, middle.y - body * 0.5 - 5); }
    }
    // Nodes occlude the packet inside their boxes, rather than drawing over labels.
    if (state.packet) { ctx.beginPath(); ctx.arc(state.packet.x, state.packet.y, Math.max(5, options.width / 130), 0, Math.PI * 2); ctx.fillStyle = options.theme.accent; ctx.fill(); }
    ctx.font = font(body, options.theme.fontFamily, true);
    geometry.nodes.forEach((n, i) => {
      ctx.fillStyle = options.theme.surface; ctx.fillRect(n.cx - n.width / 2, n.cy - n.height / 2, n.width, n.height);
      ctx.strokeStyle = options.theme.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(n.cx - n.width / 2, n.cy - n.height / 2, n.width, n.height); ctx.stroke();
      ctx.fillStyle = options.theme.text; const text = labels[i]; text.forEach((value, row) => ctx.fillText(value, n.cx, n.cy + (row - (text.length - 1) / 2) * body * 1.2));
    });
  } finally { ctx.restore(); }
  return state;
}

/** All three components use scene time minus start; mount directly in a scene. */
function canvasDiagram<O extends ValidatedEducationDiagram>(readOptions: () => O, draw: (ctx: DiagramDrawingContext, options: O, localFrame: number) => unknown): JSX.Element {
  const options = createMemo(readOptions);
  return Surface({
    get x() { return options().x; }, get y() { return options().y; }, get width() { return options().width; }, get height() { return options().height; },
    get start(): Time { return `${options().startFrame}f`; }, get end(): Time { return `${options().startFrame + options().durationFrames}f`; },
    ref(canvas) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as DiagramDrawingContext | null;
      if (!ctx || typeof ctx.fillText !== "function") throw new Error("Education diagrams require a Canvas2D surface");
      const ticker = useTicker();
      // The bitmap is identical before the reveal and throughout its final hold.
      // Memoize the canonical drawing frame so other scene ticks do not redraw it.
      const effectiveFrame = createMemo(() => {
        const current = options();
        return Math.max(0, Math.min(current.revealFrames - 1, Math.floor(ticker.time() * TIME_FPS + 0.0001) - current.startFrame));
      });
      createEffect(() => {
        const current = options();
        if (canvas.width !== current.width) canvas.width = current.width;
        if (canvas.height !== current.height) canvas.height = current.height;
        draw(ctx, current, effectiveFrame());
      });
    },
  });
}
export function CartesianPlot(props: CartesianPlotOptions): JSX.Element { return canvasDiagram(() => validateCartesianPlotOptions(props), drawCartesianPlotFrame); }
export function VectorDiagram(props: VectorDiagramOptions): JSX.Element { return canvasDiagram(() => validateVectorDiagramOptions(props), drawVectorDiagramFrame); }
export function FlowDiagram(props: FlowDiagramOptions): JSX.Element { return canvasDiagram(() => validateFlowDiagramOptions(props), drawFlowDiagramFrame); }
