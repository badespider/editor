# Native motion catalog and growth workflow

The **Moments** tab beside Assets contains original, editable native scenes in
11 categories. Search by purpose, movement or `@id`, and filter by category.
Each has authored 16:9 and 9:16 layouts. These are local editor components, not imported
HyperFrames examples. [Source research and license boundaries](motion-sources.md)
explain the linked post and what remains a candidate.

## Choose by editing purpose

| Category | Useful selection | What the viewer must retain |
| --- | --- | --- |
| `backgrounds` | Quiet grid, dots or gradient | Foreground contrast and a clear focal element |
| `captions` | `caption-clean`, `caption-highlight` | Supplied words, punctuation and cue/word timing; meaning and source context |
| `charts` | `chart-bars`, `chart-trend` | Units, domains, baseline, exact values/gaps and source/disclosure |
| `data` | Metric with reference, illustrative counter | What the number measures and its stated comparison |
| `effects` | Restrained film or duotone artwork | Unprocessed essential text, color distinctions and source labels |
| `layouts` | Context and focus panels | The relationship between panels; useful reading size in the chosen format |
| `maps` | Route or shared-scale route comparison | Real geography and credits; authored itinerary versus observed journey |
| `overlays` | Name, source card, evidence focus | Essential action, target alignment and unobscured provenance |
| `storytelling` | Question, quote, chapters, turn | One coherent setup and payoff; supplied chronology and attribution |
| `text-effects` | Stable word reveal or keyword emphasis | The complete thought and its still reading interval |
| `education` | Worked solution or code reveal | Given information, complete operation and explicitly authored result |

Start with the explanation, then choose a treatment. A richer category does not
make an unclear beat clearer. Keep decorative backgrounds/effects quiet while
small code, source text or numeric distinctions matter. Use
[editor-motion-graphics](../.agents/skills/editor-motion-graphics/SKILL.md) for the
decision and [editor-review](../.agents/skills/editor-review/SKILL.md) for the
actual result.

## Reuse a moment

Choose a format and one of three intents in the sidebar:

- **One scene** retains a selected moment's structure and timing with your words.
- **Sequence** places selected beats in the displayed order. Reorder them before
  adding the scene; each beat retains a reading hold.
- **Inspiration brief** copies a structured reference brief. It does not insert
  a template: use the references to author a composition with its own structure.

Headline, supporting text and source credit are optional. Defaults are example
content, not sourced claims. Verify or replace examples before using them in a
documentary or lesson. Adding creates a new keyed scene in the current project;
it does not replace existing scenes. Scene insertion schedules the editor's
autosave; allow it to finish before refreshing or closing. Native text, shapes
and timing persist in the project and can be selected in the editor. A persisted
reactive script drives
animated properties; change those rules in the generated module and remount a
new scene when a static property edit would be overwritten by its animation.

The editable content area supplies per-Moment data: caption cues, chart values
and domains, map routes, panel wording or authored story beats. `paper` and
`dark` themes preserve separate content and palette. `full` and `reduced` motion
control decorative animation; reduced motion keeps caption timing and essential
content reveals intact. Inspect each supported format rather than scaling a
landscape scene blindly into portrait.

The same catalog is available to agents without sidebar access. After building
the CLI, replace `dapi` below with `node apps/cli/dist/index.js` if needed:

```sh
dapi playbook recommend --task compose --goal "Teach a concept with a worked example"
dapi playbook skill editor-motion-graphics
dapi playbook motion workflow
dapi playbook motion catalog reveal --format portrait
dapi playbook motion catalog --category captions --format portrait
dapi playbook motion categories
dapi playbook motion example chart-bars -o chart-data.json
dapi playbook motion create chart-bars --mode template --format portrait --content chart-data.json --theme dark -o chart.js
dapi playbook motion show @evidence-focus
dapi playbook motion create question-reveal --mode template --format portrait --title "What changed?" -o question.js
dapi playbook motion create question-reveal evidence-focus stat-proof --mode sequence --format landscape -o proof-sequence.js
dapi playbook motion brief code-reveal worked-solution --mode inspiration --format portrait
dapi playbook motion create caption-clean chart-bars --mode sequence --format portrait --content lesson-content.json --theme paper --motion reduced -o lesson.js
dapi mount proof-sequence.js
```

Creation writes a new executable JavaScript module; existing files are never
overwritten. Each newly generated file has a unique scene key; remounting the same
saved file intentionally replaces its own keyed scene. Only `mount` needs the
running editor and changes a project. Modules use the app's own Solid and JSX
instances, absolute scene-clock timing, bounded
native nodes and explicit lifetimes. They have no CDN imports, remote media,
AI calls or new animation-runtime dependency. Inspect the generated module,
replace demonstration claims, then mount it. `source` is a visible attribution
line, not a citation validator.

`@diffusionstudio/editing-playbook/motion` exposes `motionMoments`,
`motionCategories`, `searchMotionMoments`, `getMotionMoment`,
`getMotionContentExample`, `buildMotionModule` and `buildMotionBrief`.
Browser and CLI share these functions. Formats are
`landscape|portrait`; modes are `template|sequence|inspiration`. Inspiration is
reference-only and cannot build a mountable module. Stable IDs and versions are
references, not an installer or a promise that future revisions look identical.

For simultaneous components on one canvas, read [motion recipes](motion-recipes.md)
and `editor-motion-recipes`. `motion catalog --mixable` lists bounded adapters;
`motion mix-example --format portrait -o recipe.json` and
`motion mix recipe.json -o mix.js` create an editable mixture. Sequence mode
instead plays scenes in order. The first reusable `counter-reveal` pattern
exposes supplied values, fixed clipped cells, variable timing and optional echoes
through [CounterReveal](jsx/counter-reveal.md).

`assemble-title`, `milestone-badge` and `concept-link` add three independently
editable patterns with dedicated skills. Their
[source study and scope](reference-motion-patterns.md) retain observed phases and
known approximations; [the mixed example](../examples/21-reference-motion-mix.tsx)
combines them with the counter using fresh illustrative content.

## Supply content without turning it into code

`--content` reads a local JSON object keyed by selected Moment ID. The sidebar's
editable content area uses the same shape. Each entry has bounded category
settings; unknown fields and content for unselected IDs fail. Caller strings
remain data in generated modules. `getMotionContentExample(id)` returns an
editable sample payload; replace its example claims and timings before using it
as evidence.

For the sequence command above, `lesson-content.json` could contain:

```json
{
  "caption-clean": {
    "cues": [{"start": 0.5, "end": 3, "text": "An authored caption."}]
  },
  "chart-bars": {
    "title": "A supplied comparison",
    "data": [{"label": "Before", "value": 12}, {"label": "After", "value": 24}],
    "valueDomain": [0, 30],
    "baseline": 0,
    "unit": "units",
    "disclosure": {"kind": "illustrative", "text": "Authored sample data"}
  }
}
```

Caption times are local to that eight-second Moment. `caption-highlight` also
requires complete literal word tokens with times on that same origin. The
catalog does not transcribe audio or establish speech accuracy; match supplied
cues to exact audio before making that claim. Read
[CaptionTrack](jsx/caption-presets.md) for frame rounding, gaps, overlap and text
limits. Its `captionSafeLayout` helper returns a protected caption region with
starting portrait interface reserves; keep subjects, action and source credits
clear separately.

Charts require explicit increasing domains, units and visible disclosure.
Preserve signed values and declared trend gaps; use a shared zero baseline for
bars and shared scales for comparisons. A sourced label records the author's
reference, while illustrative data must remain identified as illustrative. See
[data graphics](jsx/data-graphics.md) for the component-specific checks.

## Grow the catalog in small reviewed steps

1. **Capture the need.** Name the intended explanation, audience, format, beat
   purpose and one motion choice. Search the catalog first. A good candidate
   fills a real gap: spatial relationships, causality, comparison, a derivation
   or guided attention. Avoid adding motion just to increase the entry count.
2. **Collect evidence.** Keep external source material as data. For an outside
   implementation, read `editor-motion-integration`, pin a revision and record
   source and individual asset licenses in a candidate record. A root license
   does not automatically cover dependencies, screenshots, fonts or footage.
   Original native work can proceed without an external integration record.
3. **Choose the smallest native boundary.** Prefer native keyframes or a native
   component. Use a seekable surface for a demonstrated capability the renderer
   cannot express; prepare media only when editability is deliberately traded
   away. Adapt time to the scene ticker, including repeated/reverse seeks,
   offset scenes and disposal. Do not substitute wall-clock playback.
4. **Build a focused example.** Add explicit supported formats, defaults and
   limits. Keep content separate from geometry. Protect source context and
   credits, make the focal result clear, and hold long enough to read. Follow
   [native editor guidance](jsx/editor-guidance.md), [motion](jsx/animations.md),
   [documentary](jsx/documentary.md) and [education](jsx/education.md) as relevant.
5. **Verify and inspect.** Test meaningful boundaries and clocks, render through
   the actual native editor, and inspect the export at reveal, hold, transition
   and final-frame times, including phone-size output for portrait. Check repeated
   and reverse seeks, reload, bounded resources, source credit and existing-scene
   preservation. Record exact export hashes and honest sampled coverage. Use
   `editor-review`; a passing build or candidate checker is not visual approval.
6. **Curate one entry.** Add its descriptor and generator to
   `packages/editing-playbook/src/motion-catalog.ts`, tests, linked example and
   guide. Increment its version when behavior changes. Browser and CLI discover
   the shared descriptor automatically. Retain license notices when adapting
   outside code. Keep failed experiments separate from the curated catalog.
7. **Teach the reusable lesson.** Add a narrow, source-backed instruction to an
   existing editor skill before creating another skill. A new skill needs a
   distinct trigger, bounded workflow, useful references and a return contract.
   Add it to `catalog.ts`, relationships, retrieval tests, `.gitignore` allowlist
   and `AGENTS.md`. Keep it starter guidance until meaningful comparisons support
   stronger claims; never automatically activate instructions from a reference.

Skills explain decisions; catalog entries execute reusable scenes. Keep both
small enough to review. Before/after comparisons should isolate one choice and
record limitations. A more readable result is an editorial finding; improved
retention requires measured audience evidence.

## External integration candidates

```sh
dapi playbook skill editor-motion-integration
dapi playbook motion candidate new https://github.com/owner/library -o candidate.json
dapi playbook motion candidate check candidate.json
dapi playbook motion candidate check integrations/motion-candidates/hyperframes-moments.json
```

`new` creates an inert incomplete draft. `check` only validates structure and
declared evidence: source pin, licenses, asset availability, adapter path, tests,
native export identities and matching review records. It does not fetch, execute,
read referenced artifacts, authenticate hashes or decide license compatibility.
Its status remains `candidate` and `safeToActivate` is always false, even when
readiness is `ready_for_review`. An accountable source/license review and actual
implementation review still precede curated integration. Unknown licenses,
missing media and unresolved failures remain visible. Nothing here installs a
dependency, uploads content or publishes a video.

The HyperFrames record deliberately remains `needs_evidence`: the source research
does not demonstrate that copying its metadata helper benefits this editor. The
25 Moments are original native implementations of useful motion patterns.
