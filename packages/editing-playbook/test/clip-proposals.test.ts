// Synthetic retrieval/boundary regressions, not a benchmark of real storytelling or engagement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clipCollectionSchema } from '../src/clip-schema.ts';
import { checkClips, clipToPlan, proposeClips } from '../src/clips.ts';
import type { ClipContext } from '../src/clips.ts';

type Observation = ClipContext['observations'][number];
type Unit = ClipContext['transcripts'][number]['segments'][number];
function observation(id: string, start: number, text: string, end = start + 2): Observation {
  return { id, start, end, observation: text, uncertainty: '', modalities: ['visual'], evidenceIds: ['fixture'] };
}
function context(observations: Observation[] = [], duration = 600, segments: Unit[] = []): ClipContext {
  return { id: 'a'.repeat(64), source: { path: '/synthetic/source.mp4', sha256: 'b'.repeat(64), duration },
    observations, audio: { hasTrack: true, digitalSilence: false },
    transcripts: segments.length ? [{ id: 'words', segments }] : [], inspections: [] };
}
function assertSafe(ctx: ClipContext, result: ReturnType<typeof proposeClips>) {
  assert(clipCollectionSchema.safeParse(result.collection).success);
  for (const checked of checkClips(result.collection, ctx).results) {
    assert.deepEqual(checked.errors, []);
    assert.equal(checked.canCreatePlan, false);
  }
  for (const candidate of result.collection.candidates) {
    assert.equal(candidate.review, null);
    assert.equal(candidate.narrative.payoff.statement, '');
    const alternatives = result.diagnostics?.candidates.find(c => c.candidateId === candidate.id)?.boundaryAlternatives ?? [];
    for (const range of [candidate.range, ...alternatives]) {
      const copy = structuredClone(result.collection);
      copy.candidates = [{ ...candidate, range }];
      assert.deepEqual(checkClips(copy, ctx).results[0].errors, [], JSON.stringify(range));
    }
  }
  if (result.diagnostics) {
    assert(result.diagnostics.anchors.considered <= 512);
    assert(result.diagnostics.windows.evaluated <= result.diagnostics.anchors.considered * 72);
    assert(result.diagnostics.windows.pooled <= 1024);
    for (const hint of result.diagnostics.candidates) {
      assert(hint.reasons.length > 0);
      assert(Object.values(hint.signals).every(Number.isFinite));
      assert(hint.boundaryAlternatives.length <= 3);
    }
  }
}

test('whole-token matching fixes cat/education substring false positives', () => {
  const ctx = context([observation('education', 20, 'A discussion about education'), observation('cat', 200, 'A cat enters the garden')]);
  const brief = { goal: 'cat', count: 1 };
  const balanced = proposeClips(ctx, brief);
  const legacy = proposeClips(ctx, brief, undefined, { strategy: 'legacy' });
  assert.equal(legacy.collection.candidates[0].seed.id, 'education');
  assert.equal(balanced.collection.candidates[0].seed.id, 'cat');
  assert.equal(balanced.diagnostics?.query.status, 'matched');
  assertSafe(ctx, balanced);
});

test('short and Unicode-normalized goal tokens remain searchable', () => {
  const ctx = context([observation('intro', 20, 'An unrelated opening'), observation('ai', 200, 'ＡＩ systems are demonstrated')]);
  const result = proposeClips(ctx, { goal: 'AI', count: 1 });
  assert.deepEqual(result.diagnostics?.query.terms, ['ai']);
  assert.equal(result.collection.candidates[0].seed.id, 'ai');
  assertSafe(ctx, result);
});

test('word segmentation supports a Chinese goal without surrounding spaces', () => {
  const ctx = context([observation('intro', 20, '今天我们去公园散步。'), observation('coffee', 200, '今天学习咖啡冲煮。')]);
  const result = proposeClips(ctx, { goal: '咖啡', count: 1 });
  assert.equal(result.diagnostics?.query.status, 'matched');
  assert.equal(result.collection.candidates[0].seed.id, 'coffee');
  assertSafe(ctx, result);
});

test('source-wide budgeting retains late evidence beyond a crowded 512-anchor prefix', () => {
  const crowded = Array.from({ length: 600 }, (_, i) => observation(`early-${i}`, 10 + i / 100, 'Coffee equipment on the same kitchen counter'));
  const ctx = context([...crowded, observation('middle', 300, 'Coffee roasting changes the beans'), observation('late', 570, 'Coffee tasting reveals the final result')]);
  const brief = { goal: 'coffee', count: 3 };
  const balanced = proposeClips(ctx, brief);
  const legacy = proposeClips(ctx, brief, undefined, { strategy: 'legacy' });
  assert(balanced.collection.candidates.some(c => c.seed.id === 'late'));
  assert(!legacy.collection.candidates.some(c => c.seed.id === 'late'));
  assert.equal(balanced.diagnostics?.anchors.available, 602);
  assertSafe(ctx, balanced);
});

test('multi-window search retains a later query-relevant ending that legacy misses', () => {
  const ctx = context([observation('setup', 40, 'The experiment starts with a practical demonstration', 45),
    observation('ending', 80, 'The result appears and the demonstration concludes', 85)]);
  const brief = { goal: 'experiment result', count: 1, minDuration: 30, maxDuration: 60 };
  const balanced = proposeClips(ctx, brief);
  const legacy = proposeClips(ctx, brief, undefined, { strategy: 'legacy' });
  assert(legacy.collection.candidates[0].range.end < 80);
  const range = balanced.collection.candidates[0].range;
  assert(range.start <= 40 && range.end >= 85);
  assert(range.end - range.start > 30);
  assert.equal(balanced.diagnostics?.candidates[0].signals.queryCoverage, 1);
  assertSafe(ctx, balanced);
});

test('alternative padding recovers a matched interval when outward-only expansion exceeds the budget', () => {
  const ctx = context([observation('event', 30, 'A reveal', 31)], 100,
    [{ start: 0, end: 20, text: 'Introduction.' }, { start: 40, end: 80, text: 'A long uninterrupted statement.' }]);
  const brief = { goal: 'reveal', count: 1, minDuration: 20, maxDuration: 20 };
  const balanced = proposeClips(ctx, brief);
  const legacy = proposeClips(ctx, brief, undefined, { strategy: 'legacy' });
  assert(!legacy.collection.candidates.some(c => c.seed.id === 'event'));
  assert.equal(balanced.collection.candidates[0].seed.id, 'event');
  assert.deepEqual(balanced.collection.candidates[0].range, { start: 20, end: 40 });
  assertSafe(ctx, balanced);
});

test('lexical diversification prefers another relevant topic over a repeated passage', () => {
  const repeated = 'Coffee grinding requires careful adjustment of the grinder setting';
  const ctx = context([observation('grind', 50, repeated), observation('repeat', 400, repeated),
    observation('brew', 250, 'Coffee brewing changes water temperature and extraction balance')]);
  const balanced = proposeClips(ctx, { goal: 'coffee', count: 2 });
  assert.equal(new Set(balanced.collection.candidates.map(c => c.seed.id === 'brew' ? 'brew' : 'grind')).size, 2);
  assertSafe(ctx, balanced);
});

test('generic goals and unmatched queries are explicitly exploratory, not claims of semantic absence', () => {
  const ctx = context([observation('morning', 30, 'Morning light enters the room'), observation('evening', 500, 'The street lights turn on')]);
  const generic = proposeClips(ctx, { goal: 'Find complete moments that stand alone' });
  const unmatched = proposeClips(ctx, { goal: 'volcano' });
  assert.equal(generic.diagnostics?.query.status, 'generic_goal');
  assert.equal(unmatched.diagnostics?.query.status, 'no_lexical_match');
  assert(unmatched.proposed > 0);
  assert.match(unmatched.diagnostics!.candidates[0].reasons[0], /exploration only/);
  assertSafe(ctx, generic); assertSafe(ctx, unmatched);
});

test('empty evidence and evidence that cannot fit the budget have distinct statuses', () => {
  const empty = proposeClips(context(), { goal: 'reveal' });
  assert.equal(empty.status, 'needs_inspection');
  assert.equal(empty.diagnostics?.query.status, 'no_evidence');
  assert.equal(empty.proposed, 0);
  assert.equal(empty.nextInspectionRanges.length, 3);
  const tooLong = proposeClips(context([observation('long', 0, 'A reveal', 80)]), { goal: 'reveal', maxDuration: 60 });
  assert.equal(tooLong.status, 'no_valid_ranges');
  assert.equal(tooLong.diagnostics?.query.status, 'matched');
  assert.equal(tooLong.proposed, 0);
});

test('nested, chained and unsorted transcript overlaps are indivisible', () => {
  const ctx = context([observation('event', 12, 'A reveal', 14)], 100, [
    { start: 19, end: 30, text: 'The conclusion.' }, { start: 5, end: 8, text: 'An overlapping speaker' },
    { start: 0, end: 11, text: 'A beginning' }, { start: 10, end: 20, text: 'A continuation' },
  ]);
  const result = proposeClips(ctx, { goal: 'reveal', count: 1, minDuration: 20, maxDuration: 45 });
  assert.equal(result.proposed, 1);
  assert.equal(result.collection.candidates[0].range.start, 0);
  assert(result.collection.candidates[0].range.end >= 30);
  assertSafe(ctx, result);
});

test('touching transcript units retain their legal shared cut point', () => {
  const ctx = context([observation('event', 22, 'A reveal', 23)], 100, [
    { start: 0, end: 20, text: 'First sentence.' }, { start: 20, end: 40, text: 'Second sentence.' },
  ]);
  const result = proposeClips(ctx, { goal: 'reveal', count: 1, minDuration: 20, maxDuration: 20 });
  assert.deepEqual(result.collection.candidates[0].range, { start: 20, end: 40 });
  assertSafe(ctx, result);
});

test('source edges remain in bounds and ranges respect frame-rounded duration ceilings', () => {
  for (const event of [observation('first', 0, 'A reveal', .5), observation('last', 44, 'A reveal', 44.9)]) {
    const ctx = context([event], 45);
    const result = proposeClips(ctx, { goal: 'reveal', count: 1, minDuration: 10, maxDuration: 10 });
    assert.equal(result.proposed, 1); assertSafe(ctx, result);
  }
  const ctx = context([observation('event', 50, 'A reveal')]);
  const impossible = proposeClips(ctx, { goal: 'reveal', minDuration: 30.005, maxDuration: 30.01 });
  assert.equal(impossible.proposed, 0);
  assert.equal(impossible.status, 'no_valid_ranges');
});

test('proposals are deterministic, independent of observation order, and do not mutate evidence', () => {
  const ctx = context([observation('one', 50, 'Coffee beans are roasted'), observation('two', 250, 'Coffee brewing begins'),
    observation('three', 500, 'Coffee tasting finishes the process')]);
  const snapshot = structuredClone(ctx), brief = { goal: 'coffee' };
  const first = proposeClips(ctx, brief);
  assert.deepEqual(proposeClips(ctx, brief), first);
  assert.deepEqual(ctx, snapshot);
  ctx.observations.reverse();
  assert.deepEqual(proposeClips(ctx, brief), first);
});

test('diagnostics stay outside strict review documents and never authorize a plan', () => {
  const ctx = context([observation('event', 50, 'A reveal')]);
  ctx.observations[0].uncertainty = 'Outcome needs inspection';
  const result = proposeClips(ctx, { goal: 'reveal', count: 1 });
  assert.equal(result.strategy, 'balanced');
  assert.equal(result.externalModelCalls, 0);
  assert.equal(result.collection.schemaVersion, 1);
  assert.equal(clipCollectionSchema.safeParse({ ...result.collection, diagnostics: result.diagnostics }).success, false);
  assert(result.diagnostics!.candidates[0].reasons.some(reason => /uncertainty/.test(reason)));
  assert.throws(() => clipToPlan(result.collection, ctx, 'clip-1'), /needs review/);
  assertSafe(ctx, result);
});

test('legacy stays opt-in and unknown strategies fail explicitly', () => {
  const ctx = context([observation('event', 50, 'A reveal')]);
  const legacy = proposeClips(ctx, { goal: 'reveal' }, undefined, { strategy: 'legacy' });
  assert.equal(legacy.strategy, 'legacy'); assert.equal(legacy.diagnostics, null);
  assert.throws(() => proposeClips(ctx, { goal: 'reveal' }, undefined,
    { strategy: 'unknown' as 'balanced' }), /Unknown clip proposal strategy/);
});

test('malformed source timing is rejected instead of returning invalid hints', () => {
  for (const duration of [0, -1, Infinity, NaN]) assert.throws(() => proposeClips(context([], duration), { goal: 'reveal' }), /duration/);
  assert.throws(() => proposeClips(context([observation('bad', 590, 'A reveal', 610)]), { goal: 'reveal' }), /Evidence ranges/);
});

test('seeded boundary fixtures preserve every known transcript unit and all review gates', () => {
  let state = 20260922;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  for (let run = 0; run < 24; run++) {
    const segments = Array.from({ length: 24 }, (_, i) => {
      const start = i * 12 + random() * 2;
      return { start, end: start + 2 + random() * 15, text: `Synthetic speech unit ${i}.` };
    }).reverse();
    const observations = Array.from({ length: 12 }, (_, i) => observation(`event-${i}`, 5 + i * 25 + random() * 3, `Synthetic reveal ${i}`));
    const ctx = context(observations, 360, segments);
    const result = proposeClips(ctx, { goal: 'reveal', count: 6, minDuration: 10 + run % 7, maxDuration: 50 });
    assert(result.proposed > 0);
    assertSafe(ctx, result);
  }
});
