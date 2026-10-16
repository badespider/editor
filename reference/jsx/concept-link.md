# ConceptLink

Agent guidance: [editor-concept-link](../../.agents/skills/editor-concept-link/SKILL.md).

`ConceptLink` is one reusable relationship: a short term pops into a circle, a
thin connector grows from its boundary, then a rounded definition tag is revealed
from left to right. Every circle, connector, surface and text remains a native
editable node. Multiple instances can be staggered or placed beside other native
components; this component does not infer relationships or construct a whole graph.

```tsx
import { ConceptLink } from "@diffusionstudio/jsx";

<ConceptLink term="CPU" definition="Runs supplied instructions"
  x={120} y={480} width={840} height={620}
  start={1} duration={5} direction="down"
  nodeSize={160} cardWidth={560} fontSize={32}
  nodeDuration="10f" linkDelay="12f" cardDelay="24f"
  revealDuration="10f" minHold={2}
  accent="#37CDB6" surfaceColor="#C7F5E9"
  textColor="#152A31" lineColor="#6D8A91" />
```

The box is transparent, fixed and clipped. The default is 640×420 pixels with
downward layout. `direction="right"` places the circle on the left and the tag on
the right; author a wider box when the definition needs more room. The connector
can be diagonal, and its circle endpoint stays anchored throughout its growth.
All placement coordinates are local to the component. A surrounding panel can
place the whole instance without altering its internal geometry.

`term` is required single-line text, up to 20 characters. Short terms such as
`CPU`, `RAM` or `API` work best. `definition` is required single-line text up to
100 characters; it wraps conservatively to at most three lines with no content
discarded. `fontSize` controls the definition (default at most 28px); the term
font is bounded by its circle. A term that would require less than 8px fails.
Change the content or geometry instead of hiding it. The fit budget does not
measure the selected font: inspect the actual export at delivery size.

Optional controls are `x`, `y`, `width`, `height`, `nodeSize`, `cardWidth`,
`fontFamily`, `fontSize`, `accent`, `surfaceColor`, `textColor`, `lineColor`,
`start`, `end` or `duration`, `nodeDuration`, `linkDelay`, `cardDelay`,
`revealDuration`, `minHold`, `animate`, `key` and `name`. Colors use `#RRGGBB`;
fonts must be present on the rendering computer. `end` is an absolute parent
time and is mutually exclusive with `duration`. The default lifetime is 5s.

All times normalize to the editor's 30fps clock. `nodeDuration` defaults to
10 frames, `linkDelay` to 12, `cardDelay` to 24 and `revealDuration` to 10.
The node must settle before the connector begins; the connector must complete
before the tag starts. The default fully readable `minHold` is 1s, measured
after the tag reveal. Choose a hold for the actual words and audience; the
component does not estimate reading speed. Animate several relationships with
different instance starts rather than shortening their reading holds.

`animate={false}` keeps the node, connector and definition stages at their
authored times, with instantaneous appearance and no scale, width or fade
tracks. It retains all supplied content and the final reading hold. Playback,
direct seeking and reverse seeking use native local tracks and lifetimes;
no wall-clock timer or frame-created nodes are involved.

`getConceptLinkLayout(props)` returns immutable normalized content, component
bounds, circle/card boxes, connector endpoints, font sizes and frame timings.
It is a pure authoring helper, not a visibility measurement or render review.

The mechanics were generalized from inspected source frames around
229–234.4s in the user-provided reference: independently appearing term circles,
boundary-to-tag connector growth and a horizontal clipped definition reveal.
This is an original modular implementation. It bundles no source footage,
paper texture, font or creator artwork. The source's whole-graph repositioning
and shared many-to-one links are separate authoring choices. Use caller-supplied
terms and definitions, preserve provenance elsewhere in the composition, and
review the exact native export with the editor's normal evidence pipeline.
