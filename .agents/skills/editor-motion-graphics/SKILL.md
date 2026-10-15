---
name: editor-motion-graphics
description: Compose or improve native Diffusion Studio titles, diagrams, callouts and explanatory animations. Use for generated graphics and motion within an edit; ordinary native authoring does not require external-tool licensing research or a footage plan.
---

# Give motion a readable purpose

Read [native authoring guidance](../../../reference/jsx/editor-guidance.md) and
[the motion catalog](../../../reference/motion-catalog.md). Start with an existing
native moment or component whose purpose fits the brief. Use the catalog's
template/sequence modes to author; inspiration mode is a reference, not a mountable
composition. Reuse native components before introducing an external animation tool.

Choose the [catalog category](../../../reference/motion-catalog.md#choose-by-editing-purpose)
from the beat: captions for supplied words, charts/data for a comparison,
maps/layouts for relationships, overlays for context, and storytelling/education
for a sequence. Backgrounds, effects and text treatments support that purpose.
Select the category, intended format and editable content before styling it.

State what the viewer should understand and which element changes to explain it.
Keep essential context, source labels and literal code visible. Authored examples
must be identified as examples; an animation is not proof that code ran or an event
happened. For generated-only graphics, work directly in a native composition.
Use footage evidence and a story plan only when the work actually uses footage.

Use [native keyframes](../../../reference/jsx/keyframes.md),
[motion presets](../../../reference/jsx/effects.md), and the appropriate
[documentary](../../../reference/jsx/documentary.md) or
[education components](../../../reference/jsx/education.md). Check their current
interfaces before writing properties. Give every leaf an explicit start/end:
sourceless leaves otherwise have a finite default lifetime, even in a longer scene.
Map scene/local/source time once; derive animation from the editor clock so direct
and reverse seeks reach the same frame. Preserve scene identity and dispose native
or surface resources when the composition is removed.

For [authored captions](../../../reference/jsx/caption-presets.md), supply the exact
cue text and track-local times. Use word emphasis only with supplied word times;
preserve literal punctuation, gaps and meaning. Compare with the exact audio
before claiming speech accuracy. Label silent timing samples as authored, and
keep fallible ASR corrections and unavailable listening explicit.

For charts and metrics, retain units, source/disclosure, increasing domains and
meaningful baselines. Preserve declared gaps and shared comparison scales. Label
illustrative data visibly; a counting animation is not a measurement or trend
prediction. Read the [data contract](../../../reference/jsx/data-graphics.md)
before supplying values.

Reserve caption and platform-interface space using authored safe areas; protect
faces, hands, command output, source identity and the decisive action as well.
Use `captionSafeLayout` as a starting guide and `EvidenceCallout.protectedAreas`
for labels sharing that coordinate system. Review the entire move, not only the
first position. A rectangle that fits the canvas can still cover the evidence.

Budget entrance, still reading and exit separately. Set `motion.reveal`'s `minHold`
from the actual content, audience and output size; a technically valid one-frame
hold is not a reading judgment. Check the first readable frame, last held frame,
both sides of every content change and the last visible frame. When graphics sit
over footage, use `editor-visual-focus` for protected context and `editor-pacing`
when their timing affects a cut; these are conditional instructions, not generated
graphics prerequisites.

Keep one clear focus in each beat. Prefer a quiet background and restrained
emphasis where fine text or data is the point. Choose reduced decorative motion
when movement competes with comprehension; keep caption timing, prerequisite
reveals and essential reading intervals intact.

Render the actual single-scene composition through [node render](../../../reference/node/render.md).
Inspect that exact export at delivery size, and at phone size for mobile work.
Confirm essential characters, leader targets and provenance remain legible during
motion, holds and exits. Route to `editor-review` with the export identity and
actual inspection coverage. Schema/type/encoder success is technical evidence;
readability and continuous playback require their own observations.

For a requested new external capability or selected tool reference, use
`editor-motion-integration`. Existing native keyframes, effects, components and
catalog moments need no new integration candidate or license audit on each use.
