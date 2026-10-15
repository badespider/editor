import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import { ChapterCard, LowerThird, SourceCard, QuoteCard, Timeline, EvidenceCallout, DOCUMENTARY_THEME, wrapDocumentaryText } from "../src/documentary";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";
import type { JSX } from "solid-js";

type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(component: () => JSX.Element) {
  const stage: Node = {tag: "stage", props: {}, children: []};
  const created = {elements: 0, textNodes: 0};
  const document: ProjectDocument<Node> = {
    stage, createElement: tag => { created.elements++; return {tag, props: {}, children: []}; }, createTextNode: text => { created.textNodes++; return {tag: "#text", props: {text}, children: []}; },
    replaceText: (node, value) => { node.props.text = value; }, isTextNode: node => node.tag === "#text",
    setProperty: (node, name, value) => { node.props[name] = value; },
    insertNode(parent, node, anchor) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent; },
    removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; },
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
  };
  const dispose = renderProject(component, document);
  return {stage, created, dispose};
}
function all(node: Node): Node[] { return [node, ...node.children.flatMap(all)]; }
function named(node: Node, name: string): Node { const result = all(node).find(n => n.props.name === name); assert.ok(result, name); return result; }
function content(node: Node): string { return node.tag === "#text" ? node.props.text : node.children.map(content).join(""); }

const examples = [
  () => ChapterCard({chapter: "01", title: "A turning point", subtitle: "The record begins here."}),
  () => LowerThird({name: "Alex Morgan", role: "Researcher", source: "Interview, 2025"}),
  () => SourceCard({title: "Public record", source: "City archive", detail: "Meeting minutes", date: "2025-06-01", url: "https://example.org/record"}),
  () => QuoteCard({quote: "The whole record matters.", attribution: "Alex Morgan", source: "Interview transcript"}),
  () => Timeline({title: "The sequence", events: [{date: "2020", title: "Opened", detail: "First stage"}, {date: "2024", title: "Revised", detail: "Second stage"}]}),
  () => EvidenceCallout({target: {x: 800, y: 400, width: 280, height: 180}, label: "Visible detail", detail: "Caller-authored note", source: "Document page 4"}),
];

test("all six components create editable native geometry/text and explicit finite lifetimes", () => {
  for (const example of examples) {
    const {stage, dispose} = mount(example);
    const root = stage.children[0];
    assert.equal(root.tag, "Group");
    assert.equal(root.props.start, "0f"); assert.equal(root.props.end, "180f");
    assert.ok(all(root).some(n => n.tag === "Text"));
    assert.ok(all(root).every(n => ["Group", "Rect", "Text", "#text"].includes(n.tag)));
    for (const node of all(root).filter(n => n.tag === "Text" || n.tag === "Rect")) {
      assert.equal(node.props.start, "0f"); assert.equal(node.props.end, "180f");
      assert.ok(node.props.x >= 0 && node.props.y >= 0);
      const width = Array.isArray(node.props.width) ? node.props.width.at(-1).value : node.props.width;
      assert.ok(width >= 0 && node.props.x + width <= root.props.width + .001, node.props.name);
      assert.ok(node.props.height > 0 && node.props.y + node.props.height <= root.props.height + .001, node.props.name);
    }
    dispose();
  }
});

test("source and quotation provenance is caller text, retained in editable Text nodes", () => {
  const source = mount(() => SourceCard({title: "Record", source: "County archive", date: "2024", url: "https://example.org"}));
  assert.equal(content(named(source.stage, "Source provenance")), "County archive");
  assert.equal(content(named(source.stage, "Source date and URL")).replace(/\n/g, " "), "2024 • https://example.org");
  source.dispose();
  const quote = mount(() => QuoteCard({quote: "Exact quoted words.", attribution: "Named speaker", source: "Provided transcript"}));
  assert.equal(content(named(quote.stage, "Quoted text")), "Exact quoted words.");
  assert.equal(content(named(quote.stage, "Quote attribution")), "Named speaker");
  quote.dispose();
});

test("native Text uses fill paints, never the paint-only color property", () => {
  for (const example of examples) {
    const {stage, dispose} = mount(example);
    for (const node of all(stage).filter(node => node.tag === "Text")) {
      assert.equal(Object.hasOwn(node.props, "color"), false, node.props.name);
      assert.match(node.props.fill, /^#[\da-f]{6}$/i, node.props.name);
    }
    dispose();
  }
  const {stage, dispose} = mount(() => ChapterCard({chapter: "01", title: "A chapter", subtitle: "Context", theme: {text: "#112233", accent: "#445566", muted: "#778899"}}));
  assert.equal(named(stage, "Chapter title").props.fill, "#112233");
  assert.equal(named(stage, "Chapter label").props.fill, "#445566");
  assert.equal(named(stage, "Chapter subtitle").props.fill, "#778899");
  dispose();
});

test("wrapping preserves long words and URLs instead of dropping text", () => {
  const original = "https://example.org/a/very/long/path";
  const wrapped = wrapDocumentaryText(original, {width: 110, fontSize: 20, maxLines: 10});
  assert.equal(wrapped.replace(/\n/g, ""), original);
  assert.ok(wrapped.split("\n").every(line => Array.from(line).length <= 5));
  assert.equal(wrapDocumentaryText("One two\nThree", {width: 220, fontSize: 20, maxLines: 2}), "One two\nThree");
  assert.throws(() => wrapDocumentaryText("This will not fit", {width: 44, fontSize: 20, maxLines: 1}), /needs.*lines/);
  assert.throws(() => mount(() => ChapterCard({title: "W".repeat(1000)})), /Chapter title needs/);
});

test("timing accepts frames/seconds, gives all text the local duration and can disable motion", () => {
  const {stage, dispose} = mount(() => ChapterCard({title: "A chapter", start: 2, duration: "90f", animate: false}));
  const root = stage.children[0];
  assert.equal(root.props.start, "60f"); assert.equal(root.props.end, "150f");
  assert.equal(root.props.opacity, 1); assert.equal(root.props.offsetY, 0);
  assert.equal(named(stage, "Chapter title").props.end, "90f");
  assert.equal(typeof named(stage, "Chapter underline").props.width, "number");
  dispose();
  const explicit = mount(() => LowerThird({name: "Name", start: "30f", end: 3}));
  assert.equal(explicit.stage.children[0].props.end, "90f");
  assert.equal(named(explicit.stage, "Speaker name").props.end, "60f"); explicit.dispose();
});

test("animated cards use local native tracks and one-frame cards stay visible", () => {
  const animated = mount(() => ChapterCard({title: "Title", duration: "3f"}));
  assert.deepEqual(animated.stage.children[0].props.opacity, [{time: "0f", value: 0, easing: "easeOut"}, {time: "2f", value: 1}]);
  assert.equal(named(animated.stage, "Chapter underline").props.width.at(-1).time, "2f"); animated.dispose();
  const one = mount(() => LowerThird({name: "Name", duration: "1f"}));
  assert.equal(one.stage.children[0].props.opacity, 1); one.dispose();
});

test("theme and position/size overrides do not mutate the shared defaults", () => {
  const overrides = Object.freeze({accent: "#FF0000", fontFamily: "Arial"});
  const {stage, dispose} = mount(() => LowerThird({name: "Name", x: 12, y: 20, width: 900, height: 240, theme: overrides}));
  assert.equal(stage.children[0].props.x, 12); assert.equal(stage.children[0].props.width, 900);
  assert.equal(named(stage, "Lower third accent").props.fill, "#FF0000");
  assert.equal(DOCUMENTARY_THEME.accent, "#F47B39"); assert.ok(Object.isFrozen(DOCUMENTARY_THEME)); dispose();
});

test("timeline activeIndex updates native event emphasis without inventing dates", () => {
  const [active, setActive] = createSignal(0);
  const {stage, dispose} = mount(() => Timeline({events: [{date: "1999", title: "First"}, {date: "2004", title: "Next"}], get activeIndex() { return active(); }}));
  assert.equal(named(stage, "Event 1 marker").props.fill, DOCUMENTARY_THEME.accent);
  setActive(1);
  assert.equal(named(stage, "Event 1 marker").props.fill, DOCUMENTARY_THEME.muted);
  assert.equal(named(stage, "Event 2 marker").props.fill, DOCUMENTARY_THEME.accent);
  assert.equal(content(named(stage, "Event 2 date")), "2004"); dispose();
});

test("timeline keeps native entity identity across clock ticks with the same selected event", () => {
  const [time, setTime] = createSignal(0);
  const [events, setEvents] = createSignal([{date: "1999", title: "First"}, {date: "2004", title: "Next"}]);
  const {stage, created, dispose} = mount(() => Timeline({ get events() { return events(); }, get activeIndex() { return time() < 10 ? 0 : 1; } }));
  const initialCount = {...created}, initialNodes = all(stage).filter(n => n.tag === "Text" || n.tag === "Rect");
  for (let i = 1; i < 100; i++) setTime(i / 10);
  assert.deepEqual(created, initialCount);
  assert.deepEqual(all(stage).filter(n => n.tag === "Text" || n.tag === "Rect"), initialNodes);
  setTime(10); assert.ok(created.elements > initialCount.elements);
  assert.equal(named(stage, "Event 2 marker").props.fill, DOCUMENTARY_THEME.accent);
  const nextCount = {...created}, nextMarker = named(stage, "Event 2 marker");
  for (let i = 101; i <= 200; i++) setTime(i / 10);
  assert.deepEqual(created, nextCount); assert.equal(named(stage, "Event 2 marker"), nextMarker);
  setEvents([{date: "1999", title: "Revised first"}, {date: "2004", title: "Revised next"}]);
  assert.equal(content(named(stage, "Event 2 title")), "Revised next", "authored content updates even without a selection change");
  setTime(0); assert.equal(named(stage, "Event 1 marker").props.fill, DOCUMENTARY_THEME.accent);
  assert.equal(content(named(stage, "Event 1 date")), "1999"); dispose();
});

test("evidence callout marks the supplied local rectangle and does not cover it with its label", () => {
  const target = Object.freeze({x: 700, y: 420, width: 320, height: 200});
  const {stage, dispose} = mount(() => EvidenceCallout({target, label: "Authored note"}));
  assert.deepEqual([named(stage, "Evidence top edge").props.x, named(stage, "Evidence top edge").props.y, named(stage, "Evidence top edge").props.width], [700, 420, 320]);
  const panel = named(stage, "Evidence label panel").props;
  assert.ok(panel.y + panel.height <= target.y || panel.y >= target.y + target.height);
  assert.equal(all(stage).filter(n => n.props.name?.startsWith("Evidence ") && n.props.name.endsWith("edge")).length, 4);
  dispose();
});

test("callout explicit side placements fit the box and preserve the authored target", () => {
  const right = mount(() => EvidenceCallout({target: {x: 250, y: 608, width: 970, height: 165}, label: "Source detail", labelPosition: "right"}));
  const rightPanel = named(right.stage, "Evidence label panel").props;
  assert.equal(rightPanel.x, 1236); assert.equal(rightPanel.x + rightPanel.width, 1916);
  assert.equal(rightPanel.y, 570.5); right.dispose();
  const left = mount(() => EvidenceCallout({target: {x: 800, y: 1000, width: 100, height: 80}, label: "Note", labelPosition: "left"}));
  const leftPanel = named(left.stage, "Evidence label panel").props;
  assert.equal(leftPanel.x, 104); assert.equal(leftPanel.y + leftPanel.height, 1080); left.dispose();
  assert.throws(() => mount(() => EvidenceCallout({target: {x: 800, y: 100, width: 800, height: 200}, label: "Note", labelPosition: "right"})), /labelPosition right/);
  assert.throws(() => mount(() => EvidenceCallout({target: {x: 100, y: 100, width: 100, height: 100}, label: "Note", labelPosition: "above"})), /labelPosition above/);
  assert.throws(() => mount(() => Reflect.apply(EvidenceCallout, undefined, [{target: {x: 100, y: 100, width: 100, height: 100}, label: "Note", labelPosition: "diagonal"}])), /labelPosition must/);
});

test("invalid geometry, timing, missing provenance and impossible callout placement fail clearly", () => {
  for (const props of [{width: 0}, {height: -1}, {x: NaN}, {duration: 0}, {duration: Infinity}, {start: -1}, {start: 3, end: 2}, {end: 5, duration: 2}]) assert.throws(() => mount(() => ChapterCard({title: "Title", ...props})));
  assert.throws(() => mount(() => SourceCard({title: "Record", source: ""})), /Source provenance/);
  assert.throws(() => mount(() => QuoteCard({quote: "Quote", attribution: ""})), /Quote attribution/);
  assert.throws(() => mount(() => LowerThird({name: "Name", theme: {accent: "red"}})), /#RRGGBB/);
  assert.throws(() => mount(() => Timeline({events: [{date: "2000", title: "One"}]})), /two to six/);
  const sparseEvents = [{date: "2000", title: "One"}, , {date: "2002", title: "Three"}];
  Object.assign(sparseEvents, {extra: {date: "2001", title: "Not an indexed event"}});
  assert.throws(() => mount(() => Reflect.apply(Timeline, undefined, [{events: sparseEvents}])), /two to six complete events/);
  assert.throws(() => mount(() => Timeline({events: [{date: "2000", title: "One"}, {date: "2001", title: "Two"}], activeIndex: 2})), /activeIndex/);
  assert.throws(() => mount(() => EvidenceCallout({target: {x: 0, y: 0, width: 1921, height: 100}, label: "Note"})), /must fit/);
  assert.throws(() => mount(() => EvidenceCallout({target: {x: 0, y: 0, width: 1920, height: 1080}, label: "Note"})), /needs room/);
});
