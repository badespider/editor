// Run after building the CLI: node packages/editing-playbook/test/motion-cli-smoke.ts
// This exercises local authoring only. It never mounts a scene or renders media.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, realpath, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const cli = join(repository, "apps/cli/dist/index.js");
const temporaryRoot = await realpath(tmpdir());
const directory = await mkdtemp(join(temporaryRoot, "editor-motion-cli-"));
const checks: string[] = [];
const guard = join(directory, "forbid-external.cjs");
const expectedCategories: Record<string, number> = {backgrounds: 3, captions: 2, charts: 2, data: 3, effects: 2,
  layouts: 1, maps: 2, overlays: 3, storytelling: 4, "text-effects": 4, education: 3};
let cleanupComplete = false;

try {
  // Every command runs outside the checkout with requests, app sockets and
  // provider subprocesses disabled. An attempted external action fails the test.
  await writeFile(guard, `const forbidden = () => { throw new Error("Motion CLI smoke forbids network, app connections and subprocess execution"); };
globalThis.fetch = forbidden;
for (const [id,names] of [["node:http",["request","get"]],["node:https",["request","get"]],["node:net",["connect","createConnection"]],["node:tls",["connect"]],["node:child_process",["spawn","spawnSync","exec","execSync","execFile","execFileSync","fork"]]]) {
 const module = require(id); for (const name of names) module[name] = forbidden;
}
require("node:net").Socket.prototype.connect = forbidden;
require("node:net").Server.prototype.listen = forbidden;
require("node:module").syncBuiltinESMExports();
`, {flag: "wx"});
  const run = (args: string[], expected = 0): any => {
    const result = spawnSync(process.execPath, ["--require", guard, cli, "playbook", "motion", ...args], {
      cwd: directory, encoding: "utf8", timeout: 15_000, maxBuffer: 2_000_000,
      env: {...process.env, GEMINI_API_KEY: "", GOOGLE_API_KEY: "", OPENAI_API_KEY: ""},
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.signal, null, JSON.stringify(args));
    assert.equal(result.status, expected, `${JSON.stringify(args)}\n${result.stdout}\n${result.stderr}`);
    const parsed = JSON.parse(result.stdout);
    assert.doesNotMatch(result.stderr, /smoke forbids/);
    if ("externalCalls" in parsed) assert.equal(parsed.externalCalls, 0);
    checks.push(`${args[0]}: ${args.slice(1, 3).join(" ")}`);
    return parsed;
  };
  const json = async (name: string, value: unknown): Promise<string> => {
    const path = join(directory, name);
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", {flag: "wx"});
    return path;
  };
  const absent = async (path: string) => {
    await assert.rejects(readFile(path), (error: NodeJS.ErrnoException) => error.code === "ENOENT", `unexpected output ${path}`);
  };
  const rejectedCreate = async (args: string[]) => {
    const path = join(directory, `rejected-${checks.length}.js`);
    const result = run(["create", ...args, "-o", path], 1);
    assert.equal(typeof result.error, "string");
    await absent(path);
  };

  const categories = run(["categories"]);
  assert.equal(categories.total, 29); assert.equal(categories.categories.length, 11);
  assert.deepEqual(Object.fromEntries(categories.categories.map((category: any) => [category.id, category.count])), expectedCategories);
  const catalog = run(["catalog"]);
  assert.equal(catalog.count, 29); assert.equal(new Set(catalog.items.map((item: any) => item.id)).size, 29);
  for (const item of catalog.items) assert.deepEqual(item.origin, {kind: "editor-native", license: "MPL-2.0"});
  for (const [category, count] of Object.entries(expectedCategories)) {
    const filtered = run(["catalog", "--category", category, "--format", "portrait"]);
    assert.equal(filtered.count, count); assert.ok(filtered.items.every((item: any) => item.category === category));
  }
  assert.equal(run(["catalog", "counter", "--format", "landscape"]).items[0].id, "stat-proof");
  assert.equal(run(["show", "@caption-highlight"]).moment.id, "caption-highlight");
  const workflow = run(["workflow"]);
  assert.equal(workflow.nativeMomentIds.length, 29); assert.equal(workflow.categories.length, 11);
  assert.deepEqual(workflow.defaults, {format: "landscape", createMode: "sequence", briefMode: "inspiration", theme: "paper", motion: "full"});
  assert.equal(workflow.safeToActivate, false);
  const composable=run(["catalog","--mixable"]);
  assert.equal(composable.count,10);assert.ok(composable.items.every((item:any)=>item.mixable));
  assert.ok(workflow.mixablePresetIds.includes("counter-reveal"));

  const mixRecipePath=join(directory,"mix-example.json"),mixPath=join(directory,"mix.js"),mixSecondPath=join(directory,"mix-second.js");
  const mixExample=run(["mix-example","--format","portrait","-o",mixRecipePath]);
  assert.deepEqual(JSON.parse(await readFile(mixRecipePath,"utf8")),mixExample.recipe);
  const mixed=run(["mix",mixRecipePath,"-o",mixPath]);
  assert.equal(mixed.kind,"editor-native-motion-mix-module");assert.equal(mixed.brief.instances.length,4);
  assert.equal(mixed.brief.canvas.width,1080);assert.equal(mixed.brief.duration,8);
  const mixedSource=await readFile(mixPath,"utf8");
  assert.equal(mixed.sha256,createHash("sha256").update(mixedSource).digest("hex"));
  assert.ok(mixedSource.includes("CounterReveal"));assert.ok(mixedSource.includes("clipToBox:true"));
  assert.notEqual(run(["mix",mixRecipePath,"-o",mixSecondPath]).brief.sceneKey,mixed.brief.sceneKey);
  run(["mix",mixRecipePath,"-o",mixPath],1);
  assert.equal(createHash("sha256").update(await readFile(mixPath)).digest("hex"),mixed.sha256);
  const invalidMix=structuredClone(mixExample.recipe);invalidMix.instances[1].key=invalidMix.instances[0].key;
  const invalidMixPath=await json("mix-invalid.json",invalidMix),invalidOutput=join(directory,"mix-invalid.js");
  run(["mix",invalidMixPath,"-o",invalidOutput],1);await absent(invalidOutput);

  const examplePath = join(directory, "caption-example.json");
  const example = run(["example", "@caption-highlight", "-o", examplePath]);
  assert.deepEqual(JSON.parse(await readFile(examplePath, "utf8")), example.content);
  assert.deepEqual(Object.keys(example.content), ["caption-highlight"]);
  assert.ok(example.content["caption-highlight"].cues[0].words.length > 0);
  assert.equal(Object.hasOwn(example.content["caption-highlight"], "transcript"), false);
  const exampleSha = createHash("sha256").update(await readFile(examplePath)).digest("hex");
  run(["example", "caption-highlight", "-o", examplePath], 1);
  assert.equal(createHash("sha256").update(await readFile(examplePath)).digest("hex"), exampleSha);
  const unknownExample = join(directory, "unknown-example.json");
  run(["example", "not-a-moment", "-o", unknownExample], 1); await absent(unknownExample);

  const content = {
    "caption-highlight": {cues: [{start: .5, end: 4.5, text: "It's ours.\nStay clear.", words: [
      {text: "It's", start: .5, end: 1.2}, {text: "ours.", start: 1.2, end: 2.8},
      {text: "Stay", start: 3, end: 3.5}, {text: "clear.", start: 3.5, end: 4.5},
    ]}]},
    "chart-bars": {title: "Supplied bars", data: [{label: "A", value: -2}, {label: "B", value: 6}],
      valueDomain: [-4, 8], baseline: 0, unit: "N", disclosure: {kind: "illustrative", text: "Test fixture / not measured"}},
  };
  const contentPath = await json("custom-content.json", content);
  const modulePath = join(directory, "custom.js");
  const created = run(["create", "caption-highlight", "chart-bars", "--content", contentPath, "--theme", "dark", "--motion", "reduced",
    "--format", "portrait", "--source", "https://a.invalid/ref", "-o", modulePath]);
  assert.equal(created.brief.theme, "dark"); assert.equal(created.brief.motion, "reduced");
  assert.equal(created.brief.mode, "sequence"); assert.equal(created.brief.duration, 16);
  assert.deepEqual(created.brief.content, content);
  assert.deepEqual(created.brief.canvas, {width: 1080, height: 1920, fps: 30});
  const moduleSource = await readFile(modulePath, "utf8");
  assert.equal(created.sha256, createHash("sha256").update(moduleSource).digest("hex"));
  const match = /^const data = (.+);\r?$/m.exec(moduleSource); assert.ok(match);
  const manifest = JSON.parse(match[1]);
  assert.equal(manifest.theme, "dark"); assert.equal(manifest.motion, "reduced");
  assert.deepEqual(manifest.beats[0].settings.cues, content["caption-highlight"].cues);
  assert.equal(manifest.beats[1].settings.disclosure.kind, "illustrative");
  assert.ok(moduleSource.includes("AUTHORED CAPTION DEMO / NO AUDIO"));
  assert.doesNotMatch(moduleSource, /from ["']https?:\/\/|\bfetch\s*\(|\bCaptions\s*\(/);
  const brief = run(["brief", "caption-highlight", "chart-bars", "--content", contentPath, "--theme", "dark", "--motion", "reduced", "--format", "portrait"]);
  assert.equal(brief.referenceOnly, true); assert.equal(brief.mountable, false);
  assert.deepEqual(brief.content, content); assert.equal(brief.theme, "dark"); assert.equal(brief.motion, "reduced");

  // Older commands retain their defaults; separate new files get separate scene
  // keys while each saved module carries its own stable literal identity.
  const firstPath = join(directory, "original-first.js"), secondPath = join(directory, "original-second.js");
  const first = run(["create", "question-reveal", "--mode", "template", "-o", firstPath]);
  const second = run(["create", "question-reveal", "--mode", "template", "-o", secondPath]);
  assert.equal(first.brief.theme, "paper"); assert.equal(first.brief.motion, "full");
  assert.equal(first.brief.mode, "template"); assert.equal(first.brief.canvas.width, 1920);
  assert.equal(first.brief.duration, 6); assert.notEqual(first.brief.sceneKey, second.brief.sceneKey);
  assert.ok((await readFile(firstPath, "utf8")).includes(first.brief.sceneKey));
  const originalSha = createHash("sha256").update(await readFile(firstPath)).digest("hex");
  run(["create", "question-reveal", "-o", firstPath], 1);
  assert.equal(createHash("sha256").update(await readFile(firstPath)).digest("hex"), originalSha);
  const oldBrief = run(["brief", "code-reveal", "question-reveal"]);
  assert.equal(oldBrief.mode, "inspiration"); assert.equal(oldBrief.duration, 14);
  assert.deepEqual(oldBrief.moments.map((moment: any) => moment.id), ["code-reveal", "question-reveal"]);

  const malformed = join(directory, "malformed.json"); await writeFile(malformed, "{oops", {flag: "wx"});
  const oversized = join(directory, "oversized.json"); await writeFile(oversized, " ".repeat(131073), {flag: "wx"});
  const unselected = await json("unselected.json", {"chart-bars": content["chart-bars"]});
  const unknown = await json("unknown.json", {"caption-highlight": {...content["caption-highlight"], executable: "not code"}});
  const invalidDomain = await json("domain.json", {"chart-bars": {...content["chart-bars"], valueDomain: [8, -4]}});
  const invalidBaseline = await json("baseline.json", {"chart-bars": {...content["chart-bars"], baseline: 1}});
  const invalidWord = await json("word.json", {"caption-highlight": {cues: [{start: 0, end: 2, text: "A", words: [{start: 1, end: .5, text: "A"}]}]}});
  for (const args of [
    ["caption-highlight", "--content", malformed], ["caption-highlight", "--content", oversized],
    ["caption-highlight", "--content", unselected], ["caption-highlight", "--content", unknown],
    ["chart-bars", "--content", invalidDomain], ["chart-bars", "--content", invalidBaseline],
    ["caption-highlight", "--content", invalidWord], ["caption-highlight", "--content", "https://example.invalid/not-fetched.json"],
    ["question-reveal", "--theme", "neon"], ["question-reveal", "--motion", "random"],
    ["question-reveal", "--format", "square"], ["question-reveal", "--mode", "inspiration"],
    ["question-reveal", "question-reveal"], ["unknown-moment"],
  ]) await rejectedCreate(args);
  run(["brief", "caption-highlight", "--content", unknown], 1);
  run(["catalog", "--category", "unrecognized"], 1);
  run(["catalog", "--format", "square"], 1);

  // Recording a reference URL is inert even when it looks fetchable.
  const candidatePath = join(directory, "candidate.json");
  const candidate = run(["candidate", "new", "https://example.invalid/source", "-o", candidatePath]);
  assert.equal(candidate.valid, true); assert.equal(candidate.readiness, "needs_evidence"); assert.equal(candidate.safeToActivate, false);
  assert.deepEqual(candidate.candidate.evidence, {tests: [], exports: [], reviews: []});
  assert.equal(run(["candidate", "check", candidatePath]).safeToActivate, false);
} finally {
  // Only unlink flat files inside the exact directory created by this run.
  // No recursive removal, user workspace path or path derived from CLI input.
  const actual = await realpath(directory);
  assert.equal(dirname(actual), temporaryRoot);
  assert.ok(basename(actual).startsWith("editor-motion-cli-"));
  assert.equal(resolve(actual), resolve(directory));
  for (const entry of await readdir(actual, {withFileTypes: true})) {
    assert.ok(entry.isFile() && !entry.isSymbolicLink(), `unexpected temporary entry ${entry.name}`);
    await unlink(join(actual, entry.name));
  }
  await rmdir(actual); cleanupComplete = true;
}

console.log(JSON.stringify({passed: true, checks: checks.length, categories: 11, moments: 29,
  cliSha256: createHash("sha256").update(await readFile(cli)).digest("hex"),
  externalActionsBlocked: true, appMutated: false, mediaProcessed: false, temporaryArtifactsRemoved: cleanupComplete,
  scope: "CLI discovery, local data validation, generated module parameters and exclusive files; no actual-editor render or speech accuracy claim."}, null, 2));
