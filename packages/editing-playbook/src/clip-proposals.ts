import type { ClipBrief, ClipCandidate } from './clip-schema.ts';
import type { ClipContext } from './clips.ts';

type Range = { start: number; end: number };
type Transcript = ClipContext['transcripts'][number];
type Anchor = Range & {
  seed: ClipCandidate['seed']; words: Set<string>; matches: string[]; uncertain: boolean;
};
type Signals = {
  queryCoverage: number; seedCoverage: number; boundaryFit: number;
  paddingFit: number; durationPenalty: number;
};
type Window = Range & { anchor: Anchor; signals: Signals; score: number };
const EPS = 1e-6;
const LIMITS = { anchors: 512, windowsPerAnchor: 72, pool: 1024 } as const;
// English request boilerplate only, not a language-independent topic classifier.
const STOP_WORDS = new Set(('a an and are as at be by can do for from has have i in is it its me of on or our that the their them there these they this to was we were what which who will with you your '
  + 'find select choose create make please show clip clips video videos moment moments highlight highlights interesting best complete standalone stand alone').split(' '));
const segmenter = new Intl.Segmenter('und', { granularity: 'word' });
function words(text: string) {
  return new Set([...segmenter.segment(text.normalize('NFKC').toLowerCase())]
    .filter(part => part.isWordLike && !STOP_WORDS.has(part.segment))
    .map(part => part.segment));
}
const rangeKey = (r: Range) => `${r.start.toFixed(6)}:${r.end.toFixed(6)}`;
const seedKey = (a: Anchor) => `${a.seed.type}:${a.seed.id}`;
function compareAnchors(a: Anchor, b: Anchor) {
  return b.matches.length - a.matches.length || Number(a.uncertain) - Number(b.uncertain)
    || (a.seed.type === b.seed.type ? 0 : a.seed.type === 'observation' ? -1 : 1)
    || a.start - b.start || a.end - b.end || (seedKey(a) < seedKey(b) ? -1 : seedKey(a) > seedKey(b) ? 1 : 0);
}
function lowerBound<T>(items: T[], value: number, key: (item: T) => number) {
  let lo = 0, hi = items.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (key(items[mid]) < value) lo = mid + 1; else hi = mid; }
  return lo;
}
function mergeSpeech(units: Range[]) {
  const merged: Range[] = [];
  for (const unit of [...units].sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = merged.at(-1);
    // Touching units retain their shared, legal cut point. Overlaps are indivisible.
    if (last && unit.start < last.end - EPS) last.end = Math.max(last.end, unit.end);
    else merged.push({ start: unit.start, end: unit.end });
  }
  return merged;
}
function cutTools(transcript: Transcript | undefined, duration: number) {
  const units = [...(transcript?.segments ?? [])].sort((a, b) => a.start - b.start || a.end - b.end);
  const speech = mergeSpeech(units);
  const starts = [...new Set([0, ...units.map(s => s.start)])].sort((a, b) => a - b);
  const ends = [...new Set([...units.map(s => s.end), duration])].sort((a, b) => a - b);
  const sentenceEnds = units.filter(s => /[.!?。！？][\s"'”’」』)]*$/u.test(s.text)).map(s => s.end).sort((a, b) => a - b);
  const inside = (time: number) => {
    const index = lowerBound(speech, time, s => s.start) - 1;
    const unit = speech[index];
    return unit && time > unit.start + EPS && time < unit.end - EPS ? unit : undefined;
  };
  const before = (time: number) => inside(time)?.start ?? time;
  const after = (time: number) => inside(time)?.end ?? time;
  const near = (time: number, points: number[], distance: number) => {
    const i = lowerBound(points, time, t => t);
    return [points[i - 1], points[i]].filter((t): t is number => t !== undefined && Math.abs(t - time) <= distance + EPS)
      .sort((a, b) => Math.abs(a - time) - Math.abs(b - time) || a - b)[0] ?? time;
  };
  const matches = (time: number, points: number[]) => Math.abs(near(time, points, EPS) - time) <= EPS
    && (points[lowerBound(points, time - EPS, t => t)] ?? Infinity) <= time + EPS;
  return { before, after, inside,
    nearStart: (t: number, d: number) => near(t, starts, d),
    nearEnd: (t: number, d: number) => near(t, ends, d),
    fit: (r: Range) => ((r.start <= EPS ? 1 : matches(r.start, starts) ? .5 : 0)
      + (r.end >= duration - EPS || matches(r.end, sentenceEnds) ? 1 : matches(r.end, ends) ? .5 : 0)) / 2,
  };
}

function balancedAnchors(anchors: Anchor[], duration: number) {
  const ranked = [...anchors].sort(compareAnchors);
  if (ranked.length <= LIMITS.anchors) return ranked;
  // Reserve half the work budget for source-wide exploration, not just dense early evidence.
  const chosen = ranked.slice(0, LIMITS.anchors / 2), seen = new Set(chosen.map(seedKey));
  const buckets: Anchor[][] = Array.from({ length: 32 }, () => []);
  for (const anchor of ranked) buckets[Math.min(31, Math.floor(anchor.start / duration * 32))].push(anchor);
  for (let depth = 0; chosen.length < LIMITS.anchors; depth++) {
    let found = false;
    for (const bucket of buckets) {
      const anchor = bucket[depth];
      if (!anchor) continue;
      found = true;
      if (!seen.has(seedKey(anchor))) { chosen.push(anchor); seen.add(seedKey(anchor)); }
      if (chosen.length === LIMITS.anchors) break;
    }
    if (!found) break;
  }
  return chosen.sort(compareAnchors);
}

function windowsFor(anchor: Anchor, brief: ClipBrief, duration: number,
  cuts: ReturnType<typeof cutTools>, all: Anchor[]) {
  const pad = Math.min(brief.contextSeconds, brief.minDuration / 4);
  const raw: Range[] = [];
  for (const target of [...new Set([brief.minDuration, (brief.minDuration + brief.maxDuration) / 2, brief.maxDuration])]) {
    for (const initial of [anchor.start - pad, (anchor.start + anchor.end - target) / 2]) {
      const start = Math.max(0, Math.min(initial, duration - target));
      raw.push({ start, end: Math.min(duration, Math.max(anchor.end, start + target)) });
    }
  }
  raw.push({ start: Math.max(0, anchor.end - brief.minDuration), end: anchor.end });
  // Nearby evidence with another query term can supply a useful endpoint beyond a fixed window.
  const neighbors: Anchor[] = [];
  for (let i = lowerBound(all, Math.max(0, anchor.start - brief.maxDuration), a => a.start);
    i < all.length && all[i].start <= anchor.end + brief.maxDuration; i++) {
    const other = all[i];
    if (other.matches.some(term => !anchor.matches.includes(term))) neighbors.push(other);
  }
  for (const other of neighbors.sort((a, b) => Math.abs(a.start - anchor.start) - Math.abs(b.start - anchor.start)
    || compareAnchors(a, b)).slice(0, 2)) {
    raw.push({ start: Math.max(0, Math.min(anchor.start, other.start) - pad), end: Math.max(anchor.end, other.end) });
  }
  const result = new Map<string, Range>();
  const add = (r: Range) => {
    if (result.size >= LIMITS.windowsPerAnchor || r.start < 0 || r.end > duration + EPS
      || r.start > anchor.start + EPS || r.end < anchor.end - EPS || cuts.inside(r.start) || cuts.inside(r.end)
      || r.end - r.start < brief.minDuration - EPS || Math.ceil((r.end - r.start) * 30 - EPS) / 30 > brief.maxDuration + EPS) return;
    result.set(rangeKey(r), r);
  };
  for (const range of raw) {
    const alternatives = [range, { start: cuts.nearStart(range.start, brief.contextSeconds), end: cuts.nearEnd(range.end, brief.contextSeconds) }];
    for (const variant of alternatives) {
      for (const start of new Set([cuts.before(variant.start), cuts.after(variant.start)])) {
        for (const end of new Set([cuts.before(variant.end), cuts.after(variant.end)])) {
          if (start > anchor.start + EPS || end < anchor.end - EPS) continue;
          if (end - start < brief.minDuration - EPS) {
            add({ start: cuts.before(Math.max(0, end - brief.minDuration)), end });
            add({ start, end: cuts.after(Math.min(duration, start + brief.minDuration)) });
          } else add({ start, end });
        }
      }
    }
  }
  return [...result.values()];
}
function coverage(range: Range, all: Anchor[], terms: string[]) {
  if (!terms.length) return 0;
  const matched = new Set<string>();
  for (let i = lowerBound(all, range.start - EPS, a => a.start); i < all.length && all[i].start <= range.end + EPS; i++) {
    if (all[i].end <= range.end + EPS) for (const term of all[i].matches) matched.add(term);
    if (matched.size === terms.length) break;
  }
  return matched.size / terms.length;
}
function similarity(a: Set<string>, b: Set<string>) {
  if (Math.min(a.size, b.size) < 3) return 0; // A shared short label does not establish repetition.
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  return intersection / (a.size + b.size - intersection);
}
function overlap(a: Range, b: Range) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start)) / Math.min(a.end - a.start, b.end - b.start);
}
function compareWindows(a: Window, b: Window) {
  return b.score - a.score || compareAnchors(a.anchor, b.anchor) || a.start - b.start || a.end - b.end;
}

/** Deterministic retrieval/boundary heuristics, not semantic understanding or approval. */
export function balancedClipRanges(context: ClipContext, brief: ClipBrief, transcript: Transcript | undefined) {
  const duration = context.source.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Source duration must be finite and positive');
  const terms = [...words(brief.goal)];
  const make = (seed: Anchor['seed'], range: Range, text: string, uncertain = false): Anchor => {
    const tokens = words(text);
    return { ...range, seed, words: tokens, matches: terms.filter(term => tokens.has(term)), uncertain };
  };
  const all = [
    ...context.observations.map(o => make({ type: 'observation', id: o.id }, { start: o.start, end: o.end }, o.observation, !!o.uncertainty.trim())),
    ...(transcript?.segments.map((s, i) => make({ type: 'transcript', id: `${transcript.id}:${i}` }, { start: s.start, end: s.end }, s.text)) ?? []),
  ].sort((a, b) => a.start - b.start || compareAnchors(a, b));
  if (all.some(a => !Number.isFinite(a.start) || !Number.isFinite(a.end) || a.start < 0 || a.end <= a.start || a.end > duration + EPS)) {
    throw new Error('Evidence ranges must be finite, positive and inside the source');
  }
  const hasMatch = all.some(a => a.matches.length);
  const queryStatus = !all.length ? 'no_evidence' : !terms.length ? 'generic_goal' : hasMatch ? 'matched' : 'no_lexical_match';
  const anchors = balancedAnchors(all.filter(a => a.end - a.start <= brief.maxDuration + EPS && (!hasMatch || a.matches.length)), duration);
  const cuts = cutTools(transcript, duration);
  const alternatives = new Map<string, Window[]>(), pool = new Map<string, Window>();
  let evaluated = 0;
  for (const anchor of anchors) {
    const ranges = windowsFor(anchor, brief, duration, cuts, all);
    evaluated += ranges.length;
    const ranked = ranges.map(range => {
      const pad = Math.min(brief.contextSeconds, brief.minDuration / 4);
      const signals: Signals = {
        queryCoverage: coverage(range, all, terms), seedCoverage: terms.length ? anchor.matches.length / terms.length : 0,
        boundaryFit: cuts.fit(range),
        paddingFit: (Math.min(pad, anchor.start - range.start) + Math.min(pad, range.end - anchor.end)) / (2 * pad),
        durationPenalty: (range.end - range.start - brief.minDuration) / Math.max(1, brief.maxDuration - brief.minDuration),
      };
      // Explicit heuristic weights, not probabilities or predictions of audience engagement.
      const score = 4 * signals.queryCoverage + signals.seedCoverage + .3 * signals.boundaryFit
        + .15 * signals.paddingFit - .2 * signals.durationPenalty;
      return { ...range, anchor, signals, score };
    }).sort(compareWindows);
    alternatives.set(seedKey(anchor), ranked.slice(0, 4));
    for (const candidate of ranked.slice(0, 2)) {
      const key = rangeKey(candidate), existing = pool.get(key);
      if (!existing || compareWindows(candidate, existing) < 0) pool.set(key, candidate);
    }
  }
  const selected: { window: Window; redundancy: number; temporalNovelty: number }[] = [];
  while (selected.length < brief.count) {
    let best: (typeof selected)[number] | undefined, bestScore = -Infinity;
    for (const window of pool.values()) {
      if (selected.some(s => overlap(s.window, window) >= .5)) continue;
      const redundancy = Math.max(0, ...selected.map(s => similarity(s.window.anchor.words, window.anchor.words)));
      const temporalNovelty = selected.length ? Math.min(...selected.map(s => Math.abs(
        (s.window.start + s.window.end - window.start - window.end) / (2 * duration)))) : 0;
      const score = window.score - .75 * redundancy + .4 * temporalNovelty;
      if (score > bestScore + EPS || Math.abs(score - bestScore) <= EPS && best && compareWindows(window, best.window) < 0) {
        best = { window, redundancy, temporalNovelty }; bestScore = score;
      }
    }
    if (!best) break;
    selected.push(best);
  }
  return {
    ranges: selected.map(({ window }) => ({ range: { start: window.start, end: window.end }, seed: window.anchor.seed })),
    diagnostics: {
      query: { terms, status: queryStatus }, anchors: { available: all.length, considered: anchors.length },
      windows: { evaluated, pooled: pool.size }, limits: { ...LIMITS },
      candidates: selected.map(({ window, redundancy, temporalNovelty }, i) => ({
        candidateId: `clip-${i + 1}`, signals: { ...window.signals, redundancy, temporalNovelty },
        reasons: [
          queryStatus === 'matched' ? 'Ranked by exact goal-token coverage in retained evidence.'
            : queryStatus === 'generic_goal' ? 'Generic goal: exploring source-linked evidence across the timeline.'
              : 'No lexical goal match: exploration only, not evidence that the requested moment is absent.',
          'Known transcript units and the seed are retained; timing and narrative completeness still require review.',
          ...(window.anchor.uncertain ? ['The seed observation records uncertainty; resolve it before approval.'] : []),
          ...(redundancy > .5 ? ['Similar wording appears in another selection; check for editorial repetition.'] : []),
        ],
        boundaryAlternatives: (alternatives.get(seedKey(window.anchor)) ?? []).filter(r => rangeKey(r) !== rangeKey(window))
          .slice(0, 3).map(r => ({ start: r.start, end: r.end })),
      })),
    },
  };
}
