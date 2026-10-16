---
name: editor-illustrated-exchange
description: Compose native editable vector people, nested shoulder/elbow groups and money-for-goods exchange animations. Use for illustrated explanations, reusable line-art parts or exchange-diagram remixes.
---

# Explain one transfer with editable parts

Read [the component contract](../../../reference/jsx/illustrated-exchange.md)
and [editor-motion-recipes](../editor-motion-recipes/SKILL.md). Choose the
participant roles, what moves in each direction, and the wording before styling
the motion. `exchange-diagram` is available in Moments and the CLI catalog;
`IllustratedPerson`, `MoneyNote` and `GoodsBox` are independent native components.
Read [vector drawings and joints](../../../reference/jsx/vectors.md) when editing
contours or building another illustrated object from native paths and groups.

Use `ExchangeDiagram` for the supported money-for-goods relationship. Its payer
stands left, seller right, green notes move toward the seller and the parcel
moves toward the payer. Choose `presentation: "cycle"` for a central held
money/parcel diagram and circular arrows, or `"handoff"` for a completed transfer
to each recipient. Keep both directions legible. A symbol
or label is caller-authored content, not an inferred price, economic measurement
or legal relationship. For another relationship, compose the parts directly and
name the roles explicitly rather than retaining inaccurate spent/earned labels.

The original simplified line art generalizes an inspected exchange reference.
It does not recover that video's hidden drawing assets or original animation
rig. For a requested recreation, inspect the reference interval, tune the
authored path/pose timing and compare the exact export at declared offsets;
do not call a default catalog example an exact match.

Use fixed logical `Group` dimensions for pivots. `IllustratedPerson` has separate
shoulder and elbow groups; each contains editable vector paths. Keep normalized
anchors at the intended joint when changing a contour. Parent transforms carry
their descendants, so rotate the joint group rather than independently moving
every mark. Keep local time local: the diagram's start offsets its descendants
once. Path commands and stroke styles remain native editor data after save.

Budget the transfer, explanatory labels and final still hold with
`transferStart`, `transferDuration`, `labelDelay` and `minHold`. Labels follow the
completed transfer. Reduced motion places the objects at their final positions
and retains the authored label onset. Reframe the contained illustration for
portrait output and inspect it at phone size; a tall box alone does not make
small words readable.

Mix through `playbook motion mix` with an explicit instance box and lifetime,
or compose the parts in JSX. Change supplied labels, money symbol, parcel label
and palette independently. Render the actual scene, check each articulated
part in the native tree, modify at least one path and parent transform, then
check direct/reverse seeks and saved reload. Review the exact export using
[editor-review](../editor-review/SKILL.md); technical tests do not establish a
source match or continuous playback quality.
