import { createEffect, createSignal, Show } from "solid-js";
import { parseVectorPathCommands } from "@diffusionstudio/jsx";
import { setComponent, useEntityState } from "@/components/engine";
import { useEngine } from "@/context/engine";
import { PanelSection } from "@/components/ui/panel-section";
import { Button } from "@/components/ui/button";

/** Native command data stays editable after save/reload; no HTML/SVG paint surface. */
export function VectorPathSettings(props: { selection: Set<number> }) {
  const { world } = useEngine(), c = world.components;
  const eid = () => props.selection.values().next().value!;
  const commands = useEntityState(c.VectorPath.commands, eid, []);
  const filled = useEntityState(c.VectorPath.fillEnabled, eid, true);
  const [draft, setDraft] = createSignal<string>();
  const [error, setError] = createSignal("");
  createEffect(() => { eid(); setDraft(undefined); setError(""); });
  const apply = () => {
    try {
      const value = parseVectorPathCommands(JSON.parse(draft() ?? JSON.stringify(commands())));
      world.history.transaction("Edit vector path", () => setComponent(world, eid(), c.VectorPath, { commands: value }));
      setDraft(undefined); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  return <PanelSection title="Vector path">
    <label class="flex items-center gap-2 text-xs py-2">
      <input type="checkbox" checked={filled()} onChange={event => setComponent(world, eid(), c.VectorPath, { fillEnabled: event.currentTarget.checked })} />
      Fill closed areas
    </label>
    <p class="text-xs text-muted-foreground pb-2">Local pixels: M move, L line, Q quadratic, C cubic, Z close. Edit fill and outline below.</p>
    <textarea aria-label="Vector path commands" class="w-full min-h-36 rounded border bg-background p-2 text-xs font-mono" spellcheck={false}
      value={draft() ?? JSON.stringify(commands(), null, 2)} onInput={event => setDraft(event.currentTarget.value)} />
    <div class="flex gap-2 py-2"><Button size="small" onClick={apply}>Apply path</Button>
      <Button size="small" variant="ghost" onClick={() => { setDraft(undefined); setError(""); }}>Discard</Button></div>
    <Show when={error()}><p role="alert" class="text-xs text-destructive">{error()}</p></Show>
  </PanelSection>;
}
