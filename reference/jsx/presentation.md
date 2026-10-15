# Presentation presets and craft

Use [the editor's editing guidance](./editor-guidance.md) to choose these tools
for a beat's purpose, protect source context, author reading holds and review
the delivered result.

The existing native components work with two additional opt-in palettes:

```tsx
import { PRESENTATION_THEMES, SourceCard, WorkedExample } from "@diffusionstudio/jsx";

<SourceCard theme={PRESENTATION_THEMES.documentary.paper}
  title="A source record" source="Provided archive" detail="The relevant context." />

<WorkedExample theme={PRESENTATION_THEMES.education.classroom}
  title="Solve the equation" activeStep={1} revealThroughActive
  steps={[
    { label: "Start", expression: "2x + 4 = 10" },
    { label: "Subtract 4", expression: "2x = 6" },
    { label: "Divide by 2", expression: "x = 3" },
  ]} />
```

`documentary.paper` uses warm paper, dark ink and a restrained brown annotation
color. `education.classroom` uses warm paper, dark teal and a green answer cue.
Both use Georgia for prose; education retains Consolas for literal code. These
fonts are installed on the development Windows computer. Install or replace
them when rendering elsewhere. Every supplied text role has at least 4.5:1
contrast against both supplied card surfaces. Review the final pictures too.

`documentary.ink` and `education.technical` retain the original defaults. All
theme objects are frozen and are compatible with their corresponding tools.
Other theme overrides still use the original component interfaces.

Use [curated looks and motion.reveal](./effects.md) for a short, complete beat:
build an idea, give it a stable reading hold, then resolve. Avoid stacking two
owners of the same opacity/transform property; `reveal` returns one coherent
native track for each property it owns. A title, graph, formula and source
line need different emphasis. Match the motion and reading time to that job.

For teaching, reveal worked steps in authored order instead of showing the
answer immediately. Keep the row positions stable so viewers retain context.
For maps, make city labels and source credits legible; when their full text
cannot fit, revise the layout instead of silently dropping essential words.
These are authoring choices, not automatic proof of lesson correctness.

The refreshed examples demonstrate these choices:
[documentary](../../examples/11-documentary-story.tsx),
[education](../../examples/12-education-kit.tsx),
[mobile lesson](../../examples/13-education-portrait.tsx), and
[look comparisons](../../examples/14-curated-looks.tsx).
