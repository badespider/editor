/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { buildLearnedMotionModule, instantiateLearnedMotion } from "@diffusionstudio/editing-playbook/motion-learned";
import { mainBridge } from "@/lib/ipc";
import { MAIN_CHANNELS } from "@desktop/main-channels";
import type { MainRequestMap } from "@desktop/main-channels";
import { useEngine } from "@/context/engine";
import { handleMount } from "@/context/editor-api/mount";
import { Button } from "../ui/button";
import { learnedMotionFieldDefaults, learnedMotionFieldValues, learnedMotionFieldsFromJson } from "./learned-motion-form";

type Entry = MainRequestMap[typeof MAIN_CHANNELS.MOTION_LIBRARY_LIST]["response"][number];
type LibraryRead = MainRequestMap[typeof MAIN_CHANNELS.MOTION_LIBRARY_READ]["response"];
const fieldClass = "w-full rounded-md border border-border-input bg-background px-2 py-1.5 text-xs focus-ring";

/** Persistent local entries are data; native code is produced by the trusted compiler. */
export function LearnedMotionLibrary(props: { query: string; format: "landscape" | "portrait" }) {
  const engine = useEngine();
  const [entries, setEntries] = createSignal<Entry[]>([]);
  const [selected, setSelected] = createSignal<LibraryRead | null>(null);
  const [fields, setFields] = createSignal<Record<string, string>>({});
  const [jsonDraft, setJsonDraft] = createSignal(""), [jsonDirty, setJsonDirty] = createSignal(false);
  const [duration, setDuration] = createSignal(4);
  const [loading, setLoading] = createSignal(false), [reading, setReading] = createSignal("");
  const [busy, setBusy] = createSignal(false), [status, setStatus] = createSignal("");
  const results = createMemo(() => {
    const query = props.query.trim().replace(/^@/, "").toLowerCase();
    return entries().filter(entry => `${entry.id} ${entry.name} ${entry.description} ${entry.tags.join(" ")}`.toLowerCase().includes(query));
  });
  const validatedValues = createMemo(() => {
    const current = selected(); if (!current) return { values: {} as Record<string, string | number>, error: "" };
    try { return { values: learnedMotionFieldValues(current.component, fields()), error: "" }; }
    catch (error) { return { values: {} as Record<string, string | number>, error: error instanceof Error ? error.message : String(error) }; }
  });
  let alive = true, listRequest = 0, readRequest = 0, mountController: AbortController | undefined;
  const fail = (error: unknown) => setStatus(error instanceof Error ? error.message : String(error));

  async function refresh() {
    if (!window.desktop) return;
    const request = ++listRequest; setLoading(true); setStatus("");
    try {
      const items = await mainBridge.call(MAIN_CHANNELS.MOTION_LIBRARY_LIST, undefined);
      if (alive && request === listRequest) setEntries(items);
    } catch (error) { if (alive && request === listRequest) fail(error); }
    finally { if (alive && request === listRequest) setLoading(false); }
  }
  async function choose(id: string) {
    const request = ++readRequest; setReading(id); setSelected(null); setStatus("");
    try {
      const result = await mainBridge.call(MAIN_CHANNELS.MOTION_LIBRARY_READ, { id });
      if (!alive || request !== readRequest) return;
      setFields(learnedMotionFieldDefaults(result.component)); setJsonDraft(""); setJsonDirty(false);
      setSelected(result); setDuration(result.component.plan.duration);
    } catch (error) { if (alive && request === readRequest) fail(error); }
    finally { if (alive && request === readRequest) setReading(""); }
  }
  async function apply() {
    const current = selected(); if (!current || busy()) return;
    const projectId = engine.world.projectId, controller = new AbortController(); mountController = controller;
    const assertCurrent = () => { controller.signal.throwIfAborted(); if (engine.disposed || engine.world.projectId !== projectId) throw new Error("Project changed or closed before the learned motion finished mounting."); };
    setBusy(true); setStatus("");
    try {
      if (jsonDirty()) throw new Error("Apply or discard the advanced JSON changes first.");
      if (validatedValues().error) throw new Error(validatedValues().error);
      const options = { values: validatedValues().values, duration: duration(), format: props.format };
      const plan = instantiateLearnedMotion(current.component, options);
      const code = buildLearnedMotionModule(current.component, { ...options, sceneKey: `learned-${crypto.randomUUID()}` });
      assertCurrent(); await handleMount(() => engine, controller.signal)({ code }); assertCurrent();
      if (alive) setStatus(`Added ${current.entry.name}: ${plan.duration}s, ${props.format === "portrait" ? "9:16" : "16:9"}, ${plan.layers.length} editable layers.`);
    } catch (error) { if (alive && !controller.signal.aborted) fail(error); }
    finally { if (mountController === controller) mountController = undefined; if (alive) setBusy(false); }
  }
  function applyJson() {
    const current = selected(); if (!current) return;
    try {
      const next = learnedMotionFieldsFromJson(current.component, jsonDraft());
      setFields(next); setJsonDirty(false); setStatus("JSON values applied to the controls.");
    } catch (error) { fail(error); }
  }
  async function copySkill() {
    const current = selected(); if (!current) return;
    try { await navigator.clipboard.writeText(current.skill); if (alive) setStatus("Generated motion guidance copied."); }
    catch { if (alive) setStatus("Could not copy the guidance. You can read it below."); }
  }
  onMount(() => { void refresh(); });
  onCleanup(() => { alive = false; mountController?.abort(); });

  return <section aria-label="Learned motion library" class="space-y-2 rounded-lg border border-border p-3">
    <div class="flex items-center justify-between gap-2"><h3 class="text-xs font-450">Learned motions · {entries().length}</h3><Button size="small" variant="ghost" disabled={loading() || busy() || !window.desktop} onClick={() => void refresh()}>{loading() ? "Loading…" : "Refresh"}</Button></div>
    <p class="text-xs text-muted-foreground">Reusable parts learned from your references. Native layers remain editable; generated guidance stays scoped to each pattern.</p>
    <Show when={window.desktop} fallback={<p class="text-xs text-muted-foreground">Open the desktop editor to use your saved local motion library.</p>}>
      <div class="space-y-1" aria-label="Available learned motions"><For each={results()}>{entry => <button type="button" disabled={busy()} aria-pressed={selected()?.entry.id === entry.id} class="w-full text-left rounded border border-border p-2 hover:bg-accent focus-ring aria-pressed:border-primary" onClick={() => void choose(entry.id)}>
        <span class="block text-xs font-450">{entry.name}{reading() === entry.id ? " · Loading…" : ""}</span>
        <span class="block text-xs text-muted-foreground mt-1">{entry.description}</span>
        <span class="block text-xxs text-muted-foreground mt-1">Machine-reviewed draft · @{entry.id}</span>
      </button>}</For></div>
      <Show when={!loading() && !entries().length}><p class="text-xs text-muted-foreground">Drop a video in Reference → Learn motions to library to add your first patterns.</p></Show>
      <Show when={entries().length && !results().length}><p class="text-xs text-muted-foreground">No learned patterns match this search.</p></Show>
      <Show when={selected()}>{current => <div class="border-t border-border pt-2 space-y-2">
        <p class="text-xs font-450">Customize {current().entry.name}</p>
        <label class="block text-xs space-y-1">Duration (seconds)<input aria-label="Learned motion duration" type="number" step="0.1" min="0.034" max="120" class={fieldClass} disabled={busy()} value={duration()} onInput={event => setDuration(event.currentTarget.valueAsNumber)} /></label>
        <div class="space-y-2" aria-label="Learned motion controls"><For each={current().component.parameters}>{parameter => <label class="block text-xs space-y-1">{parameter.label}
          <Show when={parameter.type === "text"} fallback={<Show when={parameter.type === "color"} fallback={<input aria-label={`Learned motion ${parameter.id}`} class={fieldClass} type={parameter.type === "number" ? "number" : "text"} min={parameter.minimum ?? undefined} max={parameter.maximum ?? undefined} step={parameter.type === "number" ? "any" : undefined} maxLength={parameter.type === "font" ? 80 : undefined} disabled={busy() || jsonDirty()} value={fields()[parameter.id] ?? ""} onInput={event => { setFields(previous => ({ ...previous, [parameter.id]: event.currentTarget.value })); setStatus(""); }} />}>
            <span class="flex items-center gap-2"><input aria-label={`Learned motion ${parameter.id}`} type="color" class="h-8 w-12 rounded border border-border-input bg-background" disabled={busy() || jsonDirty()} value={fields()[parameter.id] ?? "#000000"} onInput={event => { setFields(previous => ({ ...previous, [parameter.id]: event.currentTarget.value })); setStatus(""); }} /><span class="text-muted-foreground font-mono">{fields()[parameter.id]}</span></span>
          </Show>}>
            <textarea aria-label={`Learned motion ${parameter.id}`} class={fieldClass} rows={2} maxLength={2000} disabled={busy() || jsonDirty()} value={fields()[parameter.id] ?? ""} onInput={event => { setFields(previous => ({ ...previous, [parameter.id]: event.currentTarget.value })); setStatus(""); }} />
          </Show>
        </label>}</For></div>
        <Show when={validatedValues().error}><p role="alert" class="text-xs whitespace-pre-wrap">{validatedValues().error}</p></Show>
        <details class="text-xs rounded border border-border p-2"><summary class="cursor-pointer">Advanced values (JSON)</summary><p class="text-muted-foreground mt-2">The controls work without JSON. Apply or discard JSON edits before returning to the controls.</p><textarea aria-label="Learned motion values" rows={7} maxLength={65536} class={fieldClass + " mt-2 font-mono"} disabled={busy()} value={jsonDirty() ? jsonDraft() : JSON.stringify(validatedValues().values, null, 2)} onInput={event => { setJsonDraft(event.currentTarget.value); setJsonDirty(true); setStatus(""); }} /><Show when={jsonDirty()}><div class="flex gap-1 mt-2"><Button size="small" variant="secondary" disabled={busy()} onClick={applyJson}>Apply JSON values</Button><Button size="small" variant="ghost" disabled={busy()} onClick={() => { setJsonDirty(false); setStatus(""); }}>Discard JSON edits</Button></div></Show></details>
        <p class="text-xxs text-muted-foreground">Fits and centers the original layout inside the selected {props.format === "portrait" ? "9:16 mobile" : "16:9 landscape"} format. Edit available values here, or select individual layers after adding.</p>
        <Button class="w-full" disabled={busy() || jsonDirty() || Boolean(validatedValues().error)} onClick={() => void apply()}>{busy() ? "Preparing…" : "Add learned motion as new scene"}</Button>
        <details class="text-xs"><summary class="cursor-pointer">Review and source provenance</summary>
          <p class="text-muted-foreground mt-2">Human review: pending. Machine review uses sampled frames and does not establish a perfect copy or continuous viewing.</p>
          <Show when={current().entry.review}>{review => <div class="mt-2 space-y-2"><p class="font-450">Machine review: passed</p><p class="whitespace-pre-wrap">{review().summary}</p><Show when={review().limitations.length}><p class="font-450">Retained limitations</p><ul class="list-disc pl-4 space-y-1"><For each={review().limitations}>{limitation => <li class="whitespace-pre-wrap">{limitation}</li>}</For></ul></Show><details><summary class="cursor-pointer">Reviewed export hashes</summary><ul class="mt-1 space-y-1 text-xxs font-mono break-all"><For each={review().renderHashes}>{hash => <li>{hash}</li>}</For></ul></details></div>}</Show>
          <ul aria-label="Learned motion source provenance" class="mt-2 space-y-2"><For each={current().entry.provenance}>{source => <li class="rounded border border-border p-2 space-y-1"><p class="font-450 break-words">{source.sourceName}</p><p>{source.range.start.toFixed(3)}–{source.range.end.toFixed(3)} seconds</p><p class="text-xxs text-muted-foreground break-all">Source SHA-256: {source.sourceSha256}</p><p class="text-xxs text-muted-foreground break-words">Evidence: {source.evidenceIds.join(", ")}</p></li>}</For></ul>
          <p class="mt-2 text-xxs text-muted-foreground break-all">Saved preview: {current().entry.previewPath}</p>
        </details>
        <details class="text-xs"><summary class="cursor-pointer">Generated motion skill</summary><p class="text-muted-foreground mt-2">Generated guidance stays scoped to this pattern.</p><pre class="mt-2 whitespace-pre-wrap break-words text-xxs max-h-64 overflow-y-auto">{current().skill}</pre><Button size="small" variant="outline" class="mt-2" onClick={() => void copySkill()}>Copy motion skill</Button><p class="mt-2 text-xxs text-muted-foreground break-all">{current().entry.skillPath}</p></details>
      </div>}</Show>
    </Show>
    <Show when={status()}><p role="status" aria-live="polite" class="text-xs whitespace-pre-wrap break-words">{status()}</p></Show>
  </section>;
}
