import test from "node:test";
import assert from "node:assert/strict";
import { createSignal } from "solid-js";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";
import {
  MapRoute,
  DOCUMENTARY_LAND_SOURCE, NATURAL_EARTH_LAND, WORLD_MAP_BOUNDS,
  drawMapRouteFrame, getMapRouteFrame, mapPointDistance, projectMapPoint, validateMapRouteOptions,
} from "../src/documentary-map.ts";
import type { MapDrawingContext, MapRouteOptions } from "../src/documentary-map.ts";

const points = [
  { longitude: -74.006, latitude: 40.7128, label: "New York" },
  { longitude: -0.1278, latitude: 51.5074, label: "London" },
  { longitude: -9.1393, latitude: 38.7223, label: "Lisbon" },
];
const defaults = (): MapRouteOptions => ({ points, width: 960, height: 600, bounds: { west: -100, east: 35, south: 0, north: 70 } });

test("equirectangular projection maps real geographic anchors and regional bounds", () => {
  assert.deepEqual(projectMapPoint(0, 0, 360, 180), { x: 180, y: 90 });
  assert.deepEqual(projectMapPoint(-180, 90, 360, 180), { x: 0, y: 0 });
  assert.deepEqual(projectMapPoint(180, -90, 360, 180), { x: 360, y: 180 });
  const bounds = defaults().bounds!;
  assert.deepEqual(projectMapPoint(-100, 70, 1350, 700, bounds), { x: 0, y: 0 });
  assert.deepEqual(projectMapPoint(35, 0, 1350, 700, bounds), { x: 1350, y: 700 });
  assert(projectMapPoint(-74.006, 40.7128, 1350, 700, bounds).x < projectMapPoint(-0.1278, 51.5074, 1350, 700, bounds).x);
});

test("bundled map is attributed real Natural Earth geometry, frozen and local", () => {
  assert.equal(DOCUMENTARY_LAND_SOURCE.license, "Public domain");
  assert.match(DOCUMENTARY_LAND_SOURCE.url, /nvkelso\/natural-earth-vector.*ne_110m_land/);
  assert.equal(DOCUMENTARY_LAND_SOURCE.sourceSha256, "9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9");
  assert(NATURAL_EARTH_LAND.length > 100);
  assert(NATURAL_EARTH_LAND.flat().length > 5000);
  assert(Object.isFrozen(NATURAL_EARTH_LAND[0][0]));
  for (const ring of NATURAL_EARTH_LAND) for (const [lon, lat] of ring) {
    assert(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
  }
  assert.match(validateMapRouteOptions(defaults()).credits, /Made with Natural Earth/);
});

test("distance uses kilometers and route timing is proportional to segment distances", () => {
  assert(Math.abs(mapPointDistance(points[0], points[1]) - 5570) < 10);
  const o = validateMapRouteOptions({ points: [{ longitude: 0, latitude: 0 }, { longitude: 10, latitude: 0 }, { longitude: 30, latitude: 0 }], width: 600, height: 320, duration: "61f", revealDuration: "61f" });
  const halfway = getMapRouteFrame(o, 30);
  assert.equal(halfway.progress, 0.5);
  assert.equal(halfway.revealed.length, 3);
  assert(Math.abs(halfway.revealed[2].longitude - 15) < 1e-10);
  assert.deepEqual(getMapRouteFrame(o, 60).revealed, o.points);
  assert.deepEqual(getMapRouteFrame(o, 600).revealed, o.points);
});

test("canonical start/duration clocks, final hold and camera are seek deterministic", () => {
  const a = validateMapRouteOptions({ ...defaults(), start: "60f", duration: "00:06", camera: { fromZoom: 1, toZoom: 1.04 } });
  const b = validateMapRouteOptions({ ...defaults(), start: 2, duration: 6, camera: { fromZoom: 1, toZoom: 1.04 } });
  assert.equal(a.startFrame, 60); assert.equal(a.durationFrames, 180); assert.equal(a.revealFrames, 135);
  assert.deepEqual(getMapRouteFrame(a, 78), getMapRouteFrame(b, 78));
  const end = getMapRouteFrame(a, 179);
  assert.equal(end.progress, 1); assert.equal(end.cameraZoom, 1.04);
  assert.equal(getMapRouteFrame(a, -1).progress, 0);
  getMapRouteFrame(a, 179);
  assert.deepEqual(getMapRouteFrame(a, 0), getMapRouteFrame(b, 0));
});

test("validated options snapshot caller data and support supplied land with holes", () => {
  const mutable = [{ longitude: 0, latitude: 0, label: "A" }, { longitude: 20, latitude: 10, label: "B" }];
  const ring: [number, number][] = [[-5, -5], [25, -5], [25, 15], [-5, 15]];
  const o = validateMapRouteOptions({ points: mutable, land: [[ring]], credits: "Own survey", width: 600, height: 320 });
  mutable[0].longitude = 100; ring[0][0] = 100;
  assert.equal(o.points[0].longitude, 0); assert.equal(o.land[0][0][0][0], -5);
  assert(Object.isFrozen(o) && Object.isFrozen(o.points) && Object.isFrozen(o.land[0][0]));
  assert.equal(o.credits, "Own survey");
});

test("bad coordinates, ambiguous dateline routes and invalid regional bounds fail clearly", () => {
  for (const [longitude, latitude] of [[181, 0], [0, -91], [NaN, 0], [0, Infinity]]) {
    assert.throws(() => projectMapPoint(longitude, latitude, 600, 300), /finite number/);
  }
  assert.throws(() => validateMapRouteOptions({ ...defaults(), points: [{ longitude: 170, latitude: 10 }, { longitude: -170, latitude: 15 }], bounds: WORLD_MAP_BOUNDS }), /crosses the dateline/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), bounds: { west: 170, east: -170, south: -10, north: 10 } }), /dateline-crossing bounds/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), bounds: { west: 0, east: 0.001, south: 0, north: 1 } }), /at least 0.01/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), points: [points[0], points[0]] }), /distinct locations/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), bounds: { west: 0, east: 20, south: 0, north: 60 } }), /outside map bounds/);
});

test("duration/land/card budgets reject invalid data before drawing", () => {
  for (const duration of [0, -1, Infinity, "3garbage", "00:99", "0.001f"]) {
    assert.throws(() => validateMapRouteOptions({ ...defaults(), duration: duration as MapRouteOptions["duration"] }), /MapRoute.duration/);
  }
  assert.throws(() => validateMapRouteOptions({ ...defaults(), duration: 2, revealDuration: 3 }), /cannot exceed/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), width: 100 }), /width/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), width: 4096, height: 4096 }), /8 megapixels/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), land: [] }), /real land polygons/);
  assert.throws(() => validateMapRouteOptions({ ...defaults(), points: new Array(2) }), /longitude\/latitude/);
});

function context() {
  const calls: { op: string; args: unknown[]; color?: unknown }[] = [];
  const record = (op: string) => (...args: unknown[]) => { for (const arg of args) if (typeof arg === "number") assert(Number.isFinite(arg)); calls.push({ op, args }); };
  const ctx: MapDrawingContext = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, font: "", textAlign: "left", textBaseline: "middle", lineCap: "butt", lineJoin: "miter",
    save: record("save"), restore: record("restore"), beginPath: record("beginPath"), closePath: record("closePath"), rect: record("rect"), clip: record("clip"), moveTo: record("moveTo"), lineTo: record("lineTo"), fill: record("fill"), stroke: record("stroke"), fillRect(...args) { record("fillRect")(...args); calls[calls.length - 1].color = this.fillStyle; }, arc: record("arc"), fillText: record("fillText"), measureText: value => ({ width: value.length * 8 }),
  };
  return { ctx, calls };
}

test("CPU draw emits real land paths, clipped regional geometry, readable pins and credits", () => {
  const o = validateMapRouteOptions({ ...defaults(), title: "Across the Atlantic" });
  const first = context(), second = context();
  drawMapRouteFrame(first.ctx, o, 100); drawMapRouteFrame(second.ctx, o, 100);
  assert.deepEqual(first.calls, second.calls);
  assert.equal(first.calls.filter(c => c.op === "clip").length, 1);
  assert(first.calls.filter(c => c.op === "lineTo").length > 4500);
  const labels = first.calls.filter(c => c.op === "fillText");
  for (const point of points) assert(labels.some(c => c.args[0] === point.label));
  assert(labels.some(c => String(c.args[0]).includes("Made with Natural Earth")));
  for (const label of labels) { assert(Number(label.args[1]) >= 0 && Number(label.args[1]) <= o.width); assert(Number(label.args[2]) >= 0 && Number(label.args[2]) <= o.height); }
  assert.equal(first.calls.filter(c => c.op === "save").length, first.calls.filter(c => c.op === "restore").length);
});

test("nearby map cities retain complete non-overlapping labels instead of the last-candidate overlap", () => {
  const cities = Array.from({length: 6}, (_, i) => ({longitude: i * 0.01, latitude: 0, label: `City ${i}`}));
  const options = validateMapRouteOptions({points: cities, width: 600, height: 320});
  const output = context(); drawMapRouteFrame(output.ctx, options, 0);
  const labels = output.calls.filter(c => c.op === "fillRect" && c.color === "#F4EEDB").map(c => c.args.map(Number));
  assert.equal(labels.length, cities.length);
  for (const city of cities) assert(output.calls.some(c => c.op === "fillText" && c.args[0] === city.label));
  for (let i = 0; i < labels.length; i++) {
    const [x, y, w, h] = labels[i]; assert(x >= 0 && y >= 0 && x + w <= options.width && y + h <= options.height);
    for (const [bx, by, bw, bh] of labels.slice(i + 1)) assert(!(x < bx + bw && x + w > bx && y < by + bh && y + h > by), "city label boxes must not overlap");
  }
});

test("uncrowded Atlantic map preserves the established above-right city label placement", () => {
  const options = validateMapRouteOptions(defaults()), output = context(); drawMapRouteFrame(output.ctx, options, 0);
  const plotWidth = 906, plotHeight = plotWidth * 70 / 135;
  const p = projectMapPoint(points[0].longitude, points[0].latitude, plotWidth, plotHeight, options.bounds);
  const text = output.calls.find(c => c.op === "fillText" && c.args[0] === "New York")!;
  assert(Math.abs(Number(text.args[1]) - (27 + p.x + 20)) < 1e-9);
  assert(Math.abs(Number(text.args[2]) - (84 + (474 - plotHeight) / 2 + p.y - 27)) < 1e-9);
});

test("map rejects impossible crowding, truncated city/provenance text and cropped labeled pins before painting", () => {
  const crowded = validateMapRouteOptions({width: 600, height: 320, points: Array.from({length: 32}, (_, i) => ({longitude: i * 0.01, latitude: 0, label: `City with long name ${i}`}))});
  const a = context(); assert.throws(() => drawMapRouteFrame(a.ctx, crowded, 0), /too crowded/); assert(!a.calls.some(c => c.op === "fillRect"));
  const long = validateMapRouteOptions({...defaults(), points: [{...points[0], label: "W".repeat(80)}, points[1]]});
  const b = context(); assert.throws(() => drawMapRouteFrame(b.ctx, long, 0), /does not fit in full/); assert(!b.calls.some(c => c.op === "fillRect"));
  const credit = validateMapRouteOptions({...defaults(), width: 600, height: 320, credits: "Source provenance ".repeat(7)});
  const c = context(); assert.throws(() => drawMapRouteFrame(c.ctx, credit, 0), /source credits do not fit in full/); assert(!c.calls.some(c => c.op === "fillRect"));
  const zoom = validateMapRouteOptions({width: 600, height: 320, points: [{longitude: -180, latitude: 0, label: "West edge"}, {longitude: -170, latitude: 0, label: "Nearby"}], camera: {toZoom: 1.1}});
  const d = context(); assert.throws(() => drawMapRouteFrame(d.ctx, zoom, 179), /leaves the viewport/); assert(!d.calls.some(c => c.op === "fillRect"));
});

test("MapRoute reuses prestart/postend pixels, continues its camera after reveal and redraws reverse seeks/options", () => {
  type Node = {tag: string; props: Record<string, unknown>; children: Node[]; parent?: Node};
  const output = context(), [time, setTime] = createSignal(0), [title, setTitle] = createSignal("Original title");
  const stage: Node = {tag: "stage", props: {}, children: []};
  const canvas = {width: 960, height: 600, getContext(kind: string, options: unknown) { assert.equal(kind, "2d"); assert.deepEqual(options, {willReadFrequently: true}); return output.ctx; }};
  const document: ProjectDocument<Node> = {
    stage, createElement: tag => ({tag, props: {}, children: []}), createTextNode: value => ({tag: "#text", props: {value}, children: []}),
    replaceText: (n, value) => { n.props.value = value; }, isTextNode: n => n.tag === "#text", setProperty: (n, key, value) => { n.props[key] = value; },
    insertNode(parent, node, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent; },
    removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; }, getParentNode: n => n.parent, getFirstChild: n => n.children[0], getNextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1],
    applyRef: (_node, ref) => ref(canvas), tick: () => ({time: time(), frame: Math.floor(time() * 30), delta: 0, playing: true}),
  };
  const input = {...defaults(), start: 2, duration: 4, revealDuration: 2, camera: {fromZoom: 1, toZoom: 1.04}};
  const dispose = renderProject(() => MapRoute({...input, get title() { return title(); }}), document);
  const draws = () => output.calls.filter(c => c.op === "fillRect" && c.args[0] === 0 && c.args[1] === 0 && c.args[2] === 960 && c.args[3] === 600).length;
  assert.equal(draws(), 1); for (let i = 1; i <= 60; i++) setTime(i / 30); assert.equal(draws(), 1);
  setTime(3.9); assert.equal(draws(), 2);
  setTime(4.2); assert.equal(draws(), 3, "camera keeps updating after the route reveal ends");
  setTime(4.2 + 0.001); assert.equal(draws(), 3);
  setTime(6); assert.equal(draws(), 4); for (let i = 181; i <= 600; i++) setTime(i / 30); assert.equal(draws(), 4);
  setTitle("Updated title"); assert.equal(draws(), 5);
  output.calls.length = 0; setTime(2.5);
  const direct = context(); drawMapRouteFrame(direct.ctx, validateMapRouteOptions({...input, title: "Updated title"}), 15);
  assert.deepEqual(output.calls, direct.calls);
  const done = output.calls.length; dispose(); setTime(3); assert.equal(output.calls.length, done);
});
