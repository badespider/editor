/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Engine } from "@/components/engine";
import { getAllEntities, hasComponent } from "bitecs";
import { mainBridge } from "@/lib/ipc";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import type { MainRequestMap } from "@desktop/main-channels";
import { handleMount } from "@/context/editor-api/mount";
import { handleNodeRender } from "@/context/editor-api/node";
import { renderOverlay } from "@/context/render";
import { WebFonts } from "@/components/engine/font";
import { buildReconstructionModule, reconstructionPlanSchema } from "@diffusionstudio/editing-playbook/reference-reconstruction";
import { auditReconstructionWorld } from "./reference-native-audit";
import { driveMotionLearning } from "./reference-learn-flow";

export type MotionLearningJob = MainRequestMap[typeof MAIN_CHANNELS.REFERENCE_LEARN_START]["response"];
export type MotionLearningProgress = { stage: string; message: string; candidates?: MotionLearningJob["candidates"] };

export async function getMotionLearningCapabilities(): Promise<{ available: boolean; reason: string }> {
  if (!window.desktop) return { available: false, reason: "Open the desktop editor and sign in to the installed Codex CLI with ChatGPT." };
  try { return await mainBridge.call(MAIN_CHANNELS.REFERENCE_LEARN_CAPABILITIES, undefined); }
  catch (error) { return { available: false, reason: error instanceof Error ? error.message : String(error) }; }
}

async function saved(engine: Engine, sceneId: number, assertCurrent: () => void) {
  const db = await engine.world.store.db, deadline = Date.now() + 15000;
  while (true) {
    assertCurrent(); await engine.world.store.queue.drain();
    const ids = getAllEntities(engine.world).filter(id => !hasComponent(engine.world, id, engine.world.components.Deleted));
    const records = await Promise.all(ids.map(id => db.getKey("entities", String(id))));
    if (ids.includes(sceneId) && records.every(key => key !== undefined)) return;
    if (Date.now() > deadline) throw new Error("Motion layers exist, but autosave did not finish. Keep the editor open; the job artifacts are preserved.");
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
}

/** Whole-video discovery emits bounded plans; only the trusted compiler supplies executable code. */
export async function learnReferenceMotions(engine: Engine, file: File, maxCandidates: number,
  onProgress: (progress: MotionLearningProgress) => void, signal: AbortSignal) {
  signal.throwIfAborted();
  const path = window.desktop?.getPathForFile(file), projectId = engine.world.projectId;
  if (!path) throw new Error("Choose a local video in the desktop editor.");
  if (renderOverlay()) throw new Error("Wait for the current video export before learning new motions.");
  const assertCurrent = () => { signal.throwIfAborted(); if (engine.disposed || engine.world.projectId !== projectId) throw new Error("Project changed or closed. Motion learning stopped before modifying another project."); };
  return driveMotionLearning({ projectId, signal, assertCurrent,
    start: () => mainBridge.call(MAIN_CHANNELS.REFERENCE_LEARN_START, { path, projectId, maxCandidates,
      fontFamilies: [...new Set([...Object.keys(WebFonts), "Arial", "Georgia", "Verdana", "Trebuchet MS", "Times New Roman", "Courier New"])] }),
    status: id => mainBridge.call(MAIN_CHANNELS.REFERENCE_LEARN_STATUS, { id }),
    cancel: id => mainBridge.call(MAIN_CHANNELS.REFERENCE_LEARN_CANCEL, { id }),
    rendered: (id, sceneId, token) => mainBridge.call(MAIN_CHANNELS.REFERENCE_LEARN_RENDERED, { id, projectId, sceneId, token }),
    onProgress: job => onProgress({ stage: job.state, message: job.message, candidates: job.candidates }),
    render: async job => {
      assertCurrent();
      const task = job.renderTask; if (!task) throw new Error("Motion learning has no render task.");
      if (renderOverlay()) throw new Error("Another export started. The learning job is preserved; finish that export before trying again.");
      const plan = reconstructionPlanSchema.parse(task.plan);
      if (plan.assetRequests.length || plan.layers.some(layer => layer.type === "image" || layer.type === "video")) throw new Error("Reusable learned motions must contain native graphics and text only.");
      const code = buildReconstructionModule(plan, { sceneKey: `learn-${job.id}-${task.token}`, bindings: [], audio: null });
      onProgress({ stage: "mounting", message: `Building candidate ${task.candidateId}, variation ${task.variant + 1}: ${plan.layers.length} editable layers…`, candidates: job.candidates });
      await handleMount(() => engine, signal)({ code }); assertCurrent();
      const sceneId = engine.world.selection.scene;
      if (sceneId === null || hasComponent(engine.world, sceneId, engine.world.components.Deleted)) throw new Error("Motion learning did not create a native scene.");
      auditReconstructionWorld(engine.world, sceneId, plan, false);
      await saved(engine, sceneId, assertCurrent); assertCurrent();
      if (renderOverlay()) throw new Error("Another export started while the motion was saving. Its native layers remain available.");
      onProgress({ stage: "rendering", message: `Rendering candidate ${task.candidateId}, variation ${task.variant + 1}…`, candidates: job.candidates });
      await handleNodeRender(() => engine, signal)({ id: sceneId, output: task.previewPath,
        config: { format: "mp4", video: { codec: "avc", fps: 30, resolution: plan.height, bitrate: 16000000 }, audio: { enabled: false } } });
      assertCurrent(); return sceneId;
    },
  });
}
