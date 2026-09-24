import { readFile, stat } from "node:fs/promises";
import type { Command } from "commander";
import { AgentEvidenceService, openSchema, inspectSchema, observationSchema, transcriptSchema } from "@diffusionstudio/video-understanding/agent";
import { agentWorkflow } from "@diffusionstudio/video-understanding/workflow";
import { z } from "zod";
import { editor } from "./cli-client";
import { registerReferenceAnalysis } from './reference-analysis';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
type Options = { desktop?: boolean; cacheDir?: string; times?: string[]; start?: string; end?: string; count?: string; native?: boolean; clip?: boolean; audio?: boolean; query?: string };
function transport(o: Options) { if(o.desktop && o.cacheDir) throw new Error('--desktop uses the desktop cache; do not combine it with --cache-dir.'); }
async function action(fn: (signal: AbortSignal) => Promise<unknown>) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  try { print(await fn(controller.signal)); }
  catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  finally { process.removeListener("SIGINT", abort); }
}
export function registerAgentEvidenceCommands(media: Command) {
  registerReferenceAnalysis(media);
  media.command('workflow').description('Default agent-operated inspection → evidence → editing → review contract, with JSON input schemas. No editor or key required.')
    .action(() => print({ ...agentWorkflow, schemas: {
      open: z.toJSONSchema(openSchema, {io:'input'}), inspect: z.toJSONSchema(inspectSchema, {io:'input'}),
      transcriptImport: z.toJSONSchema(transcriptSchema, {io:'input'}), observe: z.toJSONSchema(observationSchema, {io:'input'}),
    }, schemaNote: 'Runtime validation also enforces cross-field rules: times XOR start/end, bounded clip/audio ranges, source fingerprints, matching evidence IDs and timestamps.' }));
  media.command("inspect").argument("<session-id>")
    .description("Local agent evidence: request decoded frames and optional bounded clip/audio. No model calls.")
    .option("--desktop", "use the desktop evidence API and its cache")
    .option("--cache-dir <directory>").option("--times <seconds...>", "explicit numeric source seconds, up to 48")
    .option("--start <seconds>").option("--end <seconds>").option("--count <number>", "evenly spaced frames, 1–48")
    .option("--native", "retain original frame resolution; default max width 960")
    .option("--clip", "also provide a local H.264 inspection clip, at most 120 seconds")
    .option("--audio", "also provide source-aligned mono WAV, at most 600 seconds")
    .action((id: string, o: Options) => action(signal => {
      transport(o);
      const request = inspectSchema.parse({
      times: o.times?.map(Number), start: o.start === undefined ? undefined : Number(o.start),
      end: o.end === undefined ? undefined : Number(o.end), count: o.count === undefined ? undefined : Number(o.count),
      native: !!o.native, clip: !!o.clip, audio: !!o.audio,
      });
      return o.desktop ? editor.media.inspect.mutate({id,request}, {context:{timeoutMs:660000}}) : new AgentEvidenceService(o.cacheDir).inspect(id, request, signal);
    }));
  media.command("dossier").argument("<session-id>").description("Read an agent evidence session or search its attributed observations and transcript.")
    .option("--desktop", "use the desktop evidence API and its cache")
    .option("--cache-dir <directory>").option("--query <text>", "lexical search, not semantic similarity")
    .action((id: string, o: Options) => action(async () => {
      transport(o);
      if(o.desktop) return editor.media.dossier.query({id,query:o.query});
      const service = new AgentEvidenceService(o.cacheDir);
      return o.query === undefined ? service.read(id) : service.search(id, o.query);
    }));
  for (const [name, description] of [["transcript-import", "Import source-fingerprinted local transcription; never mark it as verified speech."],
    ["observe", "Store an agent's timestamped observations referencing evidence IDs. Reports remain fallible data."]] as const) {
    media.command(name).argument("<session-id>").argument("<json-file>").description(description).option("--cache-dir <directory>")
      .option("--desktop", "use the desktop evidence API and its cache")
      .action((id: string, path: string, o: Options) => action(async () => {
        transport(o);
        const source = await stat(path);
        if (!source.isFile() || source.size > 8 * 1024 ** 2) throw new Error("Import JSON must be a regular file of at most 8 MiB");
        const info = await readFile(path, "utf8");
        if (Buffer.byteLength(info) > 8 * 1024 ** 2) throw new Error("Import JSON exceeds 8 MiB");
        const service = new AgentEvidenceService(o.cacheDir);
        if(name === 'observe') {
          const report = observationSchema.parse(JSON.parse(info));
          return o.desktop ? editor.media.observe.mutate({id,report}) : service.observe(id,report);
        }
        const transcript = transcriptSchema.parse(JSON.parse(info));
        return o.desktop ? editor.media.transcriptImport.mutate({id,transcript}) : service.importTranscript(id,transcript);
      }));
  }
}
