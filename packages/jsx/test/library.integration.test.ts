import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignal } from "solid-js";
import { Effects, FilmLook, compileEffects, filmLook, vignette, grain, motion, PATCH_PROP_KEYS } from "../src/index";
import { renderProject } from "../src/renderer";
import type { ProjectDocument } from "../src/document";

type Node = { tag: string; props: Record<string, unknown>; children: Node[]; parent?: Node };
function host(): ProjectDocument<Node> {
  const stage: Node = { tag: "stage", props: {}, children: [] };
  return {
    stage,
    createElement: tag => ({ tag, props: {}, children: [] }),
    createTextNode: text => ({ tag: "#text", props: { text }, children: [] }),
    replaceText: (node, text) => { node.props.text = text; },
    isTextNode: node => node.tag === "#text",
    setProperty: (node, name, value) => { node.props[name] = value; },
    insertNode(parent, node, anchor) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      const at = anchor ? parent.children.indexOf(anchor) : -1;
      parent.children.splice(at < 0 ? parent.children.length : at, 0, node);
      node.parent = parent;
    },
    removeNode(parent, node) { parent.children.splice(parent.children.indexOf(node), 1); node.parent = undefined; },
    getParentNode: node => node.parent,
    getFirstChild: node => node.children[0],
    getNextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
  };
}

test("public effect component creates one native paint and updates knobs without changing its shader", () => {
  const document = host();
  const [strength, setStrength] = createSignal(0.2);
  const dispose = renderProject(() => Effects({ get effects() { return [vignette({ strength: strength() }), grain({ amount: 0.15 })]; } }), document);
  assert.equal(document.stage.children.length, 1);
  const paint = document.stage.children[0];
  assert.equal(paint.tag, "ShaderPaint");
  const code = paint.props.wgsl;
  const firstUniforms = structuredClone(paint.props.uniforms);
  setStrength(0.8);
  assert.equal(document.stage.children[0], paint);
  assert.equal(paint.props.wgsl, code);
  assert.notDeepEqual(paint.props.uniforms, firstUniforms);
  assert.deepEqual(paint.props.uniforms, compileEffects([vignette({ strength: 0.8 }), grain({ amount: 0.15 })]).uniforms);
  dispose();
});

test("FilmLook convenience component uses defaults and reacts through the same compiled stack", () => {
  const document = host();
  const [warmth, setWarmth] = createSignal(0.1);
  const dispose = renderProject(() => FilmLook({ get warmth() { return warmth(); } }), document);
  const paint = document.stage.children[0];
  assert.deepEqual(paint.props.uniforms, compileEffects([filmLook({ warmth: 0.1 })]).uniforms);
  setWarmth(-0.4);
  assert.deepEqual(paint.props.uniforms, compileEffects([filmLook({ warmth: -0.4 })]).uniforms);
  dispose();
});

test("motion presets only author accepted native patch properties including scale", () => {
  const accepted = new Set(PATCH_PROP_KEYS);
  for (const preset of [motion.popIn(), motion.captionPop(), motion.slideIn(), motion.fadeIn(), motion.fadeOut({ at: 1 }), motion.slowZoom({ duration: 4 }), motion.float({ duration: 4 })]) {
    for (const property of Object.keys(preset)) assert.ok(accepted.has(property as keyof typeof preset), property);
  }
});
