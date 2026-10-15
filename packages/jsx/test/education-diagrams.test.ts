import test from "node:test";
import assert from "node:assert/strict";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";
import {
  CartesianPlot, VectorDiagram, FlowDiagram,
  diagramArrowGeometry, diagramProgress,
  drawCartesianPlotFrame, drawVectorDiagramFrame, drawFlowDiagramFrame,
  getCartesianPlotFrame, getVectorDiagramFrame, getFlowDiagramFrame,
  validateCartesianPlotOptions, validateVectorDiagramOptions, validateFlowDiagramOptions,
} from "../src/education-diagrams.ts";
import type { CartesianPlotOptions, VectorDiagramOptions, FlowDiagramOptions, DiagramDrawingContext } from "../src/education-diagrams.ts";

const plot = (): CartesianPlotOptions => ({ width: 960, height: 600, xDomain: [0, 10], yDomain: [0, 100], xLabel: "Time", xUnit: "s", yLabel: "Position", yUnit: "m", series: [{ label: "Measured position", points: [{ x: 0, y: 0 }, { x: 5, y: 25 }, { x: 10, y: 100 }] }] });
const vectors = (): VectorDiagramOptions => ({ width: 960, height: 600, xDomain: [-5, 5], yDomain: [-5, 5], xLabel: "Horizontal", yLabel: "Vertical", origin: { x: 0, y: 0 }, unit: "N", vectors: [{ x: 3, y: 4, label: "Applied" }, { x: 0, y: -3, label: "Gravity" }] });
const flow = (): FlowDiagramOptions => ({ width: 1440, height: 600, nodes: [{ id: "client", label: "Client", x: 0, y: 0.5 }, { id: "switch", label: "Switch", x: 1 / 3, y: 0.5 }, { id: "router", label: "Router", x: 2 / 3, y: 0.5 }, { id: "server", label: "Server", x: 1, y: 0.5 }], edges: [{ id: "a", from: "client", to: "switch", label: "Frame" }, { id: "b", from: "switch", to: "router", label: "Forward" }, { id: "c", from: "router", to: "server", label: "Deliver" }], packetPath: ["a", "b", "c"] });

test("plot keeps explicit numeric domains/units and snapshots caller data", () => {
  const raw = plot(); const options = validateCartesianPlotOptions(raw);
  assert.equal(options.xLabel, "Time (s)"); assert.equal(options.yLabel, "Position (m)");
  assert.deepEqual(options.xDomain, [0, 10]); assert(Object.isFrozen(options.series[0].points[0]));
  (raw.series[0].points[0] as { x: number }).x = 9;
  assert.equal(options.series[0].points[0].x, 0);
  assert.equal(options.startFrame, 0); assert.equal(options.durationFrames, 180); assert.equal(options.revealFrames, 135);
});

test("curve reveal follows authored segment order and returns exact completed data", () => {
  const options = validateCartesianPlotOptions({ ...plot(), duration: "121f", revealDuration: "121f", xDomain: [0, 10], yDomain: [0, 10], series: [{ label: "Explicit path", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 6 }] }] });
  assert.equal(getCartesianPlotFrame(options, -1).series[0].points.length, 1);
  const midway = getCartesianPlotFrame(options, 60);
  assert.equal(midway.progress, 0.5); assert.equal(midway.series[0].marker.x, 4); assert(Math.abs(midway.series[0].marker.y - 1) < 1e-10);
  assert.deepEqual(getCartesianPlotFrame(options, 120).series[0].points, options.series[0].points);
  getCartesianPlotFrame(options, 120);
  assert.deepEqual(getCartesianPlotFrame(options, 20), getCartesianPlotFrame(options, 20));
});

test("invalid points, outside-domain data and implicit discontinuities are rejected", () => {
  for (const value of [NaN, Infinity, -Infinity, 101]) {
    assert.throws(() => validateCartesianPlotOptions({ ...plot(), series: [{ label: "Bad", points: [{ x: 0, y: 0 }, { x: 5, y: value }] }] }), /finite/);
  }
  assert.throws(() => validateCartesianPlotOptions({ ...plot(), xDomain: [2, 2] }), /increase/);
  assert.throws(() => validateCartesianPlotOptions({ ...plot(), yDomain: [20, 0] }), /increase/);
  assert.throws(() => validateCartesianPlotOptions({ ...plot(), series: [{ label: "Missing", points: new Array(2) }] }), /numeric x\/y/);
  assert.throws(() => validateCartesianPlotOptions({ ...plot(), marker: "yes" as unknown as boolean }), /boolean/);
});

test("vector endpoints are origin-relative, unit-consistent and reveal without simulation", () => {
  const options = validateVectorDiagramOptions({ ...vectors(), origin: { x: 1, y: -1 }, duration: "61f", revealDuration: "61f" });
  assert.equal(options.xLabel, "Horizontal (N)"); assert.equal(options.yLabel, "Vertical (N)");
  const half = getVectorDiagramFrame(options, 30);
  assert.deepEqual(half.vectors[0].end, { x: 2.5, y: 1 });
  assert.deepEqual(getVectorDiagramFrame(options, 60).vectors[0].end, { x: 4, y: 3 });
  assert.deepEqual(getVectorDiagramFrame(options, -1).vectors[0].end, options.origin);
});

test("zero vectors, mixed units and out-of-domain vector tips fail clearly", () => {
  assert.throws(() => validateVectorDiagramOptions({ ...vectors(), vectors: [{ x: 0, y: 0, label: "Zero" }] }), /zero-length/);
  assert.throws(() => validateVectorDiagramOptions({ ...vectors(), vectors: [{ x: 1, y: 1, label: "Mixed", unit: "m" }] }), /share a unit/);
  assert.throws(() => validateVectorDiagramOptions({ ...vectors(), vectors: [{ x: 9, y: 0, label: "Outside" }] }), /endpoint/);
  assert.throws(() => validateVectorDiagramOptions({ ...vectors(), unit: undefined }), /vector unit/);
});

test("arrow triangles retain direction for horizontal and vertical authored vectors", () => {
  const right = diagramArrowGeometry({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
  assert.deepEqual(right.head[0], { x: 100, y: 0 }); assert.equal(right.head[1].x, 90); assert.equal(right.head[2].x, 90);
  assert.equal(right.head[1].y, -right.head[2].y);
  const up = diagramArrowGeometry({ x: 0, y: 100 }, { x: 0, y: 0 }, 10);
  assert(up.head[1].y > up.head[0].y && up.head[2].y > up.head[0].y);
  assert.throws(() => diagramArrowGeometry({ x: 0, y: 0 }, { x: 0, y: 0 }), /distinct/);
});

test("packet follows connected authored edges in distance order, then holds at destination", () => {
  const options = validateFlowDiagramOptions({ ...flow(), duration: "121f", revealDuration: "121f" });
  const first = getFlowDiagramFrame(options, 0), halfway = getFlowDiagramFrame(options, 60), last = getFlowDiagramFrame(options, 120);
  assert.equal(first.packet?.edgeId, "a"); assert.equal(halfway.packet?.edgeId, "b"); assert.equal(last.packet?.edgeId, "c");
  assert(Math.abs(halfway.packet!.x - options.width / 2) < 1e-9); assert(first.packet!.x < halfway.packet!.x && halfway.packet!.x < last.packet!.x);
  assert.deepEqual(getFlowDiagramFrame(options, 120), getFlowDiagramFrame(options, 180));
  assert.equal(getFlowDiagramFrame(validateFlowDiagramOptions({ ...flow(), packetPath: [] }), 50).packet, undefined);
});

test("flow validation rejects invented endpoints, disconnected paths and overlapping layouts", () => {
  assert.throws(() => validateFlowDiagramOptions({ ...flow(), packetPath: ["a", "c"] }), /connected directed/);
  assert.throws(() => validateFlowDiagramOptions({ ...flow(), packetPath: ["missing"] }), /unknown edge/);
  assert.throws(() => validateFlowDiagramOptions({ ...flow(), edges: [{ id: "a", from: "client", to: "unknown" }] }), /existing nodes/);
  assert.throws(() => validateFlowDiagramOptions({ ...flow(), nodes: [{ id: "a", label: "A", x: 0.5, y: 0.5 }, { id: "b", label: "B", x: 0.51, y: 0.5 }], edges: [{ id: "link", from: "a", to: "b" }] , packetPath: [] }), /overlap/);
  assert.throws(() => validateFlowDiagramOptions({ ...flow(), nodes: [...flow().nodes, flow().nodes[0]] }), /Duplicate flow node ID/);
  assert.throws(() => validateFlowDiagramOptions({ ...flow(), nodes: [{ id: "a", label: "A", x: NaN, y: 0.5 }, ...flow().nodes.slice(1)] }), /finite/);
});

test("diagram clocks accept canonical times and reject bad timing/canvas budgets", () => {
  const seconds = validateCartesianPlotOptions({ ...plot(), start: 2, duration: 4, revealDuration: 3 });
  const frames = validateCartesianPlotOptions({ ...plot(), start: "60f", duration: "120f", revealDuration: "90f" });
  assert.equal(seconds.startFrame, frames.startFrame); assert.equal(seconds.durationFrames, frames.durationFrames); assert.equal(seconds.revealFrames, frames.revealFrames);
  assert.equal(diagramProgress(frames, -10), 0); assert.equal(diagramProgress(frames, 89), 1);
  assert.throws(() => diagramProgress(frames, NaN), /finite/);
  for (const duration of [0, -1, "1junk", Infinity]) assert.throws(() => validateCartesianPlotOptions({ ...plot(), duration: duration as CartesianPlotOptions["duration"] }));
  assert.throws(() => validateCartesianPlotOptions({ ...plot(), revealDuration: 7 }), /cannot exceed/);
  assert.throws(() => validateCartesianPlotOptions({ ...plot(), width: 4096, height: 4096 }), /8 megapixels/);
});

type Call = { op: string; args: unknown[]; color?: unknown; points?: number[][]; font?: string };
function context() {
  const calls: Call[] = [], styles: Record<string, unknown>[] = []; let currentPath: number[][] = [];
  const ctx: DiagramDrawingContext = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "14px Arial", textAlign: "left", textBaseline: "middle", lineCap: "butt", lineJoin: "miter",
    save() { styles.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, lineCap: this.lineCap, lineJoin: this.lineJoin }); calls.push({ op: "save", args: [] }); },
    restore() { Object.assign(this, styles.pop()); calls.push({ op: "restore", args: [] }); },
    beginPath() { currentPath = []; }, closePath() {}, rect(...args) { calls.push({ op: "rect", args }); }, clip() {},
    moveTo(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); currentPath.push([x, y]); }, lineTo(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); currentPath.push([x, y]); },
    fill() { calls.push({ op: "fill", args: [], color: this.fillStyle, points: currentPath.map(p => [...p]) }); }, stroke() { calls.push({ op: "stroke", args: [], color: this.strokeStyle, points: currentPath.map(p => [...p]) }); },
    fillRect(...args) { args.forEach(n => assert(Number.isFinite(n))); calls.push({ op: "fillRect", args, color: this.fillStyle }); },
    arc(...args) { args.forEach(n => assert(Number.isFinite(n))); calls.push({ op: "arc", args }); },
    fillText(...args) { calls.push({ op: "text", args, color: this.fillStyle, font: this.font }); },
    measureText(value) { const size = Number(this.font.match(/[\d.]+/)?.[0] ?? 14); return { width: value.length * size * 0.52 }; },
  };
  return { ctx, calls, styles };
}

test("separate finite series produce separate paths instead of bridging a mathematical gap", () => {
  const options = validateCartesianPlotOptions({ ...plot(), xDomain: [-2, 2], yDomain: [-2, 2], series: [{ label: "Left", color: "#11AAEE", points: [{ x: -2, y: -1 }, { x: -1, y: -2 }] }, { label: "Right", color: "#EEAA11", points: [{ x: 1, y: 2 }, { x: 2, y: 1 }] }] });
  const result = context(); drawCartesianPlotFrame(result.ctx, options, 179);
  const curves = result.calls.filter(c => c.op === "stroke" && ["#11AAEE", "#EEAA11"].includes(String(c.color)));
  assert.equal(curves.length, 2); assert(curves.every(c => c.points!.length === 2));
  assert(result.calls.some(c => c.op === "text" && c.args[0] === "Time (s)"));
  assert.equal(result.styles.length, 0);
});

test("vector draw uses positive-y up and equal pixel lengths for equal authored magnitudes", () => {
  const options = validateVectorDiagramOptions({ ...vectors(), xDomain: [-5, 5], yDomain: [-10, 10], vectors: [{ x: 3, y: 0, label: "Right" }, { x: 0, y: 3, label: "Up" }] });
  const result = context(); drawVectorDiagramFrame(result.ctx, options, 179);
  const shafts = result.calls.filter(c => c.op === "stroke" && [options.theme.accent, options.theme.success].includes(String(c.color)));
  assert.equal(shafts.length, 2);
  const a = shafts[0].points!, b = shafts[1].points!;
  assert(a[1][0] > a[0][0]); assert(b[1][1] < b[0][1]);
  assert(Math.abs(Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]) - Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1])) < 1e-8);
});

test("CPU diagrams replay deterministically and reject text overflow before painting", () => {
  const options = validateFlowDiagramOptions(flow()), a = context(), b = context();
  drawFlowDiagramFrame(a.ctx, options, 60); drawFlowDiagramFrame(b.ctx, options, 60); assert.deepEqual(a.calls, b.calls);
  for (const node of options.nodes) assert(a.calls.some(c => c.op === "text" && c.args[0] === node.label));
  assert.equal(a.styles.length, 0);
  const invalid = validateCartesianPlotOptions({ ...plot(), width: 480, series: [{ label: "This legend is much too long for the available diagram width", points: [{ x: 0, y: 0 }, { x: 10, y: 100 }] }] });
  const c = context(); assert.throws(() => drawCartesianPlotFrame(c.ctx, invalid, 30), /legend does not fit/); assert.equal(c.calls.filter(call => call.op === "fillRect").length, 0); assert.equal(c.styles.length, 0);
});

test("plot title, legend and axis header remain separated at native and shallow canvas sizes", () => {
  for (const [width, height] of [[1776, 888], [4096, 300], [480, 300]]) {
    const options = validateCartesianPlotOptions({ ...plot(), width, height, title: "Position over time", series: [{ label: "Position", points: plot().series[0].points }] });
    const result = context(); drawCartesianPlotFrame(result.ctx, options, 50);
    const title = result.calls.find(c => c.op === "text" && c.args[0] === options.title)!;
    const legend = result.calls.find(c => c.op === "text" && c.args[0] === "Position")!;
    const axis = result.calls.find(c => c.op === "text" && c.args[0] === "Position (m)")!;
    const half = (c: Call) => Number(c.font!.match(/[\d.]+/)![0]) / 2;
    assert(Number(title.args[2]) + half(title) + 10 <= Number(legend.args[2]) - half(legend));
    assert(Number(legend.args[2]) + half(legend) + 10 <= Number(axis.args[2]) - half(axis));
  }
});

test("live canvases redraw only on effective reveal frames or changed options", () => {
  type Node = { tag: string; props: Record<string, unknown>; children: Node[]; parent?: Node };
  const examples = [
    { options: plot(), component: (title: () => string) => CartesianPlot({ ...plot(), start: 2, duration: 4, revealDuration: 2, get title() { return title(); } }), draw: (ctx: DiagramDrawingContext, title: string) => drawCartesianPlotFrame(ctx, validateCartesianPlotOptions({ ...plot(), title, start: 2, duration: 4, revealDuration: 2 }), 15) },
    { options: vectors(), component: (title: () => string) => VectorDiagram({ ...vectors(), start: 2, duration: 4, revealDuration: 2, get title() { return title(); } }), draw: (ctx: DiagramDrawingContext, title: string) => drawVectorDiagramFrame(ctx, validateVectorDiagramOptions({ ...vectors(), title, start: 2, duration: 4, revealDuration: 2 }), 15) },
    { options: flow(), component: (title: () => string) => FlowDiagram({ ...flow(), start: 2, duration: 4, revealDuration: 2, get title() { return title(); } }), draw: (ctx: DiagramDrawingContext, title: string) => drawFlowDiagramFrame(ctx, validateFlowDiagramOptions({ ...flow(), title, start: 2, duration: 4, revealDuration: 2 }), 15) },
  ];
  for (const example of examples) {
    const output = context(), [time, setTime] = createSignal(0), [title, setTitle] = createSignal("Original title");
    const stage: Node = { tag: "stage", props: {}, children: [] };
    const canvas = { width: example.options.width, height: example.options.height, getContext: (kind: string, options: unknown) => { assert.equal(kind, "2d"); assert.deepEqual(options, { willReadFrequently: true }); return output.ctx; } };
    const document: ProjectDocument<Node> = {
      stage, createElement: tag => ({ tag, props: {}, children: [] }), createTextNode: value => ({ tag: "#text", props: { value }, children: [] }),
      replaceText: (node, value) => { node.props.value = value; }, isTextNode: node => node.tag === "#text", setProperty: (node, key, value) => { node.props[key] = value; },
      insertNode(parent, node, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent; },
      removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; },
      getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
      applyRef: (_node, ref) => ref(canvas), tick: () => ({ time: time(), frame: Math.floor(time() * 30), delta: 0, playing: true }),
    };
    const dispose = renderProject((): JSX.Element => example.component(title), document);
    const redraws = () => output.calls.filter(c => c.op === "fillRect" && c.args[0] === 0 && c.args[1] === 0 && c.args[2] === example.options.width && c.args[3] === example.options.height).length;
    assert.equal(redraws(), 1, "initial frame is prepared once");
    for (let i = 1; i <= 60; i++) setTime(i / 30);
    assert.equal(redraws(), 1, "ticks before/in the start frame reuse the bitmap");
    setTime(2 + 1 / 30); assert.equal(redraws(), 2);
    setTime(2 + 1 / 30 + 0.001); assert.equal(redraws(), 2, "subframe ticks reuse the same canonical frame");
    setTime(2.5); assert.equal(redraws(), 3);
    setTime(5); assert.equal(redraws(), 4, "seek to the held final frame draws once");
    for (let i = 151; i <= 600; i++) setTime(i / 30);
    assert.equal(redraws(), 4, "ticks throughout/post clip hold do not repaint");
    setTitle("Updated title"); assert.equal(redraws(), 5, "changed options redraw even at a held frame");
    output.calls.length = 0; setTime(2.5);
    const direct = context(); example.draw(direct.ctx, "Updated title");
    assert.deepEqual(output.calls, direct.calls, "reverse seek draws the exact active local frame");
    const beforeDispose = output.calls.length; dispose(); setTime(3);
    assert.equal(output.calls.length, beforeDispose, "disposed surfaces no longer draw");
  }
});
