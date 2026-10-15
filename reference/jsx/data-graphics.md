# Native authored data graphics

`DataBars`, `TrendLine`, and `MetricCard` use editable native text and shapes.
They show supplied quantities; they do not fetch data, execute code, fit a model,
infer missing values, or verify a source. The existing
[CartesianPlot](education.md#cartesianplot) remains appropriate for mathematical
curves and multiple series. [MapRoute](documentary.md) provides geography without
adding another map engine.

Every graphic requires a visible `disclosure`:

```ts
type DataDisclosure =
  | { kind: "illustrative"; text?: string }
  | { kind: "source"; text: string };
```

Illustrative data displays `ILLUSTRATIVE / Authored example` or the supplied
explanation. A source credit displays `SOURCE / …`; the caller must establish
whether that source supports the quantities. Credits retain their complete text
or fail to fit. Selecting `source` is not a verification result.

## Shared layout and timing

The components accept `EducationProps`: `x`, `y`, `width`, `height`, `start`,
`duration` or `end`, `fontSize`, `theme`, and `animate`. Defaults are an
`x:96, y:96, width:1728, height:888` card, 40px body type, start zero and six
seconds. Width and height must each be at least 480 and at most 4096. Text
budgets can require a larger card or fewer entries. Compact catalog layouts
use 1728×600 at 32px or 936×1120 at 40px; review the actual wording and values
before delivery.

Data is fully displayed immediately by default. `animate:true` adds a short
native opacity entrance to the card; quantities and geometry remain static.
There is no count-up through invented measurements. All native leaves receive
the card's complete local lifetime, including beyond 16 seconds. Start/end and
native animation follow the existing canonical 30fps clock and reverse seeks.

Layouts reserve title, data, unit and provenance bands. Long text, crowded
ticks, overlapping zero-scale labels and out-of-bounds values throw rather than
shrink silently, omit characters or invent a scale. Review the rendered output
at its delivery size, and at phone size for portrait work; validation does not
establish legibility for a particular audience.

## `DataBars`

```tsx
import { DataBars } from "@diffusionstudio/jsx";

<DataBars title="Change by team" duration={8}
  unit="hours" baseline={0} valueDomain={[-10, 10]}
  data={[
    { label: "A", value: -4 },
    { label: "B", value: 8 },
    { label: "C", value: 0 },
  ]}
  disclosure={{ kind: "illustrative", text: "Authored comparison" }} />
```

Supply 1–8 uniquely labeled bars, `valueDomain:[minimum,maximum]`, `unit`, and
`baseline:0`. Signed values extend left/right from the same visible zero
baseline. Domain endpoints, zero and units remain visible. A zero value retains
its category and numeric label, with no positive-length bar. A domain that omits
zero, a nonzero baseline, or a value outside the declared domain is rejected.
Each bar may override its `color` with `#RRGGBB`.

Values are finite and bounded to ±10¹². Domains increase by at least 10⁻⁹.
Labels retain exact JavaScript number text by default. Optional `valueDecimals`
is an integer 0–6; it rounds display only, keeps original bar geometry, and adds
`≈` when a displayed quantity changes. Use units appropriate to the scale rather
than squeezing long numbers into narrow columns. Units apply to every bar;
convert mixed units before authoring.

## `TrendLine`

```tsx
import { TrendLine } from "@diffusionstudio/jsx";

<TrendLine title="Supplied points" duration={8}
  xDomain={[0, 4]} yDomain={[-10, 10]}
  xLabel="Time" xUnit="s" yLabel="Count" yUnit="items"
  points={[
    { x: 0, y: -4 }, { x: 1, y: 2 },
    null,
    { x: 3, y: 4 }, { x: 4, y: 8 },
  ]}
  disclosure={{ kind: "illustrative", text: "Gap is intentional" }} />
```

Supply 2–128 complete entries with at least two finite points. X values must
increase strictly, including across gaps; coordinates must fit both declared
domains. `null` is an explicit gap, with no connecting segment. NaN, sparse
arrays, repeated/unordered x values and implicit missing observations are
rejected. Lines connect consecutive supplied points with straight segments;
they are not estimates of unobserved measurements or a smoothed curve.

Axes are linear and labeled with both range and unit. Positive y goes upward.
X and y have independent screen scales, so slope angles are not physical vector
directions. Unlike length-encoded bars, line charts may use a nonzero domain
minimum; its labeled range remains explicit. Optional `color` sets the line and
point marks. Line segments remain native center-rotated rectangles, with native
point marks and editable text.

`sampleTrendPoint(points,index)` returns an immutable copy of the exact authored
entry, or `null` for its gap. It never samples an intermediate x or extrapolates.
Indices are zero-based and must name a supplied entry.

## `MetricCard`

```tsx
import { MetricCard } from "@diffusionstudio/jsx";

<MetricCard title="Duration" value={24} unit="h" duration={8}
  comparison={{ label: "Previous period", value: 30 }}
  disclosure={{ kind: "illustrative", text: "Authored comparison" }} />
```

Supply a title, finite `value`, shared `unit` and disclosure. Optional
`comparison:{label,value}` shows another authored quantity in that same unit.
No percentage, improvement, causal claim or statistical comparison is inferred.
`valueDecimals` follows the same explicit rounding/`≈` convention as bars. Large
values and long units must fit the selected card instead of truncating.

`getDataBarsLayout`, `getTrendLineLayout` and `getMetricCardLayout` expose the
same immutable text/shape geometry used by the components. `dataDisclosureText`
validates and labels provenance; `formatDataValue` provides exact or explicitly
rounded number text. These pure helpers do not mount nodes or authenticate data.

See [the three-card example](../../examples/18-data-graphics.tsx). For motion,
protect reading holds using the [native editor guidance](editor-guidance.md),
render the actual composition through [node export](../node/render.md), and
retain honest review coverage.
