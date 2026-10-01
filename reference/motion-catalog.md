# Reusable motion catalog

Use this workflow when reusing a saved motion design on new footage or saving an
authored design for future projects. The catalog stores **editable animation data**,
not just inspiration notes. It is independent of the editing-skill catalog.

For optional readable reflow during `apply` and same-input visual baseline checks
after rendering, see [precision controls](scene-precision.md). These do not change
pinned versions or confer review approval.

## Reuse

1. Run `dapi playbook motion catalog list --query "images"`, then
   `catalog show one-to-many@1`. Read the slots, cue names, requirements, duration
   range, origin and limitations. Pin the exact version; there is no implicit latest.
2. Obtain new footage evidence and real word timing through the normal agent
   pipeline. Use `catalog workflow` for the request schema. A request contains the
   ordinary [scene input](scene-motion.md), one `instances` selection per shot,
   and `mediaDimensions` measured from the bound source files. Every shot still
   needs its framing rationale, protected regions, purpose and explicit media
   bindings. `templateId` and `criteria` in that input are replaced by `apply`;
   source content, transcript, audio range and framing are preserved.
3. Bind every text slot (by layer ID), every media slot and every named speech cue
   shown by `show`. All titles are supplied anew, including credits where required
   for the new media. Caption words/rows/emphasis remain in `input.captions`.
   Example selection within `instances`:

   ```json
   {
     "shotId": "intro",
     "template": "scale-title@1",
     "text": { "stadium-back": "SMALL START", "stadium-title": "BIG CHANGE" },
     "colors": { "#173FAD": "#7536A8" },
     "fontFamily": "Arial"
   }
   ```

   Bind `accent` and `reveal` in that shot's `cues` to actual transcript word IDs.
   The template keeps its easing, holds, layer hierarchy, shadows and relative
   movement. Normalized key times scale with shot length; word cues retain their
   explicit second offsets. Out-of-shot or reversed timing fails, never clamps.
4. Run `catalog apply request.json -o NEW_ADAPTATION`. It writes `recipe.json`,
   `input.json`, `receipt.json` and `preflight.json`. Address framing/readability
   warnings. Use `scene start NEW_ADAPTATION/recipe.json NEW_ADAPTATION/input.json
   -o NEW_JOB`, then the existing `scene render`, `next`, `review`, and bounded
   `correct` loop. Start with a short proof. Completion requires inspecting the
   actual export; successful template application alone is not a finished video.

One request can combine up to 16 shots and multiple catalog entries within the
scene workflow's 60-second preview limit. The first selected shot supplies global
caption styling, or select another with `captionFromShot`. Caption group box
overrides are already output-relative and remain unchanged. Longer productions
use separate bounded scenes in their normal editorial workflow.

### Adaptation controls and limits

- `text` replaces all text-layer slots; unexpected/missing slots fail. Long titles
  auto-fit and can become too small, so inspect native-size text.
- `colors` maps exact palette hex strings reported by `show`; `fontFamily` changes
  scene/caption fonts. Install/verify the font locally before rendering.
- Media is contained within each authored animated box, preserving its cropped
  aspect ratio. Caller-supplied dimensions guide this; `scene start` independently
  probes source bytes and rejects distorted output. Source crops remain explicit.
- Layout is contained as a whole when aspect ratio changes. This keeps group
  geometry intact but can leave unused space or small text. It is **not automatic
  subject tracking or a redesigned landscape layout**. Refine the generated recipe
  before starting a job, or use the bounded correction loop afterward.
- Text, images and named cues are the variable slots. New counts/arrangements,
  masks, detailed easing changes and per-word choices stay editable in the output
  recipe/input; they are not arbitrary-code template parameters.
- Seeds retain a photographic/tilted style. Image masks tied to the old subject
  were removed; bring an authorized cutout or author a mask for the new subject.
  The catalog does not supply original media, fonts, music, or their licenses.

## Grow the library

1. When authorized to save a design, choose the successful authored scene template
   and inspect its actual output. Record its limitations, origin and intended use.
   A reference analysis alone does not create a reusable animation.
2. Prepare metadata matching the metadata fields in `catalog workflow`'s entry
   schema: identity/version, name, description, tags, origin, limitations, design
   dimensions, duration bounds and requirements for framing/typography/motion/rhythm.
   Run `catalog capture recipe.json TEMPLATE_ID metadata.json -o candidate.json`.
   Capture removes source-specific text and excludes references, cached frames,
   media paths, transcripts and reviews. It retains editable keys/groups/masks.
3. Inspect the candidate: generalize semantic slot/cue names if useful, remove
   subject-specific masks or geometry assumptions, and check licensing/attribution.
   Keep instructions and executable code out of catalog data. Add explicitly with
   `catalog add candidate.json`. A new design gets a new ID; a revision gets a new
   integer version. Existing ID/version files are immutable through the API.
4. Test reuse on **different** media/text/timing, render a proof, inspect the result,
   and record what was actually verified. Commit the portable JSON and relevant
   regression tests when requested; keep private footage and local review files
   outside Git. Merely receiving a reference never silently adds it to the library.

The shared library lives at `motion-catalog/<id>/<version>.json`. It contains a
fingerprinted `entry` envelope; edits without a matching new version are detected.
Use `catalog --catalog PRIVATE_DIRECTORY ...` for an explicitly selected private
library. Discovery searches checkout ancestors, including the built CLI's location.
`list` searches all versions, including older ones; use `show` to choose deliberately.

## Provenance and review

Applied recipes use explicit `style.basis: "catalog"` and pinned entry hashes.
Their criteria describe **template conformance**, with no original-reference
frame claims. Existing reference-mode recipes still require inspected references;
their review requirements have not been relaxed. Corrections cannot change either
mode's frozen style specification.

The reuse receipt binds entry versions, recipe/input bytes, request and origin.
No output review or audio approval is inherited. Catalog reviews cite fresh render
frames for every essential requirement and leave `referenceEvidenceIds` empty.
Listen to the new output or mark audio/speech sync unknown. A passing review is
`agent_reported_template_conformance`, not a reference match, independent
verification or permission to publish. There are no model calls or uploads.

## Verification

Package tests cover every shipped entry, substitution, aspect-correct adaptation,
source preservation, version integrity, invalid input and fresh review semantics.
`apps/cli/src/test/motion-catalog-desktop-smoke.ts` runs the real-editor path with
synthetic media in an isolated profile. It leaves previews and a result report in
a new caller-selected directory. Synthetic tones are not listening approval.
