import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { recommend, relationships, skillIds, skills, validatePlan } from "../src/index.ts";
import type { Format, SkillId } from "../src/index.ts";
import { readSkill } from "../src/skill-reader.ts";
import { fixture } from "./fixture.ts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const idsFor = (goal: string, format: Format = "story") => recommend(format, goal).skills.map(skill => skill.id);
const creativeIds: SkillId[] = ["editor-vlog-story", "editor-scene-building", "editor-short-form", "editor-youtube-packaging", "editor-sound-polish"];

test("catalog covers declared skill IDs, with unique IDs, paths and CLI read arguments", () => {
  assert.deepEqual(skills.map(skill => skill.id), [...skillIds]);
  assert.equal(new Set(skills.map(skill => skill.id)).size, skills.length);
  assert.equal(new Set(skills.map(skill => skill.path)).size, skills.length);
  for (const skill of skills) assert.deepEqual(skill.readArgs, ["playbook", "skill", skill.id]);
});

test("vlog routing adds direction for everyday and multi-day requests, not every story", () => {
  for (const goal of ["Edit a multi-day vlog", "Shape a day-in-my-life video", "Plan my video diary", "Edit my VLOG"]) {
    assert.ok(idsFor(goal).includes("editor-vlog-story"), goal);
  }
  assert.ok(!idsFor("Edit a personal interview").includes("editor-vlog-story"));
});

test("coverage requests select scene building and all its instruction prerequisites", () => {
  for (const goal of ["Use B-roll under the explanation", "Plan pickup shots", "Improve visual coverage", "Add a cutaway"]) {
    const ids = idsFor(goal, "montage");
    for (const required of ["editor-scene-building", "editor-story-plan", "editor-visual-focus", "editor-audio-continuity", "editor-video-evidence"]) {
      assert.ok(ids.includes(required as SkillId), `${goal}: ${required}`);
    }
  }
});

test("short-form routing distinguishes standalone clips from shorter edits or keyboard shortcuts", () => {
  for (const goal of ["Make mobile Shorts", "Create a Reel", "Choose short-form moments", "Pull clips from this vlog", "Create a vertical clip", "create some clip", "Make a few clips", "Help with clipping"]) {
    assert.ok(idsFor(goal).includes("editor-short-form"), goal);
  }
  for (const goal of ["Make this tutorial shorter", "Explain keyboard shortcuts", "Export a short preview"]) {
    assert.ok(!idsFor(goal).includes("editor-short-form"), goal);
  }
});

test("requested packaging joins an edit but does not appear on every YouTube mention", () => {
  for (const goal of ["Edit this vlog and write SEO", "Suggest thumbnail concepts", "Prepare a YouTube description", "Write a pinned comment"]) {
    assert.ok(idsFor(goal).includes("editor-youtube-packaging"), goal);
  }
  assert.ok(!idsFor("Edit a YouTube tutorial about databases").includes("editor-youtube-packaging"));
});

test("sound treatment is separate from ordinary audio continuity", () => {
  for (const goal of ["Sound polish", "Improve dialogue clarity", "Fix uneven volume", "Audio cleanup", "Make the speech cleaner", "Assess noise reduction"]) {
    const ids = idsFor(goal);
    assert.ok(ids.includes("editor-sound-polish"), goal);
    assert.ok(ids.includes("editor-audio-continuity"));
  }
  assert.ok(!idsFor("Preserve complete speech").includes("editor-sound-polish"));
  assert.ok(!idsFor("Edit the interview", "interview").includes("editor-sound-polish"));
});

test("package-only tasks do not request new editing skills even if copy mentions vlogs or Shorts", () => {
  for (const goal of ["SEO for my vlog", "English Short title and description", "A thumbnail for the B-roll tutorial"]) {
    const result = recommend("story", goal, false, "package");
    assert.deepEqual(result.skills.map(skill => skill.id), ["editor-youtube-packaging"]);
    assert.equal(result.task, "package");
    assert.equal(result.providerRequired, false);
  }
});

test("explicit reference work still requests candidate learning/review, including copy-only tasks", () => {
  const result = recommend("story", "YouTube title", true, "package");
  assert.deepEqual(new Set(result.skills.map(skill => skill.id)), new Set(["editor-youtube-packaging", "editor-reference-learning", "editor-review"]));
});

test("every recommendation contains its transitive requirements and only selected graph endpoints", () => {
  for (const goal of ["edit footage", "vlog", "B-roll", "Shorts", "SEO", "sound polish", "vlog with B-roll, Shorts, SEO and sound polish"]) {
    for (const format of ["tutorial", "interview", "story", "montage"] as const) {
      const result = recommend(format, goal);
      const selected = new Set(result.skills.map(skill => skill.id));
      assert.equal(selected.size, result.skills.length);
      for (const edge of relationships) {
        if (edge.type === "requires" && selected.has(edge.from)) assert.ok(selected.has(edge.to));
      }
      for (const edge of result.relationships) assert.ok(selected.has(edge.from) && selected.has(edge.to));
      assert.equal(result.providerRequired, false);
    }
  }
});

test("specialized skill IDs validate in plans without bypassing evidence or review gates", () => {
  for (const id of creativeIds) {
    const plan = fixture(); plan.skills.push(id);
    const valid = validatePlan(plan);
    assert.equal(valid.technicalPass, true);
    assert.equal(valid.safeToAutoEdit, false);
    plan.evidence[0].verification = "uncertain";
    assert.equal(validatePlan(plan).technicalPass, false);
  }
});

test("skill reader returns exact instructions from the selected checkout for every catalog ID", async () => {
  for (const skill of skills) {
    const result = await readSkill(skill.id, repositoryRoot);
    assert.equal(result.instructions, await readFile(join(repositoryRoot, skill.path), "utf8"));
    assert.equal(result.absolutePath, join(repositoryRoot, skill.path));
    assert.equal(result.id, skill.id);
    assert.equal(result.maturity, "starter");
    assert.deepEqual(result.relationships, relationships.filter(edge => edge.from === skill.id || edge.to === skill.id));
  }
});

test("skill reader rejects arbitrary paths and unknown IDs before any file read", async () => {
  for (const id of ["../README.md", "../../AGENTS.md", "C:\\secret.txt", "", "editor-not-real"]) {
    await assert.rejects(readSkill(id, join(repositoryRoot, "not-a-checkout")), /Unknown editing skill/);
  }
});

test("skill reader accepts explicit relocated roots/CRLF and rejects missing or mismatched skills", async t => {
  const root = await mkdtemp(join(tmpdir(), "editor-skill-reader-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const skill = skills.find(skill => skill.id === "editor-vlog-story")!;
  await assert.rejects(readSkill(skill.id, root), /Skill file missing.*--repo/);
  const target = join(root, skill.path);
  await mkdir(dirname(target), { recursive: true });
  const content = (await readFile(join(repositoryRoot, skill.path), "utf8")).replace(/\r?\n/g, "\r\n");
  await writeFile(target, content, { flag: "wx" });
  assert.equal((await readSkill(skill.id, root)).instructions, content);
  await writeFile(target, content.replace("name: editor-vlog-story", "name: unrelated-skill"));
  await assert.rejects(readSkill(skill.id, root), /metadata does not match/);
});
