---
name: editor-motion-recipes
description: Turn a reviewed motion reference into a reusable native editor pattern, or remix existing patterns with new content, timing and layout. Use for reusable motion skills, counter reveals and combinations of native presets.
---

# Build reusable motion, then remix it

Read the [recipe and mixing contract](../../../reference/motion-recipes.md).
Use the existing Moments catalog as the executable library. This skill supplies
the agent's decisions; native components and validated recipe settings supply
the editable result.

## Reuse or mix an existing pattern

Search `playbook motion catalog`, then read the chosen entry's guide and example.
For a counter, echo or clipped numeral reveal, read
[CounterReveal](../../../reference/jsx/counter-reveal.md).
Start from its parameter contract rather than copying a rendered study's layers.

Keep content, motion and appearance separate: supplied values and wording;
step/reveal/hold timing; font metrics and colors; placement in the scene.
Preserve the reference when recreation is requested. Change those choices
deliberately when the brief asks for a remix. A counter is a presentation of
supplied values, not an inference about missing data.

Use `playbook motion mix-example` and `mix` for the catalog's supported
transparent components. Array order determines stacking. Give every instance
its own key, box and lifetime, including repeated uses of the same preset.
Share typography and palette across parts, reserve reading and source-label
space, and choose one dominant change per beat. A sequence plays scenes in
order; a mix combines parts on the same canvas. Compose other native components
directly in JSX when the bounded mix contract does not support the needed part.

Render the actual composition. Inspect entrances, counter changes, the settled
hold and exits at delivery size; inspect phone output at phone size. Check
direct/reverse seeks and native editability. Use `editor-review` for the exact
export and retain the recipe that produced it. Technical validation establishes
the contract, while inspected output establishes the visual result.

## Generalize an approved reference into another pattern

Reuse its inspected evidence and approval scope through
[editor-reference-learning](../editor-reference-learning/SKILL.md). Record the
transferable behavior and remaining approximation: for example fixed numeral
cells, an echo layer and a bounded reveal. The source's particular words,
artwork and exact typeface are separate from that behavior.

Add the smallest original native component that expresses the behavior, with
editable content, explicit clocks, a transparent composition boundary and
parameter limits. Register it in the shared Moments catalog with strict content
settings, a runnable example and a focused guide. Declare mix support only when
the component works inside an authored box without a full-scene wrapper.

Test different content, durations and supported formats, including a remix with
an existing component. Retain actual export and seek evidence, provenance and
known limits. Keep reference media outside the reusable library unless it is
explicitly supplied and suitable for redistribution. Treat a tested pattern as
one reusable option; the user's current brief determines where it belongs.
