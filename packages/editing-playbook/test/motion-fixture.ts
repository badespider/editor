import { generateMotionRecipe } from '../src/motion.ts';

export function motionFixture() {
  const hash = 'a'.repeat(64);
  const manifest = { schemaVersion: 1, kind: 'agent-reference-sequence', id: hash, sessionId: hash,
    source: { path: 'reference.mp4', sha256: hash, bytes: 100, mtimeMs: 1, width: 320, height: 480, startTime: 0, duration: 2 },
    request: { start: 0, end: 2, maxFrames: 600, maxDecodedMiB: 1024 }, timeBase: { numerator: 1, denominator: 30 },
    frames: Array.from({ length: 60 }, (_, index) => ({ index, pts: index, time: index / 30, durationTicks: 1,
      id: `f${index}`, path: `frames/frame-${String(index).padStart(6, '0')}.png`, sha256: hash, bytes: 100, change: null })),
    grid: { path: 'change-grid.gray', sha256: hash, width: 96, height: 54 }, viewer: 'viewer.html',
    externalModelCalls: 0, safeToAutoEdit: false, limitations: ['Synthetic test data'], sequenceSha256: hash };
  const breakdown = { sequenceSha256: hash, author: 'synthetic test', inspectedFrames: manifest.frames.map(f => f.index),
    elements: [{ id: 'caption', label: 'Caption', observation: 'Synthetic fade and small rise', inference: 'Caption motion', uncertainty: 'Synthetic fixture, not a viewed video',
      phases: [{ label: 'entry', startFrame: 0, endFrame: 6 }, { label: 'exit', startFrame: 54, endFrame: 59 }],
      keyframes: [{ frame: 0, x: .5, y: .8, opacity: 0, note: 'test' }, { frame: 6, x: .5, y: .78, opacity: 1, note: 'test' },
        { frame: 54, x: .5, y: .78, opacity: 1, note: 'test' }, { frame: 59, x: .5, y: .76, opacity: 0, note: 'test' }] }] };
  const intent = { elementId: 'caption', entryPhase: 'entry', exitPhase: 'exit', rationale: 'Test caption recipe', settings: {} };
  const recipe = generateMotionRecipe(manifest, breakdown, intent);
  const input = { source: { path: 'source.mp4', sha256: hash }, range: { start: 10, end: 12 }, width: 320, height: 480, fps: 30,
    captions: { sourceSha256: hash, verification: 'unverified', provenance: 'test ASR', cues: [{ id: 'one', start: 10.2, end: 11.8, text: 'Make this moment count' }] },
    subjectCoverage: 'unknown', protectedRegions: [] };
  return { hash, manifest, breakdown, intent, recipe, input };
}
