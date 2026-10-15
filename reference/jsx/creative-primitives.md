# Creative primitives

Four native building blocks fill gaps around the existing
[documentary cards and overlays](documentary.md), [education tools](education.md),
[effects](effects.md) and [presentation themes](presentation.md). They create
editable shapes, text and paint entities; they use no DOM animation, remote
assets or additional runtime. Use the editor's [purpose and review guidance](editor-guidance.md)
to choose a treatment and check the actual export.

## Common box, theme and timing

All four accept `x`, `y`, `width`, `height`, `start`, `end` **or** `duration`,
`fontSize`, `theme` and `animate`. Times accept seconds, canonical `"30f"`
frames and clock strings. The default lifetime is six seconds; each native
leaf receives an explicit local lifetime. Boxes are finite, at most 4096px
per side and eight megapixels. Timing is bounded to one hour at 30fps.

`theme` uses the same fields as the education tools: `background`, `surface`,
`text`, `muted`, `accent`, `success`, `fontFamily`, `monoFamily`. Colors are
`#RRGGBB`; choose fonts available on the render machine. For example,
`PRESENTATION_THEMES.education.classroom` supplies a light paper/teal palette.
Color validation does not establish contrast over arbitrary footage.

Cards and layouts default to `{x:96,y:96,width:1728,height:888}`. Backdrop
defaults to the full 1920×1080 frame. There is no automatic format reflow:
author portrait boxes and typography explicitly. A useful portrait starting
point is `{x:72,y:120,width:936,height:1640,fontSize:48}` inside a 1080×1920 scene.
The [example](../../examples/17-creative-primitives.tsx) exports landscape and
portrait factories using columns and stacked panels respectively.

## Backdrop

```tsx
<Backdrop width={1080} height={1920} duration={6} kind="dots"
  seed={42} spacing={112} strength={0.1}
  theme={PRESENTATION_THEMES.education.classroom} />
```

`kind` is `solid` (default), `grid`, `dots` or `gradient`. Grid/dots are static,
deterministic native shapes. `seed` is an unsigned 32-bit integer; `spacing`
is 24..1024px (default 96). A pattern may contain at most 512 marks; increase
spacing if a large box exceeds that budget. `strength` is pattern opacity,
0..0.25 (default 0.12). Keep it subdued behind instructional text.

Gradient uses native `LinearGradientPaint` from `theme.background` to
`theme.surface`, with `gradientAngle` in 0..360 degrees (default 90).
`getBackdropPattern(props)` returns frozen local mark boxes for authoring
checks. There is no texture download, random clock or motion to compete with
the main beat. `animate` has no effect on a static background.

## PanelLayout

```tsx
<PanelLayout duration={6} direction="columns" gap={40}
  first={box => <text {...box} fill="#FFFFFF">Context</text>}
  second={box => <text {...box} fill="#FFFFFF">Detail</text>} />
```

`direction` is `columns` (default) or `stack`. `ratio` assigns 0.2..0.8 of
usable length to the first panel, default 0.5. `gap` defaults to 32px and
`padding` to zero. Both resulting panels must retain at least 64px in each
dimension; invalid geometry throws. `getPanelLayout({width,height,...})`
returns the same frozen authored boxes without creating entities.

Each slot is a function receiving its own local
`{x:0,y:0,width,height,start:"0f",end:"Nf"}`. A timed native Group places it
inside the panel. Use the supplied local lifetime on slot leaves, and keep
their coordinates inside the slot. Slot contents remain the author's
responsibility: the component does not clip an overflowing child, resize
images or infer a nested ticker clock. A ticker-driven map/diagram must use
its documented scene-clock contract; prefer direct scene placement for those
tools. Static/native-keyframed slot content needs no manual global offset.

## StoryBeatCard

```tsx
<StoryBeatCard start={2} duration={6} minHold={3}
  eyebrow="QUESTION" title="What changed?"
  body="Show the context before the relevant detail."
  source="Caller-supplied reference" />
```

`title` and `body` are required authored prose. `eyebrow` and `source` are
optional; no source or claim is invented. The component reserves separate
regions for hierarchy, supporting text and provenance. It uses a restrained
native build/hold/exit through `motion.reveal`; `minHold` defaults to three
seconds and must fit alongside the entrance/exit. It does not estimate
reading speed. `animate={false}` shows the complete static card, including
for a shorter authored lifetime.

Prose wraps conservatively; a line-budget error asks you to shorten text,
enlarge the box or change font size. Content is not silently truncated. Use
the existing `LowerThird`, `QuoteCard`, `SourceCard` or `EvidenceCallout`
when their specific purpose matches the beat, rather than restyling every
source into this card.

## KineticText

```tsx
<KineticText x={72} y={420} width={936} height={1000} start={12} duration={6}
  fontSize={72} text="Context makes the detail meaningful."
  revealDuration={1.2} minHold={3} emphasisWords={[1,4]} />
```

`text` is prose, not literal code. Whitespace is normalized while explicit
line breaks remain. `emphasisWords` contains unique **one-based** indices
after that normalization. An emphasized word receives the accent color and
bold weight. At most 96 words/2048 characters are accepted; oversized words
and unreadable layouts throw before nodes are created.

All words reserve their final positions from the start. In the editor,
one local `OffscreenCanvas` measures complete words at their actual font
family, size and regular/bold weight. Advances use those widths plus measured
spaces, so the reveal retains normal typography rather than character-cell
gaps. Whole words wrap before their boxes overflow; a small rounding guard
protects each native text box without becoming extra inter-word spacing.
Hosts without a usable local canvas use an explicit conservative 1.1em-cell
fallback, which may wrap earlier and appear more widely spaced. Use an
installed font and review the actual editor export.

The first word is
visible at local frame zero; the last appears at `revealDuration` (default
one second). Native `steps(1)` opacity keyframes reveal words without a
per-frame JavaScript callback or layout shift. The complete reading hold
defaults to two seconds and must fit before the last visible frame.
`animate={false}` makes every word immediately visible and ignores the
reveal/hold budget, while still validating the supplied values and layout.

The timed Group maps `start` once; its word tracks begin at local zero.
Direct/reverse seeking samples the same authored native tracks. No source
trim is inferred by this component. `validateKineticText(props, measure?)` returns
frozen layout, theme, word boxes/onset frames, reveal and hold budgets, plus
`measurement: "native" | "provided" | "conservative"`. An optional
`KineticMeasure(text, weight)` supplies deterministic measured widths for
authoring checks. Widths must be finite and positive; oversized words or
line/height overflow throw rather than clipping. Measurements are cached per
semantic layout, not repeated on timeline ticks. Clock-derived text and emphasis getters that return the
same semantic values retain their native entities; changed text rebuilds
the authored layout.

Review the complete words, essential emphasis and source labels at the
intended display size. A successful typecheck, layout check or encoder run
does not establish readability or an adequate reading hold.
