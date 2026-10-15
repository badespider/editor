# Course IT Style 1

User-approved on 2026-10-12. This saves the look of the USB animated explanation
as a reusable teaching style, not as a requirement to repeat the same hardware
scene in every lesson.

The authoritative teaching/motion guidance is
[the style skill](../../.agents/skills/course-it-style-1/SKILL.md); exact design
tokens and capability limits are in [style.json](style.json). Agents can retrieve
the skill through `node apps/cli/dist/index.js playbook skill course-it-style-1`
or its versioned catalog entry through
`node apps/cli/dist/index.js playbook creative show course-it-style-1@1`
from the editor checkout. This is a creative-library entry, not a native
`playbook motion catalog` recipe or a change to vlog defaults.

## Saved example

`approved-example/build.mjs` preserves the approved USB implementation unchanged.
`approved-example/contact-sheet.jpg` preserves the inspected 16-frame overview.
The example's font and runtime are under `approved-example/assets`; preserve
Geist's OFL file and the GSAP license header/terms. These are editable authoring
resources, not a new all-topics template. The example still contains its USB
wording, hardware geometry, timeline and original-source clock provenance.

Private narration, webcam footage, model credentials, caches and exports are
excluded. Consequently this archived generator is **not a self-contained audio
demo**: it expects `assets/usb-lesson-voice.wav` when run. Do not create dummy audio
or execute it in place just to satisfy that dependency. For a new production,
copy/adapt the authoring source into a separate project, replace the topic and
geometry, bind the authorized new audio and actual timing, and update evidence
fields. The 121.4-second duration and voice provenance belong only to this USB
example. The original local lesson/preview remains unchanged.

The approved sample passed the final browser check and native-preview checks
(16 sampled times, reverse seeking and two painted-flow tests). No direct
listening, continuous viewing or final MP4 review was claimed. Saving the style
does not extend those checks to new content; check and review each adaptation.
