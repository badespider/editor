---
name: editor-scene-building
description: Plan purposeful B-roll, cutaways, and complete visual scenes from existing footage, or identify pickup shots to record. Use for visual coverage and scene construction, not ordinary portrait cropping or decorative stock insertion.
---

# Build scenes with the pictures we actually have

Start with the current beat's purpose and the inspected source dossier. Use
`editor-story-plan` for narrative ordering and `editor-visual-focus` for what must
remain visible. Read [the plan contract](../../../reference/playbook.md) before
writing a plan; use [the evidence pipeline](../../../reference/agent-workflow.md)
to inspect each proposed shot and its boundaries.

- Identify what a shot contributes: orientation, action detail, relevant object,
  reaction, or transition. Wide/action/detail/reaction is a coverage checklist,
  not a requirement to force four shots into every scene.
- Preserve a complete meaningful action where the result matters. Do not cover
  the decisive action or proof with an attractive but unrelated cutaway.
- Distinguish illustrative footage from evidence of an event. A later close-up
  of a book can illustrate studying; it does not prove when or how long the
  person studied. Check clothing, location, object state, and direction of
  movement before implying continuous action across shots.
- For explanatory coverage, prefer an available shot that helps the explanation.
  If none does, keep the original picture or suggest a specific pickup. Do not
  fetch stock, generate replacements, or add invented reactions by default.
- For a selected [visual-journal profile](../../../reference/style-profiles.md),
  remembering the creator's own environment is also a purpose. Brief views of
  nature, a room, a walk, or daily details need not match the narration. Inspect
  and identify their real source/place/time; do not imply that unrelated pictures
  prove the spoken event. Let a moment register without a fixed shot quota and
  preserve essential actions. Keep these choices scoped to that journal edit.
- Decide what the audience should hear under each shot. Keep useful original
  sound; avoid doubling dialogue when retaining a speaker's audio beneath
  another picture. Use `editor-audio-continuity` for speech boundaries and handles.

Return a coverage map with each shot's source/range/evidence, its purpose, intended
timeline placement, and audio source. Label missing pickups as proposals. This map
is a planning sidecar: the strict cut-only plan has no B-roll or independent
picture/audio fields.

When implementation is requested, distinguish two cases:

- A normal sequence retaining each shot's original sound can use the supported
  [prepared cut-only delivery](../../../reference/delivery.md).
- Silent full-frame B-roll over continuing original dialogue uses the reusable
  [layered workflow](../../../reference/layered.md): `playbook layered workflow`,
  then check/prepare/deliver/verify/inspect/review. Map each cutaway's source time,
  output frame and chronology, protect essential picture, and keep its sound muted.
  Standalone environment beats can retain original natural sound in the base plan.
  This V1 has no music or generic mixed-audio support.
- Other J/L cuts or overlapping/processed audio tracks need a custom actual editor
  composition. Read [media timing](../../../reference/jsx/timing.md),
  [audio properties](../../../reference/jsx/audio.md), and [node render](../../../reference/node/render.md)
  before authoring it. Preserve source and timeline clocks independently. Do not
  describe a cut-only preview or original-sound verifier as testing this mix.

Review the actual result for orientation, complete action, false continuity,
speech intelligibility, and sync. Compare a purposeful cutaway with the same
section's baseline when its value is uncertain; keep the simpler version if the
cutaway hides information. Hand off coverage honestly through `editor-review`.
