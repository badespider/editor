// Run after CLI build. Synthetic records only; no media/account/model calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyticsFixture, experimentFixture } from "./experiment-fixture.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const cli = join(root, "apps/cli/dist/index.js");
const directory = await mkdtemp(join(tmpdir(), "editor-experiment-smoke-"));
const options = { cwd: directory, encoding: "utf8" as const, timeout: 15_000,
  env: { ...process.env, GEMINI_API_KEY: "", GOOGLE_API_KEY: "", OPENAI_API_KEY: "" } };
function run(args: string[], status = 0) {
  const result = spawnSync(process.execPath, [cli, "playbook", ...args], options);
  assert.equal(result.status, status, `${JSON.stringify(args)}: ${result.stderr}\n${result.stdout}`);
  return result;
}
try {
  const workflow = JSON.parse(run(["experiment", "workflow"]).stdout);
  assert.equal(workflow.schema.properties.status.const, "candidate");
  assert.deepEqual(workflow.requiredEditorialChecks.short, ["opening_promise", "standalone_context", "payoff"]);
  assert.equal(workflow.safeToAutoPromote, false);
  const routed = JSON.parse(run(["recommend", "--task", "evaluate", "--goal", "Compare Shorts engagement"]).stdout);
  assert.deepEqual(routed.skills.map((s: { id: string }) => s.id), ["editor-review"]);
  const draftPath = join(directory, "nested", "draft.json");
  const draftArgs = ["experiment", "new", "--format", "short", "--hypothesis", "Clearer context", "--change", "Start earlier", "-o", draftPath];
  const draft = JSON.parse(run(draftArgs).stdout);
  assert.equal(draft.valid, false); assert.equal(draft.evidenceLevel, "not_measured");
  const before = await readFile(draftPath, "utf8");
  assert.equal(JSON.parse(run(["experiment", "check", draftPath], 1).stdout).valid, false);
  assert.ok(run(draftArgs, 1).stderr); assert.equal(await readFile(draftPath, "utf8"), before);
  assert.ok(run(["experiment", "new", "--format", "invalid", "--hypothesis", "test", "--change", "test", "-o", join(directory, "bad.json")], 1).stderr);
  const fixturePath = join(directory, "fixture.json");
  await writeFile(fixturePath, JSON.stringify(experimentFixture()), { flag: "wx" });
  const planned = JSON.parse(run(["experiment", "check", fixturePath]).stdout);
  assert.equal(planned.stage, "planned"); assert.equal(planned.evidenceLevel, "not_measured");
  const measuredPath = join(directory, "measured.json"), measured = analyticsFixture();
  measured.observations[1].metric!.denominator = "different definition";
  await writeFile(measuredPath, JSON.stringify(measured), { flag: "wx" });
  const report = JSON.parse(run(["experiment", "check", measuredPath]).stdout);
  assert.ok(report.warnings.some((w: { code: string }) => w.code === "not_comparable"));
  assert.equal(report.evidenceLevel, "audience_data_recorded_unverified");
  assert.equal(report.safeToAutoPromote, false); assert.equal(report.safeToAutoPublish, false);
  assert.ok(!("winner" in report));
  const invalidPath = join(directory, "invalid.json");
  await writeFile(invalidPath, "{broken", { flag: "wx" });
  assert.ok(run(["experiment", "check", invalidPath], 1).stderr);
  assert.ok(run(["experiment", "check", directory], 1).stderr);
  console.log(JSON.stringify({ passed: true, workingDirectory: "outside checkout", mediaProcessed: false, modelCalls: false,
    checks: ["workflow/schema discovery", "evaluation routing", "exclusive draft creation", "draft rejection", "unmeasured planned record", "incomparable analytics warning", "malformed input", "no auto-promotion"] }, null, 2));
} finally {
  // Only this test's exclusively allocated scratch directory is removed.
  await rm(directory, { recursive: true, force: true });
}
