/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assets } from "./assets";
import { useLayout } from "@/context/layout";
import { useEditorApi } from "@/context/editor-api";
import { createSignal, Show } from "solid-js";
import { Button } from "../ui/button";
import { Icon } from "../ui/icon";
import { ProjectMenu } from "./project-menu";
import { useProjectId } from "@/hooks/use-project-id";
import { getProjectName, setProjectName } from "../engine/db";
import { createResource } from "solid-js";
import { cx } from "@/lib/cva";
import { Moments } from "./moments";
import { ReferenceWorkbench } from "./reference-workbench";

export function SidebarLeft() {
  const [panel, setPanel] = createSignal<"assets" | "moments" | "reference">("assets");
  return (
    <div class="flex flex-col h-full overflow-hidden">
      <ElectronHeader />
      <ProjectHeader />
      <div role="tablist" aria-label="Project resources" class="flex gap-1 px-3 pb-2 border-b border-border">
        <Button role="tab" id="assets-tab" aria-selected={panel() === "assets"} aria-controls="assets-panel" variant={panel() === "assets" ? "secondary" : "ghost"} onClick={() => setPanel("assets")}>Assets</Button>
        <Button role="tab" id="moments-tab" aria-selected={panel() === "moments"} aria-controls="moments-panel" variant={panel() === "moments" ? "secondary" : "ghost"} onClick={() => setPanel("moments")}>Moments</Button>
        <Button role="tab" id="reference-tab" aria-selected={panel() === "reference"} aria-controls="reference-panel" variant={panel() === "reference" ? "secondary" : "ghost"} onClick={() => setPanel("reference")}>Reference</Button>
      </div>
      <Show when={panel() !== "reference"}>
        <Show when={panel() === "assets"} fallback={<div role="tabpanel" id="moments-panel" aria-labelledby="moments-tab" class="flex-1 min-h-0 flex flex-col"><Moments /></div>}>
          <div role="tabpanel" id="assets-panel" aria-labelledby="assets-tab" class="flex-1 min-h-0 flex flex-col"><Assets /></div>
        </Show>
      </Show>
      <div role="tabpanel" id="reference-panel" aria-labelledby="reference-tab" class="flex-1 min-h-0 flex-col" style={{ display: panel() === "reference" ? "flex" : "none" }}><ReferenceWorkbench active={panel() === "reference"} /></div>
    </div>
  );
}

export function ElectronHeader() {
  const { isDesktop, isFullscreen } = useEditorApi();
  const { toggleTimeline, toggleUI } = useLayout();

  return (
    <Show when={isDesktop}>
      <div class="h-10 border-b border-border shrink-0 pr-4 pl-1.5 gap-1 relative flex items-center">
        <div class="flex-1 h-full data-[fullscreen=true]:flex-none transition-all duration-100 ease-out" data-fullscreen={isFullscreen()} />
        <div class="flex items-center gap-1 relative z-30" style="-webkit-app-region: no-drag;">
          <Button variant="ghost" size="icon" class="text-muted-foreground" onClick={toggleTimeline}>
            <Icon name="sidebar-timeline" />
          </Button>
          <Button variant="ghost" size="icon" class="text-muted-foreground" onClick={toggleUI}>
            <Icon name="sidebar" />
          </Button>
        </div>
      </div>
    </Show>
  )
}

type ProjectHeaderProps = {
  class?: string;
}

export function ProjectHeader(props: ProjectHeaderProps) {
  const projectId = useProjectId();
  const [projectNameDraft, setProjectNameDraft] = createSignal<string | null>(null);
  const [projectName, { refetch: refetchProjectName }] = createResource(() => getProjectName(projectId()));

  const handleProjectNameInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
    setProjectNameDraft(event.currentTarget.value);
  };

  const handleFocusNameInput = (event: FocusEvent & { currentTarget: HTMLInputElement }) => {
    setProjectNameDraft(projectName() ?? null);
    event.currentTarget.select();
  };

  const handleBlurNameInput = () => {
    setProjectNameDraft(null);
  };

  const handleKeyDownNameInput = async (event: KeyboardEvent & { currentTarget: HTMLInputElement }) => {
    if (event.key === "Enter") {
      const input = event.currentTarget;
      const trimmedName = projectNameDraft()?.trim() ?? "";
      const currentName = projectName() ?? "";

      if (trimmedName.length > 0 && trimmedName !== currentName) {
        await setProjectName(projectId(), trimmedName);
      }

      refetchProjectName();
      setProjectNameDraft(null);
      input.blur();
    }

    if (event.key === "Escape") {
      event.currentTarget.blur();
      refetchProjectName();
      setProjectNameDraft(null);
    }
  };

  return (
    <div class={cx("h-12 shrink-0 flex items-center gap-1 pr-4 pl-2.5", props.class)}>
      <ProjectMenu />
      <div class="flex items-center w-full">
        <input
          type="text"
          value={projectNameDraft() ?? projectName() ?? ""}
          onInput={handleProjectNameInput}
          onFocus={handleFocusNameInput}
          onBlur={handleBlurNameInput}
          onKeyDown={handleKeyDownNameInput}
          placeholder="Project name"
          class="w-full bg-transparent focus-ring px-1 h-5 ml-1 rounded text-xs text-muted-foreground font-450 outline-none"
        />
      </div>
    </div>
  )
}

export function FloatingProjectHeader() {
  const { isDesktop } = useEditorApi();
  const { toggleUI } = useLayout();

  return (
    <div data-desktop={isDesktop} class="h-10 rounded-lg border border-border shrink-0 flex items-center px-2 gap-1 fixed top-4 data-[desktop=true]:top-10 left-4 z-30 bg-background shadow-lg">
      <ProjectMenu />
      <span class="text-xs text-muted-foreground font-450">Diffusion Studio</span>
      <Button variant="ghost" size="icon" class="text-muted-foreground ml-2" onClick={toggleUI}>
        <Icon name="sidebar" />
      </Button>
    </div>
  )
}
