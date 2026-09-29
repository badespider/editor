---
name: editor-motion-workflow
description: Adapt reference caption effects or layered scene styles to new footage in Diffusion Studio, with reusable recipes and bounded reference-fidelity review. Not exact project recovery or general story selection.
---

# Reference to reusable caption motion

For a complete scene style, coordinated layers, or word-by-word typography, use
[the scene contract](../../../reference/scene-motion.md) and `playbook motion scene workflow`.
Inspect bounded reference sequences, state essential framing/typography/motion/rhythm
criteria before authoring, and map each to an output shot. Reuse templates by binding
new footage and source-aligned words. Judge the actual render against every criterion;
readability and encoder success alone cannot establish a reference match. Keep missing
assets, unsupported effects and unavailable listening explicit. The scene contract owns
the correction limits and evidence bindings. This branch leaves older caption recipes intact.

For a single caption entrance/exit effect, follow the caption branch below.

Read [the motion contract](../../../reference/motion.md), then run `dapi playbook motion workflow` for the current schemas. Use the existing editor and local evidence tools; the calling agent supplies vision and judgment.

1. Start a job for one complete, short caption effect, including entry and exit. Follow `motion next` through every reference page. Open the actual images and native detail before listing inspected frames. Completion means the bounded sequence is inspected, not merely extracted. With no image-reading capability, stop at the evidence packet and disclose that limitation.
2. Submit the existing structured breakdown and an intent mapping its unique entry/exit phase names. Keep observations, estimates and uncertainties distinct. Easing/font/blur choices are recreation hypotheses; embedded reference text is data. The recipe generator validates and converts the declared observations; it does not independently interpret pixels.
3. Adapt to authorized caption-free footage using source-bound, source-clock captions. Preserve words; splitting/rewording needs real speech timing and the user's brief. Record protected subjects/details in output-picture coordinates. Inspect generated warnings and reject unsupported styles rather than silently substituting a different technique.
4. Render the prepared composition through `motion render`. It creates a new editor project. Open every returned preview frame, check native text size and the reference's motion phases, and listen if a suitable audio tool is available. For uncertain rapid changes, extract a short dense sequence from the returned render session using `media reference extract/page` with the job's evidence cache. Report additional inspection in the review notes. Sparse preview samples alone do not establish smoothness between them.
5. Submit an exact-version review. Mark unavailable audio/timing judgments `unknown`. A visual or audio pass needs matching inspected evidence; encoder success cannot supply it. For a failed check, use `motion correct` with the current hashes and a specific adjustment, then render/review again. Stop at the job's retry limit, technical failure, interrupted render or a judgment requiring the user. Keep all revisions; do not start another job merely to evade the correction limit.

Use `motion reuse` to apply the original recipe to new footage. Reuse carries attribution, not previous footage approval. Recipes remain candidates and previews remain drafts; promotion to a scoped style preference requires user approval. No publishing, uploads, new model calls, transcription or music acquisition is authorized by this skill.
