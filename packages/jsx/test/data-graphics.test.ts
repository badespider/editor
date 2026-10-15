import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";
import { DataBars, TrendLine, MetricCard, dataDisclosureText, formatDataValue, sampleTrendPoint, getDataBarsLayout, getTrendLineLayout, getMetricCardLayout } from "../src/data-graphics";
import type { DataBarsProps, TrendLineProps, MetricCardProps } from "../src/data-graphics";

const disclosure = Object.freeze({ kind: "illustrative" as const, text: "Authored data" });
const bars = (): DataBarsProps => ({ title: "Change by team", baseline: 0, unit: "hours", disclosure, valueDomain: [-10, 10], data: [{ label: "A", value: -4 }, { label: "B", value: 8 }, { label: "C", value: 0 }] });
const trend = (): TrendLineProps => ({ title: "Supplied samples", xLabel: "Time", yLabel: "Count", xUnit: "s", yUnit: "items", xDomain: [0, 4], yDomain: [-10, 10], points: [{ x: 0, y: -4 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }, { x: 4, y: 8 }], disclosure });
const metric = (): MetricCardProps => ({ title: "Duration", value: 24, unit: "h", comparison: { label: "Previous period", value: 30 }, disclosure });
type Node = { tag: string; props: Record<string, any>; children: Node[]; parent?: Node };
function mount(component: () => JSX.Element) {
  const stage: Node = { tag: "stage", props: {}, children: [] }, created = { count: 0 };
  const document: ProjectDocument<Node> = {
    stage, createElement: tag => { created.count++; return { tag, props: {}, children: [] }; }, createTextNode: value => { created.count++; return { tag: "#text", props: { value }, children: [] }; },
    replaceText: (node, value) => { node.props.value = value; }, isTextNode: node => node.tag === "#text", setProperty: (node, key, value) => { assert.notEqual(key, "borderRadius", "native rounded shapes use cornerRadius"); assert.notEqual(key, "color", "native text uses fill"); node.props[key] = value; },
    insertNode(parent, node, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent; },
    removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; },
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
  };
  return { stage, created, dispose: renderProject(component, document) };
}
const all = (node: Node): Node[] => [node, ...node.children.flatMap(all)];
function named(node: Node, name: string): Node { const found = all(node).find(item => item.props.name === name); assert.ok(found, name); return found; }
const content = (node: Node): string => node.tag === "#text" ? node.props.value : node.children.map(content).join("");

test("signed bars use one explicit linear scale from zero and retain exact authored labels", () => {
  const layout = getDataBarsLayout(bars()), negative = layout.bars[0], positive = layout.bars[1];
  assert.ok(negative.x < layout.baselineX); assert.equal(negative.x + negative.width, layout.baselineX);
  assert.equal(positive.x, layout.baselineX); assert.ok(Math.abs(positive.width - negative.width * 2) < 1e-9);
  assert.equal(layout.bars[2].width, 0); assert.ok(!layout.rects.some(part => part.name === "Bar 3"));
  assert.ok(layout.texts.some(part => part.name === "Bar 1 value" && part.value === "-4"));
  assert.ok(layout.texts.some(part => part.name === "Bar unit" && part.value.includes("hours") && part.value.includes("zero baseline")));
  assert.equal(layout.texts.find(part => part.name === "Data disclosure")?.value, "ILLUSTRATIVE / Authored data");
});

test("bar validation rejects truncated baselines, undeclared values and ambiguous categories", () => {
  for (const props of [
    { ...bars(), baseline: 2 }, { ...bars(), valueDomain: [1, 10] }, { ...bars(), valueDomain: [0, 0] },
    { ...bars(), data: [{ label: "A", value: 11 }] }, { ...bars(), data: [{ label: "A", value: NaN }] },
    { ...bars(), data: [{ label: "A", value: 1 }, { label: "A", value: 2 }] }, { ...bars(), data: new Array(2) },
  ]) assert.throws(() => getDataBarsLayout(props as DataBarsProps));
  assert.throws(() => getDataBarsLayout({ ...bars(), height: 480, data: Array.from({ length: 8 }, (_, i) => ({ label: String(i), value: i })) }), /readable label space/);
  assert.throws(() => getDataBarsLayout({ ...bars(), valueDomain: [-0.001, 100000], data: [{ label: "A", value: 1 }] }), /scale labels overlap/);
});

test("trend retains gaps, exact indexed samples and positive-y-up geometry", () => {
  const props = trend(), layout = getTrendLineLayout(props);
  assert.equal(layout.segments.length, 2, "no line bridges the explicit null gap");
  assert.equal(layout.points[2], null); assert.deepEqual(sampleTrendPoint(props.points, 1), { x: 1, y: 2 });
  assert.equal(sampleTrendPoint(props.points, 2), null);
  assert.ok(layout.points[1]!.x > layout.points[0]!.x); assert.ok(layout.points[1]!.y < layout.points[0]!.y);
  assert.ok(layout.segments[0].rotation < 0);
  assert.throws(() => sampleTrendPoint(props.points, 1.5), /authored entry/);
  assert.throws(() => sampleTrendPoint(props.points, 5), /authored entry/);
});

test("native trend segment center-pivot rectangles meet both exact projected endpoints", () => {
  const layout = getTrendLineLayout(trend());
  for (const segment of layout.segments) {
    const rectangle = layout.rects.find(part => part.rotation === segment.rotation && part.box.width === segment.length)!;
    const cx = rectangle.box.x + rectangle.box.width / 2, cy = rectangle.box.y + rectangle.box.height / 2, radians = segment.rotation * Math.PI / 180;
    assert.ok(Math.abs(cx - Math.cos(radians) * segment.length / 2 - segment.from.x) < 1e-9);
    assert.ok(Math.abs(cy - Math.sin(radians) * segment.length / 2 - segment.from.y) < 1e-9);
    assert.ok(Math.abs(cx + Math.cos(radians) * segment.length / 2 - segment.to.x) < 1e-9);
    assert.ok(Math.abs(cy + Math.sin(radians) * segment.length / 2 - segment.to.y) < 1e-9);
  }
});

test("trends reject nonfinite, unordered and out-of-domain points instead of smoothing or imputing", () => {
  for (const points of [
    [{ x: 0, y: 1 }, { x: 0, y: 2 }], [{ x: 2, y: 1 }, { x: 1, y: 2 }], [{ x: 0, y: 1 }, null, { x: 0, y: 2 }],
    [{ x: 0, y: NaN }, { x: 1, y: 2 }], [{ x: 0, y: 1 }, { x: 5, y: 2 }], [{ x: 0, y: 1 }, null], new Array(2),
  ]) assert.throws(() => getTrendLineLayout({ ...trend(), points }));
  assert.throws(() => getTrendLineLayout({ ...trend(), points: Array.from({ length: 129 }, (_, i) => ({ x: i, y: 1 })) }), /2..128/);
  assert.throws(() => getTrendLineLayout({ ...trend(), xDomain: [2, 1] }), /increase/);
});

test("source and illustrative disclosures remain visible and unknown or missing provenance fails", () => {
  assert.equal(dataDisclosureText({ kind: "source", text: "Report, table 2" }), "SOURCE / Report, table 2");
  assert.equal(dataDisclosureText({ kind: "illustrative" }), "ILLUSTRATIVE / Authored example");
  for (const disclosure of [undefined, null, { kind: "source", text: "" }, { kind: "measured", text: "Unknown" }, { kind: "illustrative", url: "https://example.org" }]) {
    assert.throws(() => getMetricCardLayout({ ...metric(), disclosure } as MetricCardProps));
  }
  assert.throws(() => getMetricCardLayout({ ...metric(), unit: "" }), /unit/);
  assert.throws(() => getMetricCardLayout({ ...metric(), hiddenSource: "not shown" } as MetricCardProps), /Unknown MetricCard/);
});

test("metric comparison displays supplied values and unit without inferring a percentage or success claim", () => {
  const layout = getMetricCardLayout({ ...metric(), disclosure: { kind: "source", text: "Authored fixture receipt" } });
  assert.equal(layout.texts.find(part => part.name === "Metric value")?.value, "24 h");
  assert.equal(layout.texts.find(part => part.name === "Metric comparison value")?.value, "30 h");
  assert.equal(layout.texts.find(part => part.name === "Metric comparison label")?.value, "Previous period");
  assert.ok(layout.texts.every(part => !/%|improve|better|faster/i.test(part.value)));
  assert.throws(() => getMetricCardLayout({ ...metric(), value: Infinity }), /finite/);
});

test("formatting preserves exact number text unless the caller explicitly requests rounding", () => {
  assert.equal(formatDataValue(0.00000001), "1e-8"); assert.equal(formatDataValue(-0), "0");
  assert.equal(formatDataValue(12.3456, 2), "12.35"); assert.equal(formatDataValue(12, 2), "12");
  assert.equal(formatDataValue(-0.001, 2), "0");
  assert.equal(getMetricCardLayout({ ...metric(), value: 24.123, valueDecimals: 2 }).texts.find(part => part.name === "Metric value")?.value, "≈24.12 h");
  for (const decimals of [-1, 7, 1.5, NaN]) assert.throws(() => formatDataValue(1, decimals), /valueDecimals/);
});

test("all cards use native editable leaves with explicit finite lifetime and readable bounds in both layouts", () => {
  for (const [width, height] of [[1728, 888], [936, 1680]]) for (const component of [
    () => DataBars({ ...bars(), width, height, start: 2, duration: 44 }),
    () => TrendLine({ ...trend(), width, height, start: 2, duration: 44 }),
    () => MetricCard({ ...metric(), width, height, start: 2, duration: 44 }),
  ]) {
    const mounted = mount(component), root = mounted.stage.children[0];
    assert.equal(root.tag, "Group"); assert.equal(root.props.start, "60f"); assert.equal(root.props.end, "1380f"); assert.equal(root.props.opacity, 1);
    for (const node of all(root).filter(node => node.tag === "Rect" || node.tag === "Text")) {
      assert.equal(node.props.start, "0f"); assert.equal(node.props.end, "1320f");
      assert.match(node.props.fill, /^#[a-f\d]{6}$/i); assert.equal(node.props.src, undefined);
      assert.ok(Number.isFinite(node.props.x) && Number.isFinite(node.props.y) && node.props.width > 0 && node.props.height > 0);
      if (node.tag === "Text") { assert.ok(node.props.x >= 0 && node.props.y >= 0); assert.ok(node.props.x + node.props.width <= width + 1e-8); assert.ok(node.props.y + node.props.height <= height + 1e-8); }
    }
    assert.match(content(named(root, "Data disclosure")), /ILLUSTRATIVE/); mounted.dispose();
  }
});

test("compact catalog cards reserve distinct readable unit and source bands in both formats", () => {
  for (const [width, height, fontSize] of [[1728, 600, 32], [936, 1120, 40]]) {
    const bar = getDataBarsLayout({ ...bars(), width, height, fontSize, unit: "units" });
    const unit = bar.texts.find(part => part.name === "Bar unit")!, source = bar.texts.find(part => part.name === "Data disclosure")!;
    assert.match(unit.value.replace(/\n/g, " "), /Value \(units\) \/ zero baseline/);
    assert.ok(unit.box.height >= unit.font * 1.35 * unit.value.split("\n").length);
    assert.ok(unit.box.y + unit.box.height <= source.box.y);
    const baseline = bar.rects.find(part => part.name === "Zero baseline")!;
    assert.ok(baseline.box.y + baseline.box.height <= unit.box.y);
    const line = getTrendLineLayout({ ...trend(), width, height, fontSize, title: "Supplied points" });
    const xUnit = line.texts.find(part => part.name === "Trend x unit")!, credit = line.texts.find(part => part.name === "Data disclosure")!;
    assert.equal(xUnit.value, "Time (s)"); assert.ok(xUnit.box.height >= xUnit.font * 1.35);
    assert.ok(xUnit.box.y + xUnit.box.height <= credit.box.y);
    const mounted = mount(() => DataBars({ ...bars(), width, height, fontSize, unit: "units" }));
    assert.match(content(named(mounted.stage, "Bar unit")).replace(/\n/g, " "), /units/); mounted.dispose();
  }
});

test("invalid timing, narrow cards and unreadable full labels fail before generating native children", () => {
  for (const props of [{ ...metric(), duration: 0 }, { ...metric(), duration: "1junk" }, { ...metric(), end: 4, duration: 2 }, { ...metric(), width: 400 }, { ...metric(), animate: "yes" }]) {
    assert.throws(() => getMetricCardLayout(props as MetricCardProps));
  }
  assert.throws(() => getMetricCardLayout({ ...metric(), width: 936, height: 1680, title: "unbreakable".repeat(10) }), /does not fit|needs/);
  assert.throws(() => getTrendLineLayout({ ...trend(), width: 480, height: 480 }), /fit|space|needs/);
});

test("semantic no-change ticks keep native identity, actual data changes and reverse seek restore values", () => {
  const [time, setTime] = createSignal(0);
  const mounted = mount(() => MetricCard({ ...metric(), get value() { return time() < 3 ? 24 : 30; } }));
  const first = named(mounted.stage, "Metric value"), count = mounted.created.count;
  for (let i = 1; i < 90; i++) setTime(i / 30);
  assert.equal(mounted.created.count, count); assert.equal(named(mounted.stage, "Metric value"), first);
  setTime(3); assert.equal(content(named(mounted.stage, "Metric value")), "30 h");
  const updated = mounted.created.count; for (let i = 91; i < 150; i++) setTime(i / 30);
  assert.equal(mounted.created.count, updated);
  setTime(1); assert.equal(content(named(mounted.stage, "Metric value")), "24 h");
  const beforeDispose = mounted.created.count; mounted.dispose(); setTime(4); assert.equal(mounted.created.count, beforeDispose);
});

test("geometry snapshots and frozen caller data are deterministic and never mutated", () => {
  const input = Object.freeze({ ...bars(), data: Object.freeze(bars().data.map(item => Object.freeze(item))), valueDomain: Object.freeze([-10, 10] as const) });
  const before = JSON.stringify(input), a = getDataBarsLayout(input), b = getDataBarsLayout(input);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(input), before); assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.bars[0]));
  const points = [{ x: 0, y: 1 }, { x: 1, y: 2 }]; const sample = sampleTrendPoint(points, 0); points[0].y = 100;
  assert.deepEqual(sample, { x: 0, y: 1 }); assert.ok(Object.isFrozen(sample));
});
