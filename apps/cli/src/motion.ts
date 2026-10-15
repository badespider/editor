import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { buildMotionBrief, buildMotionModule, getMotionMoment, motionMoments, searchMotionMoments } from "@diffusionstudio/editing-playbook/motion";
import type { MotionBuildOptions } from "@diffusionstudio/editing-playbook/motion";
import { checkMotionCandidate, createMotionCandidate, motionAdapterKinds, motionCandidateSchema, motionTestKinds } from "@diffusionstudio/editing-playbook/motion-candidates";

const formats = ["landscape", "portrait"] as const;
const modes = ["template", "sequence", "inspiration"] as const;
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
type BuildOptions = { mode: string; format: string; title?: string; body?: string; source?: string };

function safe<Args extends unknown[]>(action: (...args: Args) => Promise<void>) {
  return async (...args: Args) => {
    try { await action(...args); }
    catch (error) {
      print({ schemaVersion: 1, error: error instanceof Error ? error.message : String(error), externalCalls: 0 });
      process.exitCode = 1;
    }
  };
}

function format(value: string): MotionBuildOptions["format"] {
  if (!(formats as readonly string[]).includes(value)) throw new Error(`Choose format: ${formats.join(", ")}`);
  return value as MotionBuildOptions["format"];
}

function buildOptions(ids: string[], options: BuildOptions, mountable: boolean): MotionBuildOptions {
  const allowed = mountable ? modes.filter(mode => mode !== "inspiration") : modes;
  if (!(allowed as readonly string[]).includes(options.mode)) throw new Error(`Choose mode: ${allowed.join(", ")}${mountable ? "; use brief for inspiration" : ""}`);
  return { momentIds: ids, mode: options.mode as MotionBuildOptions["mode"], format: format(options.format),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.source === undefined ? {} : { source: options.source }) };
}

async function writeNew(path: string, content: string): Promise<string> {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx", mode: 0o600 });
  return target;
}

async function readCandidate(path: string): Promise<unknown> {
  const target = resolve(path), info = await stat(target);
  if (!info.isFile() || info.size > 8_000_000) throw new Error("Candidate must be a local JSON file at most 8 MB");
  const content = await readFile(target);
  if (content.byteLength > 8_000_000) throw new Error("Candidate must be a local JSON file at most 8 MB");
  return JSON.parse(content.toString("utf8")) as unknown;
}

export function registerMotionCommands(playbook: Command) {
  const motion = playbook.command("motion").description("Discover original native Moments, compose editable scenes and check inert integration candidates; local, no AI or downloads");
  motion.command("catalog").argument("[query]", "search native moment names, purposes and movement tags")
    .option("--format <format>", "landscape | portrait; omit to include both")
    .description("Search native Moments; external integration candidates are kept separate")
    .action(safe(async (query: string | undefined, options: { format?: string }) => {
      const selected = options.format === undefined ? undefined : format(options.format);
      const items = searchMotionMoments(query ?? "", selected);
      print({ schemaVersion: 1, kind: "editor-native-motion-catalog", query: query ?? "", format: selected ?? null, items, count: items.length, externalCalls: 0 });
    }));
  motion.command("show").argument("<id>", "native Moment ID, optionally prefixed with @")
    .description("Read one native Moment's purpose, timing, source origin and example")
    .action(safe(async (id: string) => {
      print({ schemaVersion: 1, moment: getMotionMoment(id), externalCalls: 0 });
    }));
  motion.command("create").argument("<ids...>", "one to six unique native Moment IDs in authored order")
    .option("--mode <mode>", "template | sequence; use template for one scene", "sequence")
    .option("--format <format>", "landscape | portrait", "landscape")
    .option("--title <text>", "caller-authored title")
    .option("--body <text>", "caller-authored explanation")
    .option("--source <text>", "caller-authored source or illustration label")
    .requiredOption("-o, --output <new.js>", "new executable native JavaScript module, never overwritten")
    .description("Compose an editable native module; use --mode template for one scene, sequence for ordered Moments")
    .action(safe(async (ids: string[], options: BuildOptions & { output: string }) => {
      if (extname(options.output).toLowerCase() !== ".js") throw new Error("Motion create output must be a new .js native module");
      // Fresh files must mount as distinct scenes; reloading one saved module
      // keeps the literal scene key embedded in that file.
      const input = { ...buildOptions(ids, options, true), sceneKey: `moment-${randomUUID()}` };
      const module = buildMotionModule(input), brief = buildMotionBrief(input);
      const path = await writeNew(options.output, module);
      print({ schemaVersion: 1, kind: "editor-native-motion-module", path, sha256: createHash("sha256").update(module).digest("hex"), brief,
        externalCalls: 0, next: "Mount this module in a new editor project, render the actual composition, then review its exact output. No app was contacted." });
    }));
  motion.command("brief").argument("<ids...>", "native Moment IDs in authored order")
    .option("--mode <mode>", "inspiration | template | sequence; template describes one scene", "inspiration")
    .option("--format <format>", "landscape | portrait", "landscape")
    .option("--title <text>", "caller-authored title")
    .option("--body <text>", "caller-authored explanation")
    .option("--source <text>", "caller-authored source or illustration label")
    .description("Describe motion intent without creating a module; use --mode template for a single-scene brief")
    .action(safe(async (ids: string[], options: BuildOptions) => {
      print(buildMotionBrief(buildOptions(ids, options, false)));
    }));
  motion.command("workflow").description("Read native composition commands, candidate schema and honest review requirements")
    .action(() => print({ schemaVersion: 1, formats, composeModes: ["template", "sequence"], briefModes: modes,
      defaults: { format: "landscape", createMode: "sequence", briefMode: "inspiration" }, nativeMomentIds: motionMoments.map(moment => moment.id),
      commands: ["playbook motion catalog [query] --format portrait", "playbook motion show <id>",
        "playbook motion create <id> --mode template --format landscape --title <text> --body <text> --source <text> -o new.js",
        "playbook motion create <ids...> --mode sequence --format portrait -o new.js", "playbook motion brief <ids...> --mode inspiration",
        "playbook motion candidate new <https-url> -o candidate.json", "playbook motion candidate check candidate.json"],
      instructions: ["reference/motion-catalog.md", "reference/motion-sources.md", "reference/jsx/editor-guidance.md", "reference/node/render.md"],
      skillReadArgs: ["editor-motion-graphics", "editor-motion-integration", "editor-review"].map(id => ["playbook", "skill", id]),
      candidateSchema: z.toJSONSchema(motionCandidateSchema), adapterKinds: motionAdapterKinds, requiredCandidateTestKinds: motionTestKinds,
      constraints: ["Template uses exactly one native Moment; sequence uses one to six unique Moments in the supplied order.",
        "Inspiration is an intent brief only and cannot generate a mountable module.",
        "Create writes an exclusive new JavaScript file. It does not mount, render, upload or publish.",
        "Candidate commands never fetch URLs, install dependencies or execute candidate content.",
        "Candidate checks assess declarations only. They do not authenticate files, licenses, hashes or inspection claims, and never activate a skill.",
        "Review the actual native-editor export for readability, protected context and native editability; encoder success is separate evidence."],
      safeToActivate: false, externalCalls: 0 }));

  const candidate = motion.command("candidate").description("Create/check inert external motion research records; never fetches, installs or activates them");
  candidate.command("new").argument("<https-url>", "source/reference URL, recorded without fetching")
    .option("--title <text>", "research candidate title")
    .requiredOption("-o, --output <candidate.json>", "new JSON record, never overwritten")
    .action(safe(async (url: string, options: { title?: string; output: string }) => {
      const draft = createMotionCandidate(url, options.title);
      const report = checkMotionCandidate(draft);
      const path = await writeNew(options.output, JSON.stringify(draft, null, 2) + "\n");
      print({ path, ...report });
    }));
  candidate.command("check").argument("<candidate.json>")
    .description("Check bounded local JSON declarations and missing evidence; no artifact reads, source fetches or activation")
    .action(safe(async (path: string) => {
      const report = checkMotionCandidate(await readCandidate(path));
      print(report); if (!report.valid) process.exitCode = 1;
    }));
}
