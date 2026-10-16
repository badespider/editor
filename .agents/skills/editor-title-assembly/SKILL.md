---
name: editor-title-assembly
description: Create editable letter-assembly titles that gather from blur and offsets into a held headline, with a separately timed subtitle. Use for AssembleTitle or reference-inspired gathering letters.
---

# Let a headline resolve before it must be read

Use the native [AssembleTitle contract](../../../reference/jsx/assemble-title.md).
For combining it with other components, read
[editor-motion-recipes](../editor-motion-recipes/SKILL.md).

Choose this pattern for a short title or chapter identity. Supply a fresh title
and subtitle; keep reference wording and artwork outside the reusable preset.
The observed source interval and scope are recorded in
[the motion study](../../../reference/reference-motion-patterns.md).

Lay out the complete title first. Native glyphs gather into those fixed positions,
with blur, offsets and scale resolving over the authored reveal interval. Budget
the fully assembled title and subtitle reading hold before choosing scatter.
Use a font available in the editor and review its measured spacing in the export.
This component accepts printable ASCII; use ordinary Text/KineticText for joined
scripts, wrapped prose or unsupported characters.

Keep the composition calm while letters resolve. A badge or connector can enter
after the headline settles; alternate moving elements when both are important.
For reduced motion, the title appears whole and the subtitle keeps its stage.

Compile an `assemble-title` instance through `motion mix`, or compose
`AssembleTitle` directly. Preserve its key, box and local timing when repeating
it. Render and inspect early, partly assembled, settled and final states,
including phone-size output when requested. Check literal characters, native
blur/offset tracks and reverse seeks; use `editor-review` for the exact export.
