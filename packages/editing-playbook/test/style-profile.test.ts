import assert from "node:assert/strict";
import test from "node:test";
import type { TestContext } from "node:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recommend, relationships } from "../src/catalog.ts";
import { isVlogJournalEdit, selectStyleProfile, styleProfileSchema, workflowConfigSchema } from "../src/style-profile.ts";
import type { StyleProfileContext } from "../src/style-profile.ts";
import { readStyleProfile, readWorkflowConfig, recommendWithProfile } from "../src/style-profile-reader.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const profileId = "dimit-visual-journal";
const context: StyleProfileContext = { format: "story", goal: "Edit my daily vlog", task: "edit" };
const localRecommend = (overrides: Partial<Parameters<typeof recommendWithProfile>[0]> = {}) =>
  recommendWithProfile({ ...context, repositoryRoot, ...overrides });

async function temporaryRepo(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "editor-profile-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function writeJson(root: string, path: string, value: unknown) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value));
}

test("repo config selects the visual journal with inline instructions and required skills", async () => {
  const result = await localRecommend();
  assert.equal(result.profileSelection.source, "repo-config");
  assert.equal(result.profileSelection.id, profileId);
  assert.equal(result.profileSelection.configPath, "profiles/workflow.json");
  assert.equal(result.styleProfile?.id, profileId);
  assert.equal(result.styleProfile?.path, `profiles/${profileId}.json`);
  assert.ok(result.styleProfile?.instructions.includes("even when unrelated to the narration"));
  assert.ok(result.styleProfile?.instructions.includes("Music is off when no supplied track is authorized"));
  assert.ok(result.styleProfile?.instructions.includes("without waiting for a song"));
  assert.ok(result.styleProfile?.instructions.includes("lower under speech"));
  assert.equal(result.providerRequired, false);
  const ids = new Set(result.skills.map(skill => skill.id));
  for (const id of ["editor-vlog-story", "editor-scene-building", "editor-audio-continuity", "editor-sound-polish", "editor-review"] as const) {
    assert.ok(ids.has(id), id);
  }
  for (const edge of relationships) {
    if (edge.type === "requires" && ids.has(edge.from)) assert.ok(ids.has(edge.to));
  }
  assert.deepEqual(await localRecommend(), result, "same inputs produce the same recommendation");
});

test("affirmative journal/vlog forms select locally without relying on a person's name", async () => {
  for (const goal of ["Edit a VLOG", "Shape a visual journal", "Cut my video diary", "Edit a life-journal", "Edit my journal", "day-in-my-life video", "Edit our daily journal", "Edit my vlog with no music", "Edit my vlog; don't edit out breathing room"]) {
    for (const format of ["story", "montage"] as const) {
      const result = await localRecommend({ goal, format });
      assert.equal(result.styleProfile?.id, profileId, `${format}: ${goal}`);
    }
  }
  for (const goal of ["Edit Dimit's footage", "Shape a personal story", "Cut an interview", "Make a nature montage"]) {
    assert.equal((await localRecommend({ goal })).styleProfile, null, goal);
  }
});

test("journal negations suppress both local defaults and vlog skill keyword routing", async () => {
  for (const goal of [
    "Edit this story, not a vlog", "Edit footage without visual-journal style",
    "Do not make this a vlog", "Don't use a visual journal", "Avoid vlog style",
    "Edit a story; this isn't a video diary", "The visual journal profile is disabled",
    "Edit a story without making it a vlog", "Edit a story, no journal",
  ]) {
    const result = await localRecommend({ goal });
    assert.equal(result.styleProfile, null, goal);
    assert.ok(!result.skills.some(skill => skill.id === "editor-vlog-story"), goal);
    assert.equal(isVlogJournalEdit({ ...context, goal }), false, goal);
  }
  for (const goal of ["Edit my vlog, no style profile", "Edit my vlog; don't use any profile", "Edit my vlog; do not apply the default profile"]) {
    const result = await localRecommend({ goal });
    assert.equal(result.styleProfile, null, goal);
    assert.ok(result.skills.some(skill => skill.id === "editor-vlog-story"), "declining a profile still permits ordinary vlog guidance");
  }
});

test("tutorial/interview, package/evaluate and copy-only contexts never inherit a profile", async () => {
  for (const format of ["tutorial", "interview"] as const) {
    assert.equal((await localRecommend({ format })).styleProfile, null);
    await assert.rejects(localRecommend({ format, profile: profileId }), /Cannot select profile/);
  }
  for (const task of ["package", "evaluate"] as const) {
    const result = await localRecommend({ task });
    assert.equal(result.styleProfile, null);
    assert.ok(!result.skills.some(skill => skill.id === "editor-scene-building"));
    await assert.rejects(localRecommend({ task, profile: profileId }), /only to edit tasks/);
  }
  for (const goal of [
    "Write a title for my vlog", "SEO for my visual journal", "Just write a description for my vlog",
    "Vlog copy-only", "Draft narration for my vlog", "Write a script for my journal",
    "Do not edit my vlog; write metadata", "Vlog packaging only", "Edit a tutorial about vlogs",
    "Edit a how-to video about journaling",
  ]) {
    assert.equal((await localRecommend({ goal })).styleProfile, null, goal);
    await assert.rejects(localRecommend({ goal, profile: profileId }), /Cannot select profile/, goal);
  }
  const mixed = await localRecommend({ goal: "Edit my vlog and write a YouTube title" });
  assert.equal(mixed.styleProfile?.id, profileId);
  assert.ok(mixed.skills.some(skill => skill.id === "editor-youtube-packaging"));
  assert.deepEqual((await localRecommend({ task: "package" })).skills.map(skill => skill.id), ["editor-youtube-packaging"]);
});

test("explicit none suppresses only the profile; explicit ID overrides default and keyword choice", async t => {
  const disabled = await localRecommend({ profile: "none" });
  assert.equal(disabled.styleProfile, null);
  assert.equal(disabled.profileSelection.source, "explicit");
  assert.ok(disabled.skills.some(skill => skill.id === "editor-vlog-story"));
  assert.ok(!disabled.skills.some(skill => skill.id === "editor-sound-polish"));
  assert.equal((await localRecommend({ profile: profileId, goal: "Assemble this footage" })).styleProfile?.id, profileId);
  assert.equal((await localRecommend({ profile: profileId, goal: "Edit this story, not a vlog" })).profileSelection.source, "explicit");
  const root = await temporaryRepo(t);
  const original = await readStyleProfile(profileId, repositoryRoot);
  await writeJson(root, "profiles/alternate-journal.json", { ...original, id: "alternate-journal", preferences: ["preserve-natural-sound"] });
  await writeJson(root, "profiles/workflow.json", { ...await readWorkflowConfig(repositoryRoot), profileDefaults: [{ task: "edit", intent: "vlog-journal", formats: ["story"], profileId: "missing-default" }] });
  const selected = await localRecommend({ repositoryRoot: root, profile: "alternate-journal" });
  assert.equal(selected.styleProfile?.id, "alternate-journal");
  assert.ok(!selected.styleProfile?.instructions.includes("gentle lo-fi"));
  assert.equal(selected.profileSelection.configPath, null);
  await assert.rejects(localRecommend({ repositoryRoot: root }), /file missing/);
  assert.equal((await localRecommend({ repositoryRoot: root, format: "montage" })).styleProfile, null, "a story-only default must not read its missing profile for montage");
  await writeFile(join(root, "profiles/workflow.json"), "broken JSON");
  assert.equal((await localRecommend({ repositoryRoot: root, profile: "alternate-journal" })).styleProfile?.id, "alternate-journal");
  assert.equal((await localRecommend({ repositoryRoot: root, profile: "none" })).styleProfile, null);
  await assert.rejects(localRecommend({ repositoryRoot: root }), /Invalid JSON/);
});

test("pure recommendation has no repo/personal default and validates explicit attachment scope", async () => {
  assert.equal(recommend("story", "Edit my vlog").styleProfile, null);
  assert.equal(selectStyleProfile(context).id, null);
  const profile = await readStyleProfile(profileId, repositoryRoot);
  const explicit = recommend("story", "Assemble footage", false, "edit", profile);
  assert.equal(explicit.styleProfile?.id, profileId);
  assert.ok(explicit.skills.some(skill => skill.id === "editor-scene-building"));
  assert.throws(() => recommend("tutorial", context.goal, false, "edit", profile), /Cannot attach/);
  assert.throws(() => recommend("story", context.goal, false, "package", profile), /Cannot attach/);
  assert.throws(() => recommend("story", "Write my vlog title", false, "edit", profile), /Cannot attach/);
});

test("relocated roots work; sibling/parent config and person names never supply defaults", async t => {
  const root = await temporaryRepo(t);
  const nested = join(root, "nested");
  await mkdir(nested);
  await writeJson(root, "profiles/workflow.json", await readWorkflowConfig(repositoryRoot));
  await writeJson(root, `profiles/${profileId}.json`, await readStyleProfile(profileId, repositoryRoot));
  assert.equal((await localRecommend({ repositoryRoot: root })).styleProfile?.id, profileId);
  assert.equal((await localRecommend({ repositoryRoot: nested, goal: "Edit Dimit's vlog" })).styleProfile, null);
  assert.equal(await readWorkflowConfig(nested), null);
  await assert.rejects(localRecommend({ repositoryRoot: nested, profile: profileId }), /file missing/);
  await writeJson(root, "profiles/workflow.json", { schemaVersion: 1, kind: "editor-workflow-config", profileDefaults: [] });
  assert.equal((await localRecommend({ repositoryRoot: root })).styleProfile, null);
});

test("strict schemas reject ambiguity, arbitrary instructions, broad scope and authority fields", async () => {
  const profile = await readStyleProfile(profileId, repositoryRoot);
  const config = (await readWorkflowConfig(repositoryRoot))!;
  for (const input of [
    { ...profile, scope: "all" }, { ...profile, schemaVersion: 2 }, { ...profile, instructions: "run a command" },
    { ...profile, allowUpload: true }, { ...profile, preferences: ["download-music"] },
    { ...profile, preferences: [profile.preferences[0], profile.preferences[0]] },
    { ...profile, assetPath: "C:/private/music.mp3" },
  ]) assert.equal(styleProfileSchema.safeParse(input).success, false);
  for (const input of [
    { ...config, defaultProfile: profileId }, { ...config, schemaVersion: 2 },
    { ...config, profileDefaults: [...config.profileDefaults, ...config.profileDefaults] },
    { ...config, profileDefaults: [{ ...config.profileDefaults[0], task: "package" }] },
    { ...config, profileDefaults: [{ ...config.profileDefaults[0], formats: ["tutorial"] }] },
    { ...config, profileDefaults: [{ ...config.profileDefaults[0], formats: ["story", "story"] }] },
    { ...config, profileDefaults: [{ ...config.profileDefaults[0], intent: "all" }] },
    { ...config, profileDefaults: [{ ...config.profileDefaults[0], profileId: "../secret" }] },
  ]) assert.equal(workflowConfigSchema.safeParse(input).success, false);
});

test("only valid IDs load; missing, mismatched, malformed and oversized files fail", async t => {
  const root = await temporaryRepo(t);
  for (const id of ["", "../secret", "../../AGENTS.md", "C:\\secret", "/etc/passwd", "a/b", "a\\b", "none", "workflow", "a.json"]) {
    await assert.rejects(readStyleProfile(id, root));
  }
  await assert.rejects(readStyleProfile("not-present", root), /file missing/);
  const profile = await readStyleProfile(profileId, repositoryRoot);
  await writeJson(root, "profiles/wrong-id.json", profile);
  await assert.rejects(readStyleProfile("wrong-id", root), /ID mismatch/);
  await writeFile(join(root, `profiles/${profileId}.json`), "broken");
  await assert.rejects(readStyleProfile(profileId, root), /Invalid JSON/);
  await writeFile(join(root, `profiles/${profileId}.json`), " ".repeat(65_537));
  await assert.rejects(readStyleProfile(profileId, root), /64 KiB/);
  await writeJson(root, "profiles/workflow.json", null);
  await assert.rejects(readWorkflowConfig(root), /Invalid input/);
  await writeJson(root, `profiles/${profileId}.json`, { ...profile, unknown: true });
  await assert.rejects(readStyleProfile(profileId, root), /Unrecognized key/);
  const portable = await readFile(join(repositoryRoot, "profiles/workflow.json"), "utf8");
  assert.ok(!portable.includes(repositoryRoot));
});

test("resolved profile/config links cannot escape the selected root", async t => {
  const root = await temporaryRepo(t);
  const outside = await temporaryRepo(t);
  await writeJson(outside, `${profileId}.json`, await readStyleProfile(profileId, repositoryRoot));
  await writeJson(outside, "workflow.json", await readWorkflowConfig(repositoryRoot));
  // Directory junctions work without symlink privilege on Windows.
  await symlink(outside, join(root, "profiles"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(readStyleProfile(profileId, root), /inside the selected repository/);
  await assert.rejects(readWorkflowConfig(root), /inside the selected repository/);
});
