import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { adaptMotion, generateMotionRecipe, motionDigest, reviewMotion, motionSettingsSchema } from '../src/motion.ts';
import { motionComposition, motionRuntime } from '../src/motion-composition.ts';
import { motionFixture } from './motion-fixture.ts';

test('recipe derives phase durations and relative motion, keeps original attribution and uncertainty', () => {
  const { recipe, breakdown } = motionFixture();
  assert.equal(recipe.settings.entrySeconds, .2);
  assert.ok(Math.abs(recipe.settings.exitSeconds - 5 / 30) < 1e-8);
  assert.ok(Math.abs(recipe.settings.entry.dy - .02) < 1e-8);
  assert.equal(recipe.reference.breakdownSha256, motionDigest(breakdown));
  assert.equal(recipe.status, 'candidate');
});
test('partial inspection and wrong reference binding cannot become a recipe', () => {
  const { manifest, breakdown, intent } = motionFixture();
  breakdown.inspectedFrames.splice(20, 1);
  assert.throws(() => generateMotionRecipe(manifest, breakdown, intent), /every frame/);
  breakdown.sequenceSha256 = 'b'.repeat(64);
  assert.throws(() => generateMotionRecipe(manifest, breakdown, intent), /different frame sequence/);
});
test('phase names must identify supported nonoverlapping intervals', () => {
  const { manifest, breakdown, intent } = motionFixture();
  assert.throws(() => generateMotionRecipe(manifest, breakdown, { ...intent, entryPhase: 'absent' }), /unique/);
  breakdown.elements[0].phases[1].startFrame = 5;
  assert.throws(() => generateMotionRecipe(manifest, breakdown, intent), /follow entry/);
});
test('unsupported intermediate motion is rejected rather than silently flattened', () => {
  const { manifest, breakdown, intent } = motionFixture();
  breakdown.elements[0].keyframes.splice(1, 0, { frame: 3, x: .5, y: .7, opacity: .5, note: 'Overshoot' });
  assert.throws(() => generateMotionRecipe(manifest, breakdown, intent), /endpoint motion only/);
});
test('adaptation preserves caption words and source-clock mapping', () => {
  const { recipe, input } = motionFixture(), a = adaptMotion(recipe, input);
  assert.ok(Math.abs(a.cards[0].start - .2) < 1e-8);
  assert.equal(a.cards[0].lines.join(' '), input.captions.cues[0].text);
  assert.equal(a.renderer, 'native'); assert.equal(a.safeToAutoPublish, false);
  assert.ok(a.warnings.some(w => w.includes('unverified')));
});
test('captions cannot silently cross cuts, overlap, duplicate IDs or bind a different source', () => {
  for (const change of ['start', 'end', 'duplicate', 'hash']) {
    const { recipe, input } = motionFixture();
    if (change === 'start') input.captions.cues[0].start = 9.9;
    if (change === 'end') input.captions.cues[0].end = 12.2;
    if (change === 'duplicate') input.captions.cues.push({ ...input.captions.cues[0] });
    if (change === 'hash') input.captions.sourceSha256 = 'b'.repeat(64);
    assert.throws(() => adaptMotion(recipe, input));
  }
});
test('short cues compress animation but preserve minimum hold and text', () => {
  const { recipe, input } = motionFixture(); input.captions.cues[0].end = 10.7;
  recipe.settings.entrySeconds = .5; recipe.settings.exitSeconds = .5;
  const a = adaptMotion(recipe, input), c = a.cards[0];
  assert.ok(c.entrySeconds < .5);
  assert.ok(c.end - c.start - c.entrySeconds - c.exitSeconds - c.staggerSeconds * (c.lines.length - 1) >= recipe.settings.minHoldSeconds - 1e-8);
  assert.ok(a.warnings.some(w => w.includes('reading rate')));
});
test('impossible text and timings fail rather than drop words or invent speech alignment', () => {
  const { recipe, input } = motionFixture();
  input.captions.cues[0].text = 'x'.repeat(300);
  assert.throws(() => adaptMotion(recipe, input), /cannot fit/);
  input.captions.cues[0].text = 'Hi'; input.captions.cues[0].end = 10.22;
  assert.throws(() => adaptMotion(recipe, input), /insufficient/);
});
test('protected subject regions cause explicit repositioning or failure', () => {
  const { recipe, input } = motionFixture();
  const a = adaptMotion(recipe, { ...input, subjectCoverage: 'agent_inspected', protectedRegions: [
    { start: 10, end: 12, box: { x: .1, y: .7, width: .8, height: .3 }, reason: 'Face' }] });
  assert.equal(a.cards[0].box.y, .08);
  assert.throws(() => adaptMotion(recipe, { ...input, protectedRegions: [
    { start: 10, end: 12, box: { x: 0, y: 0, width: 1, height: 1 }, reason: 'Full screen detail' }] }), /No safe/);
});
test('canvas effects remain deterministic when seeking backward and hold state is visible', () => {
  const { recipe, input } = motionFixture(); recipe.settings.blurPx = 8;
  const a = adaptMotion(recipe, input), c = a.cards[0];
  const stateAt = runInNewContext(motionRuntime + ';stateAt');
  const before = stateAt(.8, c, 0, recipe.settings); stateAt(1.7, c, 0, recipe.settings);
  assert.deepEqual(stateAt(.8, c, 0, recipe.settings), before);
  assert.equal(before.opacity, 1); assert.equal(before.blur, 0);
  assert.equal(stateAt(c.end, c, 0, recipe.settings), null);
  assert.equal(a.renderer, 'canvas');
});
test('native/canvas generation serializes user strings, never reference instructions as code', () => {
  const { recipe, input } = motionFixture(); input.captions.cues[0].text = '"}; globalThis.pwned=1; //';
  const a = adaptMotion(recipe, input), code = motionComposition(a, 'C:\\safe\\source.mp4');
  assert.ok(code.includes('const data=')); assert.ok(!code.includes('<captions'));
  const prefix = code.slice(0, code.indexOf('function tracks'));
  const result = runInNewContext(prefix + '; ({data,pwned:globalThis.pwned})');
  assert.equal(result.pwned, undefined); assert.equal(result.data.cards[0].lines.join(' '), input.captions.cues[0].text);
  assert.throws(() => motionSettingsSchema.parse({ ...recipe.settings, fontFamily: 'Arial";evil()' }));
});

function reviewFixture() {
  const hash = 'a'.repeat(64);
  const expected = { adaptationSha256: hash, renderSha256: hash, inspectionSha256: hash, artifacts: [{ id: 'f0', kind: 'frame' }, { id: 'a0', kind: 'audio' }],
    audible: true, technicalPass: true, revision: 0, maxCorrections: 2 };
  const report = { adaptationSha256: hash, renderSha256: hash, inspectionSha256: hash, reviewer: 'test', inspectedArtifactIds: ['f0'],
    checks: ['motion', 'timing', 'readability', 'placement', 'audio'].map(kind => ({ kind, status: kind === 'audio' ? 'unknown' : 'pass',
      note: 'Synthetic test assertion, not listening', evidenceIds: kind === 'audio' ? [] : ['f0'] })) };
  return { expected, report };
}
test('unheard audio stays unknown, prevents complete review, and cannot be claimed from frames', () => {
  const { report, expected } = reviewFixture();
  assert.equal(reviewMotion(report, expected).status, 'needs_human_review');
  report.checks[4].status = 'pass'; report.checks[4].evidenceIds = ['f0'];
  assert.throws(() => reviewMotion(report, expected), /matching modality/);
  report.checks[4].status = 'not_applicable';
  assert.throws(() => reviewMotion(report, expected), /Only absent/);
});
test('failed review opens corrections, budget exhaustion stops, pass does not auto-publish', () => {
  const { report, expected } = reviewFixture(); report.checks[0].status = 'fail';
  assert.equal(reviewMotion(report, expected).status, 'needs_correction');
  assert.equal(reviewMotion(report, { ...expected, revision: 2 }).status, 'correction_limit');
  report.checks[0].status = 'pass'; report.checks[4].status = 'not_applicable';
  const r = reviewMotion(report, { ...expected, audible: false });
  assert.equal(r.status, 'reviewed_draft'); assert.equal(r.safeToAutoPublish, false);
});
test('stale review, missing frames, duplicate checks and invented evidence are rejected', () => {
  const { report, expected } = reviewFixture();
  assert.throws(() => reviewMotion({ ...report, renderSha256: 'b'.repeat(64) }, expected), /Stale/);
  assert.throws(() => reviewMotion(report, { ...expected, artifacts: [...expected.artifacts, { id: 'f1', kind: 'frame' }] }), /every requested/);
  assert.throws(() => reviewMotion({ ...report, checks: Array(5).fill(report.checks[0]) }, expected), /exactly once/);
  assert.throws(() => reviewMotion({ ...report, inspectedArtifactIds: ['invented'] }, expected), /Unknown/);
});
test('all sampling times stay in actual preview bounds and caption versions change identity', () => {
  const { recipe, input } = motionFixture(); const a = adaptMotion(recipe, input);
  assert.ok(a.previewSamples.every(t => t >= 0 && t < a.duration));
  const prior = motionDigest(a); input.captions.cues[0].text = 'Different words';
  assert.notEqual(motionDigest(adaptMotion(recipe, input)), prior);
});

test('short fractional cues quantize inward and never create duplicate native keyframe ticks', () => {
  const { recipe, input } = motionFixture();
  recipe.settings.entrySeconds = .03; recipe.settings.exitSeconds = 3; recipe.settings.staggerSeconds = .001;
  input.captions.cues[0].start = 10.203; input.captions.cues[0].end = 10.881;
  const a = adaptMotion(recipe, input), c = a.cards[0];
  assert.ok(c.start >= .203); assert.ok(c.end <= .881);
  assert.ok(c.entrySeconds >= 1 / 30); assert.ok(c.exitSeconds >= 1 / 30);
  assert.equal(c.staggerSeconds, 0);
  const code = motionComposition(a, 'source.mp4');
  const tracks = runInNewContext(code.slice(0, code.indexOf('export default')) + ';tracks');
  for (let i=0;i<c.lines.length;i++) {
    for (const values of Object.values(tracks(c,i)) as {time:number}[][]) {
      const ticks=values.map(v=>Math.round(v.time*30)); assert.equal(new Set(ticks).size, ticks.length);
    }
  }
});
test('canvas easing uses the same CSS preset shape as native keyframes', () => {
  const ease = runInNewContext(motionRuntime+';ease');
  assert.ok(Math.abs(ease(.5,'easeOut')-.684643) < .00001);
  assert.ok(Math.abs(ease(.5,'easeIn')-.315357) < .00001);
  assert.ok(Math.abs(ease(.5,'easeInOut')-.5) < .00001);
});
test('landscape and square adaptations retain normalized layout and cue words', () => {
  const { recipe, input } = motionFixture();
  for (const [width,height] of [[1920,1080],[1080,1080]]) {
    const a=adaptMotion(recipe,{...input,width,height});
    assert.deepEqual(a.cards[0].box,recipe.settings.layout);
    assert.equal(a.cards[0].lines.join(' '),input.captions.cues[0].text);
  }
});
