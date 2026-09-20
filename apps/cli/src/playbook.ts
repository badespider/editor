import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { formats, recommendationTasks, relationships, skills, validatePlan, validateReference, youtubeUrlSchema } from "@diffusionstudio/editing-playbook";
import type { Format, RecommendationTask } from "@diffusionstudio/editing-playbook";
import { readSkill } from "@diffusionstudio/editing-playbook/skills";
import { recommendWithProfile } from "@diffusionstudio/editing-playbook/profiles";
import { renderPreview } from "@diffusionstudio/editing-playbook/node";
import { prepareDelivery } from "@diffusionstudio/editing-playbook/delivery";
import { verifyDelivery } from "@diffusionstudio/editing-playbook/review";
import { deliverPreparedEdit } from './playbook-delivery';
import { registerClipCommands } from './clips';
import { registerExperimentCommands } from './experiments';
import { registerLayeredCommands } from './layered';

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(resolve(path), "utf8"));
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const safe = <Args extends unknown[]>(action: (...args: Args) => Promise<void>) => async (...args: Args) => {
  try { await action(...args); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
};

export function registerPlaybookCommands(program: Command) {
  const playbook = program.command("playbook").description("Local evidence-backed plans, prepared edits, actual-editor delivery and review. No AI API calls.");
  registerClipCommands(playbook);
  registerExperimentCommands(playbook);
  registerLayeredCommands(playbook);
  playbook.command("skills").description("List editing skills and their relationship graph, including the default agent evidence workflow")
    .action(() => print({ schemaVersion: 1, skills, relationships, note: "Paths are relative to the editor repository. Use readArgs to retrieve instructions with playbook skill. Skills remain starter guidance, not learned results." }));
  playbook.command("skill").argument("<id>").option("--repo <directory>", "editor checkout containing .agents/skills; defaults to this CLI build's checkout")
    .description("Read a catalog skill's complete instructions without native agent skill discovery or a running app")
    .action(safe(async (id: string, options: { repo?: string }) => {
      // Source and bundled CJS entrypoints both live three levels below the checkout.
      print(await readSkill(id, options.repo ? resolve(options.repo) : resolve(__dirname, "../../..")));
    }));
  playbook.command("recommend").requiredOption("--goal <text>").option("--format <format>", formats.join(" | "), "tutorial")
    .option("--task <task>", "edit | package (copy only) | evaluate (existing evidence/comparisons)", "edit")
    .option("--reference", "include the reference-learning workflow")
    .option("--profile <id|none>", "explicit repo-local style profile or disable the default")
    .option("--repo <directory>", "editor checkout containing profiles; defaults to this CLI build's checkout")
    .action(safe(async (options: { goal: string; format: string; task: string; reference?: boolean; profile?: string; repo?: string }) => {
      if (!formats.includes(options.format as Format)) throw new Error(`Choose format: ${formats.join(", ")}`);
      if (!recommendationTasks.includes(options.task as RecommendationTask)) throw new Error(`Choose task: ${recommendationTasks.join(", ")}`);
      if (!options.goal.trim()) throw new Error("A goal is required.");
      print(await recommendWithProfile({ repositoryRoot: options.repo ? resolve(options.repo) : resolve(__dirname, "../../.."),
        format: options.format as Format, goal: options.goal, task: options.task as RecommendationTask,
        hasReference: options.reference, profile: options.profile }));
    }));
  playbook.command("check").argument("<plan.json>").description("Validate bounds, cited evidence, protected moments and speech boundaries")
    .action(safe(async (path: string) => {
      const report = validatePlan(await readJson(path)); print(report);
      if (!report.technicalPass) process.exitCode = 1;
    }));
  playbook.command("preview").argument("<plan.json>").requiredOption("-o, --output <path>", "new .mp4 path (never overwritten)")
    .description("Render a local cut-only review copy: at most 120 seconds / 24 segments")
    .action(safe(async (path: string, options: { output: string }) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once("SIGINT", abort);
      try { print(await renderPreview(await readJson(path), { output: options.output, baseDirectory: dirname(resolve(path)), signal: controller.signal })); }
      finally { process.removeListener("SIGINT", abort); }
    }));
  playbook.command('prepare').argument('<plan.json>').requiredOption('-o, --output <directory>', 'new edit bundle directory')
    .option('--settings <settings.json>', 'dimensions, name, local duration budget and chapter anchors')
    .description('Prepare source-bound selected media, an editable TSX timeline and independent chapters; no running app needed')
    .action(safe(async (path: string, options: { output: string; settings?: string }) => {
      const controller = new AbortController();
      const abort = () => controller.abort(); process.once('SIGINT', abort);
      try { print(await prepareDelivery(await readJson(path), { output: options.output, baseDirectory: dirname(resolve(path)),
        settings: options.settings ? await readJson(options.settings) : undefined, signal: controller.signal, onProgress: message => console.error(message) })); }
      finally { process.removeListener('SIGINT', abort); }
    }));
  playbook.command('deliver').argument('<bundle-directory>').requiredOption('-o, --output <video.mp4>', 'new delivery path, never overwritten')
    .description('Create a NEW editor project, render its actual composition, verify and save locally; app must be running')
    .action(safe(async (directory: string, options: { output: string }) => {
      const result = await deliverPreparedEdit(directory, options.output, message => console.error(message));
      print(result); if (result.status === 'technical_review_failed') process.exitCode = 1;
    }));
  playbook.command('verify').argument('<bundle-directory>').argument('<video.mp4>')
    .option('-o, --output <report.json>', 'new JSON report path')
    .description('Full decode, duration/frame checks and sampled picture/audio comparisons; no project changes')
    .action(safe(async (directory: string, video: string, options: { output?: string }) => {
      const controller = new AbortController();
      const abort = () => controller.abort(); process.once('SIGINT', abort);
      try {
        const report = await verifyDelivery(directory, video, { signal: controller.signal, onProgress: message => console.error(message) });
        if (options.output) await writeFile(resolve(options.output), JSON.stringify(report, null, 2), { flag: 'wx' });
        print(report); if (!report.technicalPass) process.exitCode = 1;
      } finally { process.removeListener('SIGINT', abort); }
    }));
  const reference = playbook.command("reference").description("Create/check candidate reference notes; never downloads or activates a skill");
  reference.command("new").argument("<youtube-url>").requiredOption("-o, --output <path>")
    .action(safe(async (url: string, options: { output: string }) => {
      youtubeUrlSchema.parse(url);
      const draft = { schemaVersion: 1, status: "candidate", url, title: "", technique: "", moments: [],
        takeaway: "", useWhen: [], avoidWhen: [], localTests: [] };
      const path = resolve(options.output);
      await writeFile(path, JSON.stringify(draft, null, 2) + "\n", { flag: "wx" });
      print({ path, valid: false, status: "candidate", needs: "Inspect the source and complete the empty fields, then run reference check. No video was fetched." });
    }));
  reference.command("check").argument("<reference.json>")
    .action(safe(async (path: string) => {
      const report = validateReference(await readJson(path)); print(report);
      if (!report.valid) process.exitCode = 1;
    }));
}
