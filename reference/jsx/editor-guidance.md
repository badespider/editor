# Choose graphics from the editing purpose

Use the editor's own [story planning](../../.agents/skills/editor-story-plan/SKILL.md),
[pacing](../../.agents/skills/editor-pacing/SKILL.md),
[visual focus](../../.agents/skills/editor-visual-focus/SKILL.md),
[scene building](../../.agents/skills/editor-scene-building/SKILL.md) and
[review](../../.agents/skills/editor-review/SKILL.md) guidance when choosing these
native library tools. A treatment should help the current beat and preserve the
context needed to understand it.

| Editing purpose | Native tool or authoring choice | What the viewer must retain |
| --- | --- | --- |
| Orient before explaining | Wide map or scene before a detail | The relevant places, source identity and relationship between them |
| Explain why a story changed | Opening question, supplied source, then an answer | A payoff that answers that same question; distinguish an illustrative example from evidence |
| Point to a document or screen | `EvidenceCallout` with authored `target` and `protectedAreas` | A stationary target frame and unobscured essential context/provenance |
| Teach a sequence | `WorkedExample.revealThroughActive`, `CodeWalkthrough.visibleThroughLine` | Prerequisite, action and proof in the intended order; earlier rows stay in place |
| Give text a deliberate reading interval | `motion.reveal({duration, minHold})` | The author-chosen minimum still hold, followed by a deliberate exit |
| Use an effect over fine text | Compare the same source at delivery size | Legible characters, meaningful color distinctions and readable source labels |
| Deliver a portrait lesson | Explicit 1080×1920 boxes and typography | The question, complete operation and result at a useful phone display size |

## Protect the context around a detail

Callout coordinates are local to its own box. Match them to the displayed source,
and supply rectangles for context the label must leave visible. `protectedAreas`
affects label placement; it does not detect text, authenticate a source or adapt
to arbitrary transforms applied elsewhere in the composition.

```tsx
<EvidenceCallout width={1920} height={1080} start={4} duration={5}
  target={{x: 220, y: 470, width: 760, height: 140}}
  protectedAreas={[
    {x: 200, y: 170, width: 1400, height: 180}, // source identity
    {x: 200, y: 840, width: 1400, height: 120}, // provenance
  ]}
  label="The relevant sentence" source="Caller-supplied page reference" />
```

The target outline stays spatially fixed during its own entrance. Automatic
placement tries a fitting side that does not cover the target or protected
rectangles. Explicit placement must satisfy those same constraints. If none
fits, change the arrangement and review it instead of hiding essential context.

## Preserve the action before showing its proof

`CodeWalkthrough.visibleThroughLine` is an optional **one-based inclusive** line
limit. The full authored array still determines geometry and is validated, while
later rows remain absent until revealed. Omit the prop to show every line.
Authored selection changes restore correctly when seeking backward.

```tsx
const visible = createMemo(() => ticker.time() < 3 ? 2 : 5);
<CodeWalkthrough title="Use the supplied SI inputs" duration={7}
  lines={[
    "def net_force(mass, acceleration):",
    "    return mass * acceleration",
    "",
    "force = net_force(2, 3)",
    "print(force)",
  ]}
  visibleThroughLine={visible()}
  note="Displayed Python text; the lesson supplies the expected result." />
```

For a tutorial, follow this with the supplied result and its units. Keep a tool
gallery separate from a complete lesson: jumping among unrelated examples
demonstrates the catalog but does not establish a learner's prerequisites.

## Author a reading hold

```tsx
<text {...motion.reveal({duration: 6, minHold: 3})}>The answer needs context.</text>
```

`minHold` is an explicit author-chosen time, using the same canonical 30fps clock
as the other native motion options. A reveal that cannot fit it fails during
authoring. Omission preserves existing timing behavior. The helper does not
estimate reading speed or certify comprehension. Assess the actual words,
audience, diagram complexity and delivery size before setting the interval.

Use a restrained look where it helps the pictures. Keep important source labels
outside decorative image treatments when appropriate. Compare before/after
framing and treatment on the same source, including fine text and color cues;
an attractive landscape alone does not test a code or screen-recording use case.
Set explicit `start` and `end` on labels that must span a longer comparison:
the editor's sourceless leaf nodes otherwise default to sixteen seconds. A long
animation track does not extend the node's lifetime; see [timing](./timing.md).

In [the code/diagram comparison](../../examples/16-editor-looks.tsx), the
`clean-teaching` treatment retains neutral character edges. `night-tech` adds
intentional colored fringes to those edges, and `archive` changes color cues.
Prefer the original or clean treatment when exact small characters are the
point; retain explicit labels when color conveys information. Assess a look on
the intended material instead of treating its name as suitability approval.

## Review the composition that will be delivered

Render the actual native composition with [node render](../node/render.md), then
inspect that file through the [local evidence pipeline](../agent-workflow.md).
Check both sides of cuts and reveal changes, important entrance states, source
labels, protected context and the final held result. Inspect essential text at
native resolution and at a useful delivery display size.

Record story, speech, readability and continuity separately, following
[editor-review](../../.agents/skills/editor-review/SKILL.md). For these silent
graphics examples, speech is absent; for footage it can be unknown and needs
appropriate listening evidence. Exact-file metadata/full decoding is separate
from picture judgment. State the sampled timestamps rather than claiming
continuous viewing from a contact sheet.

For footage-based work, retain the normal source-evidence and plan contracts.
Generated-only graphics and unrelated library code do not require a fabricated
footage plan; see [the repository instructions](../../AGENTS.md).
