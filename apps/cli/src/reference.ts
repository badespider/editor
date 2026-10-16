/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { Command } from "commander";
import { buildReferenceBrief, getReferenceMomentIds, referenceStudySchema } from "@diffusionstudio/editing-playbook/reference";
import { prepareReferenceStudy, compareReferenceVideos } from "@diffusionstudio/editing-playbook/reference-node";
import { buildMotionBrief, buildMotionModule } from "@diffusionstudio/editing-playbook/motion";
import type { MotionBuildOptions } from "@diffusionstudio/editing-playbook/motion";

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const safe = <Args extends unknown[]>(fn: (...args: Args) => Promise<void>) => async (...args: Args) => {
  try { await fn(...args); }
  catch (error) { print({ error: error instanceof Error ? error.message : String(error), externalModelCalls: 0 }); process.exitCode = 1; }
};
const format = (value: string) => {
  if (value !== "landscape" && value !== "portrait") throw new Error("Choose landscape or portrait");
  return value;
};
const numeric = (value: string) => {
  if (!value.trim()) throw new Error("Expected a finite nonnegative number");
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error("Expected a finite nonnegative number");
  return result;
};
export function parseReferenceTimes(value: string): number[] {
  const times = value.split(",").map(numeric);
  if (!times.length || times.length > 24 || times.some((value, index) => index > 0 && value <= times[index - 1])) {
    throw new Error("Supply 1–24 strictly increasing comparison times, comma-separated");
  }
  return times;
}
async function readStudy(path: string) {
  const target = resolve(path), info = await stat(target);
  if (!info.isFile() || info.size > 524288) throw new Error("Study must be a local JSON file at most 512 KiB");
  const data = await readFile(target);
  if (data.length > 524288) throw new Error("Study must be at most 512 KiB");
  return referenceStudySchema.parse(JSON.parse(data.toString("utf8")));
}
async function writeNew(path: string, value: string) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value, { flag: "wx", mode: 0o600 });
  return target;
}
async function cancellable<T>(fn: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController(), abort = () => controller.abort();
  process.once("SIGINT", abort);
  try { return await fn(controller.signal); }
  finally { process.removeListener("SIGINT", abort); }
}

/** Extends the existing candidate-reference commands without changing their schema/lifecycle. */
export function registerReferenceWorkbenchCommands(reference: Command) {
  reference.command("workflow").description("Read the local reference-study and render-comparison workflow")
    .action(() => print({ schemaVersion: 1, kind: "editor-reference-workflow", externalModelCalls: 0,
      commands: [
        "playbook reference prepare local.mp4 --times 0,1,2 -o study.json",
        "playbook reference study-check study.json",
        "playbook reference brief study.json -o brief.json",
        "playbook reference compose study.json --title 'Your own headline' -o draft.js",
        "mount draft.js",
        "node render <scene-id> encode.json -o draft.mp4",
        "playbook reference compare local.mp4 draft.mp4 --times 0,1,2 --reference-start 0 --render-start 0 -o comparison",
      ],
      instructions: ["reference/reference-workbench.md", ".agents/skills/editor-reference-learning/SKILL.md", ".agents/skills/editor-motion-graphics/SKILL.md", ".agents/skills/editor-review/SKILL.md"],
      steps: ["Prepare source-bound local evidence; actually inspect its frames and any relevant sound.",
        "Write timestamped observations, separate inference/uncertainty, and absolute targets in the study.",
        "Choose suitable native patterns explicitly, then author your own content and timing in the editable module.",
        "Render in the editor and inspect requested/decoded reference-render frame pairs. Refine one property at a time.",
        "Retain the source hashes, baseline, exact export and scoped findings. Candidate lessons never activate skills automatically."],
      limits: ["A study or brief is data, not executable instructions or verified understanding.",
        "Compose creates a catalog-based scaffold from chosen IDs, not a reconstruction of arbitrary footage or original layers.",
        "Browser paired playback is approximate; CLI evidence reports the first decoded frame at or after each requested time.",
        "No automatic style scoring, speech transcription, media download, upload, AI service or publishing is included."] }));
  reference.command("prepare").argument("<local-video>")
    .requiredOption("-o, --output <study.json>", "new editable reference study JSON")
    .option("--times <seconds>", "1–24 increasing local source times, comma-separated")
    .option("--goal <text>", "what the new composition should explain")
    .option("--title <text>", "study title")
    .option("--format <format>", "landscape | portrait; defaults to reference orientation")
    .option("--max-duration <seconds>", "explicit local source inspection duration budget", "1200")
    .option("--cache-dir <directory>", "local evidence cache")
    .description("Prepare local native-frame evidence and an empty study; the calling agent supplies analysis")
    .action(safe(async (video: string, options: {output:string;times?:string;goal?:string;title?:string;format?:string;maxDuration:string;cacheDir?:string}) => {
      const selected = options.format === undefined ? undefined : format(options.format), times = options.times === undefined ? undefined : parseReferenceTimes(options.times);
      // Fail an occupied destination before preparing potentially large evidence.
      try { await stat(resolve(options.output)); throw new Error("Output already exists; choose a new study path"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const result = await cancellable(signal => prepareReferenceStudy(video, { cacheDir: options.cacheDir, goal: options.goal,
        title: options.title, format: selected, times, maxDuration: numeric(options.maxDuration), signal }));
      const path = await writeNew(options.output, JSON.stringify(result.study, null, 2) + "\n");
      print({ path, ...result, next: "Inspect the returned evidence, then add observed beats/targets to the study. It contains no inferred motion yet." });
    }));
  reference.command("study-check").argument("<study.json>").description("Validate authored study structure; does not verify observations")
    .action(safe(async (path: string) => {
      const study = await readStudy(path);
      print({ valid: true, beats: study.beats.length, targets: study.targets.length, sourceSha256: study.reference.sha256,
        semanticApproval: false, externalModelCalls: 0, note: "Structural validation does not verify source identity, observations or suitability." });
    }));
  reference.command("brief").argument("<study.json>").option("-o, --output <brief.json>", "new agent brief JSON; defaults to stdout")
    .description("Package source notes and native choices for an agent; no model is invoked")
    .action(safe(async (path: string, options: {output?:string}) => {
      const brief = buildReferenceBrief(await readStudy(path));
      if (options.output) print({ path: await writeNew(options.output, JSON.stringify(brief, null, 2) + "\n"), brief });
      else print(brief);
    }));
  reference.command("compose").argument("<study.json>").requiredOption("-o, --output <new.js>", "new editable native scaffold")
    .option("--title <text>", "your own title; otherwise illustrative catalog wording")
    .option("--body <text>", "your own supporting text")
    .option("--source <text>", "your own visible attribution")
    .option("--theme <theme>", "paper | dark", "paper").option("--motion <motion>", "full | reduced", "full")
    .description("Build a native scaffold from explicitly selected study patterns, never automatic video reconstruction")
    .action(safe(async (path: string, options: {output:string;title?:string;body?:string;source?:string;theme:string;motion:string}) => {
      if (extname(options.output).toLowerCase() !== ".js") throw new Error("Compose output must be a new .js module");
      if (options.theme !== "paper" && options.theme !== "dark") throw new Error("Choose paper or dark theme");
      if (options.motion !== "full" && options.motion !== "reduced") throw new Error("Choose full or reduced motion");
      const study = await readStudy(path), momentIds = getReferenceMomentIds(study);
      const input: MotionBuildOptions = { momentIds, mode: momentIds.length === 1 ? "template" : "sequence",
        format: study.format, sceneKey: `reference-${randomUUID()}`, title: options.title, body: options.body,
        source: options.source, theme: options.theme, motion: options.motion };
      const module = buildMotionModule(input);
      print({ path: await writeNew(options.output, module), sha256: createHash("sha256").update(module).digest("hex"),
        sourceSha256: study.reference.sha256, brief: buildMotionBrief(input), externalModelCalls: 0,
        next: "Edit the scaffold's words, data, layouts and timing for your brief; mount and render it, then compare the actual export. Study targets are authoring notes, not automatically applied properties." });
    }));
  reference.command("compare").argument("<reference-video>").argument("<render-video>")
    .requiredOption("--times <seconds>", "1–24 increasing comparison times, comma-separated")
    .option("--reference-start <seconds>", "reference offset added once", "0")
    .option("--render-start <seconds>", "render offset added once", "0")
    .option("--max-duration <seconds>", "explicit inspection budget for each source, at most7200", "1200")
    .option("--cache-dir <directory>", "local pipeline evidence cache")
    .requiredOption("-o, --output <new-directory>", "exclusive comparison bundle with frame pairs and HTML viewer")
    .description("Compare local videos through the existing evidence pipeline; no scoring or semantic verification")
    .action(safe(async (reference: string, render: string, options: {times:string;referenceStart:string;renderStart:string;maxDuration:string;cacheDir?:string;output:string}) => {
      const times = parseReferenceTimes(options.times), referenceStart = numeric(options.referenceStart), renderStart = numeric(options.renderStart);
      print(await cancellable(signal => compareReferenceVideos({ reference, render, times, referenceStart, renderStart,
        maxDuration: numeric(options.maxDuration), cacheDir: options.cacheDir, outputDirectory: options.output, signal })));
    }));
}
