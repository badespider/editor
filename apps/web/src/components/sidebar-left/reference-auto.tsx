/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useEngine } from "@/context/engine";
import { useProjectId } from "@/hooks/use-project-id";
import { Button } from "../ui/button";
import { getRecreationCapabilities, recreateReference } from "./reference-recreate-run";
import { createReferenceRunGate, validateAutomaticReferenceFile } from "./reference-auto-state";

type Receipt = Awaited<ReturnType<typeof recreateReference>>;
type Capabilities = Awaited<ReturnType<typeof getRecreationCapabilities>>;
const DEFAULT_GOAL = "Match the reference visuals and motion with editable native layers";
const stages = [
  { id: "preparing", label: "Prepare frames" }, { id: "analyzing", label: "Analyze reference" },
  { id: "mounting", label: "Build native layers" }, { id: "rendering", label: "Render preview" },
  { id: "reviewing", label: "Compare and correct" }, { id: "complete", label: "Ready for review" },
] as const;

/** The selected local video starts the authorized Codex-backed workflow, without evaluating model code in the UI. */
export function ReferenceAuto() {
  const engine = useEngine(), projectId = useProjectId(), gate = createReferenceRunGate();
  const [goal, setGoal] = createSignal(DEFAULT_GOAL);
  const [startTime, setStartTime] = createSignal(0), [endTime, setEndTime] = createSignal(15);
  const [preserveAudio, setPreserveAudio] = createSignal(true);
  const [capabilities, setCapabilities] = createSignal<Capabilities | null>(null);
  const [checking, setChecking] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  const [fileName, setFileName] = createSignal("");
  const [progress, setProgress] = createSignal({ stage: "", message: "" });
  const [receipt, setReceipt] = createSignal<Receipt | null>(null);
  const [message, setMessage] = createSignal("");
  const stageIndex = createMemo(() => stages.findIndex(stage => stage.id === progress().stage));
  let fileInput!: HTMLInputElement, alive = true;
  let capabilityRequest: Promise<Capabilities> | null = null;
  let initialProject: string | undefined;

  async function refreshCapabilities(): Promise<Capabilities> {
    if (capabilityRequest) return capabilityRequest;
    setChecking(true);
    capabilityRequest = Promise.resolve().then(() => getRecreationCapabilities()).catch(error => ({ available: false, reason: error instanceof Error ? error.message : "The desktop reference bridge is unavailable." } as Capabilities));
    try {
      const result = await capabilityRequest;
      if (alive) { setCapabilities(result); setChecking(false); }
      return result;
    } finally { capabilityRequest = null; }
  }

  async function start(file: File | undefined) {
    if (!file) return;
    if (busy()) { setMessage("A reference job is already running. Cancel it or wait for its result before dropping another video."); return; }
    try { validateAutomaticReferenceFile(file); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); return; }
    const controller = gate.begin(); if (!controller) return;
    setBusy(true); setReceipt(null); setFileName(file.name); setMessage("");
    setProgress({ stage: "preparing", message: "Checking desktop reference capabilities…" });
    try {
      const available = await refreshCapabilities();
      if (controller.signal.aborted) return;
      if (!available.available) throw new Error(available.reason || "Automatic reference requires the desktop reference bridge. Use the manual workspace below while it is unavailable.");
      const result = await recreateReference(engine, file, goal().trim() || DEFAULT_GOAL, { start: startTime(), end: endTime(), maxCorrections: 2, preserveAudio: preserveAudio() }, job => {
        if (alive && gate.isCurrent(controller) && !controller.signal.aborted) setProgress({ stage: job.stage, message: job.message });
      }, controller.signal);
      if (alive && gate.isCurrent(controller) && !controller.signal.aborted) {
        setReceipt(result); setProgress({ stage: "complete", message: "Rendered native layers and comparisons are ready. Review the remaining visual differences below." });
      }
    } catch (error) {
      if (alive && gate.isCurrent(controller) && !controller.signal.aborted) setProgress({ stage: "failed", message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (gate.isCurrent(controller)) {
        if (alive && controller.signal.aborted) setProgress({ stage: "cancelled", message: "Reference run cancelled. Check any already-created scene or output before starting another run." });
        gate.finish(controller); if (alive) setBusy(false);
      }
    }
  }

  function cancel() {
    if (!busy()) return;
    gate.cancel(); setProgress({ stage: "cancelling", message: "Cancelling the reference run…" });
  }
  function drop(event: DragEvent) {
    event.preventDefault(); event.stopPropagation(); setDragging(false);
    const files = event.dataTransfer?.files;
    if (!files || files.length !== 1) { setMessage("Drop one reference video at a time."); return; }
    void start(files[0]);
  }
  async function copyReceipt() {
    try { await navigator.clipboard.writeText(JSON.stringify(receipt(), null, 2)); if (alive) setMessage("Result details copied."); }
    catch { if (alive) setMessage("Could not copy result details. The paths are shown below."); }
  }
  onMount(() => { void refreshCapabilities(); });
  createEffect(() => {
    const id = projectId();
    if (initialProject === undefined) { initialProject = id; return; }
    if (id !== initialProject) { initialProject = id; gate.cancel(); setReceipt(null); }
  });
  onCleanup(() => { alive = false; gate.cancel(); });

  return (
    <div class="space-y-3 rounded-xl border border-border p-3" aria-label="Automatic reference">
      <div><h2 class="text-sm font-450">Reference → editable recreation</h2><p class="text-xs text-muted-foreground mt-1">Choose a scene, then drop its video to recreate the visible layout, content and motion.</p></div>
      <p class="text-xs text-muted-foreground">Uses your signed-in Codex account for up to four analysis and review calls. Sampled reference frames and rendered comparisons are sent to Codex.</p>
      <p class="text-xs text-muted-foreground">Text, shapes and motion remain editable. Photos and textures can become image layers; camera shots remain media clips. Each rendered revision is compared before corrections. Exact recovery still needs review.</p>
      <div class="grid grid-cols-2 gap-2 text-xs"><label>Source start (seconds)<input aria-label="Reference source start" type="number" min="0" step="0.001" value={startTime()} disabled={busy()} onInput={event => setStartTime(event.currentTarget.valueAsNumber)} class="w-full rounded border border-border-input bg-background px-2 py-1" /></label><label>Source end (seconds)<input aria-label="Reference source end" type="number" min="0" step="0.001" value={endTime()} disabled={busy()} onInput={event => setEndTime(event.currentTarget.valueAsNumber)} class="w-full rounded border border-border-input bg-background px-2 py-1" /></label></div>
      <p class="text-xs text-muted-foreground">Up to 120 seconds per run. Start with a short graphic scene for detailed motion matching.</p>
      <label class="flex gap-2 text-xs"><input type="checkbox" checked={preserveAudio()} disabled={busy()} onChange={event => setPreserveAudio(event.currentTarget.checked)} />Keep original audio</label>
      <label class="block text-xs space-y-1">Goal before dropping video<textarea aria-label="Automatic reference goal" class="w-full rounded-md border border-border-input bg-background px-2 py-1.5 text-xs focus-ring" rows={2} maxLength={1200} value={goal()} disabled={busy()} onInput={event => setGoal(event.currentTarget.value)} /></label>
      <input ref={fileInput} type="file" hidden aria-label="Automatic reference video file" accept="video/*,.mp4,.m4v,.mov,.webm,.mkv,.avi,.mts,.m2ts" onChange={event => { void start(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      <div aria-label="Automatic reference video dropzone" class={`rounded-lg border border-dashed p-4 space-y-2 text-center ${dragging() ? "border-primary bg-secondary" : "border-border"}`} onDragOver={event => { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = busy() ? "none" : "copy"; setDragging(!busy()); }} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }} onDrop={drop}>
        <p class="text-xs break-words">{busy() ? `Working on ${fileName()}` : "Drop a reference video here"}</p>
        <Button variant="secondary" disabled={busy() || checking() || !capabilities()?.available} onClick={() => fileInput.click()}>Choose video and start</Button>
      </div>
      <Show when={checking()} fallback={<Show when={capabilities() && !capabilities()?.available}><p class="text-xs text-muted-foreground">Automatic reference is unavailable: {capabilities()?.reason} The manual workspace below remains available.</p><Button size="small" variant="outline" disabled={busy()} onClick={() => void refreshCapabilities()}>Check availability</Button></Show>}><p class="text-xs text-muted-foreground">Checking desktop reference availability…</p></Show>
      <Show when={progress().stage}>
        <ol class="grid grid-cols-2 gap-1 text-xxs text-muted-foreground" aria-label="Automatic reference phases"><For each={stages}>{(stage, index) => <li aria-current={progress().stage === stage.id ? "step" : undefined} class={stageIndex() >= index() ? "text-foreground" : ""}>{stageIndex() > index() ? "✓ " : ""}{stage.label}</li>}</For></ol>
        <p class="text-xs whitespace-pre-wrap break-words" role="status" aria-live="polite">{progress().message}</p>
      </Show>
      <Show when={busy()}><Button variant="outline" onClick={cancel} disabled={progress().stage === "cancelling"}>Cancel reference run</Button></Show>
      <Show when={receipt()}>{result => <div class="space-y-2 border-t border-border pt-2 text-xs">
        <p class="break-words text-muted-foreground">Result for {fileName()}</p>
        <p class="font-450">Revision {result().revision} ready for review · {result().layerCount} layers</p>
        <dl class="space-y-1 break-all"><dt class="text-muted-foreground">Scene</dt><dd>{result().sceneId}</dd><dt class="text-muted-foreground">Saved output folder</dt><dd>{result().outputDirectory}</dd><Show when={result().previewPath}><dt class="text-muted-foreground">Native preview</dt><dd>{result().previewPath}</dd></Show><Show when={result().comparisonPath}><dt class="text-muted-foreground">Reference comparison</dt><dd>{result().comparisonPath}</dd></Show></dl>
        <Show when={result().warnings.length}><ul class="list-disc pl-4 space-y-1"><For each={result().warnings}>{warning => <li class="whitespace-pre-wrap">{warning}</li>}</For></ul></Show>
        <Button size="small" variant="outline" onClick={() => void copyReceipt()}>Copy result details</Button>
      </div>}</Show>
      <Show when={message()}><p class="text-xs whitespace-pre-wrap break-words" role="status">{message()}</p></Show>
    </div>
  );
}
