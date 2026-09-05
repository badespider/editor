import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fingerprint, probe, renderPreview } from "../src/preview.ts";
import { validatePlan } from "../src/validate.ts";
import { fixture } from "./fixture.ts";

// Opt-in, provider-free integration test. Takes the exact OBS regression source
// and a fresh output folder; no source footage is distributed with this repo.
const source = process.argv[2], target = process.argv[3];
if (!source || !target) throw new Error("Usage: node test/preview-smoke.ts <original-OBS-video> <new-output-directory>");
const directory = resolve(target);
const before = await fingerprint(resolve(source));
assert.equal(before, fixture().sources[0].sha256, "This fixture describes one specific inspected clip; do not apply its observations to unrelated footage.");
await mkdir(directory, { recursive: false });
const cli = fileURLToPath(new URL("../../../apps/cli/dist/index.js", import.meta.url));
const results: unknown[] = [];
for (const [name, duration] of [["baseline", 7.7], ["short", 2], ["tight", 0.5]] as const) {
  const plan = fixture(); plan.sources[0].path = resolve(source); plan.segments[0].out = duration;
  const path = join(directory, `${name}.plan.json`);
  await writeFile(path, JSON.stringify(plan, null, 2), { flag: "wx" });
  const checked = spawnSync(process.execPath, [cli, "playbook", "check", path], { encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
  const preview = spawnSync(process.execPath, [cli, "playbook", "preview", path, "-o", join(directory, `${name}.mp4`)], {
    encoding: "utf8", windowsHide: true, timeout: 180_000,
  });
  assert.equal(preview.status, 0, preview.stderr);
  const result = JSON.parse(preview.stdout);
  assert.equal(result.aiCalls, 0);
  assert.equal(result.sourceFilesModified, false);
  const metadata = await probe(result.path);
  assert.equal(metadata.width, 1280); assert.equal(metadata.height, 720); assert.ok(metadata.hasAudio);
  results.push({ name, ...result });
  const existingHash = await fingerprint(result.path);
  await assert.rejects(() => renderPreview(plan, { output: result.path, baseDirectory: directory }), /already exists/);
  assert.equal(await fingerprint(result.path), existingHash);
}
const wrongTrim = fixture(); wrongTrim.sources[0].path = resolve(source); wrongTrim.segments[0].in = 1;
await writeFile(join(directory, "rejected-trim.plan.json"), JSON.stringify(wrongTrim, null, 2), { flag: "wx" });
const rejected = spawnSync(process.execPath, [cli, "playbook", "check", join(directory, "rejected-trim.plan.json")], { encoding: "utf8", windowsHide: true });
assert.equal(rejected.status, 1);
assert.ok(JSON.parse(rejected.stdout).errors.some((item: { code: string }) => item.code === "protected_range"));
await assert.rejects(() => renderPreview(wrongTrim, { output: join(directory, "must-not-render.mp4"), baseDirectory: directory }), /Plan rejected/);
const changed = fixture(); changed.sources[0].path = resolve(source); changed.sources[0].sha256 = "0".repeat(64);
await assert.rejects(() => renderPreview(changed, { output: join(directory, "bad-hash.mp4"), baseDirectory: directory }), /fingerprint changed/);
const bounds = fixture(); bounds.sources[0].path = resolve(source); bounds.sources[0].duration = 20; bounds.segments[0].out = 9; bounds.brief.maxDuration = 10;
await assert.rejects(() => renderPreview(bounds, { output: join(directory, "bad-bounds.mp4"), baseDirectory: directory }), /actual probed duration/);
assert.equal(await fingerprint(resolve(source)), before, "Original video changed");

// The candidate files must validate but never enter the runtime skill catalog.
for (const name of ["dani-lee-key-scenes", "joseph-visual-consistency"]) {
  const path = fileURLToPath(new URL(`../../../playbook/references/${name}.json`, import.meta.url));
  const checked = spawnSync(process.execPath, [cli, "playbook", "reference", "check", path], { encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).automaticallyActivated, false);
}
const report = { source: resolve(source), originalSha256: before, originalUnchanged: true, aiCalls: 0,
  previews: results, rejectedTrim: validatePlan(wrongTrim), existingOutputPreserved: true,
  fingerprintMismatchRejected: true, actualSourceBoundsChecked: true,
  referenceCandidatesRemainInactive: true,
  review: "These are encoding and constraint tests, not a storytelling comparison or audiovisual review." };
await writeFile(join(directory, "smoke-results.json"), JSON.stringify(report, null, 2), { flag: "wx" });
assert.equal(JSON.parse(await readFile(join(directory, "smoke-results.json"), "utf8")).originalUnchanged, true);
console.log(JSON.stringify(report, null, 2));
