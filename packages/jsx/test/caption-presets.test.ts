import assert from "node:assert/strict";
import test from "node:test";
import { createSignal } from "solid-js";
import type { JSX } from "solid-js";
import { CaptionTrack, captionSafeLayout, getCaptionTrackState, layoutCaptionText, validateCaptionTrackOptions, MAX_CAPTION_CUES, MAX_CAPTION_WORDS } from "../src/caption-presets";
import type { CaptionCue } from "../src/caption-presets";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";

type Node = {tag: string; props: Record<string, any>; children: Node[]; parent?: Node};
function mount(component: () => JSX.Element) {
  const [time, setTime] = createSignal(0);
  const stage: Node = {tag: "stage", props: {}, children: []}, counts = {created: 0, writes: 0};
  const document: ProjectDocument<Node> = {
    stage, tick: () => ({time: time(), frame: Math.floor(time() * 30), delta: 0, playing: false}),
    createElement: tag => {counts.created++; return {tag, props: {}, children: []};},
    createTextNode: value => {counts.created++; return {tag: "#text", props: {text: value}, children: []};},
    replaceText: (node, value) => {counts.writes++; node.props.text = value;}, isTextNode: node => node.tag === "#text",
    setProperty: (node, name, value) => {if (node.tag === "Text" && name === "color") throw Error("Native Text needs fill"); counts.writes++; node.props[name] = value;},
    insertNode(parent, node, anchor) {if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, node); node.parent = parent;},
    removeNode(parent, node) {parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined;},
    getParentNode: node => node.parent, getFirstChild: node => node.children[0], getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
  };
  return {stage, counts, setTime, dispose: renderProject(component, document)};
}
function all(node: Node): Node[] {return [node, ...node.children.flatMap(all)];}
function named(node: Node, name: string): Node {const found = all(node).find(node => node.props.name === name); assert.ok(found, name); return found;}
function content(node: Node): string {return node.tag === "#text" ? node.props.text : node.children.map(content).join("");}
const cues: readonly CaptionCue[] = Object.freeze([Object.freeze({text: "Hello, world!\nKeep it.", start: 0, end: 2, words: Object.freeze([
  Object.freeze({text: "Hello,", start: 0, end: .5}), Object.freeze({text: "world!", start: .5, end: 1}),
  Object.freeze({text: "Keep", start: 1, end: 1.5}), Object.freeze({text: "it.", start: 1.5, end: 2}),
])})]);

test("caption safe layout reserves bottom/right social context and returns a reusable protected region", () => {
  const portrait = captionSafeLayout({width: 1080, height: 1920});
  assert.equal(portrait.x, 1080 * .067); assert.equal(portrait.width, 1080 * (1 - .067 - .15));
  assert.ok(portrait.y > 1300 && portrait.y + portrait.height < 1600);
  assert.equal(portrait.protectedArea.x, portrait.x); assert.equal(portrait.protectedArea.height, portrait.height);
  assert.ok(Object.isFrozen(portrait) && Object.isFrozen(portrait.insets) && Object.isFrozen(portrait.protectedArea));
  const top = captionSafeLayout({width: 1080, height: 1920, position: "top", insets: {top: 200, left: 100}});
  assert.equal(top.y, 200); assert.equal(top.x, 100);
  const landscape = captionSafeLayout({width: 1920, height: 1080});
  assert.equal(landscape.fontSize, 44); assert.equal(landscape.x, 96); assert.equal(landscape.y + landscape.height, 972);
});

test("safe layout rejects nonfinite, unsupported or impossible dimensions and inset budgets", () => {
  for (const invalid of [{width: NaN}, {height: Infinity}, {width: 0}, {height: 1}, {width: 1000.5}, {width: 8192, height: 8192},
    {fontSize: 0}, {maxLines: 4}, {maxLines: 1.5}, {padding: -1}, {insets: {bottom: 1800}}, {insets: {left: 1080}}, {insets: {future: 1}}, {position: "middle"}]) {
    assert.throws(() => Reflect.apply(captionSafeLayout, undefined, [{width: 1080, height: 1920, ...invalid}]));
  }
});

test("prepared cues preserve literal case, punctuation and newlines and snapshot caller arrays", () => {
  const original = [{text: "Don't stop...\nOkay?", start: 0, end: 2, words: [{text: "Don't", start: 0, end: .5}, {text: "stop...", start: .5, end: 1}, {text: "Okay?", start: 1, end: 2}]}];
  const prepared = validateCaptionTrackOptions({cues: original, preset: "karaoke"});
  assert.equal(prepared.cues[0].text, "Don't stop...\nOkay?");
  assert.deepEqual(prepared.cues[0].lines.map(line => line.text), ["Don't stop...", "Okay?"]);
  assert.deepEqual(prepared.cues[0].words.map(word => word.text), ["Don't", "stop...", "Okay?"]);
  original[0].text = "Changed"; original[0].words[0].text = "Changed";
  assert.equal(prepared.cues[0].text, "Don't stop...\nOkay?"); assert.equal(prepared.cues[0].words[0].text, "Don't");
  assert.ok(Object.isFrozen(prepared.cues) && Object.isFrozen(prepared.cues[0].lines) && Object.isFrozen(prepared.cues[0].words[0]));
});

test("caption layout wraps only authored whitespace, preserves all characters and honors measured word positions", () => {
  const text = "One, two!\nThree?";
  const lines = layoutCaptionText(text, {width: 240, height: 180, fontSize: 20, padding: 10, maxLines: 3, textAlign: "center"}, value => value.length * 10);
  assert.deepEqual(lines.map(line => line.text), ["One, two!", "Three?"]);
  assert.equal(lines[0].x, 75); assert.equal(lines[1].x, 90);
  const prepared = validateCaptionTrackOptions({cues, preset: "karaoke"}, value => value.length * 20);
  const words = prepared.cues[0].words;
  assert.equal(words[1].x - words[0].x, "Hello, ".length * 20);
  assert.equal(words[2].y - words[0].y, prepared.fontSize * 1.35);
  const wrapped = layoutCaptionText("A B C", {width: 90, height: 120, fontSize: 20, padding: 10, maxLines: 3, textAlign: "left"}, value => value.length * 20);
  assert.equal(wrapped.map(line => line.text).join(""), "A B C");
  assert.throws(() => layoutCaptionText("unbreakable", {width: 80, height: 120, fontSize: 20, padding: 10, maxLines: 2, textAlign: "left"}), /does not fit/);
  assert.throws(() => layoutCaptionText("A\nB\nC", {width: 300, height: 120, fontSize: 20, padding: 10, maxLines: 2, textAlign: "left"}), /line\/height budget/);
  assert.throws(() => layoutCaptionText("A", {width: NaN, height: 120, fontSize: 20, padding: 10, maxLines: 2, textAlign: "left"}));
  assert.throws(() => validateCaptionTrackOptions({cues}, () => NaN), /measured width/);
});

test("cue and word clocks translate once and use half-open ends through gaps and reverse seeks", () => {
  const options = validateCaptionTrackOptions({start: "60f", preset: "karaoke", cues: [{text: "Hello, world!", start: 1, end: 3, words: [{text: "Hello,", start: 1, end: 1.5}, {text: "world!", start: 2, end: 2.5}]}]});
  for (const [frame, expected] of [[89, [-1, -1]], [90, [0, 0]], [104, [0, 0]], [105, [0, -1]], [120, [0, 1]], [134, [0, 1]], [135, [0, -1]], [149, [0, -1]], [150, [-1, -1]], [1000, [-1, -1]], [90, [0, 0]]] as const) {
    const state = getCaptionTrackState(options, frame); assert.deepEqual([state.cueIndex, state.wordIndex], expected);
  }
  assert.throws(() => getCaptionTrackState(options, NaN), /finite/);
});

test("invalid cue order, rounded overlap, clocks, box, colors and unknown fields fail before authoring", () => {
  const bad: unknown[] = [
    {cues: []}, {cues: Array(501).fill(cues[0])}, {cues: [{text: "A", start: 0, end: 0}]}, {cues: [{text: "A", start: -1, end: 1}]},
    {cues: [{text: "A", start: "1s", end: 2}]}, {cues: [{text: "A", start: NaN, end: 1}]}, {cues: [{text: "A", start: 0, end: 1}, {text: "B", start: .5, end: 2}]},
    {cues: [{text: "A", start: 0, end: .054}, {text: "B", start: .049, end: 1}]}, {cues: [{text: " ", start: 0, end: 1}]},
    {cues, preset: "giant"}, {cues, duration: 1}, {cues, start: 3599}, {cues, x: -1}, {cues, x: 1900}, {cues, height: 10},
    {cues, textColor: "white"}, {cues, backgroundOpacity: 2}, {cues, fontFamily: "Arial\nOther"}, {cues, textAlign: "right"},
    {cues, sourceIn: 2}, {cues: [{text: "A", start: 0, end: 1, confidence: 1}]},
  ];
  for (const props of bad) assert.throws(() => Reflect.apply(validateCaptionTrackOptions, undefined, [props]));
});

test("complete own cue/word indices are required even when arrays have extra or inherited entries", () => {
  const sparse = new Array(2); sparse[1] = cues[0]; Object.assign(sparse, {extra: cues[0]});
  const inherited = new Array(1); Object.setPrototypeOf(inherited, {0: cues[0]});
  for (const bad of [sparse, inherited]) assert.throws(() => Reflect.apply(validateCaptionTrackOptions, undefined, [{cues: bad}]), /complete own/);
  const words = new Array(1); Object.setPrototypeOf(words, {0: {text: "A", start: 0, end: 1}});
  assert.throws(() => Reflect.apply(validateCaptionTrackOptions, undefined, [{preset: "karaoke", cues: [{text: "A", start: 0, end: 1, words}]}]), /complete own/);
});

test("karaoke requires complete literal words and authored, ordered, in-cue timings", () => {
  const bad = [undefined, [], [{text: "Hello", start: 0, end: 1}], [{text: "hello,", start: 0, end: 1}, {text: "world!", start: 1, end: 2}],
    [{text: "Hello, world!", start: 0, end: 2}], [{text: "Hello,", start: 0, end: 1}, {text: "world!", start: .5, end: 2}],
    [{text: "Hello,", start: 0, end: .001}, {text: "world!", start: 1, end: 2}], [{text: "Hello,", start: 0, end: 1}, {text: "world!", start: 1, end: 3}],
    [{text: "Hello,", start: 0, end: 1, probability: 1}, {text: "world!", start: 1, end: 2}],
  ];
  for (const words of bad) assert.throws(() => Reflect.apply(validateCaptionTrackOptions, undefined, [{preset: "karaoke", cues: [{text: "Hello, world!", start: 0, end: 2, words}]}]));
  assert.throws(() => validateCaptionTrackOptions({preset: "karaoke", cues: [{text: "A", start: 1, end: 2, words: [{text: "A", start: 0, end: .5}]}]}), /share the track clock/);
  const many: CaptionCue[] = Array.from({length: MAX_CAPTION_CUES}, (_, index) => ({text: "a a a a a a a a a", start: index, end: index + 1, words: Array.from({length: 9}, (_, word) => ({text: "a", start: index + word / 10, end: index + (word + 1) / 10}))}));
  assert.ok(many.length * 9 > MAX_CAPTION_WORDS);
  assert.throws(() => validateCaptionTrackOptions({preset: "karaoke", cues: many}), /caption words exceed/);
});

test("clean/boxed tracks create editable native text with explicit cue-local lifetimes and literal lines", () => {
  for (const preset of ["clean", "boxed"] as const) {
    const {stage, dispose} = mount(() => CaptionTrack({cues, preset, start: 2}));
    const root = stage.children[0]; assert.equal(root.props.start, "60f"); assert.equal(root.props.end, "120f");
    assert.ok(all(stage).every(node => ["stage", "Group", "Rect", "Text", "#text"].includes(node.tag)));
    assert.equal(content(named(stage, "Caption 1 line 1")), "Hello, world!"); assert.equal(content(named(stage, "Caption 1 line 2")), "Keep it.");
    for (const leaf of all(stage).filter(node => node.tag === "Text" || node.tag === "Rect")) {
      assert.equal(leaf.props.start, "0f"); assert.equal(leaf.props.end, "60f"); assert.ok(leaf.props.x >= 0 && leaf.props.y >= 0);
      assert.ok(leaf.props.x + leaf.props.width <= root.props.width && leaf.props.y + leaf.props.height <= root.props.height + .001);
    }
    assert.equal(all(stage).filter(node => node.tag === "Rect").length, preset === "boxed" ? 1 : 0);
    dispose();
  }
});

test("authored captions past sixteen seconds remain timed and editable through their final frame", () => {
  const {stage, dispose} = mount(() => CaptionTrack({start: 3, duration: 22, cues: [{text: "Earlier.", start: 0, end: 1}, {text: "Still here.", start: 18, end: 22}]}));
  assert.equal(stage.children[0].props.end, "750f");
  assert.equal(named(stage, "Caption cue 2").props.start, "540f"); assert.equal(named(stage, "Caption cue 2").props.end, "660f");
  assert.equal(named(stage, "Caption 2 line 1").props.end, "120f");
  assert.equal(content(named(stage, "Caption 2 line 1")), "Still here."); dispose();
});

test("karaoke follows direct/reverse seeks, preserves node identity and stops updates on disposal", () => {
  const {stage, counts, setTime, dispose} = mount(() => CaptionTrack({cues, preset: "karaoke", start: 2}));
  const first = named(stage, "Caption 1 word 1"), second = named(stage, "Caption 1 word 2");
  assert.equal(first.props.fill, "#FFFFFF"); setTime(2); assert.equal(first.props.fill, "#54D6C7");
  const settled = {...counts};
  for (let frame = 1; frame < 15; frame++) setTime(2 + frame / 30);
  assert.deepEqual(counts, settled, "unchanged spoken word causes no native writes or rebuilds");
  setTime(2.5); assert.equal(first.props.fill, "#FFFFFF"); assert.equal(second.props.fill, "#54D6C7");
  assert.equal(named(stage, "Caption 1 word 1"), first); assert.equal(counts.created, settled.created);
  setTime(4); assert.equal(second.props.fill, "#FFFFFF"); setTime(2); assert.equal(first.props.fill, "#54D6C7");
  assert.equal(named(stage, "Caption 1 word 1"), first);
  dispose(); const after = {...counts}; setTime(2.5); assert.deepEqual(counts, after);
});

test("authored cue/color changes remain reactive without replacing their clock origin", () => {
  const [words, setWords] = createSignal<readonly CaptionCue[]>(cues), [fill, setFill] = createSignal("#123456");
  const {stage, setTime, dispose} = mount(() => CaptionTrack({get cues() {return words();}, get textColor() {return fill();}, start: 3}));
  setTime(3.5); setFill("#654321"); assert.equal(named(stage, "Caption 1 line 1").props.fill, "#654321");
  setWords([{text: "Corrected, literally.", start: 0, end: 2}]);
  assert.equal(content(named(stage, "Caption 1 line 1")), "Corrected, literally.");
  assert.equal(stage.children[0].props.start, "90f"); assert.equal(stage.children[0].props.end, "150f"); dispose();
});
