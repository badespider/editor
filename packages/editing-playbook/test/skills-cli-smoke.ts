// Run after building the CLI. No footage, desktop, model, or external account required.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { skills } from "../src/catalog.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const cli = join(root, "apps/cli/dist/index.js");
const options = { cwd: tmpdir(), encoding: "utf8" as const, timeout: 15_000,
  env: { ...process.env, GEMINI_API_KEY: "", GOOGLE_API_KEY: "", OPENAI_API_KEY: "" } };
const run = (args: string[]) => JSON.parse(execFileSync(process.execPath, [cli, ...args], options));
const catalog = run(["playbook", "skills"]);
assert.equal(catalog.skills.length, 12);
for (const skill of skills) {
  const entry = catalog.skills.find((entry: { id: string }) => entry.id === skill.id);
  const result = run(entry.readArgs);
  assert.equal(result.instructions, await readFile(join(root, skill.path), "utf8"));
  assert.equal(result.absolutePath, join(root, skill.path));
}
const directed = run(["playbook", "recommend", "--format", "story", "--goal", "Edit a vlog with B-roll, mobile Shorts, SEO and sound polish"]);
for (const id of ["editor-vlog-story", "editor-scene-building", "editor-short-form", "editor-youtube-packaging", "editor-sound-polish"]) {
  assert.ok(directed.skills.some((skill: { id: string }) => skill.id === id));
}
const copyOnly = run(["playbook", "recommend", "--task", "package", "--goal", "SEO for the original English vlog"]);
assert.deepEqual(copyOnly.skills.map((skill: { id: string }) => skill.id), ["editor-youtube-packaging"]);
assert.equal(copyOnly.providerRequired, false);
const clipping = run(["playbook", "clips", "workflow"]);
assert.ok(clipping.skillReadArgs.some((args: string[]) => args[2] === "editor-short-form"));
for (const args of clipping.skillReadArgs) assert.ok(catalog.skills.some((skill: { readArgs: string[] }) => JSON.stringify(skill.readArgs) === JSON.stringify(args)));
assert.equal(run(["playbook", "skill", "editor-vlog-story", "--repo", root]).id, "editor-vlog-story");
for (const args of [
  ["playbook", "skill", "../README.md"],
  ["playbook", "skill", "editor-vlog-story", "--repo", tmpdir()],
  ["playbook", "recommend", "--goal", "edit", "--task", "publish"],
  ["playbook", "recommend", "--goal", "edit", "--format", "unsupported"],
]) {
  const failed = spawnSync(process.execPath, [cli, ...args], options);
  assert.equal(failed.status, 1, JSON.stringify(args));
  assert.equal(failed.stdout.trim(), "");
  assert.ok(failed.stderr.trim());
}
console.log(JSON.stringify({ passed: true, skillsRead: skills.length, workingDirectory: "outside checkout",
  checks: ["catalog", "complete instructions", "creative routing", "clipping entrypoint", "copy-only scope", "explicit repo", "invalid ID/task/format/root"],
  mediaProcessed: false, desktopRequired: false, modelCalls: false }, null, 2));
