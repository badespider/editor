// Real local evidence pipeline with an injected deterministic runner. No model,
// account, desktop or network calls; not a visual-analysis quality evaluation.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { runMedia } from '../src/delivery.ts';
import { fingerprint } from '../src/preview.ts';
import { ReferenceAutoService } from '../src/reference-auto.ts';
import type { ReferenceCodexRunner } from '../src/reference-codex.ts';

const directory = await mkdtemp(join(tmpdir(), 'editor-reference-auto-media-test-'));
const source = join(directory, 'synthetic-reference.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=7:d=4',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-output_ts_offset', '5', source]);
let imageCount = 0;
const runner: ReferenceCodexRunner = {
  capabilities: async () => ({ runner: 'codex-cli', installed: true, available: true, authenticated: true, auth: 'chatgpt',
    reason: 'Deterministic test runner only.', remoteProcessing: true, analysisWindowSeconds: 120, timeoutSeconds: 600 }),
  run: async request => {
    imageCount = request.images.length;
    for (const image of request.images) {
      const png = await readFile(image); assert.ok(png.length > 1000); assert.equal(png.readUInt32BE(16), 320);
    }
    assert.ok(request.prompt.includes('"decodedTime":') && request.prompt.includes('"sourceRange":{"start":0,"end":4}'));
    const output = JSON.stringify({ schemaVersion: 1, title: 'Synthetic native test', summary: 'Deterministic shape authored by a test; no visual model was invoked.',
      uncertainties: ['No model or actual editor was used by this regression.'], width: 1920, height: 1080, fps: 30, duration: 4, background: '#10141c',
      layers: [{ id: 'card', name: 'Synthetic card', type: 'rect', start: 0, end: 4, x: 400, y: 300, width: 800, height: 300,
        rotation: 0, opacity: 1, fill: '#ffffff', text: '', fontFamily: 'Arial', fontSize: 48, fontWeight: 400,
        textAlign: 'left', radius: 20, keyframes: [{ time: 0, x: 400, y: 300, scale: 1, rotation: 0, opacity: 0 },
          { time: .5, x: 400, y: 300, scale: 1, rotation: 0, opacity: 1 }] }] });
    await writeFile(request.outputPath, output, { flag: 'wx' });
    return { output, usage: null, model: 'deterministic-test-no-model', logPath: join(request.directory, 'not-invoked.log'),
      stderrPath: join(request.directory, 'not-invoked.stderr'), executable: 'test-constructor-injection-only' };
  },
};
const service = new ReferenceAutoService({ directory: join(directory, 'jobs'), runner });
try {
  const queued = await service.start({ path: source, projectId: 'synthetic-test' });
  assert.equal(queued.state, 'queued');
  let done = await service.status(queued.id);
  const deadline = Date.now() + 30_000;
  while (!['ready', 'failed', 'cancelled'].includes(done.state) && Date.now() < deadline) { await pause(20); done = await service.status(queued.id); }
  assert.equal(done.state, 'ready', done.error ?? undefined);
  assert.equal(imageCount, 8);
  assert.equal(done.result!.source.sha256, await fingerprint(source));
  assert.equal(done.result!.source.startTime, 5);
  assert.ok(done.result!.evidence.frames.every(frame => frame.decodedTime >= frame.requestedTime - 1e-6 && frame.decodedTime < 4));
  assert.ok(done.result!.evidence.frames.some(frame => frame.decodedTime - frame.requestedTime > .01));
  assert.equal(await readFile(done.result!.modulePath, 'utf8'), done.result!.module);
  console.log(JSON.stringify({ directory, status: 'passed', jobId: done.id, frames: imageCount, evidence: join(done.outputDirectory, 'evidence.json'),
    nativeModule: done.result!.modulePath, actualModelCalls: 0, actualEditorRender: false,
    checks: ['real pipeline preparation', 'full PNG attachments', 'nonzero origin', 'actual decoded PTS', 'strict native plan', 'persistent native module'] }));
} finally { await service.shutdown(); }
