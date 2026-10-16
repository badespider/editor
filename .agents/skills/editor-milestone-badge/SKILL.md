---
name: editor-milestone-badge
description: Present a supplied milestone in an editable circular badge that grows from a dot and reveals its context label. Use for MilestoneBadge or animated value/date badges.
---

# Attach context to a milestone

Read the native [MilestoneBadge contract](../../../reference/jsx/milestone-badge.md).
Use [editor-motion-recipes](../editor-motion-recipes/SKILL.md) to combine it with
other patterns. [The motion study](../../../reference/reference-motion-patterns.md)
records the observed dot-to-circle and outward label reveal.

Supply the value and context label explicitly. A supplied token can represent a
date, stage or result; the animation does not infer a measurement or missing
intermediate values. Preserve units, source and disclosure in adjacent native
layers when needed. A static-value badge can accompany a separate CounterReveal
when the brief actually supplies a changing sequence.

Choose left, right or below placement from the available space. Keep the label
outside the circle and within its fixed reveal mask. Fit the complete value to
the circle, set label typography independently when necessary, and reserve the
settled reading hold after both circle and label arrive. Inspect the full move
for clipping and collisions with nearby text.

Use `milestone-badge` in a mix or compose `MilestoneBadge` directly. Give repeated
badges independent keys and lifetimes. Stagger them for authored chronology;
their left-to-right order alone does not prove a real sequence. Reduced motion
shows the supplied badge and label immediately.

Render the exact scene and inspect the dot, growing circle, label reveal and
complete hold at delivery size. Check reverse seeks and separate editable value,
circle and context layers. Retain remaining differences from the source study
without turning its palette, wording or typography into a universal rule.
