import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import { EquationCard, layoutMathExpression } from "../src/education-equation";
import { EDUCATION_THEME, educationFrames, educationLayout, educationTheme } from "../src/education-core";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";

type Node = { tag: string; props: Record<string, any>; children: Node[]; parent?: Node };
function host(): ProjectDocument<Node> {
  const stage: Node = { tag: "stage", props: {}, children: [] };
  return { stage, createElement: tag => ({ tag, props: {}, children: [] }),
    createTextNode: text => ({ tag: "#text", props: { text }, children: [] }),
    replaceText(node, text) { node.props.text = text; }, isTextNode: node => node.tag === "#text",
    setProperty(node, name, value) { node.props[name] = value; },
    insertNode(parent, node, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent; },
    removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; },
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
  };
}
const all = (node: Node): Node[] => [node, ...node.children.flatMap(all)];
const content = (node: Node): string => node.tag === "#text" ? node.props.text : node.children.map(content).join(" ");
function corners(box: {x: number; y: number; width: number; height: number; rotation?: number}) {
  const angle = (box.rotation ?? 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const center = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  return [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => ({
    x: center.x + x * box.width * cos - y * box.height * sin,
    y: center.y + x * box.width * sin + y * box.height * cos,
  }));
}
function endpoints(box: {x: number; y: number; width: number; height: number; rotation?: number}) {
  const angle = (box.rotation ?? 0) * Math.PI / 180, dx = Math.cos(angle) * box.width / 2, dy = Math.sin(angle) * box.width / 2;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  return [{x: x - dx, y: y - dy}, {x: x + dx, y: y + dy}];
}

test("structured fractions, powers and roots produce finite native parts within the advertised box", () => {
  const expression = { type: "row" as const, items: ["x =", { type: "fraction" as const, numerator: { type: "root" as const, radicand: { type: "power" as const, base: "b", exponent: "2" } }, denominator: "2a" }] };
  const result = layoutMathExpression(expression, 64);
  assert.equal(result.parts.filter(part => part.type === "rule").length, 5);
  assert.equal(result.parts.filter(part => part.type === "rule" && part.rotation !== undefined).length, 3);
  for (const part of result.parts) {
    assert.ok(part.width > 0 && part.height > 0);
    for (const corner of corners(part)) {
      assert.ok(corner.x >= -.001 && corner.y >= -.001);
      assert.ok(corner.x <= result.width + .001);
      assert.ok(corner.y <= result.height + .001);
    }
  }
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.parts));
  assert.deepEqual(layoutMathExpression(expression, 64), result);
});

test("native radical strokes connect to an overbar and enclose a tall fraction without font glyph assumptions", () => {
  const result = layoutMathExpression({type: "root", radicand: {type: "fraction", numerator: "a + b", denominator: "c + d"}}, 64);
  const strokes = result.parts.filter(part => part.type === "rule" && part.rotation !== undefined);
  assert.equal(strokes.length, 3);
  const path = strokes.map(endpoints);
  for (let index = 1; index < path.length; index++) assert.ok(Math.hypot(path[index - 1][1].x - path[index][0].x, path[index - 1][1].y - path[index][0].y) < .001);
  const overbar = result.parts.find(part => part.type === "rule" && part.rotation === undefined)!;
  const final = path.at(-1)![1];
  assert.ok(final.x >= overbar.x && final.x <= overbar.x + overbar.width);
  assert.ok(final.y >= overbar.y && final.y <= overbar.y + overbar.height);
  const radicand = result.parts.filter(part => part.type === "text");
  const bottom = Math.max(...radicand.map(part => part.y + part.height));
  assert.ok(path[1][1].y >= bottom, "the hook covers the entire fraction, not one fixed-size glyph");
  assert.ok(overbar.y + overbar.height < Math.min(...radicand.map(part => part.y)));
  assert.ok(overbar.x + overbar.width > Math.max(...radicand.map(part => part.x + part.width)));
  assert.equal(result.parts.some(part => part.type === "text" && part.text === "√"), false);
});

test("rotated root geometry stays finite inside its advertised bounds across sizes and nested radicands", () => {
  for (const fontSize of [12, 32, 64, 128]) {
    const expressions = [
      {type: "root" as const, radicand: "x"},
      {type: "root" as const, radicand: {type: "fraction" as const, numerator: "1", denominator: "2"}},
    ];
    for (const expression of expressions) {
      const result = layoutMathExpression(expression, fontSize);
      for (const part of result.parts) for (const corner of corners(part)) {
        assert.ok(Number.isFinite(corner.x) && Number.isFinite(corner.y));
        assert.ok(corner.x >= -.001 && corner.x <= result.width + .001);
        assert.ok(corner.y >= -.001 && corner.y <= result.height + .001);
      }
    }
  }
  const nested = layoutMathExpression({type: "root", radicand: {type: "root", radicand: {type: "power", base: "b", exponent: "2"}}}, 64);
  for (const part of nested.parts) for (const corner of corners(part)) {
    assert.ok(corner.x >= -.001 && corner.x <= nested.width + .001);
    assert.ok(corner.y >= -.001 && corner.y <= nested.height + .001);
  }
});

test("fraction rule separates numerator from denominator; superscript rises above base", () => {
  const fraction = layoutMathExpression({ type: "fraction", numerator: "1", denominator: "2" });
  const top = fraction.parts[0], line = fraction.parts[1], bottom = fraction.parts[2];
  assert.ok(top.y + top.height < line.y);
  assert.ok(line.y + line.height < bottom.y);
  const power = layoutMathExpression({ type: "power", base: "m", exponent: "2" });
  assert.ok(power.parts[1].y < power.parts[0].y);
});

test("equation card produces editable native math, definitions and reactive supplied content", () => {
  const doc = host();
  const [formula, setFormula] = createSignal("F = ma");
  const dispose = renderProject(() => EquationCard({ title: "Net force", get equation() { return formula(); }, caption: "Constant mass", start: 2, duration: 4,
    variables: [{ symbol: "F", meaning: "net force", unit: "N" }, { symbol: "m", meaning: "mass", unit: "kg" }] }), doc);
  assert.equal(doc.stage.children[0].props.start, "60f");
  assert.equal(doc.stage.children[0].props.end, "180f");
  assert.match(content(doc.stage), /F = ma/); assert.match(content(doc.stage), /net force \(N\)/);
  for (const node of all(doc.stage).filter(node => node.tag === "Text")) {
    assert.equal(node.props.color, undefined); assert.ok(node.props.fill); assert.equal(node.props.end, "120f");
  }
  setFormula("6 N = 2 kg × 3 m/s²");
  assert.match(content(doc.stage), /6 N = 2 kg/);
  dispose();
});

test("equation roots author explicit native Rect rotations and stay within the card after transformation", () => {
  for (const box of [{width: 1728, height: 888, fontSize: 32}, {width: 936, height: 1620, fontSize: 30}]) {
    const doc = host();
    const dispose = renderProject(() => EquationCard({...box, title: "A native radical", equation: {type: "root", radicand: {type: "fraction", numerator: "a + b", denominator: "c"}}}), doc);
    const rules = all(doc.stage).filter(node => node.props.name?.startsWith("Math rule"));
    assert.equal(rules.filter(node => node.props.rotation !== 0).length, 3);
    for (const node of all(doc.stage).filter(node => node.tag === "Rect" || node.tag === "Text")) {
      assert.ok(node.props.fill); assert.equal(node.props.color, undefined);
      for (const corner of corners({x: node.props.x, y: node.props.y, width: node.props.width, height: node.props.height, rotation: node.props.rotation})) {
        assert.ok(corner.x >= -.001 && corner.x <= box.width + .001, node.props.name);
        assert.ok(corner.y >= -.001 && corner.y <= box.height + .001, node.props.name);
      }
    }
    dispose();
  }
});

test("invalid math structure, unreadable expressions and sparse variables fail before authoring", () => {
  for (const expression of ["", "a\nb", { type: "latex", value: "x" }, { type: "row", items: [] }, { type: "row", items: ["a", , "b"] }]) {
    assert.throws(() => Reflect.apply(layoutMathExpression, undefined, [expression]));
  }
  const cyclic: any = { type: "root" }; cyclic.radicand = cyclic;
  assert.throws(() => layoutMathExpression(cyclic), /8 levels|minimum 8px/);
  assert.throws(() => layoutMathExpression("x", NaN), /finite/);
  assert.throws(() => renderProject(() => EquationCard({ title: "Equation", equation: "W".repeat(120) }), host()), /does not fit/);
  assert.throws(() => renderProject(() => Reflect.apply(EquationCard, undefined, [{ title: "Equation", equation: "x", variables: [,] }]), host()), /complete entries/);
  const sparseRow = ["a", , "b"]; Object.assign(sparseRow, {extra: "not an indexed item"});
  assert.throws(() => Reflect.apply(layoutMathExpression, undefined, [{type: "row", items: sparseRow}]), /complete items/);
  const inheritedVariables = [{symbol: "x", meaning: "value"}, {symbol: "y", meaning: "other value"}];
  delete inheritedVariables[1]; Object.setPrototypeOf(inheritedVariables, Object.assign(Object.create(Array.prototype), {1: {symbol: "z", meaning: "inherited"}}));
  assert.throws(() => renderProject(() => EquationCard({title: "Equation", equation: "x", variables: inheritedVariables}), host()), /complete entries/);
});

test("shared education clock, geometry and theme reject ambiguous or unsafe input", () => {
  assert.equal(educationFrames("90f", "duration"), 90);
  assert.equal(educationFrames("00:03", "duration"), 90);
  assert.throws(() => Reflect.apply(educationFrames, undefined, ["junk", "start"]));
  assert.throws(() => educationFrames(Infinity, "duration"));
  const box = { x: 0, y: 0, width: 1920, height: 1080 };
  assert.throws(() => educationLayout({ start: 3600, duration: 1 }, box), /108000/);
  assert.throws(() => educationLayout({ duration: 4, end: 8 }, box), /end or duration/);
  assert.throws(() => educationLayout({ width: NaN }, box), /finite/);
  const custom = Object.freeze({ accent: "#FFAA00" });
  assert.equal(educationTheme(custom).accent, "#FFAA00");
  assert.equal(EDUCATION_THEME.accent, "#54D6C7");
  assert.throws(() => educationTheme({ accent: "cyan" }), /#RRGGBB/);
});
