/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import type { Engine } from "@/components/engine";
import { getAllEntities, hasComponent } from "bitecs";
import { mainBridge } from "@/lib/ipc";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import { handleMount } from "@/context/editor-api/mount";
import { handleNodeRender } from "@/context/editor-api/node";
import { renderOverlay } from "@/context/render";
import { buildReferenceStyleModule, referenceStylePlanSchema } from "@diffusionstudio/editing-playbook/reference-style";

export type ReferenceAutoProgress = { stage: string; message: string };
export async function getAutomaticReferenceCapabilities(): Promise<{available:boolean;reason:string}> {
  if (!window.desktop) return { available: false, reason: "Open the desktop editor and sign in to the installed Codex CLI with ChatGPT." };
  try { return await mainBridge.call(MAIN_CHANNELS.REFERENCE_AUTO_CAPABILITIES, undefined); }
  catch (error) { return {available:false,reason:error instanceof Error?error.message:String(error)}; }
}
const delay = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));

/** Wait for this mount's IDB entities, rather than presenting queued autosave as a durable save. */
async function saved(engine: Engine, ids: number[], signal: AbortSignal) {
  const db = await engine.world.store.db;
  const deadline = Date.now() + 15000;
  while (true) {
    signal.throwIfAborted(); await engine.world.store.queue.flush();
    const records = await Promise.all(ids.map(id => db.getKey("entities", String(id))));
    if (records.every(key => key !== undefined)) return;
    if (Date.now() > deadline) throw new Error("The native scene exists, but project autosave did not finish. Keep the editor open; the saved module remains in the output folder.");
    await delay(100);
  }
}

/** Model output stays data; only this trusted generator supplies executable module code. */
export async function startAutomaticReference(engine: Engine, file: File, goal: string,
  onProgress: (progress: ReferenceAutoProgress) => void, signal: AbortSignal) {
  signal.throwIfAborted();
  const path = window.desktop?.getPathForFile(file);
  if (!path) throw new Error("Choose a local video in the desktop editor.");
  const projectId = engine.world.projectId;
  if (renderOverlay()) throw new Error("Wait for the current video export to finish before starting reference recreation.");
  const assertCurrent = () => { signal.throwIfAborted(); if (engine.world.projectId !== projectId) throw new Error("Project changed. The reference run was stopped before modifying another project."); };
  let jobId: string | undefined;
  const abort = () => {
    if (jobId) void mainBridge.call(MAIN_CHANNELS.REFERENCE_AUTO_CANCEL, {id:jobId}).catch(() => undefined);
  };
  signal.addEventListener("abort", abort, {once:true});
  try {
    let job = await mainBridge.call(MAIN_CHANNELS.REFERENCE_AUTO_START, { path, goal, projectId });
    jobId = job.id;
    if (signal.aborted) { abort(); signal.throwIfAborted(); }
    while (job.state !== "ready") {
      assertCurrent();
      if (job.state === "failed" || job.state === "cancelled") throw new Error(job.error || `Reference job ${job.state}`);
      onProgress({stage:job.state,message:job.message || `Reference job: ${job.state}`});
      await delay(700); assertCurrent();
      job = await mainBridge.call(MAIN_CHANNELS.REFERENCE_AUTO_STATUS, {id:jobId});
    }
    assertCurrent();
    if (!job.result || job.projectId !== projectId) throw new Error("Reference job returned no valid project-bound result.");
    if (renderOverlay()) throw new Error("Another export started. Your generated plan is saved; finish that export before mounting a new draft.");
    const plan = referenceStylePlanSchema.parse(job.result.plan);
    const code = buildReferenceStyleModule(plan, {sceneKey:`reference-auto-${job.id}`});
    const before = new Set(getAllEntities(engine.world));
    onProgress({stage:"mounting",message:`Creating ${plan.layers.length} editable text and shape layers…`});
    await handleMount(() => engine)({code}); assertCurrent();
    const sceneId = engine.world.selection.scene;
    if (sceneId === null || before.has(sceneId)) throw new Error("The agent draft did not create a fresh native scene.");
    const newIds = getAllEntities(engine.world).filter(id => !before.has(id) && !hasComponent(engine.world,id,engine.world.components.Deleted));
    await saved(engine,newIds,signal); assertCurrent();
    const previewPath = job.result.outputDirectory.replace(/[\\/]$/,"") + "/preview.mp4";
    if (renderOverlay()) throw new Error("Another export started while the native draft was saving. The editable scene and plan are preserved.");
    onProgress({stage:"rendering",message:"Rendering a preview from the native editable composition…"});
    await handleNodeRender(() => engine, signal)({id:sceneId,output:previewPath,config:{format:"mp4",video:{codec:"avc",fps:30,resolution:Math.min(plan.height,1920),bitrate:8000000},audio:{enabled:false}}});
    assertCurrent();
    onProgress({stage:"comparing",message:"Decoding the rendered preview and preparing reference/render frame pairs…"});
    const receipt = await mainBridge.call(MAIN_CHANNELS.REFERENCE_AUTO_FINISH, {id:jobId,projectId,sceneId});
    assertCurrent();
    onProgress({stage:"complete",message:"Native layers, saved plan, preview and comparison are ready."});
    return receipt;
  } catch (error) {
    abort(); throw error;
  } finally { signal.removeEventListener("abort",abort); }
}
