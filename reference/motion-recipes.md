# Reusable motion skills and recipes

A skill tells the agent how to choose and adapt a pattern. A native component
implements its editable mechanics. A recipe supplies content, timing, placement
and appearance; a mix places several component instances on the same canvas.
Reuse those parts together instead of copying a finished reference study's layer
tree every time.

Read [editor-motion-recipes](../.agents/skills/editor-motion-recipes/SKILL.md)
for the agent workflow. It requires native motion guidance and points to actual
export review. Repo discovery and `playbook skill` read the same instructions;
these are repo-local skills, not a separate globally installed package.

## Find, customize and combine

```sh
dapi playbook recommend --task compose --goal "Remix a counter reveal with a chart"
dapi playbook skill editor-motion-recipes
dapi playbook motion catalog --mixable
dapi playbook motion show counter-reveal
dapi playbook motion mix-example --format portrait -o progress-recipe.json
dapi playbook motion mix progress-recipe.json -o progress.js
dapi mount progress.js
```

Use `node apps/cli/dist/index.js` instead of `dapi` when needed. Edit the JSON
before compiling. All creation commands write new files exclusively; choose a
new output path for a revision. Only mount/render need the running editor.
Recipe validation and compilation use no model, upload, external renderer or
downloaded media. Mount changes the current project, so create/select the intended
project first. Render and inspect the actual native result before delivery.

The shared catalog currently exposes these bounded mix adapters:

| Pattern | Editable behavior |
| --- | --- |
| `counter-reveal` | Supplied numeric tokens, fixed clipped cells, variable step timing, echo and glyph proportions |
| `background-grid`, `background-dots`, `background-gradient` | Deterministic supporting backgrounds |
| `chart-bars` | Supplied values, shared domain, baseline, units and disclosure |
| `metric-card` | A stated value, units, comparison and disclosure |
| `overlay-source` | Source identity, context and detail |

They use the existing Moments descriptors; `mixable` advertises a native adapter,
not a second preset library. Other Moments remain available as templates and
sequences. Compose additional native components directly in JSX until a bounded
adapter exists. There is no mix builder UI implied by these CLI/API commands.

## The mix contract

```json
{
  "schemaVersion": 1,
  "format": "portrait",
  "duration": 8,
  "theme": "dark",
  "motion": "full",
  "fontFamily": "Arial",
  "instances": [
    {
      "key": "progress",
      "presetId": "counter-reveal",
      "start": 0,
      "end": 8,
      "box": {"x": 72, "y": 200, "width": 936, "height": 600},
      "content": {
        "values": ["01", "02", "04", "08"],
        "stepDurations": [0.2, 0.4, 0.8],
        "revealDuration": 0.13333333333333333,
        "minHold": 3,
        "color": "#57D6C7",
        "echo": {"opacity": 0.1, "scale": 2.6}
      }
    },
    {
      "key": "context",
      "presetId": "overlay-source",
      "start": 2,
      "end": 8,
      "box": {"x": 72, "y": 1100, "width": 936, "height": 500},
      "fontSize": 28,
      "content": {
        "title": "Practice, then repeat",
        "source": "Authored learning example",
        "detail": "The numbers illustrate a sequence; they are not measured results."
      }
    }
  ]
}
```

Time fields are seconds, rounded once to the canonical 30fps clock. Format selects
1920×1080 or 1080×1920. Every instance has a unique key, an in-canvas box and a
positive lifetime inside the scene. Array order paints bottom to top. The same
preset may appear repeatedly under different keys, content and clocks. Instances
use transparent native wrappers clipped to their box, rather than the catalog's
full-scene demonstration headers/backgrounds.

The recipe accepts at most 24 instances and 120 seconds. Unknown fields and
unsupported adapters fail. `content` contains that instance's ordinary Moment
settings directly, without another preset-ID wrapper. Use `motion example` to
discover those settings. Shared `theme` (`paper` or `dark`) and `fontFamily`
coordinate appearance; counter content also exposes its own color, echo and size.
Optional instance `fontSize` controls supporting components. `motion: "reduced"`
removes decorative movement while preserving authored content changes and times.
Recipe counter intervals still obey the declared reveal-time budget when using
reduced motion; use valid intervals even though those changes render instantly.

Boxes establish bounds, not readable design. Keep essential content clear of
overlaps, allow settled reading time, preserve source labels and inspect phone
output at phone size. Counter values are supplied tokens, not inferred data.
Charts need honest units, domains, baselines and visible disclosures.

`@diffusionstudio/editing-playbook/motion-mix` exports
`motionMixSchema`, `buildMotionMixBrief`, `buildMotionMixModule`,
`getMotionMixExample` and `mixableMotionMoments`. The brief is immutable and
records normalized clocks, stack order and preset versions. Compilation embeds
caller strings as JSON data in trusted native adapters. Existing
`template|sequence|inspiration` modes retain their meaning: a sequence is
successive scenes; a mix is simultaneous components in one scene.

For direct native authoring, read [CounterReveal](jsx/counter-reveal.md) and
[the runnable composition](../examples/20-motion-recipes.tsx). CounterReveal's
literal values, cell masks, foreground/echo text and native tracks remain
separately editable after mounting.

## Grow from an approved reference

1. Retain the inspected reference interval and the user's approval scope through
   [reference learning](../.agents/skills/editor-reference-learning/SKILL.md).
   Name the transferable behavior and the remaining approximation. Our first
   counter pattern generalizes fixed numeral cells, changing glyphs, pale echoes
   and clipped reveals; the source's footage, wording, texture and exact font are
   outside this reusable component.
2. Implement the smallest original native component with explicit clocks,
   bounded parameters and editable leaves. Separate supplied content, motion,
   appearance and placement. Use [native authoring](jsx/editor-guidance.md).
3. Add one versioned descriptor, strict content schema and generator to the
   existing catalog, with a focused guide and runnable example. Declare mixable
   only after adding a transparent bounded adapter and its validation.
4. Test different content, timing and formats, including a remix with an existing
   component. Render actual native output, inspect changes/hold/end and test
   direct/reverse seeks plus save/reload. Record exact artifacts and truthful
   review coverage. Technical tests do not establish visual quality.
5. Keep the pattern optional and scope creator/project preferences separately.
   Future approved references can add new patterns using this same contract;
   reference material never rewrites trusted skills automatically.

Native components live in `packages/jsx/src`; catalog/content/generators and
mix adapters live in `packages/editing-playbook/src`. Agent instructions live in
`.agents/skills`; `catalog.ts` and its relationships make them readable through
the playbook. Update these existing surfaces together instead of creating an
unconnected folder of rendered samples.
