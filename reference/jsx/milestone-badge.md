# Milestone badge

Agent guidance: [editor-milestone-badge](../../.agents/skills/editor-milestone-badge/SKILL.md).

`MilestoneBadge` turns a tiny dot into a circle, reveals the supplied value inside
it, and slides a context label outward into a fixed clipping box. The circle,
value and context remain editable native shapes/text with native local keyframe
tracks. It uses no source artwork, texture, video, external renderer or timers.

```tsx
import { MilestoneBadge } from "@diffusionstudio/jsx";

<MilestoneBadge value="72%" label="Completed modules" labelSide="left"
  x={160} y={260} width={1600} height={560} start={1} duration={5}
  popDuration="12f" labelDelay="6f" minHold={3}
  color="#57D6C7" textColor="#102030" fontFamily="Arial"
  fontSize={72} labelFontSize={38} />
```

Supply `value` (1–16 single-line Unicode characters) and `label` (1–80).
`labelSide` is `left`, `right` (default), or `below`. Labels wrap without dropping
their words; unreadable line budgets fail during authoring. The component does
not infer an earlier value, animate an invented numeric trend, verify a metric,
or supply a source credit. Add caller-authored units and provenance as needed.
Counting text can be composed separately with `CounterReveal`; the badge's
supplied value remains a static literal within its own instance.

The default transparent box is 1100×420 at 0,0. Author width, height and placement
separately for landscape and portrait; choose `below` for a stacked arrangement.
Axis dimensions must be 128–4096 pixels and area at most 8 megapixels. Fixed
rectangle containers hold the clipping regions, including the value's inscribed
box inside the circle. The circle has space for its 6% scale overshoot. A label
slides from the circle-facing edge of its own fixed viewport; it cannot cover
the value while moving. The component's outer clipping box stays fixed.

`color` fills the circle (default `#57D6C7`), `textColor` colors value and context
(default `#101C2B`), and optional `backgroundColor` fills the outer box. Omit the
background when mixing above `Backdrop` or footage. All colors are `#RRGGBB`.
`fontFamily` defaults to Arial. `fontSize` controls the value and defaults to a
conservative fit inside the circle; explicit sizes that cannot fit fail. The
value uses weight 700. `labelFontSize` independently controls context, defaulting
to a bounded size derived from the value. A font metric estimate is not visual
approval: inspect actual characters and contrast at delivery size, especially on
a phone. Do not shrink essential context to make an unsuitable box pass.

`start` places the whole badge. Supply `duration` (default 5 seconds) or an
absolute parent-timeline `end`, never both. `popDuration` defaults to 12 frames
and needs at least two frames for its peak and settle. The native circle scale
goes from 0.025 through 1.06 to 1; the value reveals during the last part of that
expansion. `labelDelay` is an offset from the badge's own start, default four
frames, followed by a six-frame label reveal. The fully settled frame is
`max(popDurationFrames, labelDelayFrames + 6)`. `minHold`, default two seconds,
protects a complete still interval after that point. All times normalize to
integer native 30fps frames. The author supplies the reading budget; this is not
an automatic reading-speed estimate.

`animate={false}` shows the complete circle, value and context at local frame
zero, retaining the requested minimum hold. `key` and `name` identify instances.
`getMilestoneBadgeLayout(props)` exposes immutable geometry, wrapped label,
normalized timing, settled/hold budgets and native tracks for recipe tooling.
Neither repeated playback nor reverse/direct seeking allocates fresh entities
when the authored content is unchanged.

This is an original reusable generalization of the observed dot, circle and
context-label behavior in a reference study. Its defaults contain no reference
text, palette, artwork, claims or source-specific timeline. Inspect the actual
export at the dot, expansion, partial label, complete value and final hold. Mix
it with other skills/components through independently authored boxes and times;
keep reference observations separate from visual approval of the resulting
composition.
