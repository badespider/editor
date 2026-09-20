---
name: editor-audio-continuity
description: Check speech boundaries, silence and audiovisual continuity when editing footage in Diffusion Studio. Use for dialogue cuts, music balance or audio transitions; not to generate or purchase music or voice services.
---

# Treat sound as separate evidence

Read [the playbook contract](../../../reference/playbook.md). Establish whether audio is present, silent, unknown, or speech-bearing. A waveform measures signal; it does not establish spoken words. Reading a subtitle or interface is not listening to the audio.

- Use local probing/waveform measurements first. For speech, use an available listening or transcription path within the user's authorization. If no suitable path is available, report unknown speech and do not invent a transcript.
- Start from [the agent evidence workflow](../../../reference/agent-workflow.md): `media understand` defaults to no-provider preparation; `media inspect <session-id> --start ... --end ... --audio` returns aligned local audio. Import a suitable existing/local transcript with `media transcript-import`; this does not perform ASR itself. Diffusion Studio's separate `media listen`/`watch` and `media transcribe` are provider-backed paths. Do not invoke them in a no-API task or silently fall back to Gemini.
- Map known speech units to `speechRanges`. Keep pauses that convey emotion or separate concepts. A transcript's timings may be approximate; inspect audio at consequential edit boundaries.
- Keep video and audio on the same source time origin. Do not independently shift audio to zero and lose a real delay or lead.
- Picture-only cutaways over continuing original voice use [the layered workflow](../../../reference/layered.md), which keeps an independent uninterrupted base soundtrack and mutes the cutaway sound. Natural-sound-only segments can remain in the base plan. For other J/L cuts, use suitable audio handles, a speech-aware timeline and documented editor controls/TSX. The cut-only renderer does not implement these mixes; review the actual composition with the appropriate verifier.
- Do not add music by default to a silent technical recording. When music is requested and available, keep speech intelligible and check peaks and transitions; generation or licensing is a separate action.
- For a selected [visual-journal profile](../../../reference/style-profiles.md), preserve breathing room, environmental sound, and the sound of daily actions even when unrelated to narration. Map the audio source separately when a cutaway carries continuing voice, and avoid doubling dialogue or implying a false place/time. Without a supplied, authorized music track, continue with voice and natural ambience; optional gentle lo-fi, when supplied and authorized, stays lower under speech. This is scoped guidance for that journal edit, not a default for tutorials or unrelated projects.

For the local silent regression clip, no speech is expected. This does not imply that other recordings from the same folder are silent. Record what was measured versus heard, and route to `editor-review` for boundary and continuity checks.
