# Editable counter reveals

`CounterReveal` makes fixed tabular cells, one native text layer for each changed
glyph run, and native vertical offset tracks. Unchanged digits stay still. Its
unpainted rectangle containers use `clipToBox`, so an outgoing character cannot
move the mask with it. It uses no source video, copied texture, external renderer,
timer or model call.

```tsx
import { CounterReveal } from "@diffusionstudio/jsx";

<CounterReveal values={["2030", "2031", "2032", "2033"]}
  x={160} y={280} width={1600} height={560} start={2} duration={5}
  stepDurations={["4f", "8f", "16f"]} revealDuration="4f" minHold={2}
  color="#E86138" fontFamily="Arial" glyphScaleX={1.2}
  echo={{color: "#E86138", opacity: 0.12, scale: 2.6, offsetY: -60}} />
```

Supply the displayed sequence explicitly. `values` accepts 1–48 safe integer
numbers or formatted strings of up to 16 characters; strings need a digit and
may include numeric punctuation, currency `$€£¥`, spaces and ASCII unit labels
such as `"$10B"`. Decimal values belong in supplied strings, preserving their
format. Values are right aligned with empty leading cells. Nothing infers data,
authenticates a metric, or invents intermediate measurements. Add source/unit
labels with the appropriate data/story components.

`stepDuration` is a uniform interval between value onsets, default `"6f"`.
Alternatively, `stepDurations` supplies exactly `values.length - 1` intervals,
allowing a fast run to slow into a final value. `revealDuration` defaults to
`"4f"` and must fit every animated interval. `direction` is `"up"` or `"down"`.
`minHold`, default one second, protects the fully settled final value. The total
`duration` (default six seconds) or explicit `end` must fit all changes, the last
reveal and that hold. Do not supply both duration/end or both interval options.
Times use the native integer 30fps clock and remain local to the component's
authored `start`; direct and reverse seeks have the same tracks and layers.

The default box is 1400×500 at 0,0. Supply a box explicitly for portrait work;
the component clips everything to that box. `rowHeight` defaults to half its
height, vertically centered; `cellGap` defaults to zero. Fixed tabular cells use
a conservative 1.2em width after horizontal glyph scaling. The resulting compact
row is centered inside the outer box; enlarging that box does not scatter a
short token across its width. `fontSize` defaults to a
conservative fit against the cell width and row height. `fontFamily` defaults to
Arial, `fontWeight` to 700, and `color` to `#F06032`. `glyphScaleX` and
`glyphScaleY` independently multiply native glyph size while cells stay fixed.
Explicit sizes that exceed the conservative budget fail rather than silently
cropping the settled value. Actual font metrics and phone readability still need
rendered inspection. Axis dimensions are 32–4096 pixels and the box is capped at
8 megapixels. A sequence may contain at most 512 changed glyph runs.

`echo` is absent by default. Its optional fields are color (foreground color),
opacity (0.12), scale (2.6), offsetX (0), and offsetY (0). The echo is a separate,
editable sequence beneath the foreground and stays clipped to the component
box. Its scale is allowed to crop at the outer box deliberately; inspect that
crop in the composition. `echo={false}` disables it explicitly.

`animate={false}` retains all supplied values and their onset times, with
instantaneous swaps and no sliding. It does not skip to the final value. Ensure
the chosen intervals are readable for the intended audience. `key` and `name`
can identify the root when composing multiple counters.

Keep the counter independent from its environment: compose it above `Backdrop`,
beside `SourceCard`, or in a `PanelLayout` slot. Prefixes, emphasis words, data
disclosures and transitions are separate native layers, preserving their own
timing and content. Do not bake the original reference's year sequence, wording,
font, source imagery or palette into a universal default.

`getCounterRevealLayout(props)` exposes the immutable normalized cells, changed
glyph runs, compact `rowX`/`rowWidth`, value onsets, settled frame, hold budget and styling for recipe
builders and inspection. It is a technical contract, not visual approval. Render
the actual composition and inspect first/change/settled/end frames, all literal
characters, counter/echo overlap, protected labels and final reading time at the
delivery size. Keep sampled picture review separate from continuous playback.
