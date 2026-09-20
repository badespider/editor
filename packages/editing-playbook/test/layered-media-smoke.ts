// Opt-in local FFmpeg test. No desktop, models, network, or user media involved.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layeredPlanSchema, prepareLayered, readLayeredBundle } from '../src/layered.ts';
import { verifyLayered } from '../src/layered-review.ts';
import { runMedia } from '../src/delivery.ts';
import { fingerprint } from '../src/preview.ts';
import { fixture } from './fixture.ts';

const root = await mkdtemp(join(tmpdir(), 'editor-layered-test-'));
const source = join(root, 'source.mp4'), cutaway = join(root, 'trees.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=4',
  '-f', 'lavfi', '-i', 'aevalsrc=0.1*sin(500*t+65*t*t):s=48000:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source]);
await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', cutaway]);
const basePlan = fixture();
basePlan.brief = { ...basePlan.brief, goal: 'Synthetic continuous voice test', format: 'story' };
basePlan.sources = [{ id: 'obs', path: source, duration: 4, audio: 'other', sha256: await fingerprint(source) },
  { id: 'nature', path: cutaway, duration: 2, audio: 'no_track', sha256: await fingerprint(cutaway) }];
basePlan.evidence[0] = { ...basePlan.evidence[0], kind: 'visual' };
basePlan.evidence.push({ id: 'blue', sourceId: 'nature', start: 0, end: 1, observation: 'Synthetic blue plate for routing checks, not journal footage.', kind: 'visual', verification: 'observed', artifact: 'lavfi synthetic fixture' });
basePlan.segments[0].out = 3; basePlan.protectedRanges = [];
const plan = layeredPlanSchema.parse({ schemaVersion: 1, kind: 'editor-layered-plan', basePlan,
  settings: { name: 'Layered synthetic smoke', width: 320, height: 180 }, pictureProtectedRanges: [],
  cutaways: [{ id: 'blue', sourceId: 'nature', in: 0, out: 1, atFrame: 30, purpose: 'environment',
    reason: 'Test picture replacement while audio remains unchanged.', chronologyNote: 'Synthetic, not real chronology.', evidenceIds: ['blue'], audio: 'muted' }] });
const prepared = await prepareLayered(plan, { output: join(root, 'bundle'), baseDirectory: root });
await readLayeredBundle(prepared.root);
await assert.rejects(prepareLayered(plan, { output: prepared.root, baseDirectory: root }), /EEXIST/);
// Independent FFmpeg test render exercises the mapping/verifier, NOT an editor-render claim.
const args = ['-v', 'error', '-nostdin', '-n'];
const filters: string[] = [], labels: string[] = [];
for (const [i, p] of prepared.bundle.pictures.entries()) {
  args.push('-i', join(prepared.root, p.path));
  filters.push(`[${i}:v]trim=start=${p.sourceIn}:duration=${p.durationFrames / 30},setpts=PTS-STARTPTS[v${i}]`); labels.push(`[v${i}]`);
}
args.push('-i', join(prepared.root, prepared.bundle.audio.path));
filters.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=0[v]`);
const output = join(root, 'reference-render.mp4');
await runMedia([...args, '-filter_complex', filters.join(';'), '-map', '[v]', '-map', `${labels.length}:a`, '-c:v', 'libx264', '-c:a', 'aac', '-t', '3', output]);
const report = await verifyLayered(prepared.root, output);
assert.equal(report.technicalPass, true, JSON.stringify(report.errors));
// A trim strictly between source frames must fail preparation, not mount an empty MP4.
const tinyPlan = structuredClone(plan); tinyPlan.cutaways[0].in = .001; tinyPlan.cutaways[0].out = .002;
await assert.rejects(prepareLayered(tinyPlan, { output: join(root, 'empty-cutaway'), baseDirectory: root }), /video|decoded|duration/);
// Deliberately wrong/silent sound must fail, including while B-roll is on screen.
const silent = join(root, 'wrong-audio.mp4');
await runMedia(['-v', 'error', '-nostdin', '-n', '-i', output, '-af', 'volume=0', '-c:v', 'copy', '-c:a', 'aac', silent]);
assert.equal((await verifyLayered(prepared.root, silent)).technicalPass, false);
// Changing the candidate after its picture scan must not return a pass for new bytes.
let changed = false;
await assert.rejects(verifyLayered(prepared.root, output, { onProgress: async message => {
  if (!changed && message.startsWith('Checking independent')) { changed = true; await writeFile(output, await readFile(silent)); }
} }), /changed|decode|process|stream|samples/);
const composition = join(prepared.root, 'edit.tsx');
const original = await readFile(composition, 'utf8');
await writeFile(composition, original + '// tamper');
await assert.rejects(readLayeredBundle(prepared.root), /changed/);
await writeFile(composition, original);
await writeFile(join(prepared.root, 'cutaways/blue.mp4'), 'invalid changed media');
await assert.rejects(readLayeredBundle(prepared.root), /changed/);
console.log(JSON.stringify({ root, status: 'passed', checks: ['prepare', 'mapping', 'continuous base audio', 'wrong audio rejection', 'no overwrite', 'tampered composition', 'tampered media'], actualEditorTest: false }));
