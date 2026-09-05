---
name: editor-visual-focus
description: Improve framing and visual emphasis in Diffusion Studio footage edits, especially screen recordings or reframing for another aspect ratio. Use when crops, zooms, labels or reading time affect comprehension.
---

# Direct attention without losing context

Read [the playbook contract](../../../reference/playbook.md). Get the current beat's purpose before choosing a crop. Inspect the source at native resolution; small previews cannot verify tiny interface text.

- Identify the relevant area and the context the viewer needs to orient themselves. Show a wider view when needed before a closer view. Return to context when attention moves elsewhere.
- Crop only from visible pixels. Do not treat an enlarged blurry label as verified text or invent a missing screen state.
- Preserve menus, command output, hands or reactions that establish what happened. Check all relevant frames in an animated crop, not only its first frame.
- Place overlays away from essential UI and respect the delivery aspect ratio. Avoid decorative emphasis that competes with the demonstration.
- Test reading time using the actual displayed text, intended audience and output size. Do not impose a fixed universal reading speed or zoom frequency.

Use `media inspect <session-id> --times ... --native` from [the default evidence workflow](../../../reference/agent-workflow.md) for original frames, and the editor's existing node properties or TSX for framing changes. [Media grab](../../../reference/media/grab.md) remains a lower-level alternative when the pipeline cannot serve the source; state the limitation and preserve provenance. Inspect the documented property contract before changing it. `playbook preview` is cut-only; it does not apply crops, captions or overlays. Use `dapi node render` for a composition containing those operations and inspect that render.

When shortening a text-heavy beat, consult `editor-pacing` and protect the needed interval. Record the focus decision and the evidence it serves; route to `editor-review` for legibility and context checks.
