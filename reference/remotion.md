# Optional local Remotion renderer

Use this module when a user selects Remotion for a scene recipe or an agent is
testing a renderer comparison. The normal editor renderer remains the default.
Remotion is a separately licensed dependency, not relicensed under this repo's
MPL license. Check [its current terms](https://www.remotion.dev/docs/license/pricing)
for your organization before use. Rendering is local; this integration makes no
AI calls and does not configure cloud rendering or an account/license key.

## Render and review

1. Prepare a new `layered-v2` job through the normal
   [scene workflow](scene-motion.md). Reuse an appropriate catalog template and
   source evidence; keep reference interpretation with the calling agent.
2. Optionally save settings in a local JSON file:

   ```json
   {"captionEntrance":"spring","concurrency":2}
   ```

   `captionEntrance` defaults to `recipe`, preserving the declared caption
   animation. `spring` adds a small frame-driven scale entrance to each revealed
   word while retaining its original word timestamp, text, row and emphasis.
   It is a new design choice, not an inferred reference curve. Concurrency is
   bounded to 1–4 browser pages; start with 2 and lower it on memory pressure.
3. Build the CLI and render:

   ```sh
   dapi playbook motion scene render NEW_JOB --renderer remotion --remotion-options settings.json
   ```

   Omit `--remotion-options` for the recipe defaults. No open desktop editor is
   needed. Node 24+, FFmpeg/FFprobe, the workspace dependencies and a supported
   Chrome Headless Shell are required. Remotion downloads its browser on first
   use if missing. That setup needs network access, but no footage upload.
4. Follow the returned `scene next` evidence. Inspect all supplied frames,
   reference criteria, motion phases and native typography; listen or retain
   unknown speech/audio judgments. Use the same `scene review` and bounded
   `scene correct` commands. A correction must render with the explicitly chosen
   engine/options again. Preserve all prior attempts; an interrupted attempt is
   retained for diagnosis, not automatically retried or overwritten.

Completion is a new verified render plus an exact-version visual/audio review,
not a successful dependency install or schema check. All outputs remain drafts.

## What this first integration supports

The existing recipe/catalog data stays editable and reusable: ordered layers,
image masks, independent/group transforms, precision curves, per-property timing,
bounded exposure samples, title fitting and source-clock captions. Remotion
owns frame capture and video decoding; React sequences use integer shot frames.
Trusted shared Canvas drawing helpers preserve current typography/shape behavior,
while images/video use Remotion-managed media. It is not a wholesale conversion
to HTML typography, an interactive Remotion Player panel, or a 3D/Lottie importer.
Those can be added as separately tested designs later.

The worker stages only fingerprinted bound media under a private job directory.
Public asset names are generated hashes, never user URLs or source instructions.
The composition receives validated data rather than arbitrary code. Keep those
local bundles private: they contain footage even though they are called `public`.
Fonts come from the render machine; verify installed fonts and their rights.
No font downloads, sound effects, music or AI services are silently added.

Muted picture is rendered first; the existing prepared continuous narration is
encoded once with the editor's audio settings. Duration, dimensions, frame count,
decodability and audio presence pass the existing technical gate before the
normal evidence inspection. `remotion-attempt.json` and `scene-render.json` bind
the engine/dependency/source fingerprint, options, revision and actual output.
Technical checks do not prove speech synchronization or artistic improvement.

V1 renders the complete bounded scene job (maximum 60 seconds). Existing
desktop per-scene caches are not shared with Remotion; `--full` is redundant.
Neither better visual quality nor faster rendering is assumed. Compare identical
footage/audio and describe any styling changes separately from engine changes.
Browser/font anti-aliasing can differ even with identical recipe data.

## Verification

Detailed reference templates can opt into `template.finish` for seeded grain and vignette;
the editor renderer refuses that finish rather than dropping it. See
[reference fidelity](reference-fidelity.md) for the analysis, short-control and diagnostic
comparison workflow. This addition does not reconstruct original materials or 3D cameras.

For channel graphics, templates can declare `surface: {kind:"paper", seed:37,
strength:0.85}`. This is an opaque, static, procedural background material;
it leaves source pictures and captions untouched. `cornerRadius` on rectangular
drawn layers is a fraction of the panel's smaller dimension (0–0.5), supported
by both layered drawing engines. Media layers must retain their existing framing
and mask contract. See [the channel preset](channel-template.md) for reuse.

Run the workspace's `check` and `test` scripts plus the editing-playbook and CLI
checks. The explicit integration test uses real Chromium with synthetic footage:

```sh
node packages/remotion-renderer/test/smoke.mjs NEW_OUTPUT_DIRECTORY
```

It checks a moving video, measured title, source-clock captions and a complete
60-frame render. Review its actual pixels; a technical pass is not a visual
verdict. Source media, render bundles, browser downloads and test exports stay
outside the shared motion catalog and Git.
