import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import type { Command } from "commander";
import { z } from "zod";
import { buildMotionBrief, buildMotionModule, getMotionMoment, getMotionContentExample, motionCategories, motionMoments, searchMotionMoments } from "@diffusionstudio/editing-playbook/motion";
import type { MotionBuildOptions, MotionCategory } from "@diffusionstudio/editing-playbook/motion";
import { buildMotionMixBrief, buildMotionMixModule, getMotionMixExample, mixableMotionMoments, motionMixSchema } from "@diffusionstudio/editing-playbook/motion-mix";
import { checkMotionCandidate, createMotionCandidate, motionAdapterKinds, motionCandidateSchema, motionTestKinds } from "@diffusionstudio/editing-playbook/motion-candidates";
import { registerMotionLibraryCommands } from './motion-library';

const formats = ["landscape", "portrait"] as const;
const modes = ["template", "sequence", "inspiration"] as const;
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
type BuildOptions = { mode: string; format: string; title?: string; body?: string; source?: string;content?:string;theme?:string;motion?:string };

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
  if(options.theme!==undefined && !["paper","dark"].includes(options.theme))throw new Error("Choose theme: paper, dark");
  if(options.motion!==undefined && !["full","reduced"].includes(options.motion))throw new Error("Choose motion: full, reduced");
  return { momentIds: ids, mode: options.mode as MotionBuildOptions["mode"], format: format(options.format),theme:options.theme as MotionBuildOptions["theme"],motion:options.motion as MotionBuildOptions["motion"],
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

async function readCandidate(path: string, maxBytes=8_000_000): Promise<unknown> {
  const target = resolve(path), info = await stat(target);
  if (!info.isFile() || info.size > maxBytes) throw new Error(`Expected a local JSON file at most ${maxBytes} bytes`);
  const content = await readFile(target);
  if (content.byteLength > maxBytes) throw new Error(`Expected a local JSON file at most ${maxBytes} bytes`);
  return JSON.parse(content.toString("utf8")) as unknown;
}

export function registerMotionCommands(playbook: Command) {
  const motion = playbook.command("motion").description("Discover original native Moments, compose editable scenes and check inert integration candidates; local, no AI or downloads");
  registerMotionLibraryCommands(motion);
  motion.command("catalog").argument("[query]", "search native moment names, purposes and movement tags")
    .option("--format <format>", "landscape | portrait; omit to include both")
    .option("--category <category>", motionCategories.join(" | "))
    .option("--mixable", "only entries with bounded native component mix adapters")
    .description("Search native Moments; external integration candidates are kept separate")
    .action(safe(async (query: string | undefined, options: { format?: string;category?:string;mixable?:boolean }) => {
      const selected = options.format === undefined ? undefined : format(options.format);
      const items = searchMotionMoments(query ?? "", selected,options.category as MotionCategory|undefined).filter(item=>!options.mixable || item.mixable);
      print({ schemaVersion: 1, kind: "editor-native-motion-catalog", query: query ?? "", format: selected ?? null, items, count: items.length, externalCalls: 0 });
    }));
  motion.command("show").argument("<id>", "native Moment ID, optionally prefixed with @")
    .description("Read one native Moment's purpose, timing, source origin and example")
    .action(safe(async (id: string) => {
      const moment=getMotionMoment(id);
      print({ schemaVersion: 1, moment,exampleContent:{[moment.id]:getMotionContentExample(moment.id)}, externalCalls: 0 });
    }));
  motion.command("categories").description("List native categories and preset counts").action(()=>print({categories:motionCategories.map(category=>({id:category,count:motionMoments.filter(m=>m.category===category).length})),total:motionMoments.length}));
  motion.command("mix-example")
    .option("--format <format>","landscape | portrait","landscape")
    .requiredOption("-o, --output <recipe.json>","new editable mix recipe JSON, never overwritten")
    .description("Write an original counter/background/chart/source-card mix example with explicit boxes and times")
    .action(safe(async(options:{format:string;output:string})=>{
      const recipe=getMotionMixExample(format(options.format));
      const path=await writeNew(options.output,JSON.stringify(recipe,null,2)+"\n");
      print({schemaVersion:1,kind:"editor-native-motion-mix-recipe",path,recipe,externalCalls:0});
    }));
  motion.command("mix").argument("<recipe.json>","strict local mix recipe, at most 128 KiB")
    .requiredOption("-o, --output <new.js>","new native module, never overwritten")
    .description("Mix curated native components in one editable scene; array order draws bottom to top")
    .action(safe(async(path:string,options:{output:string})=>{
      if(extname(options.output).toLowerCase()!==".js")throw new Error("Motion mix output must be a new .js native module");
      const parsed=motionMixSchema.parse(await readCandidate(path,131072));
      const input={...parsed,sceneKey:parsed.sceneKey??`motion-mix-${randomUUID()}`};
      const module=buildMotionMixModule(input),brief=buildMotionMixBrief(input);
      const output=await writeNew(options.output,module);
      print({schemaVersion:1,kind:"editor-native-motion-mix-module",path:output,sha256:createHash("sha256").update(module).digest("hex"),brief,externalCalls:0,
        next:"Mount in a new project, inspect overlapping layers and reading holds, render the native scene, then check reverse seeks and reload."});
    }));
  motion.command("example").argument("<id>").requiredOption("-o, --output <settings.json>","new editable data settings")
    .description("Write authored example values/timings for a preset; does not fetch data or transcribe audio")
    .action(safe(async(id:string,options:{output:string})=>{const moment=getMotionMoment(id);const content={[moment.id]:getMotionContentExample(moment.id)};const path=await writeNew(options.output,JSON.stringify(content,null,2)+"\n");print({path,content,externalCalls:0});}));
  motion.command("create").argument("<ids...>", "one to six unique native Moment IDs in authored order")
    .option("--mode <mode>", "template | sequence; use template for one scene", "sequence")
    .option("--format <format>", "landscape | portrait", "landscape")
    .option("--title <text>", "caller-authored title")
    .option("--body <text>", "caller-authored explanation")
    .option("--source <text>", "caller-authored source or illustration label")
    .option("--content <settings.json>","preset data keyed by selected moment ID, at most 128 KiB")
    .option("--theme <theme>","paper | dark","paper")
    .option("--motion <motion>","full | reduced (decorative motion)","full")
    .requiredOption("-o, --output <new.js>", "new executable native JavaScript module, never overwritten")
    .description("Compose an editable native module; use --mode template for one scene, sequence for ordered Moments")
    .action(safe(async (ids: string[], options: BuildOptions & { output: string }) => {
      if (extname(options.output).toLowerCase() !== ".js") throw new Error("Motion create output must be a new .js native module");
      // Fresh files must mount as distinct scenes; reloading one saved module
      // keeps the literal scene key embedded in that file.
      const input = { ...buildOptions(ids, options, true), sceneKey: `moment-${randomUUID()}` };
      if(options.content) input.content=await readCandidate(options.content,131072) as MotionBuildOptions["content"];
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
    .option("--content <settings.json>","preset data keyed by selected moment ID, at most 128 KiB")
    .option("--theme <theme>","paper | dark","paper")
    .option("--motion <motion>","full | reduced (decorative motion)","full")
    .description("Describe motion intent without creating a module; use --mode template for a single-scene brief")
    .action(safe(async (ids: string[], options: BuildOptions) => {
      const input=buildOptions(ids,options,false);
      if(options.content)input.content=await readCandidate(options.content,131072) as MotionBuildOptions["content"];
      print(buildMotionBrief(input));
    }));
  motion.command("workflow").description("Read native composition commands, candidate schema and honest review requirements")
    .action(() => print({ schemaVersion: 1, formats, composeModes: ["template", "sequence"], briefModes: modes,
      defaults: { format: "landscape", createMode: "sequence", briefMode: "inspiration",theme:"paper",motion:"full" },categories:motionCategories,nativeMomentIds: motionMoments.map(moment => moment.id),
      commands: ["playbook motion catalog [query] --format portrait", "playbook motion show <id>",
        "playbook motion create <id> --mode template --format landscape --title <text> --body <text> --source <text> -o new.js",
        "playbook motion create <ids...> --mode sequence --format portrait -o new.js", "playbook motion brief <ids...> --mode inspiration",
        "playbook motion categories", "playbook motion example <id> -o settings.json", "playbook motion create <id> --mode template --content settings.json --theme dark --motion reduced -o new.js", "playbook motion catalog --mixable", "playbook motion mix-example --format portrait -o recipe.json", "playbook motion mix recipe.json -o new.js", "playbook motion candidate new <https-url> -o candidate.json", "playbook motion candidate check candidate.json"],
      instructions: ["reference/motion-catalog.md", "reference/motion-sources.md", "reference/jsx/editor-guidance.md", "reference/node/render.md"],
      skillReadArgs: ["editor-motion-graphics", "editor-motion-recipes", "editor-motion-integration", "editor-review"].map(id => ["playbook", "skill", id]),
      mixablePresetIds:mixableMotionMoments().map(item=>item.id),mixRecipeSchema:z.toJSONSchema(motionMixSchema),
      candidateSchema: z.toJSONSchema(motionCandidateSchema), adapterKinds: motionAdapterKinds, requiredCandidateTestKinds: motionTestKinds,
      constraints: ["Template uses exactly one native Moment; sequence uses one to six unique Moments in the supplied order.",
        "Inspiration is an intent brief only and cannot generate a mountable module.",
        "Create writes an exclusive new JavaScript file. It does not mount, render, upload or publish.",
        "Mix uses 1..24 uniquely keyed native component instances on one bounded canvas; repeated preset IDs are allowed. Only mixable catalog entries have adapters; template scene wrappers are never stacked.",
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
