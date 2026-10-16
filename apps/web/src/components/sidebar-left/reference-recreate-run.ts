/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Engine } from "@/components/engine";
import { getAllEntities, hasComponent } from "bitecs";
import { mainBridge } from "@/lib/ipc";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import { handleMount } from "@/context/editor-api/mount";
import { handleNodeRender } from "@/context/editor-api/node";
import { renderOverlay } from "@/context/render";
import { WebFonts } from "@/components/engine/font";
import { buildReconstructionModule, reconstructionPlanSchema } from "@diffusionstudio/editing-playbook/reference-reconstruction";
import { auditReconstructionWorld } from "./reference-native-audit";

export type RecreationOptions = { start: number; end: number; maxCorrections: number; preserveAudio: boolean };
export type RecreationProgress = { stage: string; message: string };
const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
export async function getRecreationCapabilities(): Promise<{ available: boolean; reason: string }> {
  if (!window.desktop) return { available: false, reason: "Open the desktop editor and sign in to the installed Codex CLI with ChatGPT." };
  try { return await mainBridge.call(MAIN_CHANNELS.REFERENCE_RECREATE_CAPABILITIES, undefined); }
  catch (error) { return { available: false, reason: error instanceof Error ? error.message : String(error) }; }
}
async function saved(engine: Engine, sceneId: number, signal: AbortSignal) {
  const db = await engine.world.store.db, deadline = Date.now() + 15000;
  while (true) {
    signal.throwIfAborted(); await engine.world.store.queue.drain();
    const ids = getAllEntities(engine.world).filter(id => !hasComponent(engine.world, id, engine.world.components.Deleted));
    const records = await Promise.all(ids.map(id => db.getKey("entities", String(id))));
    if (ids.includes(sceneId) && records.every(key => key !== undefined)) return;
    if (Date.now() > deadline) throw new Error("Project autosave did not finish. Keep the editor open; the native module and rendered revisions remain in the output folder.");
    await delay(100);
  }
}

/** Only the host compiler supplies code; every correction renders before its next visual review. */
export async function recreateReference(engine: Engine, file: File, goal: string, options: RecreationOptions,
  onProgress: (progress: RecreationProgress) => void, signal: AbortSignal) {
  signal.throwIfAborted();
  const path = window.desktop?.getPathForFile(file), projectId = engine.world.projectId;
  if (!path) throw new Error("Choose a local video in the desktop editor.");
  if (renderOverlay()) throw new Error("Wait for the current video export to finish before recreating a reference.");
  if (![options.start, options.end].every(Number.isFinite) || options.start < 0 || options.end <= options.start || options.end - options.start > 120) throw new Error("Choose a positive source interval of at most 120 seconds.");
  const assertCurrent = () => { signal.throwIfAborted(); if (engine.world.projectId !== projectId) throw new Error("Project changed. The reference run stopped before modifying another project."); };
  let jobId: string | undefined;
  const abort = () => { if (jobId) void mainBridge.call(MAIN_CHANNELS.REFERENCE_RECREATE_CANCEL, { id: jobId }).catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    let job = await mainBridge.call(MAIN_CHANNELS.REFERENCE_RECREATE_START, { path, projectId, goal, ...options,
      fontFamilies: [...new Set([...Object.keys(WebFonts), "Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman", "Courier New"])] });
    jobId = job.id; if (signal.aborted) { abort(); signal.throwIfAborted(); }
    while (true) {
      assertCurrent();
      if (job.projectId !== projectId) throw new Error("Reference result belongs to another project.");
      if (job.state === "failed" || job.state === "cancelled") throw new Error(job.error || `Reconstruction ${job.state}`);
      if (job.state === "complete") {
        if (!job.receipt) throw new Error("Reconstruction finished without a review receipt.");
        onProgress({ stage: "complete", message: "Rendered revisions and visual comparisons are ready for review." });
        return job.receipt;
      }
      if (job.state === "awaiting-render") {
        const result = job.result; if (!result) throw new Error("Reconstruction has no validated plan.");
        if (renderOverlay()) throw new Error("Another export started. Your reconstruction plan is saved; finish that export before continuing.");
        const plan = reconstructionPlanSchema.parse(result.plan);
        const code = buildReconstructionModule(plan, { sceneKey: `recreation-${job.id}`, bindings: result.bindings, audio: result.audio });
        onProgress({ stage: "mounting", message: `Building revision ${result.revision}: ${plan.layers.length} editable layers…` });
        await handleMount(() => engine, signal)({ code }); assertCurrent();
        const sceneId = engine.world.selection.scene;
        if (sceneId === null || hasComponent(engine.world, sceneId, engine.world.components.Deleted)) throw new Error("Reconstruction did not create a native scene.");
        auditReconstructionWorld(engine.world, sceneId, plan, Boolean(result.audio));
        await saved(engine, sceneId, signal); assertCurrent();
        if (renderOverlay()) throw new Error("Another export started while the scene was saving. Saved layers and previous renders remain available.");
        onProgress({ stage: "rendering", message: `Rendering revision ${result.revision} at ${plan.width} × ${plan.height}…` });
        await handleNodeRender(() => engine, signal)({ id: sceneId, output: result.previewPath,
          config: { format: "mp4", video: { codec: "avc", fps: 30, resolution: plan.height, bitrate: 16000000 }, audio: { enabled: Boolean(result.audio) } } });
        assertCurrent();
        job = await mainBridge.call(MAIN_CHANNELS.REFERENCE_RECREATE_RENDERED, { id: jobId, projectId, sceneId, revision: result.revision });
      } else {
        onProgress({ stage: job.state, message: job.message });
        await delay(700); assertCurrent();
        job = await mainBridge.call(MAIN_CHANNELS.REFERENCE_RECREATE_STATUS, { id: jobId });
      }
    }
  } catch (error) { abort(); throw error; }
  finally { signal.removeEventListener("abort", abort); }
}
