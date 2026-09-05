import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { Command } from "commander";
import { UnderstandingService } from "@diffusionstudio/video-understanding/node";
import type { AnalyzeRequest, Job } from "@diffusionstudio/video-understanding/types";
import { editor } from "./cli-client";
import { EditorUnderstandingService } from "@diffusionstudio/video-understanding/system";
import { registerAgentEvidenceCommands } from "./agent-evidence";

type Options = { provider?: string; overviewCount?: string; local?: boolean; desktop?: boolean; cacheDir?: string; upload?: boolean; prepareOnly?: boolean;
  goal?: string; model?: string; maxEvents?: string; maxDuration?: string; maxVerificationSeconds?: string; force?: boolean; wait?: boolean; output?: string };
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const fail = (error: unknown) => { console.error((error as Error).message); process.exitCode = 1; };

export function registerUnderstandingCommands(media: Command) {
  registerAgentEvidenceCommands(media);
  media.command("understand").argument("<id|path>", "video asset id or local file")
    .description("Prepare video evidence for the calling agent (default, no model calls), or explicitly select Gemini analysis.")
    .option("--provider <provider>", "agent (default, local files) or gemini (optional cloud adapter)", "agent")
    .option("--overview-count <number>", "agent overview frame count, 1–48 (default 12)")
    .option("--local", "run in this CLI process without an open editor (requires a local path; always waits)")
    .option("--desktop", "use the desktop API for agent evidence; accepts a local path or desktop video asset id")
    .option("--cache-dir <directory>", "local-mode evidence cache location")
    .option("--upload", "allow sending video/audio to Google Gemini; API charges may apply")
    .option("--prepare-only", "decode and save native-resolution evidence locally, without any API calls")
    .option("--goal <text>", "what the editor needs to understand")
    .option("--model <id>", "Gemini model supporting agentic video (or GEMINI_VIDEO_MODEL)")
    .option("--max-events <number>", "maximum verification calls, 1–24 (default 8)")
    .option("--max-verification-seconds <seconds>", "per-event video budget (default 20, maximum 60); longer events remain unverified")
    .option("--max-duration <seconds>", "reject longer sources (default 1200, maximum 7200)")
    .option("--force", "create new analysis even if a matching cached result exists")
    .option("--wait", "wait for a desktop job to finish")
    .option("-o, --output <path>", "write completed evidence JSON, exclusively (implies --wait)")
    .action(async (ref: string, options: Options) => {
      let local: UnderstandingService | undefined;
      let current: Job | undefined;
      const agentCancellation = new AbortController();
      const system = new EditorUnderstandingService(options.cacheDir);
      const abort = () => {
        agentCancellation.abort();
        if (local) local.stop();
        else if (current) void editor.media.understandingCancel.mutate({ id: current.id }).catch(fail);
      };
      process.once("SIGINT", abort);
      try {
        if (!["agent", "gemini"].includes(options.provider || "agent")) throw new Error("--provider must be agent or gemini");
        if (options.desktop && (options.local || options.cacheDir)) throw new Error("--desktop cannot be combined with --local or --cache-dir; desktop owns its cache.");
        if (options.provider !== "gemini" && !options.prepareOnly) {
          if (options.upload || options.model || options.maxEvents || options.maxVerificationSeconds || options.force) throw new Error("Cloud/force options do not apply to agent evidence. To use Gemini, explicitly select --provider gemini --upload.");
          const request = { provider: "agent" as const, goal: options.goal,
            maxDuration: options.maxDuration === undefined ? undefined : Number(options.maxDuration),
            overviewCount: options.overviewCount === undefined ? undefined : Number(options.overviewCount),
          };
          const session = options.desktop
            ? await editor.media.understand.mutate({ ...request, ...(existsSync(ref) ? { path: resolve(ref) } : { id: ref }) }, { context: { timeoutMs: 660000 } })
            : await system.understand({ ...request, path: resolve(ref) }, agentCancellation.signal);
          if (!("kind" in session) || session.kind !== "agent-video-evidence") throw new Error("Desktop did not return agent evidence. Rebuild/restart it before continuing; no cloud fallback will be attempted.");
          if (options.output) await writeFile(resolve(options.output), JSON.stringify(session, null, 2), { flag: "wx", mode: 0o600 });
          print({ provider: "agent", sessionId: session.id, revision: session.revision, source: session.source, audio: session.audio,
            overview: session.inspections[0], externalModelCalls: 0, safeToAutoEdit: false,
            next: "Read media workflow, inspect the returned files yourself, refine with media inspect, import local ASR with transcript-import, and save findings with observe. Use dossier to resume and playbook check before editing.",
            transport: options.desktop ? "desktop (use --desktop for subsequent evidence commands)" : "local (reuse the same --cache-dir if specified)", limitations: session.limitations });
          return;
        }
        if (options.prepareOnly && options.upload) throw new Error("--prepare-only cannot be combined with --upload");
        if (options.overviewCount) throw new Error("--overview-count applies only to agent mode");
        if (options.cacheDir && !options.local) throw new Error("--cache-dir requires --local");
        const input: Omit<AnalyzeRequest, "path"> = {
          allowUpload: !!options.upload, mode: options.prepareOnly ? "prepare" : "analyze", goal: options.goal,
          model: options.model, force: options.force,
          maxEvents: options.maxEvents === undefined ? undefined : Number(options.maxEvents),
          maxVerificationSeconds: options.maxVerificationSeconds === undefined ? undefined : Number(options.maxVerificationSeconds),
          maxDuration: options.maxDuration === undefined ? undefined : Number(options.maxDuration),
        };
        if (options.local) {
          local = new UnderstandingService(options.cacheDir);
          current = await local.start({ ...input, path: resolve(ref) });
        } else {
          const target = existsSync(ref) ? { path: resolve(ref) } : { id: ref };
          const result = await editor.media.understand.mutate({ ...input, ...target, provider: "gemini" });
          if (!("state" in result)) throw new Error("Expected an explicit Gemini/preparation job, received agent evidence.");
          current = result;
        }
        if (!local && !options.wait && !options.output) { print(current); return; }
        console.error(`Understanding job ${current.id}`);
        let stage = "";
        while (["queued", "running"].includes(current.state)) {
          if (current.stage !== stage) { stage = current.stage; console.error(stage); }
          await delay(500);
          current = local ? await local.status(current.id) : await editor.media.understandingStatus.query({ id: current.id });
        }
        if (current.state !== "completed") throw new Error(`${current.state}: ${current.error || current.stage}`);
        const evidence = local ? await local.evidence(current.id) : await editor.media.evidence.query({ id: current.id });
        if (options.output) await writeFile(resolve(options.output), JSON.stringify(evidence, null, 2), { flag: "wx", mode: 0o600 });
        print({ job: current, evidence });
      } catch (error) { fail(error); }
      finally { system.stop(); process.removeListener("SIGINT", abort); }
    });

  media.command("understanding-status").argument("<job-id>")
    .option("--local", "read a local CLI job").option("--cache-dir <directory>")
    .action(async (id: string, options: Options) => {
      try { print(options.local ? await new UnderstandingService(options.cacheDir).status(id) : await editor.media.understandingStatus.query({ id })); }
      catch (error) { fail(error); }
    });
  media.command("understanding-cancel").argument("<job-id>")
    .description("Cancel an active desktop analysis; local foreground jobs use Ctrl+C")
    .action(async (id: string) => {
      try { print(await editor.media.understandingCancel.mutate({ id })); } catch (error) { fail(error); }
    });
  media.command("evidence").argument("<job-id>")
    .option("--query <text>", "lexical search over observations, speech, text, and inference")
    .option("--supported-only", "return only events supported by the model verification pass")
    .option("--local", "read a local CLI job").option("--cache-dir <directory>")
    .action(async (id: string, options: Options & { query?: string; supportedOnly?: boolean }) => {
      try { print(options.local ? await new UnderstandingService(options.cacheDir).evidence(id, options.query, options.supportedOnly)
        : await editor.media.evidence.query({ id, query: options.query, supportedOnly: options.supportedOnly })); }
      catch (error) { fail(error); }
    });
}
