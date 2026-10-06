# Learn a reusable editing style

Use this workflow when the user wants a reference's editing language carried into
different videos, or wants to grow a style catalog. The calling agent interprets
the evidence and writes the rules. The tools retain provenance, bind editable
recipes and generate fresh review criteria. A style profile covers selected scenes.

## Study the reference

1. Inspect its overview through the [agent evidence pipeline](agent-workflow.md).
   Choose at least three distinct, nonoverlapping scenes with different roles,
   such as subject introduction, explanation, and spoken emphasis. Include the
   entrances, holds and exits needed to understand each technique. Add scenes when
   a new technique or contradictory example changes the proposed rules.
2. Inspect every frame in each bounded scene and seal its detailed `media reference
   design` record using [reference analysis](reference-fidelity.md). Keep measurements,
   observations, uncertainty and unavailable audio separate. Completion means each
   selected scene has a sealed analysis and actual inspected coverage.
3. Save `sources.json`, an array of `{id, role, sessionId, sequenceId, designSha256}`.
   Use one evidence cache. Run `media reference style-template sources.json
   --cache-dir CACHE -o worksheet.json`. The worksheet offers observed features;
   the agent authors general rules rather than copying literal feature targets.
4. Fill the guide and remove the worksheet's `featureIndex` and `instruction`.
   Each rule states its principle, use/avoid conditions, editable controls,
   confidence, backing scene/feature IDs, review method and tolerance. Repeated
   confidence needs at least two scenes. Single-example rules remain conditional.
   Declare what to preserve, replace, and retime. Generalize subjects, original
   headlines, buildings, imagery and source-specific masks into new-content slots.
   Preserve uncertainty about fonts, easing, geometry and sound.
5. Save `{sources, guide}` to `request.json`; run `media reference style request.json
   --cache-dir CACHE -o sealed-guide.json`. The command checks actual design/frame
   fingerprints, distinct source ranges, compatible evidence and coverage.
   Its seal validates attribution, not the truth of the observations.

## Save editable techniques

Read `playbook motion catalog style workflow` for current schemas. Find suitable
recipes with catalog `list/show`, or author a missing technique using the scene
workflow. Use source-neutral text/media slots, clean masks for new subjects and
named cues. Test a short application on different content to assess portability.
An exact reference-control is useful for an explicit reconstruction request or a
specific uncertain technique; it is not a prerequisite for style use.

Save `recipe-bindings.json`, an array of `{template: "id@1", purpose, useWhen,
avoidWhen}`. Run `catalog style capture sealed-guide.json recipe-bindings.json
-o style-candidate.json`, inspect it, then `catalog style add style-candidate.json`
when saving is authorized. Capture pins recipe hashes; addition creates an immutable
version under `motion-catalog/.styles/`. Candidates contain no source images,
transcripts, local cache paths or output approvals. Editable recipes remain separate
so several styles can share a useful technique without duplicating it.

## Apply to a new story

1. Read `catalog style show PROFILE@VERSION` before storyboarding. Choose recipes
   for each scene's purpose using their use/avoid conditions. A profile is a menu
   of related techniques rather than a requirement to repeat one composition.
2. Supply fresh footage, assets, words, dimensions and real source-clock cues in
   the normal catalog request. Add `style: {profile: "PROFILE@VERSION",
   applications: [{ruleId, shotIds, rationale, adaptation}]}`. Account for every
   rule exactly once. `shotIds: []` proposes an omission and explains why; the
   omission stays in the review checklist instead of disappearing.
3. Run `catalog apply request.json -o NEW_ADAPTATION`. The result contains editable
   recipe/input, a pinned receipt and preflight findings. In this mode generalized
   guide rules supply per-rule review targets. Direct recipe use without a style
   profile keeps its existing detailed template requirements.
4. Check layout and cue timing, then use `scene start/render/next/review` on a fresh
   job for the new content. Inspect every returned frame, request dense evidence
   for rapid movement and native frames for text/masks. Review every rule and
   proposed omission: story relevance, typography hierarchy, movement/depth,
   readability, timing and clean transitions. Listen or keep audio/speech sync
   unknown. Apply the scene workflow's bounded corrections.

Completion means a source-bound export has its own exact-version review. Catalog
application and technical tests alone cannot establish visual quality. Compare
design behavior and storytelling purpose across subjects; full-frame pixel error
is meaningful only for appropriately aligned comparable imagery. Profiles are
explicitly selected, so they do not impose a style on unrelated projects or vlogs.
New examples can justify a new profile version. No model, upload or publication
is performed by these commands.
