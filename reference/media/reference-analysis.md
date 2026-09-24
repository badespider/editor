# Frame-by-frame reference analysis

Use this mode when studying animation timing, motion graphics, a rapid transition
or a one-frame visual change. Normal `media inspect` remains the efficient tool
for storytelling overviews. Neither mode supplies the agent's visual reasoning.

V1 is available through the local CLI and the Node `ReferenceAnalysisService`
export from `@diffusionstudio/video-understanding/reference`. It does not add a
desktop IPC endpoint or edit the timeline. No API key, other model, download,
upload, transcription or publishing is involved.

## Extract an exact short sequence

```sh
dapi media understand reference.mp4 --overview-count 12 --cache-dir evidence
dapi media reference workflow
dapi media reference extract SESSION --start 10 --end 12 --cache-dir evidence
dapi media reference page SESSION SEQUENCE --from 0 --count 24 --cache-dir evidence
```

Replace `dapi` with `node apps/cli/dist/index.js` when running from this checkout.
Use the returned `sessionId`, sequence `id`, and the same cache directory on every
call. Source times are seconds from the first video presentation timestamp.
Choose a bounded effect, usually 0.5–3 seconds to start, rather than extracting
an entire reference video as native PNGs.

Every decoded frame with a presentation timestamp in **[start, end)** is kept,
including visually identical frames. There is no conversion to 30 fps, sampled
time grid, deduplication or frame interpolation. Integer PTS and its rational time
base are saved beside each PNG. Indices are **zero-based within this sequence**,
not original global frame numbers. A frame already being displayed at `start`
but whose PTS precedes `start` is not included; start earlier if you need that
before-state. The final frame's preview hold is clipped at `end`.

The decoder uses FFmpeg's timestamp-preserving
[passthrough mode](https://ffmpeg.org/ffmpeg.html#Advanced-options) and integer
timestamps from [showinfo](https://ffmpeg.org/ffmpeg-filters.html#showinfo), not
average FPS or the rounded `pts_time` log text. Regression tests independently
compare an extracted variable-rate sequence with FFprobe's full-source decoded
frame timestamps.

Native image dimensions are preserved. PNGs are RGB24 display evidence, **not**
the original compressed bytes, exact source color grading, alpha layers, or
original project assets. V1 rejects HDR, non-square pixel geometry and
display-matrix transforms instead of silently tone-mapping or rotating them.

### Budgets and reuse

- Range: at most 30 seconds. Default maximum 600 frames; explicit `--max-frames`
  can raise that to 1800. Exceeding it rejects the request, never truncates it.
- `--max-decoded-mib` defaults to 1024, ceiling 4096. A conservative RGB pixel
  estimate plus PNG overhead is checked before native extraction. This is not a
  prediction of the compressed file sizes. 4K needs short ranges or an explicit
  larger budget. Completed PNG/grid sizes are checked too; page sheets add small
  review files beyond that native-frame budget.
- Five-minute operation timeout, Ctrl+C cancellation, 16 GiB / two-hour source
  limits. Source content is fingerprinted for new extractions; later access
  checks source size/mtime and manifest/source bindings. Selected image/grid
  fingerprints are checked when evidence is returned or compared.
- Repeating an identical extraction reuses the source-bound sequence and
  verifies its files. Dense sequences have their own budget; they do not consume
  the ordinary session's 1024 sparse-artifact slots.
- A request folder is exclusive. `sequence.json` is written last. Interrupted
  jobs can leave an incomplete diagnostic folder; it is not resumed as if
  complete or automatically deleted. Use a new cache/range after inspecting it.
- Evidence stays local but is not encrypted. The calling agent's own image
  service may process images it opens.

## Inspect the images, not just their filenames

`extract` returns a `viewerPath`, `manifestPath` and a starter breakdown object.
The offline `viewer.html` supports:

- previous/next buttons, arrow keys and a frame slider;
- native-size inspection and source-coordinate readout;
- a previous-frame overlay for seeing subtle changes;
- best-effort playback at 1x, 1/4x or 1/10x using the recorded timestamp gaps.

Image loading/browser timing can slow playback; it is not an audiovisual timing
verifier. Frame stepping and recorded timestamps are authoritative. There is no
audio in this viewer; use the normal evidence workflow for sound.

For agents, `page` returns 1–48 **consecutive** original frames, paths, hashes,
timestamps, a contact sheet and explicit left-to-right/top-to-bottom order.
Default page size is 24. Follow `nextFrom` until it is null if full inspection is
needed. The thumbnails are navigation aids; open native files to judge fine text,
masks and small motion. Extraction and returning a page never mark frames viewed.

Each frame after the first also has a change score and changed-pixel bounding box
from a coarse 96x54 grayscale grid. These can guide closer inspection. They are
**not object tracks or recovered transforms**: camera motion, lighting, cuts and
compression can all affect them. A small or zero score can still hide important
fine detail. Do not use scores to skip frames when claiming full inspection.

## Describe the effect with source-bound evidence

Fill the returned `breakdownTemplate` after actually inspecting frames, then:

```sh
dapi media reference annotate SESSION SEQUENCE breakdown.json --cache-dir evidence
```

The workflow command exposes the strict schema. Supply `sequenceSha256`, an
`author`, unique `inspectedFrames`, and an `elements` array. Each element has:

- `id`, `label`, `observation`, `inference`, `uncertainty`;
- `phases`: labels with inclusive `startFrame` and `endFrame` endpoints;
- optional authored `keyframes`: `frame`, `note`, and any known `x`, `y`, `scale`,
  `rotationDegrees`, `opacity` values. `x/y` use normalized picture coordinates;
  state the anchor and scale baseline in the note. Off-screen positions are valid.

Example element (use real inspected indices and descriptions):

```json
{
  "id": "title", "label": "Main title",
  "observation": "The title moves right, passes its resting position, then returns.",
  "inference": "A short overshoot and settle may recreate the visible movement.",
  "uncertainty": "Original easing curve and layer setup are unknown.",
  "phases": [{"label": "entry and settle", "startFrame": 0, "endFrame": 23}],
  "keyframes": [{"frame": 0, "x": -0.2, "y": 0.5, "note": "Estimated title-center position, not automatically measured."}]
}
```

Phase endpoints and keyframes must reference declared inspected frames. The
record reports coverage and stays `agent_reported`, `safeToAutoEdit: false`.
Adjacent authored keyframes also yield elapsed time, parameter deltas and average
change per second. These are derived from the agent's estimates, not automatically
measured object tracks or recovered easing. Zero-time transitions have null rates.
This validates attribution and references, not truth or actual viewing. A
breakdown is inert data, not executable animation code, a recovered project, an
approved skill, or permission to redistribute the creator's assets. Follow the
reference-learning skill before promoting a tested technique to trusted guidance.

## Compare a rendered recreation

Open and extract a short range from the authorized recreation using the same
workflow and cache, then compare corresponding frame pairs:

```sh
dapi media reference compare REF_SESSION REF_SEQUENCE OUR_SESSION OUR_SEQUENCE --from 0 --count 24 --offset 0 --cache-dir evidence -o comparison-page.json
```

Comparison aligns time **relative to the requested range starts**. `--offset`
shifts candidate time by that many seconds, within -30..30. Each reference frame
is paired with the latest candidate frame at/before the target time. Candidate
gaps retain the displayed frame; missing/out-of-range coverage is explicitly null.
No frames are interpolated. Matching aspect ratios are required; different
resolutions are allowed and the metric is normalized to the same small grid.

Results include verified native image pairs, timing, coarse grayscale absolute
pixel difference and `nextFrom` pagination. They remain `measurements_only`.
A low error is not proof of good design, motion equivalence or a successful
recreation; inspect the images and timing. Different colors/fonts can change
error without changing the animation concept. Original layers, masks, software,
opacity curves and easing cannot be uniquely inferred from a finished render.

## Regression checks

```sh
npm test --workspace=@diffusionstudio/video-understanding
npm run check --workspace=@diffusionstudio/video-understanding
npm run check --workspace=@diffusionstudio/cli
npm run build --workspace=@diffusionstudio/cli
node packages/video-understanding/test/reference-cli-smoke.ts
```

Fixtures cover 60 fps with a one-frame flash, variable rate with positive source
PTS, exact count and native dimensions, repeated images, paging, caching,
storage/frame limits, cancellation, source/artifact changes, authored coverage,
viewer data escaping, and timestamp-aligned comparison. No paid model tests.

The viewer's control logic has isolated DOM-stub tests for stepping, overlay,
native-size toggle and VFR playback scheduling. These do not replace a real-browser
visual test; visually verify the viewer in a supported browser separately.
