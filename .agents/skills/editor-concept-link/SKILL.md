---
name: editor-concept-link
description: Explain a term with an editable circle, growing connector and revealed definition card. Use for ConceptLink, term-to-definition motion or staged concept callouts.
---

# Connect one term to one explanation

Read [ConceptLink](../../../reference/jsx/concept-link.md) for its geometry and
timing contract, and [editor-motion-recipes](../editor-motion-recipes/SKILL.md)
for mixing. [The motion study](../../../reference/reference-motion-patterns.md)
records the source node, connector and definition-tag construction.

Use this pattern for a short term and its supplied definition. The connector
expresses that authored relationship; it is not evidence of causality, a real
data link or an automatically extracted definition. Keep context and sources
visible where the subject requires them.

Choose down/right orientation to fit the intended format. The circle appears,
the connector grows from its anchored endpoint, then the definition reveals
left to right inside a fixed card mask. Fit the complete definition before
setting the reveal speed, and preserve its final reading hold. The label must
stay attached to the same term throughout.

Several independently keyed `concept-link` instances can explain a sequence.
Stagger their starts and leave space for each connection; review crossings and
overlaps rather than implying that the component solves arbitrary graph layout.
Combine a badge, counter or title when it adds context to the explanation.
Reduced motion preserves the authored stages through instantaneous changes.

Render and inspect the node entrance, connector endpoint, partial card reveal
and complete definition. Check literal wording, separate native shapes/text,
offset timing and reverse seeks. Use `editor-review` for the exact export.
