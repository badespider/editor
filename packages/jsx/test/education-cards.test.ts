import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { LessonCard, WorkedExample, CodeWalkthrough, QuizCard } from "../src/education-cards";
import { EDUCATION_THEME } from "../src/education-core";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";

type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(component: () => JSX.Element) {
  const stage: Node = {tag: "stage", props: {}, children: []};
  const created = {elements: 0, textNodes: 0};
  const document: ProjectDocument<Node> = {
    stage, createElement: tag => { created.elements++; return {tag, props: {}, children: []}; }, createTextNode: text => { created.textNodes++; return {tag: "#text", props: {text}, children: []}; },
    replaceText: (node, value) => { node.props.text = value; }, isTextNode: node => node.tag === "#text",
    setProperty: (node, name, value) => { if (node.tag === "Text" && name === "color") throw new Error("Text requires fill, not paint color"); node.props[name] = value; },
    insertNode(parent, node, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent; },
    removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; },
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
  };
  return {stage, created, dispose: renderProject(component, document)};
}
function all(node: Node): Node[] { return [node, ...node.children.flatMap(all)]; }
function named(node: Node, name: string): Node { const result = all(node).find(n => n.props.name === name); assert.ok(result, name); return result; }
function content(node: Node): string { return node.tag === "#text" ? node.props.text : node.children.map(content).join(""); }
function untyped(component: (...args: any[]) => JSX.Element, props: unknown) { return () => Reflect.apply(component, undefined, [props]); }
const steps = [{label: "Given", expression: "F = m * a", explanation: "Start with the relationship."}, {label: "Substitute", expression: "F = 2 * 3"}, {label: "Multiply", expression: "F = 6"}, {label: "State units", expression: "F = 6 N", explanation: "Force is measured in newtons."}];
const examples = [
  () => LessonCard({title: "A useful relationship", body: "Connect the quantities before using a formula.", eyebrow: "PHYSICS", footer: "Authored lesson text"}),
  () => WorkedExample({title: "Find the force", steps, activeStep: 2}),
  () => CodeWalkthrough({title: "Read a loop", lines: ["for (let i = 0; i < 3; i++) {", "  console.log(i);", "}"], highlightedLines: [2], note: "The highlighted line emits a value."}),
  () => QuizCard({question: "Which unit measures force?", choices: ["Newtons", "Meters", "Seconds", "Kilograms"], answerIndex: 0, explanation: "A newton is the SI unit of force."}),
];

test("all education cards mount native editable shapes and fill-painted text within their local box", () => {
  for (const example of examples) {
    const {stage, dispose} = mount(example), root = stage.children[0];
    assert.equal(root.tag, "Group"); assert.equal(root.props.end, "180f");
    for (const node of all(root)) {
      assert.ok(["Group", "Rect", "Text", "#text"].includes(node.tag));
      if (node.tag !== "Text" && node.tag !== "Rect") continue;
      assert.equal(node.props.start, "0f"); assert.equal(node.props.end, "180f");
      assert.ok(node.props.x >= 0 && node.props.y >= 0, node.props.name);
      assert.ok(node.props.width > 0 && node.props.height > 0, node.props.name);
      assert.ok(node.props.x + node.props.width <= root.props.width + .001, node.props.name);
      assert.ok(node.props.y + node.props.height <= root.props.height + .001, node.props.name);
      assert.match(node.props.fill, /^#[\da-f]{6}$/i);
    }
    dispose();
  }
});

test("lesson content, theme and common timing are authored and editable", () => {
  const {stage, dispose} = mount(() => LessonCard({title: "Question", body: "Explain the idea.", start: 2, duration: "90f", animate: false, theme: {accent: "#123456"}}));
  assert.equal(stage.children[0].props.start, "60f"); assert.equal(stage.children[0].props.end, "150f");
  assert.equal(stage.children[0].props.opacity, 1); assert.equal(stage.children[0].props.offsetY, 0);
  assert.equal(named(stage, "Lesson body").props.end, "90f");
  assert.equal(named(stage, "Lesson accent").props.fill, "#123456");
  assert.equal(content(named(stage, "Lesson body")), "Explain the idea."); dispose();
  const custom = mount(() => LessonCard({title: "A title", body: "A short body.", width: 900, height: 700, fontSize: 22}));
  assert.equal(custom.stage.children[0].props.width, 900); custom.dispose();
});

test("worked example changes its zero-based highlight reactively without solving expressions", () => {
  const [active, setActive] = createSignal(0);
  const {stage, dispose} = mount(() => WorkedExample({title: "Authored steps", steps, get activeStep() { return active(); }}));
  assert.equal(named(stage, "Step 1 marker").props.fill, EDUCATION_THEME.accent);
  setActive(3);
  assert.equal(named(stage, "Step 1 marker").props.fill, EDUCATION_THEME.muted);
  assert.equal(named(stage, "Step 4 marker").props.fill, EDUCATION_THEME.accent);
  assert.equal(content(named(stage, "Step 4 expression")), "F = 6 N");
  assert.equal(named(stage, "Step 4 expression").props.fontFamily, EDUCATION_THEME.monoFamily); dispose();
});

test("worked examples can reveal through the active step and reverse without moving authored rows", () => {
  const full = mount(() => WorkedExample({title: "All authored steps", steps}));
  const fullPositions = steps.map((_, index) => {
    const panel = named(full.stage, `Step ${index + 1} panel`).props;
    return [panel.x, panel.y, panel.width, panel.height];
  });
  assert.ok(named(full.stage, "Step 4 expression"), "default behavior still shows every step"); full.dispose();
  const [active, setActive] = createSignal(0), [reveal, setReveal] = createSignal(true);
  const {stage, created, dispose} = mount(() => WorkedExample({title: "One idea at a time", steps, get activeStep() { return active(); }, get revealThroughActive() { return reveal(); }}));
  assert.equal(all(stage).filter(node => /^Step \d+ expression$/.test(node.props.name ?? "")).length, 1);
  assert.equal(all(stage).some(node => node.props.name === "Step 4 expression"), false);
  assert.doesNotMatch(content(stage), /F = 6/);
  for (const target of [2, 3, 1, 0]) {
    setActive(target);
    assert.equal(all(stage).filter(node => /^Step \d+ expression$/.test(node.props.name ?? "")).length, target + 1);
    for (let index = 0; index <= target; index++) {
      const panel = named(stage, `Step ${index + 1} panel`).props;
      assert.deepEqual([panel.x, panel.y, panel.width, panel.height], fullPositions[index]);
    }
    assert.equal(all(stage).some(node => node.props.name === `Step ${target + 2} expression`), false);
  }
  const unchanged = {...created}; setActive(0); assert.deepEqual(created, unchanged);
  setReveal(false); assert.ok(named(stage, "Step 4 expression"));
  setReveal(true); assert.equal(all(stage).some(node => node.props.name === "Step 4 expression"), false);
  dispose();
});

test("code retains leading/trailing spaces, tabs and blank lines as literal monospace text", () => {
  const literal = ["  const x = 2;  ", "", "\treturn x;"];
  const {stage, dispose} = mount(() => CodeWalkthrough({title: "Literal code", lines: literal}));
  literal.forEach((line, index) => {
    const node = named(stage, `Code line ${index + 1}`);
    assert.equal(content(node), line);
    assert.equal(node.props.fontFamily, EDUCATION_THEME.monoFamily);
  });
  assert.equal(all(stage).filter(n => n.props.name?.endsWith("marker")).length, 0); dispose();
});

test("code highlighting uses one-based reactive line numbers and supports ten lines", () => {
  const [highlighted, setHighlighted] = createSignal<readonly number[]>([1]);
  const lines = Array.from({length: 10}, (_, index) => `const n${index} = ${index};`);
  const {stage, dispose} = mount(() => CodeWalkthrough({title: "Ten lines", lines, note: "No execution", get highlightedLines() { return highlighted(); }}));
  assert.ok(named(stage, "Code line 1 marker"));
  setHighlighted([10]);
  assert.equal(all(stage).some(n => n.props.name === "Code line 1 marker"), false);
  assert.ok(named(stage, "Code line 10 marker")); dispose();
});

test("code reveals authored lines without exposing future output or moving the complete layout", () => {
  const lines = Object.freeze(["def force(m, a):", "    return m * a  ", "", "force(2, 3)", "# AUTHORED EXPECTED: 6 N"]);
  const baseline = mount(() => CodeWalkthrough({title: "Read, then apply", lines, highlightedLines: [5]}));
  const fullPositions = lines.map((_, index) => {
    const line = named(baseline.stage, `Code line ${index + 1}`).props;
    return [line.x, line.y, line.width, line.height];
  });
  assert.ok(named(baseline.stage, "Code line 5"), "omitted limit keeps all legacy lines visible"); baseline.dispose();
  const [limit, setLimit] = createSignal<number | undefined>(2);
  const {stage, dispose} = mount(() => CodeWalkthrough({title: "Read, then apply", lines, highlightedLines: [5], get visibleThroughLine() { return limit(); }}));
  assert.doesNotMatch(content(stage), /AUTHORED EXPECTED/);
  assert.equal(content(named(stage, "Code line 2")), "    return m * a  ");
  assert.equal(all(stage).some(node => node.props.name === "Code line 5 marker"), false);
  for (const value of [4, 5, 1, 3, undefined, 2]) {
    setLimit(value);
    const count = value ?? lines.length;
    assert.equal(all(stage).filter(node => /^Code line \d+$/.test(node.props.name ?? "")).length, count);
    for (let index = 0; index < count; index++) {
      const line = named(stage, `Code line ${index + 1}`).props;
      assert.deepEqual([line.x, line.y, line.width, line.height], fullPositions[index]);
      assert.ok(Number.isFinite(line.x) && Number.isFinite(line.y) && line.width > 0 && line.height > 0);
    }
    if (count < lines.length) assert.doesNotMatch(content(stage), /AUTHORED EXPECTED/);
  }
  dispose();
});

test("code validates hidden lines, indices and full-row fit before a later reveal", () => {
  for (const visibleThroughLine of [0, -1, 3, 1.5, NaN, Infinity, null, "1"]) {
    assert.throws(() => mount(untyped(CodeWalkthrough, {title: "Title", lines: ["first", "second"], visibleThroughLine})), /visibleThroughLine/);
  }
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["first", "hidden\nline"], visibleThroughLine: 1})), /Code line 2 must be a literal single line/);
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["first", "x".repeat(200)], visibleThroughLine: 1})), /Code line 2 does not fit/);
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["first", "\t".repeat(100)], visibleThroughLine: 1})), /Code line 2 does not fit/);
  const [lines, setLines] = createSignal<readonly string[]>(["first", "second"]);
  const {dispose} = mount(() => CodeWalkthrough({title: "Changing line count", get lines() { return lines(); }, visibleThroughLine: 2}));
  assert.throws(() => setLines(["first"]), /visibleThroughLine/);
  dispose();
});

test("quiz keeps answers and explanation hidden until the authored index is revealed", () => {
  const [answer, setAnswer] = createSignal<number | undefined>();
  const {stage, dispose} = mount(() => QuizCard({question: "Choose the authored answer.", choices: ["First", "Second"], explanation: "Caller explanation.", get answerIndex() { return answer(); }}));
  assert.equal(all(stage).some(n => n.props.name === "Quiz answer label" || n.props.name === "Quiz explanation"), false);
  setAnswer(1);
  assert.equal(named(stage, "Choice 2 marker").props.fill, EDUCATION_THEME.success);
  assert.equal(named(stage, "Choice 1 marker").props.fill, EDUCATION_THEME.muted);
  assert.equal(content(named(stage, "Quiz answer label")), "Answer");
  assert.equal(content(named(stage, "Quiz explanation")), "Caller explanation.");
  setAnswer(undefined);
  assert.equal(all(stage).some(n => n.props.name === "Quiz answer label" || n.props.name === "Quiz explanation"), false); dispose();
});

test("clock-driven selections preserve native entity identity until the semantic selection changes", () => {
  const cases = [
    (time: () => number) => WorkedExample({title: "Stable steps", steps, get activeStep() { return time() < 10 ? 0 : 1; }}),
    (time: () => number) => WorkedExample({title: "Stable progressive steps", steps, revealThroughActive: true, get activeStep() { return time() < 10 ? 0 : 1; }}),
    (time: () => number) => CodeWalkthrough({title: "Stable code", lines: ["first();", "second();", "third();"], get highlightedLines() { return time() < 10 ? (Math.floor(time()) % 2 ? [2, 1] : [1, 2]) : [3]; }}),
    (time: () => number) => CodeWalkthrough({title: "Stable staged code", lines: ["first();", "second();", "third();"], get visibleThroughLine() { return time() < 10 ? 1 : 3; }}),
    (time: () => number) => QuizCard({question: "Stable question", choices: ["First", "Second"], get answerIndex() { return time() < 10 ? undefined : 1; }}),
  ];
  for (const example of cases) {
    const [time, setTime] = createSignal(0);
    const {stage, created, dispose} = mount(() => example(time));
    const originalText = all(stage).filter(node => node.tag === "Text"), initialCount = {...created};
    for (let tick = 1; tick < 100; tick++) setTime(tick / 10);
    assert.deepEqual(created, initialCount);
    const unchangedText = all(stage).filter(node => node.tag === "Text");
    assert.equal(unchangedText.length, originalText.length);
    unchangedText.forEach((node, index) => assert.equal(node, originalText[index]));
    setTime(10);
    assert.ok(created.elements > initialCount.elements, "a real selection transition updates native content");
    const updatedText = all(stage).filter(node => node.tag === "Text"), updatedCount = {...created};
    for (let tick = 101; tick <= 200; tick++) setTime(tick / 10);
    assert.deepEqual(created, updatedCount);
    all(stage).filter(node => node.tag === "Text").forEach((node, index) => assert.equal(node, updatedText[index]));
    dispose();
  }
});

test("sparse arrays with extra properties or inherited entries cannot skip validation", () => {
  const sparseSteps = [steps[0], , steps[2]]; Object.assign(sparseSteps, {extra: steps[1]});
  const sparseLines = ["line one", , "line three"]; Object.assign(sparseLines, {extra: "not line two"});
  const sparseChoices = ["one", , "three"]; Object.assign(sparseChoices, {extra: "not two"});
  const sparseHighlights = new Array(1); Object.assign(sparseHighlights, {extra: 1});
  assert.throws(() => mount(untyped(WorkedExample, {title: "Title", steps: sparseSteps})), /complete indexed/);
  assert.throws(() => mount(untyped(CodeWalkthrough, {title: "Title", lines: sparseLines})), /complete indexed/);
  assert.throws(() => mount(untyped(QuizCard, {question: "Question", choices: sparseChoices})), /complete indexed/);
  assert.throws(() => mount(untyped(CodeWalkthrough, {title: "Title", lines: ["x"], highlightedLines: sparseHighlights})), /complete indexed/);
  const inherited = ["one", "two"]; delete inherited[1]; Object.setPrototypeOf(inherited, Object.assign(Object.create(Array.prototype), {1: "inherited"}));
  assert.throws(() => mount(untyped(QuizCard, {question: "Question", choices: inherited})), /complete indexed/);
});

test("quiz Answer badge stays on one line at fontSize 29 and small supported fonts", () => {
  for (const fontSize of [8, 16, 28, 29, 32]) {
    const {stage, dispose} = mount(() => QuizCard({fontSize, question: "Choose 2.", choices: ["1", "2", "3", "4"], answerIndex: 1, explanation: "Authored answer."}));
    const root = stage.children[0], badge = named(stage, "Quiz answer label");
    assert.equal(content(badge), "Answer", `fontSize ${fontSize}`);
    assert.ok(badge.props.width >= badge.props.fontSize * 1.1 * 6);
    for (const node of all(root).filter(n => n.tag === "Text" || n.tag === "Rect")) {
      assert.ok(node.props.width > 0 && node.props.height > 0, node.props.name);
      assert.ok(node.props.x >= 0 && node.props.x + node.props.width <= root.props.width + .001, node.props.name);
      assert.ok(node.props.y >= 0 && node.props.y + node.props.height <= root.props.height + .001, node.props.name);
    }
    dispose();
  }
});

test("invalid counts, authored indices and malformed content fail with field errors", () => {
  assert.throws(() => mount(() => WorkedExample({title: "Title", steps: []})), /WorkedExample.steps/);
  assert.throws(() => mount(() => WorkedExample({title: "Title", steps: [...steps, steps[0]]})), /WorkedExample.steps/);
  for (const activeStep of [-1, 4, 1.5, NaN, null]) assert.throws(() => mount(untyped(WorkedExample, {title: "Title", steps, activeStep})), /activeStep/);
  assert.throws(() => mount(untyped(WorkedExample, {title: "Title", steps: [null]})), /step object/);
  assert.throws(() => mount(untyped(WorkedExample, {title: "Title", steps, revealThroughActive: "true"})), /revealThroughActive must be boolean/);
  assert.throws(() => mount(() => WorkedExample({title: "Title", revealThroughActive: true, steps: [steps[0], {label: "Later", expression: ""}]})), /Step 2 expression/);
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: []})), /CodeWalkthrough.lines/);
  for (const highlightedLines of [[0], [2], [1.5], [1, 1], [NaN]]) assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["x"], highlightedLines})), /highlightedLines/);
  for (const choices of [["one"], ["1", "2", "3", "4", "5"]]) assert.throws(() => mount(() => QuizCard({question: "Question", choices})), /QuizCard.choices/);
  for (const answerIndex of [-1, 2, 0.5, Infinity, null]) assert.throws(() => mount(untyped(QuizCard, {question: "Question", choices: ["one", "two"], answerIndex})), /answerIndex/);
  assert.throws(() => mount(() => LessonCard({title: "", body: "Body"})), /Lesson title/);
  assert.throws(() => mount(() => QuizCard({question: "Question", choices: ["one", ""]})), /Choice 2/);
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["one\ntwo"]})), /literal single line/);
});

test("long text and narrow code boxes fail instead of silently overflowing or wrapping code", () => {
  assert.throws(() => mount(() => LessonCard({title: "Title", body: "word ".repeat(2000)})), /Lesson body/);
  assert.throws(() => mount(() => WorkedExample({title: "Title", steps: [{label: "A", expression: "x".repeat(1000)}]})), /expression needs/);
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["x".repeat(200)]})), /does not fit without wrapping/);
  assert.throws(() => mount(() => CodeWalkthrough({title: "Title", lines: ["\t".repeat(100)]})), /does not fit without wrapping/);
  assert.throws(() => mount(() => QuizCard({question: "Question", choices: ["word ".repeat(500), "Two"]})), /Choice 1 needs/);
});

test("frozen caller arrays and theme are never mutated", () => {
  const inputs = Object.freeze({title: "Read the code", lines: Object.freeze(["  x += 1;  "]), highlightedLines: Object.freeze([1]), theme: Object.freeze({accent: "#112233"})});
  const {stage, dispose} = mount(() => CodeWalkthrough(inputs));
  assert.equal(content(named(stage, "Code line 1")), "  x += 1;  ");
  assert.equal(named(stage, "Code line 1 marker").props.fill, "#112233");
  assert.equal(EDUCATION_THEME.accent, "#54D6C7"); dispose();
});
