# Long-form to short clips: research and integration proposal

Reviewed September 5, 2026. **Research snapshot.** The agent-directed candidate,
review and source-mapping layer is now implemented; see [clipping commands](clips.md).
Automatic semantic highlight detection, captions and vertical tracking remain
proposed future work. The comparison below records the research that informed it.

## Recommendation

Build a native **agent-directed clip planner** on this editor's existing evidence
pipeline and prepared-delivery workflow. Keep the calling agent as the editorial
decision-maker. Borrow transcript segmentation from ClipsAI, story decomposition
from HIVE, and shot-aware camera movement from AutoFlip. Do not add a mandatory
second cloud model, a hosted clipping service, or model training to the core.

For a vlog, the objective is a complete, understandable moment: enough setup,
an interesting action or reveal, and a satisfying ending. Finding the loudest
sentence or a visually busy shot is not the same problem. This is our design
inference from the different tasks evaluated below, not a proven universal winner.

Exa research covered three workstreams: practical implementations, reframing,
and narrative/evaluation research. Eight searches returned 46 result slots with
43 distinct URL strings, including duplicate papers/repositories under different
URLs. Follow-up reading covered 14 primary clipping pages for eight selected
systems/studies, prioritizing methods and limitations. This is a focused review,
not an exhaustive systematic review. No third-party system was installed or
benchmarked on the user's vlog; search rank, stars and vendor claims were not
treated as quality evidence.

## Practical systems

| System | What its documented implementation provides | Fit for this editor | Main limitation |
| --- | --- | --- | --- |
| [ClipsAI](https://github.com/clipsai/clipsai) | Python clip finder using transcription, plus a separate speaker-oriented resizer | Best baseline for speech-led candidate boundaries; possible optional adapter | Topic coherence alone does not establish visual completeness or a standalone payoff |
| [FunClip](https://github.com/modelscope/FunClip) | Local FunASR transcription, text/speaker selection, multi-segment clipping, subtitles; optional LLM-assisted clipping | Good reference for precise transcript-driven selection and user correction | A transcript-led workflow does not by itself understand a silent visual event; optional LLM paths need separate configuration |
| [AutoFlip](https://research.google/blog/autoflip-an-open-source-framework-for-intelligent-video-reframing/) | Shot-aware salient-region detection and smooth reframing | Good architectural reference for a later vertical-framing stage | Reframes rather than chooses the story; the legacy implementation is unsupported |

ClipsAI's documented ClipFinder uses TextTiling with BERT embeddings to detect
topic shifts at sentence granularity. That is a useful candidate generator, not
a calibrated engagement predictor. Its repository uses WhisperX for transcription
and describes Pyannote access for speaker-aware resizing. Local execution still
involves model installation/access and compute; it is not dependency-free.
[ClipFinder documentation](https://www.clipsai.com/references/clip),
[ClipsAI repository](https://github.com/clipsai/clipsai)

FunClip's text/speaker selection and per-clip subtitles are useful interaction
patterns. It documents English and other model options, so older descriptions
calling it Chinese-only are too narrow. Model timestamp granularity varies: a
segment-level transcript should not be treated as precise word alignment. Its
LLM-assisted path is optional and should not silently replace our agent default.
[FunClip documentation](https://github.com/modelscope/FunClip)

AutoFlip separates shot boundaries, salient regions and camera-path optimization;
its design allows stationary, panning and tracking behavior, with padding when
important regions cannot fit. The official legacy documentation says support
ended March 1, 2023. Borrow those principles rather than making that old executable
a new core dependency. A modern detector/backend would need its own maintenance,
model-license and Windows feasibility check before installation.
[Google's system description](https://research.google/blog/autoflip-an-open-source-framework-for-intelligent-video-reframing/),
[legacy support notice](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/autoflip.md)

**Practical choice:** our native planner, with ClipsAI as a speech-oriented
comparison baseline. FunClip is more relevant if transcript correction becomes
the main interface. AutoFlip is a reframing reference, not an alternative to
narrative selection. No maintained, tested, one-package winner for this exact
agent-operated vlog workflow was established by this review.

## Academic review: what transfers and what does not

### HIVE — separate story selection from boundary decisions

“From Long Videos to Engaging Clips: A Human-Inspired Video Editing Framework
with Multimodal Narrative Understanding,” EMNLP Industry 2025, combines visual
and dialogue information, then separates highlight detection, opening/ending
selection and irrelevant-content pruning. Its DramaAD benchmark includes over
2,500 short-drama episodes and 500 professionally edited advertisement clips.
[Paper and proceedings record](https://aclanthology.org/2025.emnlp-industry.185/)

**Transfer:** make the agent first identify the promising moment, then choose
the necessary beginning and end, then remove only genuinely unnecessary material.
Evidence requests can expand around a candidate rather than repeatedly analyzing
the entire video. These are useful software stages even without reproducing the
paper's model stack.

**Limit:** drama/advertisement results do not establish improvement on casual
vlogs, screen tutorials or real audience retention. We should test the decomposition
locally rather than repeat its reported gains as our expected gains.

### REGen — keep generated structure attached to original evidence

“REGen: Multimodal Retrieval-Embedded Generation for Long-to-Short Video Editing”
uses a hybrid generated script with retrieval of original-video quotes, plus
synthetic narration, for documentary teasers. The project presents the work at
NeurIPS 2025. [Paper](https://arxiv.org/abs/2505.18880),
[official project](https://wx83.github.io/REGen/)

**Transfer:** every proposed story beat or retained quote should link to the exact
original source interval. Retrieval should support the plan, not merely produce a
plausible summary detached from usable footage.

**Limit:** teaser construction with generated narration is materially different
from preserving a creator's original speech. Our default should keep the original
voice and footage. AI voice, rewritten speech and training additional models are
not implied by adopting evidence-linked planning.

### Lotus — expose different kinds of short, and preserve user control

Lotus combines extractive editing (retaining original segments) with abstractive
editing (creating condensed narration). Its IUI 2025 work includes a user study
of eight participants and a results evaluation where preferences differed by video
type. [Paper](https://doi.org/10.1145/3708359.3712090),
[accessible manuscript](https://arxiv.org/abs/2502.07096)

**Transfer:** present distinct choices: an original moment, a multi-cut mini-story,
or a teaser. Let the creator refine the selection and boundary decisions rather
than accepting a single unexplained output.

**Limit:** a small usability study is not evidence of platform-wide performance.
Its mixed generated/original format does not justify enabling synthetic speech
by default. Treat user control as an interface lesson, not a measured retention gain.

### QVHighlights / Moment-DETR — evaluate whether the right moment was found

QVHighlights, NeurIPS 2021, pairs over 10,000 videos with natural-language queries,
relevant temporal moments and saliency annotations for two-second clips. Its
Moment-DETR baseline predicts time intervals and saliency from video/query
representations. [Paper](https://arxiv.org/abs/2107.09609),
[official code](https://github.com/jayleicn/moment_detr)

**Transfer:** support a clear query such as “find the reveal and reaction,” and
evaluate candidate coverage separately from the final edit. Multiple nonadjacent
moments can answer one query.

**Limit:** retrieval overlap and saliency are not measures of intact sentences,
good framing, story coherence or real-world engagement. A learned retriever is an
optional later addition if the existing dossier/transcript/agent workflow misses
important candidates; it is not required for the first version.

### MEDit-Bench — editorial intent matters; automated judging can mislead

The MEDit-Bench preprint pairs 60 videos with 540 professional edits across
multiple requested messages and editors. It reports position bias in LLM-based
preference judging and a gap between model and human editing at stricter temporal
criteria. [Manuscript](https://arxiv.org/html/2607.25300)

**Transfer:** record the intended message before choosing clips; accept that several
different edits may be legitimate. Compare outputs in shuffled/blinded order, with
human judgment and concrete failure categories instead of trusting a single
LLM-generated quality score.

**Important limit:** annotators were told to ignore audio and make visually driven,
cut-only summaries. Shot order and rationales are released but not used by that
benchmark. It therefore does not validate dialogue safety, complete audiovisual
storytelling, or retention predictions. Treat it as a preprint, not conclusive
evidence for production quality.

## Proposed integration with our existing pipeline

The following stages and names are design proposals, not available CLI commands.

1. **Bind the long-form input.** Start with `media understand` and source-aligned
   evidence. If clipping an edited export, inspect that exact export and link it
   to the delivery manifest when available. Preserve both output-time and original
   source-time mappings. An edited 13-minute timeline is not the same clock as its
   source recordings. Mark source mapping unavailable for arbitrary exports instead
   of guessing it.
2. **Propose candidates with context.** Combine transcript sentence/topic boundaries,
   scene changes and agent observations. Include lead-in and follow-through evidence,
   not just the apparent peak. Unknown speech cannot be assumed silent; nonverbal
   events must remain eligible. Reuse cached evidence before extracting more.
3. **Review narrative completeness.** The agent states the clip's promise, necessary
   setup, central action/reveal, ending, and reason it stands alone. Distinguish a
   complete original moment from a deliberate teaser. Record uncertainty or reject
   weak candidates. Avoid unsupported “viral scores.”
4. **Protect boundaries and meaning.** Preserve complete known speech/action units,
   names/referents needed for comprehension, and the visible result of the action.
   Use source-linked protected ranges and re-inspect uncertain cuts. Deduplicate
   candidates that merely repeat the same moment.
5. **Choose framing after selection.** For vertical output, protect the actual
   subject: sometimes a face, sometimes hands, an object or screen text. Smooth
   movement within shots and reset intentionally across cuts. Fall back to full
   picture with padding when a safe crop cannot preserve the important content.
6. **Prepare editable delivery.** Convert an approved candidate into the existing
   plan. Cut-only/contain output can already use `playbook prepare` and `deliver`.
   Later caption/crop tracks must be explicit composition features with suitable
   tests. Store metadata titles separately from visible text. Retain source/time
   provenance and the decision rationale beside each candidate.
7. **Check and review the actual short.** Reuse technical export checks, then inspect
   meaning, ending, crop/readability, speech and A/V sync. Require approval for
   publishing; preserve the earlier long-form edit and all originals.

The candidate record should include source/export hashes, evidence IDs, retained
intervals, source-to-output mapping, intended message, mode, setup/payoff rationale,
protected ranges, framing requirements, uncertainties and review status. A record
is a proposal until evidence and boundaries have been reviewed; serializing it
does not certify its truth.

Recommended initial product defaults: **three candidate original-moment clips,
roughly 30–90 seconds when the content supports it**, original speech, no generated
voice, no added music, and no forced crop. These are configurable creative defaults,
not claims about any platform's maximum allowed duration. A coherent shorter or
longer moment should not be padded or damaged to hit an arbitrary target.

Local ASR/detection can be optional adapters; installed models consume local compute
and may require a download. The planner must declare missing capabilities. Keeping
another cloud model out of the pipeline does not give a text-only caller sight or
hearing, and the calling agent's own service still has its normal usage limits.

## How we should test whether it is better

Start small with authorized samples from a vlog, a speech-led video and a screen
tutorial. Compare a simple sentence/topic baseline against multimodal planning;
use ClipsAI as an optional real baseline only after dependency/model review and
installation approval. Keep the same source, goal and approximate duration budget.

For each candidate record:

- Does it make sense without the long video? Does the stated promise pay off?
- Did the edit change meaning, interrupt a word/action, or omit necessary context?
- Can viewers see the important subject, hands, result or text at delivery size?
- Are the picture and original sound correctly aligned through every cut?
- How many candidates are duplicates, rejected, or require manual repair?
- What were elapsed time, local compute, extraction volume and actual provider use?

First compare selection with framing held fixed, then compare framing with selection
held fixed. Shuffle A/B order and collect the user's reasons, not just a preference
number. A tiny trial is a usability check, not statistical proof. Only later,
with explicit publication/analytics access, could actual audience performance be
evaluated; even then topic and audience differences are confounders.

## Shipped now versus next

**Implemented this turn:** project-safe decoder caches; source-bound edit bundles;
new-project actual-editor rendering; technical picture/audio verification;
chapter metadata independent of visible titles; synthetic regressions.

**Next implementation:** candidate proposal/review records and source-to-edited-time
mapping for long-form clipping. Then optional transcript adapters, captions and
shot-aware vertical reframing. No new cloud model is necessary for agent-authored
selection. The promising research informs the structure; it does not remove the
need to inspect the footage and review each actual result.
