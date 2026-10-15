# Education components

Import the eight tools from `@diffusionstudio/jsx`. `LessonCard`, `EquationCard`, `WorkedExample`, `CodeWalkthrough`, and `QuizCard` create native editable text and shapes. `CartesianPlot`, `VectorDiagram`, and `FlowDiagram` draw local canvas surfaces; edit their labels and geometry through props rather than individual native text nodes.

These are presentation tools. They do not parse LaTeX, perform computer algebra, execute code, solve physics, grade a student, or inspect live network packets. Supply the teaching content and its correct conditions, units, and answers.

## Example

An original authored lesson with a timed answer reveal:

```tsx
/* @jsxImportSource @diffusionstudio/jsx */
import { LessonCard, EquationCard, QuizCard, useTicker } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

export default function DivisionLesson() {
  const ticker = useTicker();
  const answer = createMemo(() => ticker.time() < 10 ? undefined : 0);
  return <rect scene="division-lesson" width={1920} height={1080}
    end={12} fill="#101C2B">
    <LessonCard start={0} duration={3} eyebrow="DIVISION"
      title="Make the relationship visible."
      body="A fraction can express division." />
    <EquationCard start={3} duration={4} title="AN AUTHORED EXAMPLE"
      equation={{ type: "row", items: [
        { type: "fraction", numerator: "8", denominator: "2" }, "= 4",
      ] }} />
    <QuizCard start={7} duration={5} question="Which expression equals 4?"
      choices={["8 / 2", "2 / 8"]}
      answerIndex={answer()}
      explanation="Eight divided by two equals four." />
  </rect>;
}
```

The reveal is authored video timing, not an interactive quiz. See [the complete math, physics, and IT example](../../examples/12-education-kit.tsx) for all eight tools.

## Native card timing and style

All five native cards accept `EducationProps`:

| Props | Contract |
| --- | --- |
| `x`, `y`, `width`, `height` | Composition pixels. Default box `(96, 96, 1728, 888)` for a 1920×1080 scene. Width/height must be 32…4096. |
| `start` | Parent-local start, default `0`. |
| `duration` / `end` | Duration defaults to `6` seconds. Alternatively supply an absolute parent-local `end`; supplying both throws. |
| `fontSize` | Base size, default `32`, allowed 8…256; individual labels scale from it. |
| `animate` | Default `true`: a short native fade and 20px entrance slide, up to 12 frames. `false` is static. No automatic exit animation. |
| `theme` | Partial `EducationTheme` override; omitted fields retain `EDUCATION_THEME`. |

Times accept seconds, frame strings such as `"90f"`, and [clock strings](./timing.md#time-formats), rounded to canonical 30fps frames. Starts are nonnegative, durations are at least one frame, and the complete lifetime must fit within 108,000 frames (one hour). Native card children use their local duration; a one-frame card skips the entrance.

`EDUCATION_THEME` provides `background: "#101C2B"`, `surface: "#1C2D42"`, `text: "#F6F0E4"`, `muted: "#BAC7D6"`, `accent: "#54D6C7"`, `success: "#75D99B"`, `fontFamily: "Arial"`, and `monoFamily: "Consolas"`. Colors use `#RRGGBB`; font families must be installed on the render machine. Theme overrides do not mutate the defaults. Unknown fields or invalid values throw.

Optional whole themes are exported as `PRESENTATION_THEMES.education.technical` (the existing default) and `PRESENTATION_THEMES.education.classroom` (warm paper, dark teal text, Georgia/Consolas). Pass the chosen object through `theme`; defaults remain unchanged. The same catalog includes `documentary.ink` and `documentary.paper` for the [documentary components](./documentary.md). See [the theme definitions](../../packages/jsx/src/presentation-themes.ts).

Native prose wraps using a conservative 1.1em character-cell budget, rather than browser font measurement. Content exceeding a field's line budget throws a named error instead of disappearing or overflowing silently. Shorten it, enlarge the box, or reduce the font size, then inspect the actual render. Required prose must be nonempty; code has its separate literal-line rules below. Duration never estimates reading time.

### Explicit portrait layout

The kit does not automatically reflow a landscape design. Choose boxes, text lengths, and fonts for the intended format:

```tsx
<rect scene="portrait-lesson" width={1080} height={1920} end={6} fill="#101C2B">
  <LessonCard x={72} y={120} width={936} height={1500} fontSize={34}
    duration={6} title="A single idea"
    body={"Define the terms.\nShow one example.\nLeave time to read."}
    footer="An authored lesson" />
</rect>
```

Use an explicit box for each subsequent tool too. The portrait example uses base `fontSize={48}`, short headings, and a three-second revealed-answer hold. Check actual text at the intended phone display size; fitting the canvas does not establish mobile readability.

See [the portrait lesson and quiz example](../../examples/13-education-portrait.tsx) for a complete 1080×1920 scene with explicit mobile geometry.

## Lesson, worked example, code, and quiz

| Component | Required props | Optional content and behavior |
| --- | --- | --- |
| `LessonCard` | `title`, `body` | `eyebrow`, `footer`. Prose can include paragraph breaks. |
| `WorkedExample` | `title`, `steps` | 1–4 `{label, expression, explanation?}` steps. `activeStep` is zero-based, default `0`; a reactive value changes emphasis. `revealThroughActive={true}` hides future rows until that step, preserving their positions and reversing correctly. Default `false` keeps all rows visible. Expressions are authored monospace text, not evaluated. |
| `CodeWalkthrough` | `title`, `lines` | 1–10 literal strings. `highlightedLines` is a complete array of distinct **one-based** line numbers, default empty. Optional one-based `visibleThroughLine` reveals rows through that line; omitted shows all. Optional `note`. |
| `QuizCard` | `question`, `choices` | 2–4 nonempty choice strings. Optional zero-based `answerIndex` reveals an “Answer” label and optional `explanation`; omitted/`undefined` hides both. No input handling or automatic grading. |

Array entries must be complete; sparse arrays and out-of-range indices fail validation. These inputs can be reactive, as in the timed quiz example.

`CodeWalkthrough` keeps leading/trailing spaces, tabs, and empty rows in the literal editable text. It uses `theme.monoFamily`. Each array entry is exactly one line: embedded line breaks/control characters and lines that cannot fit are rejected, never auto-wrapped. The conservative width budget treats tabs as four-column tab stops; actual glyph rendering still depends on the chosen font. Code is displayed, never executed or syntax-highlighted automatically.

`visibleThroughLine` accepts an integer from 1 through the complete line count. Future text, numbers, and highlight markers are absent from the native tree; their authored row positions remain reserved. All hidden lines still validate for literal content and fit before rendering, so a later reveal cannot expose an unchecked oversized line. A reactive limit works in both directions. Unchanged semantic selections preserve native entities across clock ticks. Label any supplied output as **authored expected output**, not an observed execution result.

```tsx
<CodeWalkthrough title="Read the function" duration={5}
  lines={["def double(value):", "    return 2 * value", "", "result = double(3)"]}
  visibleThroughLine={2} highlightedLines={[2]}
  note="Literal Python text / no execution" />
```

See [the coherent force lesson](../../examples/15-editor-guided-lesson.tsx) for prerequisite → relationship → worked calculation → vector → staged code → check. It applies the editor's own story-plan, pacing, visual-focus, and review guidance to one authored problem. The eight-tool example remains a gallery.

## `EquationCard`

Required: `title` and `equation: MathExpression`. Optional: `caption`, `variables` (1–4 `{symbol, meaning, unit?}` definitions), and `mathSize` (default twice `fontSize`, 12…256px).

```ts
type MathExpression = string
  | { type: "row"; items: readonly MathExpression[] }
  | { type: "fraction"; numerator: MathExpression; denominator: MathExpression }
  | { type: "power"; base: MathExpression; exponent: MathExpression }
  | { type: "root"; radicand: MathExpression };
```

Fractions, superscripts, roots, and their rules remain native editable geometry. Strings are literal one-line text, not LaTeX or expressions to calculate. Rows support 1–24 items; a formula is limited to 128 nodes / eight nesting levels, with nested text at least 8px. Oversized math throws instead of shrinking silently. Simplify it, reduce `mathSize`, or enlarge the card. `layoutMathExpression(expression, fontSize?)` exposes the same deterministic native layout for custom compositions.

A root uses connected native rectangle strokes and an overbar sized to the complete radicand, including tall fractions; it does not stretch a font's `√` glyph. Layout parts remain `text | rule`. A `MathRulePart` can include `rotation` in degrees around its rectangle center, matching `Rect.rotation`. Custom consumers must apply it when drawing rules and calculate their bounds from transformed corners. `EquationCard` handles this directly.

The caller supplies mathematical conditions, variable meanings, and compatible units. Displaying a formula does not verify its domain or prove an answer.

## Canvas diagram timing

The three diagrams accept their own `EducationDiagramOptions`, not all native card props:

| Props | Contract |
| --- | --- |
| `width`, `height` | Required integer canvas dimensions: width 480…4096, height 300…4096, maximum 8,388,608 pixels. |
| `x`, `y` | Composition pixels, default `0`. |
| `start`, `duration` | Start `0`, duration `6` seconds by default; the same canonical 30fps / one-hour lifetime limit applies. |
| `revealDuration` | Positive, no longer than duration; defaults to 75%, leaving a final hold. |
| `title`, `theme` | Optional title and partial `EducationTheme`. Typography is managed by the diagram, not `fontSize`. |

Place diagrams as **direct scene children**, with `start` on that scene's clock. Canvas animation samples `floor(ticker.time() × 30) − startFrame`. It does not infer offsets from a nested group, sequence, or trimmed parent. Use explicit clock adaptation before nesting under a differently timed parent. Seeking and exports follow playhead time; no wall-clock timers or remote services are used.

Diagram titles, axes, legends, and labels are checked against measured Canvas2D text widths during drawing. Text that cannot fit throws a named error; flow-node labels wrap to at most two lines. Use shorter labels or a larger canvas and review crowding in the actual render.

### `CartesianPlot`

Supply `xDomain: [min, max]`, `yDomain: [min, max]`, `xLabel`, `yLabel`, and `series: [{label, points: [{x, y}], color?}]`. Optional `xUnit`, `yUnit` append displayed axis units; `marker` defaults to `true`.

Domains must increase by at least 1e−9; coordinates are finite and inside the declared domains. Supply 1–8 series, 2–2,048 points each, at most 8,192 points total; a series needs at least two distinct positions. Colors use `#RRGGBB`. The projection uses linear Cartesian axes, with positive y upward; axis ranges can scale x and y differently. Curves join supplied samples with straight segments. **Split discontinuities into separate series**; no function parsing, domain inference, or asymptote detection occurs. The reveal follows normalized path length as presentation timing, not elapsed physical time.

```tsx
<CartesianPlot width={1400} height={760} duration={5}
  title="Supplied samples" xDomain={[-2, 2]} yDomain={[-1, 5]}
  xLabel="x" yLabel="y"
  series={[{ label: "y = x²", points: [
    {x: -2, y: 4}, {x: -1, y: 1}, {x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 4},
  ] }]} />
```

This sparse example is a polyline approximation; author denser samples when smooth curvature matters.

### `VectorDiagram`

Supply `origin: {x, y}`, `vectors: [{x, y, label, unit?}]`, both domains, and both axis labels. Vector x/y are **displacements from the shared origin**, not endpoint coordinates. Supply 1–12 nonzero vectors; every endpoint must fit the domains. Use a shared `unit` or per-vector units; all must match exactly. Convert values yourself first; use `"1"` for dimensionless vectors. The unit is appended to each axis label, so pass `xLabel="Force x"`, not a second unit suffix.

The diagram preserves equal screen scale per x/y unit so arrow directions and relative lengths remain meaningful. Arrows extend together during reveal. It does not compute a resultant, validate a force model, integrate motion, or convert units. Label the physical quantity and coordinate frame explicitly.

### `FlowDiagram`

Supply 2–24 `nodes: [{id, label, x, y}]` and 1–64 directed `edges: [{id, from, to, label?}]`. Node positions are authored normalized coordinates from 0 to 1 inside the usable drawing area, with x rightward and y downward. IDs must be unique; edges must connect distinct existing nodes. Duplicate directed connections and overlapping node boxes are rejected. This is not automatic graph layout.

Optional `packetPath` is an ordered list of up to 128 edge IDs; each edge must lead into the next in the declared direction. Empty/omitted means no packet. The moving marker illustrates that authored path, not a live packet capture, routing protocol, timing measurement, or network simulator. Position nodes and labels so the actual export remains readable.

For custom procedural compositions, each diagram exports its `validate…Options`, `get…Frame`, and `draw…Frame` helpers; `diagramProgress` and `diagramArrowGeometry` are also available. Validation snapshots caller data before deterministic frame calculation and drawing.
