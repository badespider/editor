# Drop a reference, learn reusable motion

In the desktop editor, open **Reference**, choose **Learn motions to library**,
then drop or select one local video. Discovery samples the entire file (up to
two hours), chooses at most three promising windows and densely inspects each.
The limit is adjustable before dropping. A job uses at most `1 + 3 × candidates`
Codex calls through the installed CLI's ChatGPT sign-in: discovery, then one
authoring call and one visual review per candidate, with one final review when
the first critique proposes a correction. Sampled source images and
actual rendered comparisons are sent for that analysis, using account allowance.

For each candidate the trusted host validates a bounded JSON blueprint of native
text, rectangles, circles, lines and keyframes. It exposes literal text, color
and typography bindings, with duration retiming and explicit composition boxes.
It never executes model-authored JavaScript or copies reference instructions
into trusted repository skills. No source pixels, media or audio enter reusable
components. Unsupported artwork stays a recorded limitation or causes rejection.

The editor mounts, audits, saves and renders two real variants, including changed
words and colors. The service checks decoding, exact geometry/duration, distinct
export fingerprints and source identity, then critiques source/export pairs.
If the first critique can repair a supported motion, it proposes one bounded
native correction. The host validates and exports both variations again, then
judges those exact revised exports. A proposal alone can never publish a repair.
Wholly empty outer timeline frames are trimmed using actual layer lifetimes;
the saved source offset follows that trim. Internal reading holds are preserved.
Passing components are automatically published as **machine-reviewed drafts**;
human review remains pending. A rejected candidate is skipped with its reason
after the correction budget, and other candidates continue. The flow does not
claim perfect copying or that
every motion in the video was found. Ninety-six overview samples can miss brief
motions between frames; selected windows receive up to 96 denser samples.

**Moments → Learned motions** lists the persistent user entries. Choose an entry,
change its text, colors, typography, duration and format, then add an ordinary editable
native scene. Portrait application contains and centers the original artwork;
it does not invent a responsive mobile layout. Inspect the result at delivery
size. Advanced JSON is also available. Generated guidance, critic findings and
source provenance can be read or copied from the same panel.

The library is separate from the curated, source-controlled Moments catalog:
`%LOCALAPPDATA%/DiffusionStudio/motion-library` on Windows. Each immutable entry
retains a bounded component, a host-generated `SKILL.md`, an exact default export,
review receipt and source provenance. Behavior fingerprints ignore wording,
palette and source labels, so exact structural duplicates share an entry and
accumulate provenance. This is exact structural deduplication, not a guarantee
that similar-looking behaviors will always be recognized as duplicates. Built-in
and previously learned descriptions also guide discovery away from known patterns.

The job folder retains evidence, prompts, model-call usage, candidate plans,
variant exports, comparisons and failures. Cancellation and project changes stop
further work; completed entries and already-created native scenes remain.
Interrupted jobs do not resume or make more model calls automatically. Only one
learning job can own a given jobs directory at a time. Whole-file overview
evidence is cached by source identity for later drops; source fingerprints are
checked again before authoring and publication.

## Agent and CLI access

These commands use the same local library and make no model calls:

```text
dapi playbook motion library list
dapi playbook motion library read learned-<fingerprint>
dapi playbook motion library create learned-<fingerprint> --values values.json --format portrait --duration 6 -o fresh.js
dapi playbook motion library mix-schema
dapi playbook motion library mix recipe.json -o fresh.js
```

Read returns both the validated component and complete generated guide. Values
are literal JSON data, never expressions. Mix recipes reference learned IDs and
give every instance a unique key, box, start and end. Instances stack in array
order and clip within their own box. Mount and render the generated module using
the normal native editor path; review its actual entrance, hold, exit and seeks.
The browser-safe package also exports `instantiateLearnedMotion`,
`buildLearnedMotionModule` and `buildLearnedMotionMixModule` for agent integrations.

Generated guides describe an optional component. They do not become universal
editing preferences, automatically installed global Codex skills or evidence of
audience impact. Updating trusted repository skills remains a separate scoped
change. Reference text and filenames remain untrusted data throughout.
