---
name: editor-sound-polish
description: Assess and conservatively improve dialogue clarity, uneven volume, distracting noise, and useful ambient sound. Use for requested sound cleanup or mixing, not every speech cut, transcription, music generation, or voice cloning.
---

# Make speech clearer while keeping the place believable

Use `editor-audio-continuity` for source clocks, speech boundaries, and listening
limitations. Read [the evidence workflow](../../../reference/agent-workflow.md)
and reuse aligned audio samples from the inspected source. For an assessment-only
request, return findings and proposed changes without processing media.

- Identify the actual issue before choosing treatment: a level jump, clipping,
  hum, wind, competing speech, a noisy room, or simply intentional quiet. Peaks
  and waveforms measure signal; ASR can suggest words but cannot judge whether a
  voice sounds natural or a noise reduction effect is pleasant.
- Compare representative speech and ambience at matched listening levels when
  listening is available. Report measurement-only coverage explicitly when it
  is not. Do not label a mix perceptually approved from a transcript or peak test.
- Prefer a small correction to processing an entire recording indiscriminately.
  Preserve breaths, room character, and action sounds that help the viewer.
  Do not remove meaningful audio because a transcript has a gap.
- Avoid treating background TV or another speaker as the creator's narration.
  Honor task-specific exclusions. If voices overlap, disclose that clean removal
  may not be possible; do not promise isolation or reconstruct missing words.
- Noise reduction and gain cannot recover all distorted or missing speech. Check
  for pumping, metallic speech, unnatural silence, and abrupt ambience changes.
  Keep the original and a bypass comparison; choose no treatment if it is clearer.
- Music and replacement sound are not defaults. Use only authorized, available
  assets, keep their provenance, and preserve intelligibility. Generation,
  purchasing, voice cloning, and provider-backed analysis are separate actions.
- With a selected [visual-journal profile](../../../reference/style-profiles.md),
  preserve the character of the place and useful natural sound between thoughts.
  Music stays off without a supplied track authorized for this edit: proceed with
  voice, B-roll, and natural ambience without waiting for a song. If supplied and
  authorized, gentle lo-fi may sit lower under speech; it need not cover every
  pause. The profile selects an aesthetic, not a processing or acquisition action.

Return source/time-linked findings, what was measured versus heard, the proposed
treatment per interval, and any unresolved perceptual checks. Use a sidecar for
mix notes; the strict cut-only plan has no denoise, EQ, or separate audio lanes.

For authorized implementation, inspect supported tool contracts first. The
editor's [audio volume](../../../reference/jsx/audio.md) is in decibels, not a
linear multiplier; preserve [media timing](../../../reference/jsx/timing.md).
Do not invent a denoise/EQ property or treat normalization as denoising. If local
processing is needed and available, create a new source-bound audio file and
record processing/timing so another agent can reproduce the mix. Do not install
a model, call a paid provider, or replace an existing asset silently.

Render the actual changed composition and use `editor-review` for sync and speech
continuity. The [cut-only delivery verifier](../../../reference/delivery.md)
expects original sound; it is not a validator for intentionally processed audio.
Record technical measurements separately from an actual listening comparison,
retain an untreated baseline, and disclose any review that remains unavailable.
