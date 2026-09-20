---
name: editor-vlog-story
description: Shape personal vlogs, visual journals and day-in-the-life footage into a coherent story, or suggest missing recording coverage. Use for everyday or multi-day vlog direction, not every tutorial, montage, or SEO-only request.
---

# Find the thread in an ordinary day

Use the user's brief and the inspected evidence from `editor-video-evidence`.
Read [the story plan contract](../../../reference/playbook.md) when producing an
edit plan. This specializes `editor-story-plan`; it does not replace its evidence
or timing rules. If the task is advice about what to record, return advice without
assembling or rendering a video.

When recommendation output includes `styleProfile`, read its inline `instructions`
and retain its ID with the edit's sidecar notes. See [scoped profiles](../../../reference/style-profiles.md)
for selection and overrides. A selected visual-journal profile makes the person's
own environment, nature, and daily details part of the purpose: briefly keep them
even when unrelated to the narration. Preserve place/time, personality, natural
sound, and breathing room; do not require an explanatory or dramatic payoff from
every detail. Use `editor-scene-building` and `editor-audio-continuity` for those
moments. This preference applies only to the selected edit, not every vlog,
generic story, tutorial, or copy-only task; the current brief takes precedence.

- Describe the thread in one sentence: what the person is trying to do, what
  changes, and where the available footage leaves them. A quiet observation or an
  unfinished goal can be an honest ending. Do not manufacture conflict, emotions,
  success, or a transformation to fit a three-act formula.
- Separate the main thread from side activities. Keep an everyday detour when it
  reveals personality, explains a later event, or offers a useful change of pace.
  Repeated explanations do not automatically deserve equal time.
- Choose the opening from the actual promise and payoff. A preview of a later
  moment is an explicit reorder: retain its meaning and check that it does not
  imply the wrong cause, time, or outcome. Do not make every vlog a teaser montage.
- Preserve reactions, imperfect phrasing, and breathing room when they are part
  of the person's voice. Use `editor-pacing` for justified cuts, not a universal
  rule to remove every pause or reach a particular cuts-per-minute count.
- For multi-day footage, establish the day/order from reliable source context or
  user information. File names and modification times alone are not proof of
  recording chronology. Mark uncertain ordering and avoid pretending separate
  days were one uninterrupted event.
- List missing coverage separately from existing evidence. A suggestion such as
  "record how the study session went" is a future shot, not an observation to
  insert into a plan. Request only shots that would resolve a specific gap.

For example, footage of a stated study goal, an interrupted session, and a later
reflection may support a story about making time to study. Footage of opening a
book alone does not establish studying all night or passing an exam.

Return the proposed thread, source-linked beats, important pauses/context to keep,
and unresolved gaps or optional recording suggestions. Use normal plan fields for
supported edits; keep narrative notes in a sidecar, not extra strict-schema fields.
Respect the requested duration but flag insufficient material instead of padding
or inventing a result. Route an authorized rendered edit to `editor-review`.

## Opening-promise check

Before finalizing the opening, compare its actual first picture/thought with the
proposed title/thumbnail and eventual outcome. Identify output-relative ranges
for the promise, essential context, and payoff, mapped back to source evidence.
Ask what a new viewer would expect from this beginning and whether the video
delivers it. If packaging is not available, mark that comparison unknown rather
than inventing a title. An honest reflection or unresolved goal can be a payoff.
Do not impose a fixed hook deadline, section count, teaser, or retention target.

For an engagement comparison, read [experiment records](../../../reference/engagement.md)
and use `playbook experiment new/check`. Compare one story choice with a
same-footage baseline and record `opening_promise` and `payoff` in each variant's
review. Keep ordinary single-edit notes in the usual sidecar; an experiment is
not mandatory for every vlog. A clearer opening is an editorial hypothesis until
audience evidence exists, not a measured retention improvement.
