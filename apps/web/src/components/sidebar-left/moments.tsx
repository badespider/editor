/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo, createSignal, For, Show } from "solid-js";
import { toast } from "somoto";
import { buildMotionBrief, buildMotionModule, getMotionMoment, getMotionContentExample, motionCategories, motionMoments, searchMotionMoments } from "@diffusionstudio/editing-playbook/motion";
import type { MotionCategory, MotionContent, MotionMomentFormat, MotionMomentMode } from "@diffusionstudio/editing-playbook/motion";
import { useEngine } from "@/context/engine";
import { handleMount } from "@/context/editor-api/mount";
import { Button } from "../ui/button";

const fieldClass = "w-full rounded-md border border-border-input bg-background px-2 py-1.5 text-xs focus-ring";

/** The catalog generates native editable scenes through the same persisted mount path as the CLI. */
export function Moments() {
  const engine = useEngine();
  const [query, setQuery] = createSignal("");
  const [format, setFormat] = createSignal<MotionMomentFormat>("landscape");
  const [category, setCategory] = createSignal<MotionCategory|"all">("all");
  const [theme, setTheme] = createSignal<"paper"|"dark">("paper");
  const [reduceMotion, setReduceMotion] = createSignal(false);
  const [contentDraft, setContentDraft] = createSignal("");
  const [mode, setMode] = createSignal<MotionMomentMode>("template");
  const [selected, setSelected] = createSignal<string[]>(["question-reveal"]);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [source, setSource] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [status, setStatus] = createSignal("");
  const results = createMemo(() => searchMotionMoments(query(), format(),category()==="all"?undefined:category() as MotionCategory));
  const selectedVisible = createMemo(()=>mode()!=="template" || results().some(item=>item.id===selected()[0]));
  const duration = createMemo(() => selected().reduce((sum, id) => sum + getMotionMoment(id).defaultDuration, 0));
  const choose = (id: string) => {
    setStatus("");
    if(mode()!=="template" && !selected().includes(id) && selected().length===6){setStatus("Choose up to six moments in one sequence.");return;}
    setContentDraft("");
    if (mode() === "template") setSelected([id]);
    else setSelected(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id]);
  };
  const changeMode = (value: MotionMomentMode) => {
    setMode(value);
    setContentDraft("");
    if (value === "template") setSelected(ids => ids.slice(0, 1));
    setStatus("");
  };
  const move = (index: number, offset: number) => setSelected(ids => {
    const next = [...ids];
    const target = index + offset;
    if (target < 0 || target >= next.length) return ids;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const remove = (id:string) => {setSelected(ids=>ids.filter(item=>item!==id));setContentDraft("");setStatus("");};
  const apply = async () => {
    if (busy() || !selected().length || !selectedVisible()) return;
    setBusy(true); setStatus("");
    try {
      const content = contentDraft().trim()?JSON.parse(contentDraft()) as MotionContent:undefined;
      const options = { momentIds: selected(), mode: mode(), format: format(), title: title() || undefined, body: body() || undefined, source: source() || undefined, content, theme:theme(),motion:reduceMotion()?"reduced" as const:"full" as const };
      const brief = buildMotionBrief(options);
      if (mode() === "inspiration") {
        await navigator.clipboard.writeText(JSON.stringify(brief, null, 2));
        setStatus("Motion brief copied. Use it to author a new scene.");
      } else {
        await handleMount(() => engine)({ code: buildMotionModule({ ...options, sceneKey: `moment-${crypto.randomUUID()}` }) });
        setStatus(`Added a ${brief.duration}s ${options.format === "portrait" ? "9:16" : "16:9"} scene. Select its layers to edit.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add this moment.";
      setStatus(message);
      toast.error("Moment could not be applied", { description: message });
    } finally { setBusy(false); }
  };
  return (
    <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
      <div><h2 class="text-sm font-450">Motion library</h2><p class="text-xs text-muted-foreground mt-1">{motionMoments.length} reusable presets for stories, graphics and lessons.</p></div>
      <label class="block text-xs space-y-1">Search moments
        <input class={fieldClass} type="search" maxLength={300} placeholder="@evidence-focus, code, reveal…" value={query()} onInput={event => setQuery(event.currentTarget.value)} />
      </label>
      <label class="block text-xs space-y-1">Category<select id="moment-category" class={fieldClass} value={category()} onChange={event=>setCategory(event.currentTarget.value as MotionCategory|"all")}><option value="all">All categories</option><For each={motionCategories}>{value=><option value={value}>{value.replaceAll("-"," ")}</option>}</For></select></label>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs space-y-1">Format<select id="moment-format" class={fieldClass} value={format()} onChange={event => setFormat(event.currentTarget.value as MotionMomentFormat)}><option value="landscape">16:9 landscape</option><option value="portrait">9:16 mobile</option></select></label>
        <label class="text-xs space-y-1">Use<select id="moment-mode" class={fieldClass} value={mode()} onChange={event => changeMode(event.currentTarget.value as MotionMomentMode)}><option value="template">One scene</option><option value="sequence">Sequence</option><option value="inspiration">Inspiration brief</option></select></label>
      </div>
      <label class="block text-xs space-y-1">Theme<select id="moment-theme" class={fieldClass} value={theme()} onChange={event=>setTheme(event.currentTarget.value as "paper"|"dark")}><option value="paper">Paper</option><option value="dark">Dark studio</option></select></label>
      <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={reduceMotion()} onChange={event=>setReduceMotion(event.currentTarget.checked)}/>Reduce decorative motion</label>
      <p class="text-xs text-muted-foreground"><Show when={mode() === "inspiration"} fallback={mode() === "sequence" ? "Choose beats, then arrange their order below." : "Keep a moment’s structure and timing; add your own words."}>Collect movement and pacing references for a new composition.</Show></p>
      <div class="space-y-2" aria-label="Available moments">
        <For each={results()}>{moment => <button type="button" aria-pressed={selected().includes(moment.id)} class="w-full text-left rounded-lg border border-border p-3 hover:bg-accent focus-ring aria-pressed:border-primary aria-pressed:bg-secondary" onClick={() => choose(moment.id)}>
          <span class="flex justify-between gap-2 text-xs font-450"><span>{moment.title}</span><span class="text-muted-foreground">{moment.defaultDuration}s</span></span>
          <span class="block text-xs text-muted-foreground mt-1">{moment.purpose}</span>
          <span class="block text-xxs text-muted-foreground mt-2">{moment.category.replaceAll("-"," ")} · @{moment.id}</span>
        </button>}</For>
        <Show when={!results().length}><p class="text-xs text-muted-foreground">No moments match. Try “reveal”, “proof” or “lesson”.</p></Show>
      </div>
      <Show when={mode() !== "template" && selected().length > 0}>
        <div class="space-y-1" aria-label="Moment order"><p class="text-xs font-450">Selected order</p><For each={selected()}>{(id, index) => <div class="flex items-center gap-1 text-xs"><span class="flex-1">{index() + 1}. {getMotionMoment(id).title}</span><Button size="small" variant="ghost" aria-label={`Move ${getMotionMoment(id).title} earlier`} disabled={index() === 0} onClick={() => move(index(), -1)}>↑</Button><Button size="small" variant="ghost" aria-label={`Move ${getMotionMoment(id).title} later`} disabled={index() === selected().length - 1} onClick={() => move(index(), 1)}>↓</Button><Button size="small" variant="ghost" aria-label={`Remove ${getMotionMoment(id).title}`} onClick={() => remove(id)}>×</Button></div>}</For></div>
      </Show>
      <label class="block text-xs space-y-1">Headline <span class="text-muted-foreground">(optional)</span><input class={fieldClass} maxLength={72} placeholder="Use the moment’s example" value={title()} onInput={event => setTitle(event.currentTarget.value)} /></label>
      <label class="block text-xs space-y-1">Supporting text <span class="text-muted-foreground">(optional)</span><textarea class={fieldClass} rows={2} maxLength={160} value={body()} onInput={event => setBody(event.currentTarget.value)} /></label>
      <label class="block text-xs space-y-1">Source credit <span class="text-muted-foreground">(optional)</span><input class={fieldClass} maxLength={96} value={source()} onInput={event => setSource(event.currentTarget.value)} /></label>
      <details class="rounded-md border border-border p-2 text-xs space-y-2"><summary class="cursor-pointer">Preset data and timing</summary><p class="text-muted-foreground mt-2">Load an example to edit values, labels, caption cues or story beats. Sample data is illustrative; captions need your own verified words and times.</p><Button variant="secondary" class="mt-2" onClick={()=>setContentDraft(JSON.stringify(Object.fromEntries(selected().map(id=>[id,getMotionContentExample(id)])),null,2))}>Load editable example</Button><label class="block mt-2">Advanced preset data (JSON)<textarea aria-label="Advanced preset data" class={fieldClass+" mt-1 font-mono"} rows={9} maxLength={131072} value={contentDraft()} placeholder="Leave empty to use example settings" onInput={event=>setContentDraft(event.currentTarget.value)}/></label><Show when={contentDraft()}><Button variant="ghost" onClick={()=>setContentDraft("")}>Reset data</Button></Show></details>
      <Show when={!selectedVisible()}><p class="text-xs text-muted-foreground">Choose a preset from the results.</p></Show>
      <Button class="w-full" disabled={busy() || !selected().length || !selectedVisible()} onClick={apply}>{busy() ? "Preparing…" : mode() === "inspiration" ? "Copy motion brief" : `Add new scene · ${duration()}s`}</Button>
      <p role="status" aria-live="polite" class="text-xs text-muted-foreground">{status()}</p>
    </div>
  );
}
