/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from "solid-js";
import { buildReferenceBrief, createReferenceStudy, getReferenceMomentIds, referenceMediaSchema, referenceStudySchema } from "@diffusionstudio/editing-playbook/reference";
import type { ReferenceMedia, ReferenceStudy } from "@diffusionstudio/editing-playbook/reference";
import { buildMotionModule, motionMoments } from "@diffusionstudio/editing-playbook/motion";
import { useEngine } from "@/context/engine";
import { handleMount } from "@/context/editor-api/mount";
import { Button } from "../ui/button";
import { ReferenceAuto } from "./reference-auto";
import { MAX_REFERENCE_STUDY_BYTES, matchReferenceMedia, newReferenceBeat, parseReferenceStudyText, serializeReferenceStudy, referenceComparisonTimes, referenceComparisonWindow } from "./reference-workbench-state";

type LocalVideo = { file: File; url: string; media: ReferenceMedia | null };
type Beat = ReferenceStudy["beats"][number];
type BeatDraft = Omit<Beat, "start" | "end" | "palette"> & { start: string; end: string; palette: string };
const fieldClass = "w-full rounded-md border border-border-input bg-background px-2 py-1.5 text-xs focus-ring";
const draftFor = (beat: Beat): BeatDraft => ({ ...beat, start: String(beat.start), end: String(beat.end), palette: beat.palette.join(", "), nativeMomentIds: [...beat.nativeMomentIds] });
const seconds = (value: number) => Number.isFinite(value) ? `${value.toFixed(3)}s` : "—";
const numberFrom = (value: string) => value.trim() ? Number(value) : NaN;

/** Local previews and inert author notes. Native composition happens only through the explicit draft button. */
export function ReferenceWorkbench(props: { active?: boolean }) {
  const engine = useEngine();
  const [reference, setReference] = createSignal<LocalVideo | null>(null);
  const [render, setRender] = createSignal<LocalVideo | null>(null);
  const [study, setStudy] = createSignal<ReferenceStudy | null>(null);
  const [title, setTitle] = createSignal("");
  const [goal, setGoal] = createSignal("");
  const [format, setFormat] = createSignal<"landscape" | "portrait">("landscape");
  const [selectedBeat, setSelectedBeat] = createSignal("");
  const [beatDraft, setBeatDraft] = createSignal<BeatDraft | null>(null);
  const [jsonDraft, setJsonDraft] = createSignal("");
  const [jsonDirty, setJsonDirty] = createSignal(false);
  const [patternQuery, setPatternQuery] = createSignal("");
  const [expanded, setExpanded] = createSignal(false);
  const [linked, setLinked] = createSignal(true);
  const [referenceOffset, setReferenceOffset] = createSignal("0");
  const [renderOffset, setRenderOffset] = createSignal("0");
  const [referenceTime, setReferenceTime] = createSignal(0);
  const [elapsed, setElapsed] = createSignal(0);
  const [playing, setPlaying] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("");
  let referenceVideo: HTMLVideoElement | undefined, renderVideo: HTMLVideoElement | undefined;
  let referenceInput!: HTMLInputElement, renderInput!: HTMLInputElement, studyInput!: HTMLInputElement;
  let frame: number | undefined, disposed = false;
  const downloads = new Set<string>();

  const binding = createMemo(() => {
    const current = study();
    return current ? matchReferenceMedia(current.reference, reference()?.media ?? null) : null;
  });
  const attached = () => binding()?.matches === true;
  const comparison = createMemo(() => {
    const a = reference()?.media, b = render()?.media;
    return linked() && a && b ? referenceComparisonWindow(a.duration, b.duration, numberFrom(referenceOffset()), numberFrom(renderOffset())) : null;
  });
  const formDirty = createMemo(() => {
    const current = study(); if (!current) return false;
    const saved = current.beats.find(beat => beat.id === selectedBeat());
    return title() !== current.title || goal() !== current.goal || format() !== current.format ||
      JSON.stringify(beatDraft()) !== JSON.stringify(saved ? draftFor(saved) : null);
  });
  const nativeSelection = createMemo(() => {
    const current = study();
    if (!current) return { ids: [] as string[], error: "Choose a reference and add a beat first." };
    try { return { ids: getReferenceMomentIds(current), error: "" }; }
    catch (error) { return { ids: [] as string[], error: error instanceof Error ? error.message : "Choose up to six native patterns." }; }
  });
  const patterns = createMemo(() => {
    const query = patternQuery().trim().toLowerCase();
    return motionMoments.filter(moment => `${moment.id} ${moment.title} ${moment.category}`.toLowerCase().includes(query));
  });
  const fail = (error: unknown) => setStatus(error instanceof Error ? error.message : String(error));

  function pause() {
    setPlaying(false);
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    referenceVideo?.pause(); renderVideo?.pause();
  }
  function setVideoTime(video: HTMLVideoElement | undefined, value: number) {
    if (video && Number.isFinite(value) && video.readyState >= 1 && Math.abs(video.currentTime - value) > .0001) video.currentTime = value;
  }
  function seekComparison(value: number) {
    pause();
    const window = comparison(); if (!window) return;
    const time = referenceComparisonTimes(window, value);
    setVideoTime(referenceVideo, time.reference); setVideoTime(renderVideo, time.render);
    setElapsed(time.elapsed); setReferenceTime(time.reference);
  }
  function animatePlayback() {
    if (!playing() || disposed || !referenceVideo) return;
    const window = comparison();
    if (referenceVideo.ended || referenceVideo.paused) { pause(); return; }
    setReferenceTime(referenceVideo.currentTime);
    if (window) {
      const time = referenceComparisonTimes(window, referenceVideo.currentTime - window.referenceStart);
      setElapsed(time.elapsed);
      if (referenceVideo.currentTime >= window.referenceStart + window.duration - .005) {
        setVideoTime(referenceVideo, window.referenceStart + window.duration); setVideoTime(renderVideo, window.renderStart + window.duration); pause(); return;
      }
      // Browser playback is approximate. Re-align substantial drift; exact-frame review is separate.
      if (renderVideo && !renderVideo.seeking && Math.abs(renderVideo.currentTime - time.render) > .12) setVideoTime(renderVideo, time.render);
    }
    frame = requestAnimationFrame(animatePlayback);
  }
  async function play() {
    if (!referenceVideo || !reference()?.media) return;
    if (playing()) { pause(); return; }
    const window = comparison();
    if (window) {
      const time = referenceComparisonTimes(window, elapsed() >= window.duration ? 0 : elapsed());
      setVideoTime(referenceVideo, time.reference); setVideoTime(renderVideo, time.render); setElapsed(time.elapsed);
    }
    setPlaying(true);
    try {
      await Promise.all([referenceVideo.play(), ...(window && renderVideo ? [renderVideo.play()] : [])]);
      if (disposed || !playing()) { pause(); return; }
      if (frame !== undefined) cancelAnimationFrame(frame);
      animatePlayback();
    } catch (error) { pause(); fail(error); }
  }
  function nativePlay() {
    if (playing()) return;
    setPlaying(true); animatePlayback();
  }

  function installStudy(input: ReferenceStudy, preferredBeat = selectedBeat()) {
    const serialized = serializeReferenceStudy(input), parsed = parseReferenceStudyText(serialized);
    setStudy(parsed); setTitle(parsed.title); setGoal(parsed.goal); setFormat(parsed.format);
    const beat = parsed.beats.find(item => item.id === preferredBeat) ?? parsed.beats[0];
    setSelectedBeat(beat?.id ?? ""); setBeatDraft(beat ? draftFor(beat) : null);
    setJsonDraft(serialized); setJsonDirty(false);
  }
  function startStudy() {
    const media = reference()?.media; if (!media) return;
    pause(); installStudy(createReferenceStudy(media));
    setStatus("New study started. Notes stay in this session until you download the JSON.");
  }
  function chooseFile(kind: "reference" | "render", file: File | undefined) {
    if (!file) return;
    if (!file.size) { fail(new Error("Choose a nonempty local video file.")); return; }
    pause();
    const previous = kind === "reference" ? reference() : render();
    if (previous) URL.revokeObjectURL(previous.url);
    const local = { file, url: URL.createObjectURL(file), media: null };
    if (kind === "reference") { setReference(local); setReferenceTime(0); }
    else setRender(local);
    setElapsed(0); setStatus("Reading local video metadata…");
  }
  function metadata(kind: "reference" | "render", video: HTMLVideoElement) {
    const local = kind === "reference" ? reference() : render();
    if (!local || video.src !== local.url) return;
    try {
      const media = referenceMediaSchema.parse({ name: local.file.name, sha256: null, bytes: local.file.size, duration: video.duration, width: video.videoWidth, height: video.videoHeight });
      if (kind === "reference") {
        setReference({ ...local, media });
        if (!study()) installStudy(createReferenceStudy(media));
      } else setRender({ ...local, media });
      setStatus("Local preview ready. Add notes from what you inspect.");
    } catch (error) { fail(error); }
  }
  function clearRender() {
    pause(); const local = render(); if (local) URL.revokeObjectURL(local.url);
    setRender(null); setRenderOffset("0"); setElapsed(0);
  }
  function mediaError(kind: "reference" | "render", video: HTMLVideoElement) {
    const local = kind === "reference" ? reference() : render();
    if (!local || video.src !== local.url) return;
    pause();
    if (kind === "reference") setReference({ ...local, media: null });
    else setRender({ ...local, media: null });
    setStatus(`This local ${kind} video could not be decoded by the browser. Choose a supported video file.`);
  }
  function commitNotes(): ReferenceStudy | null {
    const current = study(); if (!current) return null;
    if (!attached()) { fail(new Error("Attach the matching reference file before editing its notes.")); return null; }
    if (jsonDirty()) { fail(new Error("Apply or discard JSON edits before saving notes.")); return null; }
    try {
      const draft = beatDraft();
      const beat = draft ? { ...draft, start: numberFrom(draft.start), end: numberFrom(draft.end), palette: draft.palette.split(/[,\s]+/).filter(Boolean) } : null;
      const updated = referenceStudySchema.parse({ ...current, title: title(), goal: goal(), format: format(), beats: beat ? current.beats.map(item => item.id === selectedBeat() ? beat : item) : current.beats });
      installStudy(updated); return updated;
    } catch (error) { fail(error); return null; }
  }
  function saveNotes() { if (commitNotes()) setStatus("Notes saved in this session. Download study JSON to keep them after reload."); }
  function addBeat() {
    const current = commitNotes(); if (!current) return;
    try {
      const beat = newReferenceBeat(referenceVideo?.currentTime ?? referenceTime(), current.reference.duration, current.beats.map(item => item.id));
      installStudy({ ...current, beats: [...current.beats, beat] }, beat.id);
      setStatus("Beat added at the reference playhead. Separate visible observations from inferences.");
    } catch (error) { fail(error); }
  }
  function selectBeat(id: string) {
    const current = formDirty() ? commitNotes() : study(); if (!current) return false;
    const beat = current.beats.find(item => item.id === id);
    setSelectedBeat(beat?.id ?? ""); setBeatDraft(beat ? draftFor(beat) : null); return true;
  }
  function removeBeat() {
    const current = commitNotes(); if (!current) return;
    const id = selectedBeat(); installStudy({ ...current, beats: current.beats.filter(beat => beat.id !== id), targets: current.targets.filter(target => target.beatId !== id) }, "");
    setStatus("Beat and its measurements removed from this session study.");
  }
  function updateBeat<K extends keyof BeatDraft>(key: K, value: BeatDraft[K]) { setBeatDraft(previous => previous ? { ...previous, [key]: value } : null); }
  function choosePattern(id: string) {
    const draft = beatDraft(); if (!draft) return;
    if (!draft.nativeMomentIds.includes(id) && draft.nativeMomentIds.length >= 6) { setStatus("Choose at most six patterns for one beat."); return; }
    updateBeat("nativeMomentIds", draft.nativeMomentIds.includes(id) ? draft.nativeMomentIds.filter(item => item !== id) : [...draft.nativeMomentIds, id]);
  }
  function seekBeat() {
    const draft = beatDraft(); if (!draft) return;
    const time = numberFrom(draft.start), media = reference()?.media;
    if (!Number.isFinite(time) || !media || time < 0 || time > media.duration) { fail(new Error("Enter a start inside the reference duration.")); return; }
    pause();
    const window = comparison();
    if (window && time >= window.referenceStart && time <= window.referenceStart + window.duration) seekComparison(time - window.referenceStart);
    else { setLinked(false); setVideoTime(referenceVideo, time); setReferenceTime(time); }
  }
  async function loadStudy(file: File | undefined) {
    if (!file) return;
    if (formDirty() || jsonDirty()) { setStatus("Save or discard pending edits before loading another study."); return; }
    try {
      if (file.size > MAX_REFERENCE_STUDY_BYTES) throw new RangeError("Study JSON must be at most 512 KiB");
      const parsed = parseReferenceStudyText(await file.text()); if (disposed) return;
      pause(); installStudy(parsed); setStatus("Study loaded. Attach its matching reference file to edit notes or create a native draft.");
    } catch (error) { if (!disposed) fail(error); }
  }
  function applyJson() {
    if (formDirty()) { setStatus("Save or discard note edits before applying JSON."); return; }
    try { installStudy(parseReferenceStudyText(jsonDraft())); setStatus("Study JSON applied. Notes remain unverified author observations."); }
    catch (error) { fail(error); }
  }
  function readyStudy() {
    if (formDirty() || jsonDirty()) throw new Error("Save notes or apply JSON edits before exporting the study.");
    const current = study(); if (!current) throw new Error("Create or load a study first.");
    return parseReferenceStudyText(serializeReferenceStudy(current));
  }
  function download() {
    try {
      const current = readyStudy(), url = URL.createObjectURL(new Blob([serializeReferenceStudy(current)], { type: "application/json" }));
      downloads.add(url);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${current.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "reference-study"}.json`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => { downloads.delete(url); URL.revokeObjectURL(url); }, 1000);
      setStatus("Study JSON download requested. The videos themselves are not included.");
    } catch (error) { fail(error); }
  }
  async function copyBrief() {
    try { await navigator.clipboard.writeText(JSON.stringify(buildReferenceBrief(readyStudy()), null, 2)); if (!disposed) setStatus("Agent brief copied. It contains author notes and selected native patterns, not an automatic recreation."); }
    catch (error) { if (!disposed) fail(error); }
  }
  async function createDraft() {
    if (busy()) return;
    try {
      const current = readyStudy();
      if (!attached()) throw new Error("Attach the matching reference file before creating a draft.");
      const ids = getReferenceMomentIds(current);
      const code = buildMotionModule({ momentIds: ids, mode: ids.length === 1 ? "template" : "sequence", format: current.format, sceneKey: `reference-${crypto.randomUUID()}`, source: "ILLUSTRATIVE / Native scaffold from selected catalog patterns" });
      setBusy(true); pause();
      await handleMount(() => engine)({ code });
      if (!disposed) setStatus(`Added an illustrative native draft from ${ids.length} chosen pattern${ids.length === 1 ? "" : "s"}. Replace example content and review the export. Allow autosave before reload.`);
    } catch (error) { if (!disposed) fail(error); }
    finally { if (!disposed) setBusy(false); }
  }

  createEffect(() => {
    const window = comparison(); reference()?.url; render()?.url;
    untrack(() => { pause(); setElapsed(0); if (window) { setVideoTime(referenceVideo, window.referenceStart); setVideoTime(renderVideo, window.renderStart); setReferenceTime(window.referenceStart); } });
  });
  createEffect(() => { if (props.active === false) untrack(() => { pause(); setExpanded(false); }); });
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setExpanded(false); };
  window.addEventListener("keydown", escape);
  onCleanup(() => {
    disposed = true; pause(); window.removeEventListener("keydown", escape);
    for (const local of [reference(), render()]) if (local) URL.revokeObjectURL(local.url);
    downloads.forEach(url => URL.revokeObjectURL(url)); downloads.clear();
  });

  return (
    <section aria-label="Reference workspace" class={`min-h-0 overflow-y-auto p-3 space-y-4 ${expanded() ? "fixed inset-3 z-50 bg-background border border-border rounded-xl shadow-xl" : "flex-1"}`}>
      <ReferenceAuto />
      <div class="flex items-start justify-between gap-2"><div><h2 class="text-sm font-450">Reference study</h2><p class="text-xs text-muted-foreground mt-1">Inspect a local video, record beats, then build an original native draft.</p></div><Button variant="ghost" onClick={() => setExpanded(value => !value)}>{expanded() ? "Close expanded review" : "Expand review"}</Button></div>
      <p class="text-xs text-muted-foreground">Session only. Download study JSON to keep notes after reload. Local previews are not inserted into the timeline.</p>
      <input ref={referenceInput} type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden aria-label="Local reference video file" onChange={event => { chooseFile("reference", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      <input ref={renderInput} type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden aria-label="Local render video file" onChange={event => { chooseFile("render", event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      <input ref={studyInput} type="file" accept="application/json,.json" hidden aria-label="Reference study JSON file" onChange={event => { void loadStudy(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
      <div class="flex flex-wrap gap-2"><Button onClick={() => referenceInput.click()}>Choose reference video</Button><Button variant="secondary" onClick={() => renderInput.click()}>Choose render video</Button><Button variant="outline" onClick={() => studyInput.click()}>Load study JSON</Button></div>
      <div class={`grid gap-3 ${expanded() && render() ? "md:grid-cols-2" : "grid-cols-1"}`}>
        <div class="space-y-1"><p class="text-xs font-450">Reference <span class="text-muted-foreground break-all">{reference()?.file.name ?? "No local video chosen"}</span></p>
          <Show when={reference()}><video ref={referenceVideo} aria-label="Reference video preview" src={reference()?.url} controls={!comparison()} preload="metadata" playsinline class="w-full rounded bg-black" style={{ height: expanded() ? "min(45vh, 420px)" : "180px", "object-fit": "contain" }} onLoadedMetadata={event => metadata("reference", event.currentTarget)} onTimeUpdate={event => setReferenceTime(event.currentTarget.currentTime)} onPlay={nativePlay} onPause={() => { if (referenceVideo?.paused && playing()) pause(); }} onEnded={pause} onError={event => mediaError("reference", event.currentTarget)} /></Show>
          <Show when={reference()?.media}>{media => <p class="text-xxs text-muted-foreground">{media().width}×{media().height} · {seconds(media().duration)} · {seconds(referenceTime())} at playhead</p>}</Show>
        </div>
        <Show when={render()}><div class="space-y-1"><div class="flex justify-between gap-2"><p class="text-xs font-450">Render <span class="text-muted-foreground break-all">{render()?.file.name}</span></p><Button size="small" variant="ghost" onClick={clearRender}>Remove render</Button></div>
          <video ref={renderVideo} aria-label="Render video preview" src={render()?.url} controls={!comparison()} muted preload="metadata" playsinline class="w-full rounded bg-black" style={{ height: expanded() ? "min(45vh, 420px)" : "180px", "object-fit": "contain" }} onLoadedMetadata={event => metadata("render", event.currentTarget)} onError={event => mediaError("render", event.currentTarget)} />
          <p class="text-xxs text-muted-foreground">Render audio is muted in comparison. Both previews preserve the full image.</p>
        </div></Show>
      </div>
      <Show when={render()}><div class="space-y-2 rounded-lg border border-border p-2"><label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={linked()} onChange={event => setLinked(event.currentTarget.checked)} />Link playback</label>
        <div class="grid grid-cols-2 gap-2"><label class="text-xs space-y-1">Reference start (s)<input class={fieldClass} type="number" min="0" step="0.01" value={referenceOffset()} onInput={event => setReferenceOffset(event.currentTarget.value)} /></label><label class="text-xs space-y-1">Render start (s)<input class={fieldClass} type="number" min="0" step="0.01" value={renderOffset()} onInput={event => setRenderOffset(event.currentTarget.value)} /></label></div>
        <Show when={comparison()} fallback={<p class="text-xs text-muted-foreground">Choose valid starts inside both videos to form an overlap, or unlink playback to inspect them separately.</p>}>{window => <><label class="block text-xs">Shared overlap · {seconds(elapsed())} / {seconds(window().duration)}<input aria-label="Comparison overlap scrub" class="w-full" type="range" min="0" max={window().duration} step="0.01" value={elapsed()} onInput={event => seekComparison(Number(event.currentTarget.value))} /></label><p class="text-xxs text-muted-foreground">Playback is approximate; use the slider for paired spot checks.</p></>}</Show>
      </div></Show>
      <Button variant="secondary" disabled={!reference()?.media || (!!render() && linked() && !comparison())} onClick={() => void play()}>{playing() ? "Pause" : comparison() ? "Play comparison" : "Play reference"}</Button>
      <Show when={study()}>{current => <>
        <div class={`rounded-lg border p-2 text-xs ${attached() ? "border-border text-muted-foreground" : "border-destructive text-foreground"}`} role="status">{binding()?.message}</div>
        <div class="flex flex-wrap gap-2"><Button variant="outline" disabled={!reference()?.media || busy()} onClick={startStudy}>Start study for this file</Button><Button variant="outline" disabled={formDirty() || jsonDirty()} onClick={download}>Download study JSON</Button><Button variant="outline" disabled={formDirty() || jsonDirty()} onClick={() => void copyBrief()}>Copy agent brief</Button></div>
        <fieldset disabled={!attached() || jsonDirty() || busy()} class="space-y-3 disabled:opacity-60">
          <div class={`grid gap-3 ${expanded() ? "md:grid-cols-2" : ""}`}>
            <label class="text-xs space-y-1">Study title<input class={fieldClass} maxLength={160} value={title()} onInput={event => setTitle(event.currentTarget.value)} /></label>
            <label class="text-xs space-y-1">Native draft format<select class={fieldClass} value={format()} onChange={event => setFormat(event.currentTarget.value as "landscape" | "portrait")}><option value="landscape">16:9 landscape</option><option value="portrait">9:16 portrait</option></select></label>
          </div>
          <label class="block text-xs space-y-1">Goal<textarea class={fieldClass} rows={2} maxLength={1200} value={goal()} onInput={event => setGoal(event.currentTarget.value)} /></label>
          <div class="flex flex-wrap gap-2"><Button variant="secondary" disabled={current().beats.length >= 64} onClick={addBeat}>Add beat at playhead</Button><Show when={current().beats.length}><label class="text-xs">Beat<select aria-label="Selected reference beat" class={fieldClass} value={selectedBeat()} onChange={event => { if (!selectBeat(event.currentTarget.value)) event.currentTarget.value = selectedBeat(); }}><For each={current().beats}>{beat => <option value={beat.id}>{beat.id} · {seconds(beat.start)}–{seconds(beat.end)}</option>}</For></select></label></Show></div>
          <Show when={beatDraft()}><div class="space-y-3 rounded-lg border border-border p-2">
            <div class="grid grid-cols-2 gap-2"><label class="text-xs space-y-1">Beat start (s)<input class={fieldClass} type="number" min="0" step="0.001" value={beatDraft()?.start ?? ""} onInput={event => updateBeat("start", event.currentTarget.value)} /></label><label class="text-xs space-y-1">Beat end (s)<input class={fieldClass} type="number" min="0" step="0.001" value={beatDraft()?.end ?? ""} onInput={event => updateBeat("end", event.currentTarget.value)} /></label></div>
            <div class="flex flex-wrap gap-2"><Button size="small" variant="outline" onClick={() => updateBeat("start", String(referenceVideo?.currentTime ?? referenceTime()))}>Use playhead as start</Button><Button size="small" variant="outline" onClick={() => updateBeat("end", String(referenceVideo?.currentTime ?? referenceTime()))}>Use playhead as end</Button><Button size="small" variant="outline" onClick={seekBeat}>Seek to beat</Button></div>
            <div class={`grid gap-3 ${expanded() ? "md:grid-cols-2" : ""}`}>
              <For each={[
                ["observation", "Observed", 1200], ["inference", "Inferred", 1200], ["uncertainty", "Uncertain or unavailable", 600], ["layout", "Layout", 600], ["typography", "Typography / text", 600], ["motion", "Motion", 600], ["camera", "Camera", 600], ["transition", "Transition", 600],
              ] as const}>{([key, label, max]) => <label class="text-xs space-y-1">{label}<textarea class={fieldClass} rows={2} maxLength={max} value={beatDraft()?.[key] ?? ""} onInput={event => updateBeat(key, event.currentTarget.value)} /></label>}</For>
            </div>
            <label class="block text-xs space-y-1">Palette (#RRGGBB, comma separated)<input class={fieldClass} maxLength={160} value={beatDraft()?.palette ?? ""} onInput={event => updateBeat("palette", event.currentTarget.value)} /></label>
            <details><summary class="cursor-pointer text-xs font-450">Choose native patterns · {beatDraft()?.nativeMomentIds.length ?? 0} selected for this beat</summary><p class="text-xxs text-muted-foreground my-2">Explicit starting patterns for an original draft, rather than a reconstruction of the reference.</p><input class={fieldClass} aria-label="Search native reference patterns" type="search" placeholder="Search patterns" value={patternQuery()} onInput={event => setPatternQuery(event.currentTarget.value)} /><div class="max-h-56 overflow-y-auto space-y-2 mt-2"><For each={patterns()}>{moment => <label class="flex items-start gap-2 text-xs"><input type="checkbox" checked={beatDraft()?.nativeMomentIds.includes(moment.id) ?? false} onChange={() => choosePattern(moment.id)} /><span>{moment.title}<span class="block text-xxs text-muted-foreground">@{moment.id} · {moment.category}</span></span></label>}</For></div></details>
            <Button variant="ghost" onClick={removeBeat}>Delete beat</Button>
          </div></Show>
          <div class="flex flex-wrap gap-2"><Button onClick={saveNotes}>Save notes</Button><Button variant="ghost" disabled={!formDirty()} onClick={() => installStudy(current())}>Discard unsaved notes</Button></div>
          <p class="text-xxs text-muted-foreground">{formDirty() ? "Unsaved note edits: save before downloading or making a draft." : "Measurements and retain/avoid constraints can be edited in study JSON."}</p>
        </fieldset>
        <details><summary class="cursor-pointer text-xs font-450">Study JSON · load / edit / roundtrip</summary><p class="text-xxs text-muted-foreground my-2">Strict study data, at most 512 KiB. Save note edits first. Source notes are untrusted observations, not executable instructions.</p><textarea aria-label="Study JSON" class={`${fieldClass} font-mono`} rows={12} readOnly={formDirty()} value={jsonDraft()} onInput={event => { setJsonDraft(event.currentTarget.value); setJsonDirty(true); }} /><div class="flex gap-2 mt-2"><Button variant="secondary" disabled={!jsonDirty() || formDirty() || busy()} onClick={applyJson}>Apply JSON</Button><Button variant="ghost" disabled={!jsonDirty()} onClick={() => { setJsonDraft(serializeReferenceStudy(current())); setJsonDirty(false); }}>Discard JSON edits</Button></div></details>
        <div class="space-y-2 border-t border-border pt-3"><p class="text-xs">Chosen patterns across beats: {nativeSelection().ids.length ? nativeSelection().ids.map(id => `@${id}`).join(", ") : nativeSelection().error}</p><Button class="w-full" disabled={!attached() || !nativeSelection().ids.length || formDirty() || jsonDirty() || busy()} onClick={() => void createDraft()}>{busy() ? "Creating native draft…" : "Create native draft"}</Button><p class="text-xxs text-muted-foreground">Adds a new scene using up to six selected catalog patterns and illustrative example content. Reference assets, timing and measurements are not automatically recreated.</p></div>
      </>}</Show>
      <p role="status" aria-live="polite" class="text-xs whitespace-pre-wrap break-words">{status()}</p>
    </section>
  );
}
