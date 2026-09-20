import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { checkExperiment, createExperimentDraft, experimentFormats, experimentSchema, requiredEditorialChecks } from "@diffusionstudio/editing-playbook";

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
function safe<A extends unknown[]>(action: (...args: A) => Promise<void>) {
  return async (...args: A) => { try { await action(...args); } catch (error) { console.error((error as Error).message); process.exitCode = 1; } };
}

export function registerExperimentCommands(playbook: Command) {
  const experiment = playbook.command("experiment").description("Local, provisional engagement comparisons; no analytics access, model calls, media edits or automatic learning");
  experiment.command("workflow").description("Read the experiment schema, editorial checks and lifecycle")
    .action(() => print({ schemaVersion: 1, instructions: "reference/engagement.md",
      commands: ["playbook experiment new --format long --hypothesis <text> --change <text> -o draft.json", "playbook experiment check experiment.json"],
      skillReadArgs: ["editor-vlog-story", "editor-short-form", "editor-youtube-packaging", "editor-review"].map(id => ["playbook", "skill", id]),
      requiredEditorialChecks: { long: requiredEditorialChecks("long"), short: requiredEditorialChecks("short") },
      schema: z.toJSONSchema(experimentSchema), safeToAutoPromote: false, externalModelCalls: 0,
      constraints: ["A new draft is intentionally incomplete, not an approved experiment or a measured result.",
        "Check is structural only: hashes, review claims and analytics evidence are recorded, not independently verified.",
        "Unknown metrics are omitted, not zero. No winner, uplift or significance is calculated.",
        "Read linked guidance for qualitative checks. JSON Schema cannot express all cross-field checks; run experiment check."] }));
  experiment.command("new").requiredOption("--format <format>", "long | short")
    .requiredOption("--hypothesis <text>").requiredOption("--change <text>").requiredOption("-o, --output <file>", "new JSON file; never overwritten")
    .action(safe(async (options: { format: string; hypothesis: string; change: string; output: string }) => {
      const format = z.enum(experimentFormats).parse(options.format);
      const draft = createExperimentDraft({ format, hypothesis: options.hypothesis, change: options.change });
      const path = resolve(options.output);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(draft, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      print({ path, status: "candidate", valid: false, evidenceLevel: "not_measured", instructions: "reference/engagement.md",
        requiredEditorialChecks: requiredEditorialChecks(format), needs: "Fill source/variant identity and comparison design. Leave review, conclusion and approval null until supported.", externalModelCalls: 0 });
    }));
  experiment.command("check").argument("<experiment.json>").description("Check declared identities, timing, reviews and metric comparability; does not authenticate files or analytics")
    .action(safe(async (path: string) => {
      const target = resolve(path), info = await stat(target);
      if (!info.isFile() || info.size > 8_000_000) throw new Error("Experiment must be a local JSON file at most 8 MB.");
      const report = checkExperiment(JSON.parse(await readFile(target, "utf8")));
      print(report); if (!report.valid) process.exitCode = 1;
    }));
}
