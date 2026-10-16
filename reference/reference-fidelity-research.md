# Reference fidelity: what HyperFrames actually exposes

Research date: 2026-10-15. Scope: read-only inspection of first-party documentation
and public implementation. No upstream package was installed or executed, no
model was called, and the embedded demonstration videos were not watched.

The official repository's `main` resolved through the GitHub API to
[`917ee5d31342f8c8a4a14659679762489cafe665`](https://github.com/heygen-com/hyperframes/commit/917ee5d31342f8c8a4a14659679762489cafe665),
committed at `2026-10-15T23:43:46Z`. Links below pin that inspected revision.
Earlier research used `cea8aa8a7dee9d669e47e4b488213008bbe305cd` for the
reference workflow and `49c49504a44e0352f6877611f5384e7aedcc4e92` for catalog
metadata; those are historical pins, not the current source examined here.

## Finding

The public workflow is an agent authoring and correction process supported by
deterministic rendering and inspection tools. It is not evidence of a universal
video-to-original-layers inverse renderer. Its recreation guide calls for
frame-by-frame motion notes, a rendered comparison and repeated corrections with
absolute targets while keeping matched properties fixed. It also distinguishes
reproducing a saved composition from approximating a video through a text
description. The percentages in that guide describe its own examples and are
explicitly not a general guarantee. See
[the recreation guide, lines 13–40 and 100–104](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/prompting/recreating-references.mdx#L13-L40).

This supports the user's goal of a close visual and motion reconstruction, but
does not establish that a sparse one-shot plan can satisfy it. Our native editor
should adopt the observable analysis/refinement loop while retaining its own
renderer, editable layers and authorization boundaries.

## Public tools and their actual boundaries

| Capability | What the inspected source implements | What it does not establish |
| --- | --- | --- |
| Motion transcription and refinement | The recreation guide asks for duration, camera path, element actions with times, overlapping entrances, blur and colors, followed by frame comparisons and targeted edits. | An automatic analysis service or measured success rate for arbitrary uploads. |
| Paired snapshots | `snapshot --at … --against ref.mp4` renders the composition at selected times and extracts reference pictures beside it. | A semantic judgment that the reconstruction matches. |
| Variant comparison | `compare` renders independent composition projects/HTML at a shared timestamp into a labeled sheet. | Video reconstruction or an automatic optimization loop. |
| `grade-compare` | Applies supplied color-grade/LUT candidates to one image; video input uses its first frame. It can prepend an ungraded baseline. | A grade of motion, typography, scene fidelity or recreation quality. |
| Keyframe inspection | `keyframes` surfaces authored GSAP/CSS motion, paths, timing and unresolved source expressions. | Recovering an unknown original animation curve from flattened video. |
| Rich rendering | Public adapters support seekable GSAP, CSS, WAAPI, Lottie and Three.js; the CLI has local/Docker render paths. | That an authoring agent inferred the correct scene, or that every object inside a canvas becomes a native editor layer. |

Implementation references:

- [snapshot.ts, pairing at lines 890–912 and command contract at 1042–1046](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/snapshot.ts#L890-L912).
- [compare.ts, capture at lines 269–301 and command at 352–387](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/compare.ts#L269-L301).
- [grade-compare.ts, first-frame extraction at 444–503 and command at 537–577](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/grade-compare.ts#L444-L503).
- [keyframes.ts, surfaced authored motion types at 26–105](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/keyframes.ts#L26-L105),
  [runtime adapter source directory](https://github.com/heygen-com/hyperframes/tree/917ee5d31342f8c8a4a14659679762489cafe665/packages/core/src/runtime/adapters),
  and [render/execute.ts, local/Docker selection](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/render/execute.ts#L70-L128).

The independent snapshot-source audit found an important timing detail: its
[FFprobe-assisted reference extraction](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/snapshot.ts#L215-L326)
selects the containing presentation frame, with a simpler seek fallback when
probing is unavailable. Missing reference pictures are warned and skipped. This
is different from our evidence pipeline's first-frame-at-or-after contract;
comparison timing must retain the actual decoded timestamps. Snapshot's optional
Gemini descriptions are separate from producing local paired pictures and still
do not supply a numeric fidelity grade.

For example, the actual [Three.js adapter's seek method](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/core/src/runtime/adapters/three.ts#L85-L90)
publishes the requested time and dispatches a seek event; the
[Lottie adapter](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/core/src/runtime/adapters/lottie.ts#L88-L143)
converts composition time to the supplied animation's frame and handles looping
or holding its final frame. These replay authored assets; they do not infer them
from reference pixels.

The separate [iteration guide](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/prompting/iterating.mdx#L4-L18)
distinguishes structural/runtime checks from creative quality. Its
[source-editing guide](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/studio/source.mdx#L6-L44)
describes shared project files and targeted element context; it also calls for
playing the result and watching the actual encode after technical checks. These
are human/agent review instructions, not evidence that a comparison PNG is
automatically inspected by a hidden grader.

## Asset extraction is a different input path

The public capture pipeline operates on a live website and its accessible DOM,
styles and media. `coreExtractionPhase.ts` accepts a Puppeteer page/CDP context
and collects HTML, tokens, animation information and video manifests.
`postExtractionPhase.ts` downloads assets/fonts, while optional image-description
work depends on external vision-provider credentials. The generated inventory
points an agent at screenshots, design tokens, visible text, asset descriptions,
Lottie/shader records and downloaded files. Sources:
[coreExtractionPhase.ts](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/capture/coreExtractionPhase.ts#L1-L67),
[postExtractionPhase.ts](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/capture/postExtractionPhase.ts#L1-L46),
and [agentPromptGenerator.ts, lines 110–179](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/capture/agentPromptGenerator.ts#L110-L179).

`capture video` selects an existing discovered video URL from that manifest and
downloads it; it is not an implementation of separating photographs, fonts,
hidden objects or original layers from an arbitrary flattened MP4. See
[capture/video.ts, lines 185–281](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/packages/cli/src/commands/capture/video.ts#L185-L281).

The visual-spec guide specifically requires supplied files for photographic and
live-action content and identifies a limit for reconstructing organic artwork
from words. The runtime guide favors using an existing Lottie source when one is
available rather than redrawing it, and uses a real Three.js scene for depth and
lighting. This is materially richer than our basic-shape plan. See
[visual-specs.mdx, limits](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/prompting/visual-specs.mdx#L46-L56)
and [runtimes-and-3d.mdx](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/prompting/runtimes-and-3d.mdx#L19-L84).

## Open source and external dependencies

The repository's own code is published under
[Apache-2.0](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/LICENSE).
That gives inspectable implementation for the tools above; it does not make every
dependency, model, hosted service or reference asset Apache-licensed.

The official desktop-app documentation describes a locally running Claude Code
or Codex agent, with requests billed to its signed-in account or configured API
key. It does not establish that those model services or their weights are
included in this repository. Public browser Studio documentation also exposes a
clipboard handoff of element context to an agent. These are documented distinct
surfaces; this review does not infer an unpublished cloud recreation backend from
them. Sources:
[connect-your-agent.mdx](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/studio-app/connect-your-agent.mdx#L5-L15)
and [source.mdx](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/docs/studio/source.mdx#L39-L44).

The current [CREDITS.md](https://github.com/heygen-com/hyperframes/blob/917ee5d31342f8c8a4a14659679762489cafe665/CREDITS.md#L25-L68)
separates third-party terms: for example GSAP's Standard License is identified
as non-OSI, Three.js as MIT, several fonts as OFL, and particular textures are
listed with origin still to be confirmed. An engine license is therefore not
blanket permission to copy catalog media or a reference video's images, marks,
music or fonts. This research imports no upstream implementation or assets.

## Why the first native automatic pass misses the stated goal

This comparison concerns the initial sparse-plan implementation, not a finding
about a future revised workflow. The inspected local sources were
[`reference-auto.ts`](../packages/editing-playbook/src/reference-auto.ts)
(SHA-256 `50320b48fc408b03cc07606be033169a720ff720e3896827e7762a7480693a1f`)
and [`reference-style.ts`](../packages/editing-playbook/src/reference-style.ts)
(SHA-256 `620b4fbe7f47bc59b2b546dfdec8ac9427cc2396158027f1da681341dbad5ead`).
The following are implementation observations and engineering inferences, not
an upstream performance benchmark.

| Initial local design | Consequence for visual/motion fidelity |
| --- | --- |
| Six to twelve evenly spaced stills over at most the first 120 seconds | Brief reveals, cuts, occlusion order and acceleration between those samples can be missed. More prompt detail cannot recover an event that was never observed. |
| One model call produces one plan | A mismatch discovered after rendering never reaches a correction pass. The comparison folder is currently an output, not feedback to the authoring agent. |
| Text, rectangles, circles and lines; solid fills and limited typography | Photo/illustration texture, masks, gradients, blur, stroke treatment, tracking, complex shapes and 3D composition have no faithful representation in that contract. A different shape is a substitute, not the same visual. |
| Linear x/y/scale/rotation/opacity tracks with twenty keys per layer | Some motion can be approximated, but curved paths, expressive easing, deformations, animated materials and camera depth may need richer native support or a declared limitation. |
| Full decode and eight sparse pairs followed by `visualReview: pending` | This establishes technical output and review material, not a completed match. Editable layers alone do not prove layout, literal text or timing accuracy. |

## Native implementation direction

These are original recommendations for this editor, inferred from the inspected
workflow and the local gaps. They do not require adopting HyperFrames' renderer
or installing its skills.

1. **Analyze the chosen interval before authoring.** Use a coarse overview to
   locate shots, then inspect dense frames around each entrance, transition,
   camera move and settling point. Record source-time states, object identity,
   layer order, literal text, bounds, colors, fonts and uncertainty. Give each
   element an observed motion track with start, intermediate and held states.
2. **Check representation coverage.** Map the observed elements to native
   editable capabilities. Reuse authorized original assets when supplied. Keep
   text and geometry separate; identify unsupported masks, typography, images or
   3D before generating an approximation. A faithful reconstruction may require
   extending the native contract rather than increasing primitive counts.
3. **Close the render–inspect–refine loop.** Show the agent the actual native
   export beside matching reference times, including dense motion boundaries.
   Preserve layer IDs and matched properties. Apply a bounded patch of absolute
   targets, render again and retain before/after evidence. Stop with explicit
   remaining mismatches or the authorized iteration budget, not a decode pass.
4. **Keep fidelity and editability separately reviewable.** Check literal text,
   position/size, layer order, timing, trajectories, easing, assets and effects at
   actual delivery size. Verify direct/reverse seeks and inspect the editable
   scene as well as the encode. Retain the accepted native module and asset
   versions: reproducibility of that artifact differs from inferring it again
   from a video.

The reusable lesson is a measured reconstruction and correction process. It is
not an honest basis for promising perfect recovery of an arbitrary flattened
video, an automatic audience benefit or recovered original source layers.
