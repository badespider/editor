import type { z } from 'zod';
import { describeMotionEntry, type MotionCatalogEntry, motionCatalogRequestSchema } from '../src/motion-catalog.ts';
import { sceneFixture } from './scene-fixture.ts';

/** Entirely synthetic; never evidence of actual viewing/listening. */
export function catalogRequest(entry: MotionCatalogEntry): z.input<typeof motionCatalogRequestSchema> {
  const { input } = sceneFixture(), info = describeMotionEntry(entry);
  input.audio.end = 16; input.shots[0].end = 6;
  input.transcript.words = [{ id: 'w1', text: 'New', start: 11, end: 11.5 }, { id: 'w2', text: 'story', start: 13, end: 13.5 }];
  input.captions = [{ id: 'words', start: .9, end: 5, words: [{ wordId: 'w1', row: 0, scale: 1 }, { wordId: 'w2', row: 1, scale: 1.5 }] }];
  input.assets.push({ ...input.assets[0], id: 'still', kind: 'image', path: '/synthetic/new-object.png' });
  input.shots[0].bindings = info.mediaSlots.map(s => ({ slot: s.slot, assetId: s.kind === 'image' ? 'still' : 'a', sourceIn: s.kind === 'image' ? 0 : 10 }));
  input.shots[0].cues = Object.fromEntries(info.cues.map((c, i) => [c, i ? 'w2' : 'w1']));
  return { input, instances: [{ shotId: 'one', template: info.selector,
    text: Object.fromEntries(info.textSlots.map((s, i) => [s, i ? 'BUILD TOGETHER' : 'NEW STORY'])) }],
    mediaDimensions: { a: { width: 1080, height: 1920 }, still: { width: 800, height: 400 } } };
}
