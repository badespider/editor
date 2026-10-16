import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { test } from "node:test";
import { nativeModule } from "./native-motion-host.ts";
import type { Mounted, NativeNode as Node } from "./native-motion-host.ts";
import { motionMoments, searchMotionMoments, getMotionMoment, buildMotionBrief, buildMotionModule } from "../src/motion-catalog.ts";
import type { MotionBuildOptions } from "../src/motion-catalog.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const options = (ids: string[], format: "landscape" | "portrait" = "landscape", mode: MotionBuildOptions["mode"] = "template"): MotionBuildOptions => ({momentIds: ids, format, mode});
function named(mount: Mounted, name: string): Node {
  const node = mount.nodes().find(node => node.props.name === name);
  assert.ok(node, `missing ${name}`); return node;
}
function content(node: Node): string { return node.tag === "#text" ? String(node.props.text) : node.children.map(content).join(""); }

test("native registry is immutable, searchable and links actual local guides/examples", () => {
  assert.equal(motionMoments.length, 30);
  assert.equal(new Set(motionMoments.map(item => item.id)).size, 30);
  for (const item of motionMoments) {
    assert.ok(Object.isFrozen(item)); assert.ok(Object.isFrozen(item.movementTags));
    assert.deepEqual(item.formats, ["landscape", "portrait"]);
    assert.deepEqual(item.origin, {kind: "editor-native", license: "MPL-2.0"});
    assert.ok(existsSync(resolve(repository, item.guidePath)), item.guidePath);
    assert.ok(existsSync(resolve(repository, item.examplePath)), item.examplePath);
  }
  assert.equal(getMotionMoment("@code-reveal").id, "code-reveal");
  assert.deepEqual(searchMotionMoments("@code-rev", "portrait").map(item => item.id), ["code-reveal"]);
  assert.deepEqual(searchMotionMoments("counter hold").map(item => item.id), ["stat-proof", "counter-reveal"]);
  assert.equal(searchMotionMoments("").length, 30);
  assert.throws(() => getMotionMoment("unknown"), /Unknown/);
});

test("brief preserves authored order and intent without pretending inspiration is mountable", () => {
  const brief = buildMotionBrief(options(["code-reveal", "question-reveal"], "portrait", "inspiration"));
  assert.equal(brief.referenceOnly, true); assert.equal(brief.mountable, false);
  assert.deepEqual(brief.moments.map(item => [item.id, item.start, item.end]), [["code-reveal", 0, 8], ["question-reveal", 8, 14]]);
  assert.equal(brief.source, "Authored example / source not supplied.");
  assert.equal(brief.canvas.width, 1080); assert.equal(brief.duration, 14);
  assert.ok(Object.isFrozen(brief.moments));
  assert.throws(() => buildMotionModule(options(["question-reveal"], "portrait", "inspiration")), /reference brief/);
});

test("invalid and ambiguous requests fail before code generation", () => {
  for (const request of [
    {momentIds: [], mode: "sequence", format: "portrait"},
    {momentIds: ["code-reveal", "code-reveal"], mode: "sequence", format: "portrait"},
    {momentIds: ["code-reveal", "stat-proof"], mode: "template", format: "portrait"},
    {momentIds: ["code-reveal"], mode: "automatic", format: "portrait"},
    {momentIds: ["code-reveal"], mode: "template", format: "square"},
    {...options(["code-reveal"]), sceneKey: "unsafe/scene"},
    {...options(["code-reveal"]), title: "x".repeat(73)},
    {...options(["code-reveal"]), body: "x".repeat(161)},
    {...options(["code-reveal"]), source: "x".repeat(97)},
    {...options(["code-reveal"]), unexpected: true},
  ]) assert.throws(() => buildMotionModule(request as MotionBuildOptions));
  const sparse: string[] = []; sparse.length = 2; sparse[1] = "code-reveal";
  Object.assign(sparse, {metadata: true});
  assert.throws(() => buildMotionModule(options(sparse, "portrait", "sequence")), /complete/);
  assert.throws(() => buildMotionModule({...options(["evidence-focus"], "portrait"), body: "unbreakable".repeat(10)}), /too wide/);
  assert.throws(() => searchMotionMoments("x".repeat(301)), /300/);
});

test("caller text remains data in executable ESM, with only the two host imports", async () => {
  const payload = '";throw Error("bad");//';
  const source = buildMotionModule({...options(["question-reveal"]), title: payload, sceneKey: "safe-scene"});
  assert.deepEqual(Array.from(source.matchAll(/from "([^"]+)"/g), match => match[1]), ["dapi-host:@diffusionstudio/jsx", "dapi-host:solid-js"]);
  assert.doesNotMatch(source, /from ["']https?:\/\/|Math\.random|Date\.|fetch\(/);
  const native = await nativeModule(source), mounted = native.mount();
  assert.equal(content(named(mounted, "question-reveal/title")).replace(/\s+/g, " "), payload);
  assert.equal(mounted.document.stage.children[0].props.scene, "safe-scene");
  mounted.dispose();
});

for (const format of ["landscape", "portrait"] as const) {
  test(`every ${format} template executes actual native components with explicit finite lifetime`, async () => {
    const failures:string[]=[];
    for (const item of motionMoments) {
      try {
      const source = buildMotionModule(options([item.id], format));
      const native = await nativeModule(source), mounted = native.mount();
      const root = mounted.document.stage.children[0];
      assert.equal(root.props.width, format === "portrait" ? 1080 : 1920);
      assert.equal(root.props.height, format === "portrait" ? 1920 : 1080);
      assert.equal(root.props.end, item.defaultDuration);
      assert.equal(named(mounted, `${item.id}/title`).props.fontSize, format === "portrait" ? 64 : 72);
      assert.equal(named(mounted, `${item.id}/source`).props.fontSize, format === "portrait" ? 28 : 20);
      for (const node of mounted.nodes().filter(node => ["Rect", "Text", "Surface", "Group"].includes(node.tag))) {
        assert.notEqual(node.props.end, undefined, `${item.id}: ${node.props.name ?? node.tag} end`);
        assert.notEqual(node.props.start, undefined, `${item.id}: ${node.props.name ?? node.tag} start`);
        if (node.tag === "Text") { assert.equal(node.props.color, undefined); assert.notEqual(node.props.fill, undefined); }
      }
      for (const time of [0, item.defaultDuration/2, item.defaultDuration-1/30, 0]) mounted.setTime(time);
      if (item.id === "code-reveal" && format === "portrait") {
        assert.equal(named(mounted, "Code line 1").props.fontSize, 44*.85);
        assert.equal(content(named(mounted, "code-reveal/role")), "CODE / NOT EXECUTED");
        mounted.setTime(6); assert.equal(content(named(mounted, "Code line 4")), "y = double(3)");
        assert.equal(content(named(mounted, "Code line 5")), "print(y)");
      }
      if (item.id === "worked-solution" && format === "portrait") {
        assert.equal(named(mounted, "Step 1 expression").props.fontSize, 40*1.15);
      }
      if (item.id === "route-reveal") {
        const surface = mounted.nodes().find(node => node.tag === "Surface");
        assert.equal(surface?.parent, root, "ticker-driven map stays a direct scene child");
        assert.notEqual(mounted.routePath(), "");
      }
      mounted.dispose();
      } catch(error) { failures.push(`${item.id}: ${(error as Error).message}`); }
    }
    assert.deepEqual(failures,[]);
  });
}

test("sequence uses scene time, supports reverse reveals and keeps counter identity between ticks", async () => {
  const ids = ["question-reveal","evidence-focus","worked-solution","code-reveal","stat-proof","route-reveal"], brief = buildMotionBrief(options(ids, "landscape", "sequence"));
  const native = await nativeModule(buildMotionModule(options(ids, "landscape", "sequence"))), mounted = native.mount();
  assert.equal(mounted.document.stage.children[0].props.end, 44);
  const answer = named(mounted, "question-reveal/answer");
  assert.equal(answer.props.opacity, 0); mounted.setTime(3); assert.equal(answer.props.opacity, 1); mounted.setTime(1); assert.equal(answer.props.opacity, 0);
  const worked = brief.moments.find(item => item.id === "worked-solution")!;
  mounted.setTime(worked.start+1); assert.ok(!mounted.nodes().some(node => node.props.name === "Step 3 expression"));
  mounted.setTime(worked.start+7); assert.equal(content(named(mounted, "Step 3 expression")), "x = 3");
  mounted.setTime(worked.start+1); assert.ok(!mounted.nodes().some(node => node.props.name === "Step 3 expression"));
  const code = brief.moments.find(item => item.id === "code-reveal")!;
  mounted.setTime(code.start+1); assert.ok(!mounted.nodes().some(node => node.props.name === "Code line 6"));
  mounted.setTime(code.start+6); assert.equal(content(named(mounted, "Code line 6")), "# EXPECTED: 6");
  mounted.setTime(code.start+1); assert.ok(!mounted.nodes().some(node => node.props.name === "Code line 6"));
  const stat = brief.moments.find(item => item.id === "stat-proof")!;
  const counter = named(mounted, "stat-proof/value");
  mounted.setTime(stat.start+3.5); assert.equal(content(counter), "100");
  mounted.setTime(stat.start); assert.equal(content(counter), "0");
  mounted.setTime(stat.start+1.5); assert.equal(content(counter), "40");
  const created = mounted.created();
  for (let i=0;i<50;i++) mounted.setTime(stat.start+1.5+i/3000);
  assert.equal(named(mounted, "stat-proof/value"), counter); assert.equal(mounted.created(), created, "ticks update text rather than reconstructing native entities");
  const route = brief.moments.find(item => item.id === "route-reveal")!;
  mounted.setTime(route.start); const beginning = mounted.routePath();
  mounted.setTime(route.start+4.5); const ending = mounted.routePath();
  assert.notEqual(beginning, ending); mounted.setTime(route.start); assert.equal(mounted.routePath(), beginning);
  mounted.dispose();
});
