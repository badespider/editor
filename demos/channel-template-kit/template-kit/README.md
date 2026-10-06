# Five ways, one brand

Five editable Remotion cutaway templates for the new channel, plus a 39-second
silent sampler. These are draft design options, not five compulsory scenes for
every episode. The earlier `One-Useful-Task` demo remains unchanged.

## Preview

From `demos/channel-template-kit`, run `npm ci`, then `npm run studio`.
Open the localhost URL printed by Studio.

- Sampler composition: `Five-Ways-One-Brand`
- Contact sheet composition: `Template-Overview`
- Each template has its own composition under **Five-Templates**.

| Template | Sampler | Best use | Motion / rhythm |
| --- | --- | --- | --- |
| Paper Notes | 0–8 seconds | Personal example, constraint, one practical lesson | Taped paper lands; context appears; marker and arrow point to the action |
| Bold Type | 8–15 seconds | Hook, misconception, turning point | Assumption enters; strike; reframe lifts into view; hold |
| Blueprint | 15–23 seconds | Three-step explanation or feedback loop | One node and connection at a time; check; return path |
| Side-by-Side | 23–31 seconds | Baseline vs alternative | Baseline remains visible as the alternative enters; aligned comparison fields |
| Focus Demo | 31–39 seconds | Screen walkthrough / evidence detail | Screen establishes context; surroundings dim; target is framed; context returns |

## Reuse and boundaries

All five export `Interactive.withSchema` components. Headline/content props,
section labels and each scene's timing are editable. `sectionLabel=""` hides the
demo name; a chapter label can replace it. The comparison exposes the two field
labels. Focus Demo accepts an image asset (a path relative to `public/` or a
permitted URL) and a focus rectangle in composition pixels. With a real screenshot supplied, the invented UI and animated demo
cursor are removed. It does not fabricate an interaction on an actual image.

The design canvas is **1920 × 1080, 30 fps**. Default durations are 7–8 seconds.
Changing duration alone changes the hold, not all internal cue times. Retiming
for real narration requires moving the scene's keyframes. Prefer short copy:
headlines roughly 12–27 characters, diagram labels 16, comparison values two
lines. The conservative font fitting is not an unlimited text-layout engine.

These are long-form cutaways. They are **not vertical layouts** and should not
be center-cropped into Shorts. They also do not replace presenter footage or
prove that actual AI-generated results were obtained. The paper example,
comparison and demo interface are labelled illustrative.

For episode variety, choose a dominant treatment and one or two supporting
treatments based on the script. Leave quiet presenter/evidence stretches
between them. Repeating the same five-scene order would defeat the purpose.

These files are reusable local source components; they have not been promoted
to the editor's approved motion catalog or changed its production defaults.
No voice, music, paid services, downloaded reference assets, or MP4 export were
used for this preview.

## Inspiration and original work

- [Remotion Elements](https://www.remotion.dev/elements): modular building blocks,
  including paper, split screens and text markers.
- [News Article Highlight](https://www.remotion.dev/elements/text/news-article-highlight/):
  idea of establishing a readable document, then isolating the relevant detail.
- [Ordinary Folk's process](https://www.ordinaryfolk.co/process): message and design
  decisions before animation; motion supporting the story. This was a written
  process reference, not a frame-by-frame study of their portfolio.

The graphics and animation source here were authored for this demo. No third-party
code, images, video, or branding was copied from those pages. The common palette
and typography come from the user's channel brief: navy, white, cyan, Arial
regular/bold. The Remotion skills informed separate editable scene components,
source-visible timing, frame-driven animation and Studio-first review.

## Checks

`npm run check` type-checks the entry point and imported components.
Local validation covered entries, mid-build states and holds across all five styles,
plus changed topic text and an alternate screenshot. Rendered evidence is intentionally
not committed. Rendering and inspection are technical checks, not design approval.
