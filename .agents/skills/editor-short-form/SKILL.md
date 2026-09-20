---
name: editor-short-form
description: Select and shape standalone Shorts, Reels, or other short-form excerpts from a longer video using the editor's clipping pipeline. Use for narrative selection and context, not merely shortening a long-form edit or making a crop correction.
---

# Make an excerpt work for a new viewer

Use `editor-video-evidence` and read [the clipping contract](../../../reference/clips.md).
The existing pipeline selects one continuous moment from an exact long-form
export, preserving its internal cuts and sound. This skill supplies editorial
judgment; it does not add semantic detection, automatic captions, or new montage
support. Run `dapi playbook clips workflow` for current schemas and budgets.

- Inspect each candidate and surrounding context. The first retained thought
  should orient a viewer who has not seen the vlog. Resolve ambiguous "this",
  "he", or "that happened" from footage that actually fits the selection.
- Write a modest promise, setup, action, and payoff tied to in-range observations.
  A payoff may be a realization, practical explanation, or funny reaction, not
  necessarily an achievement. Do not invent drama to fill schema fields.
- Protect complete speech and action boundaries. If a reaction needs the prior
  setup, extend the candidate within the supported budget; otherwise choose a
  different moment. Reject a clip whose ending reverses meaning when restored
  to context. Return fewer clips when only a few stand alone.
- Prefer distinct moments over several near-duplicates. Record why each clip is
  useful independently, not an unsupported numerical "viral score". The desired
  duration serves the moment; product limits are not claims about platform rules.
- Keep the title truthful to the excerpt itself. "I want an IT internship" must
  not become "I got my first IT job". A recovered item does not prove its fall
  was filmed. Coordinate final copy with `editor-youtube-packaging` when requested.

Author candidates with source IDs, exact ranges, narrative evidence, protected
context, and selection reasons. Informal selection advice may remain explicitly
provisional when source evidence is unavailable; it is not an executable plan.
Complete `clips check` and the exact-candidate
source review before creating a plan. Review records remain attributed claims;
do not mark audio heard because a transcript exists.

For requested mobile output, read [portrait framing and review](../../../reference/portrait.md)
and use `clips portrait init/check/review/prepare`, normal delivery, then
`clips portrait inspect/review-render` on the actual export. Preserve faces,
hands, important objects, and context; use reviewed contain framing when a crop
cannot preserve them. A source-selection pass is not a framing or render pass.

Do not burn in captions, add a new opening, recut nonadjacent excerpts, add music,
or publish automatically. If the user requests a newly assembled short rather
than a continuous excerpt, disclose that distinction and use the documented
composition workflow with its own source/timeline mapping and actual-render review.

## Separate the moment from its boundaries

First identify why the moment is worth watching. Then consider supported start
and end alternatives independently: the most interesting sentence may not be a
complete opening, and the peak may need a subsequent reaction or explanation.
Finally check whether any removal loses context. Reject unsupported nonadjacent
pruning in the continuous-excerpt path; do not hide that limitation in the notes.

Review three questions using the actual selected/rendered version:

- `opening_promise`: does the first picture/thought set an honest expectation?
- `standalone_context`: can a stranger resolve the people, objects and situation
  without the original vlog? The needed context must survive inside the excerpt.
- `payoff`: does it deliver the promised answer, result, or reaction, with an
  intact ending rather than a misleading cliffhanger or forced loop?

For requested mobile output, also record `portrait_context`; retain the separate
portrait and rendered-output gates. Audio/video capability limits remain explicit.
Missing evidence is `unknown`, not a pass or not-applicable result.

For a comparison, read [experiment records](../../../reference/engagement.md),
vary one supported boundary choice and save output-relative review ranges for
both variants. Assess comprehension and completion; a shorter clip's higher
percentage viewed alone does not establish a better experience. Do not claim a
retention benefit without audience evidence or silently add captions/effects.
