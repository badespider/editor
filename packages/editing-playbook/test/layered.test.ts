import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLayered, layeredPlanSchema, visiblePictures } from '../src/layered.ts';
import { fixture } from './fixture.ts';
import type { DeliveryBundle } from '../src/delivery-schema.ts';

export function layeredFixture() {
  const basePlan = fixture();
  basePlan.sources.push({ id: 'nature', path: 'nature.mp4', duration: 10, sha256: 'c'.repeat(64), audio: 'other' });
  basePlan.evidence.push({ id: 'trees', sourceId: 'nature', start: 0, end: 4, observation: 'Inspected synthetic test range.', kind: 'visual', verification: 'observed', artifact: 'synthetic.json' });
  return layeredPlanSchema.parse({ schemaVersion: 1, kind: 'editor-layered-plan', basePlan,
    settings: { width: 320, height: 180 }, pictureProtectedRanges: [],
    cutaways: [{ id: 'trees', sourceId: 'nature', in: 1, out: 2, atFrame: 15, purpose: 'environment',
      reason: 'Remember the place.', chronologyNote: 'Same outing; illustrative placement, not simultaneous proof.', evidenceIds: ['trees'], audio: 'muted' }] });
}
test('layered validation keeps sound independent and never declares story approval', () => {
  const result = checkLayered(layeredFixture());
  assert.equal(result.technicalPass, true, JSON.stringify(result));
  assert.equal(result.duration, 2); assert.equal(result.reviewRequired, true); assert.equal(result.safeToAutoEdit, false);
});
test('cutaways require bounded inspected visual evidence and a fingerprint', () => {
  for (const change of [(p: ReturnType<typeof layeredFixture>) => { p.basePlan.sources[1].sha256 = undefined; },
    (p: ReturnType<typeof layeredFixture>) => { p.basePlan.evidence[1].verification = 'uncertain'; },
    (p: ReturnType<typeof layeredFixture>) => { p.cutaways[0].evidenceIds = ['recording-change']; },
    (p: ReturnType<typeof layeredFixture>) => { p.basePlan.evidence[1].end = 1.5; },
    (p: ReturnType<typeof layeredFixture>) => { delete p.basePlan.evidence[1].artifact; }]) {
    const p = layeredFixture(); change(p); assert.equal(checkLayered(p).technicalPass, false);
  }
});
test('ambiguous overlap, duplicate IDs, excess duration, music and unmuted cutaways reject', () => {
  const p = layeredFixture();
  for (const cut of [{ ...p.cutaways[0] }, { ...p.cutaways[0], id: 'other', atFrame: 20 }])
    assert.equal(checkLayered({ ...p, cutaways: [...p.cutaways, cut] }).technicalPass, false);
  assert.equal(checkLayered({ ...p, music: 'track.wav' }).technicalPass, false);
  assert.equal(checkLayered({ ...p, cutaways: [{ ...p.cutaways[0], audio: 'original' }] }).technicalPass, false);
  p.cutaways[0].atFrame = 40; assert.equal(checkLayered(p).technicalPass, false);
});
test('picture protection includes inherited source moments without blocking their voice', () => {
  const p = layeredFixture();
  p.pictureProtectedRanges = [{ startFrame: 15, endFrame: 20, reason: 'See the reaction.' }];
  assert.equal(checkLayered(p).technicalPass, false);
  p.pictureProtectedRanges = [];
  p.cutaways[0].atFrame = 0; assert.equal(checkLayered(p).technicalPass, false);
  p.cutaways[0].atFrame = 15; assert.equal(checkLayered(p).technicalPass, true);
});
test('visible picture is split at cutaways but preserves both source and timeline clocks', () => {
  const p = layeredFixture();
  const base = { frames: 60, clips: [{ id: 'opening', startFrame: 0, durationFrames: 60, path: 'media/opening.mp4', sha256: 'b'.repeat(64) }] } as Pick<DeliveryBundle, 'frames' | 'clips'>;
  const result = visiblePictures(p, base, [{ id: 'trees', path: 'cutaways/trees.mp4', sha256: 'c'.repeat(64) }]);
  assert.deepEqual(result.map(c => [c.startFrame, c.durationFrames, c.sourceIn, c.path]), [
    [0, 15, 0, 'base/media/opening.mp4'], [15, 30, 0, 'cutaways/trees.mp4'], [45, 15, 1.5, 'base/media/opening.mp4'],
  ]);
  assert.equal(result.reduce((n, c) => n + c.durationFrames, 0), 60);
});
test('fractional source ends are held up to the next frame, never lose selected time', () => {
  const p = layeredFixture(); p.cutaways[0].out = 2.001;
  const base = { frames: 60, clips: [{ id: 'opening', startFrame: 0, durationFrames: 60, path: 'media/opening.mp4', sha256: 'b'.repeat(64) }] } as Pick<DeliveryBundle, 'frames' | 'clips'>;
  const result = visiblePictures(p, base, [{ id: 'trees', path: 'cutaways/trees.mp4', sha256: 'c'.repeat(64) }]);
  assert.equal(result[1].durationFrames, 31); assert.equal(result[2].sourceIn, 46 / 30);
});
test('layered checks preserve base speech/audio/evidence warnings', () => {
  const p = layeredFixture(); p.basePlan.sources[0].audio = 'speech';
  p.basePlan.evidence[0].verification = 'model_supported';
  const result = checkLayered(p);
  assert.ok(result.warnings.some(w => w.includes('model_claim')));
  assert.ok(result.warnings.some(w => /speech/i.test(w) && w.includes('Base plan')));
});
test('vanishing ranges cannot produce a zero-frame cutaway', () => {
  const p = layeredFixture(); p.cutaways[0].out = p.cutaways[0].in + 1e-10;
  assert.equal(checkLayered(p).technicalPass, false);
});
