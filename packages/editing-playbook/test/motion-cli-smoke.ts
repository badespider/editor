// Synthetic workflow regression, NOT a claim of visual inspection or style quality.
// --editor renders through a running isolated editor; otherwise uses labeled placeholder media.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { motionFixture } from './motion-fixture.ts';
import { fingerprint } from '../src/preview.ts';

const repository = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(repository, 'apps/cli/dist/index.js');
const root = await mkdtemp(join(tmpdir(), 'motion-smoke-')), job = join(root, 'job');
const editor = process.argv.includes('--editor');
const env = { ...process.env, GEMINI_API_KEY: '', GOOGLE_API_KEY: '', OPENAI_API_KEY: '' };
const run = (...args: string[]) => JSON.parse(execFileSync(process.execPath, [cli, 'playbook', 'motion', ...args],
  { cwd: repository, env, encoding: 'utf8', timeout: 300_000, maxBuffer: 8 * 1024 ** 2 }));
const fails = (...args: string[]) => assert.notEqual(spawnSync(process.execPath, [cli, 'playbook', 'motion', ...args],
  { cwd: repository, env, encoding: 'utf8', timeout: 60000 }).status, 0);
const json = async (name: string, value: unknown) => { const path = join(root, name); await writeFile(path, JSON.stringify(value), { flag: 'wx' }); return path; };
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const reference = join(root, 'reference.mp4'), source = join(root, 'source.mp4');
execFileSync(ffmpeg, ['-v','error','-nostdin','-n','-f','lavfi','-i','testsrc2=s=320x480:r=30:d=2',
  '-vf','fade=t=in:st=0:d=0.2,fade=t=out:st=1.8:d=0.166667','-c:v','libx264','-pix_fmt','yuv420p',reference], { env });
execFileSync(ffmpeg, ['-v','error','-nostdin','-n','-f','lavfi','-i','color=c=0x18212b:s=320x480:r=30:d=2',
  '-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-shortest',source], { env });
assert.equal(run('workflow').externalModelCalls, 0);
const first = run('start', reference, '--start', '0', '--end', '2', '--max-corrections', '1', '-o', job);
assert.equal(first.stage, 'needs_interpretation');
assert.equal(run('next', job, '--from', '48').evidence.artifacts.length, 12);
const fixture = motionFixture(); fixture.breakdown.sequenceSha256 = first.evidence.sequenceSha256;
fixture.breakdown.author = 'SYNTHETIC REGRESSION FIXTURE — no viewing claimed';
const report = await json('breakdown.json', fixture.breakdown), intent = await json('intent.json', fixture.intent);
assert.equal(run('interpret', job, report, intent).stage, 'needs_footage');
const recipePath = join(job, 'interpretation', 'recipe.json');
const beforeRecipe = await readFile(recipePath, 'utf8');
const sourceHash = await fingerprint(source);
fixture.input.source = { path: source, sha256: sourceHash };
fixture.input.range = { start: 0, end: 2 }; fixture.input.captions.sourceSha256 = sourceHash;
fixture.input.captions.cues[0].start = .2; fixture.input.captions.cues[0].end = 1.8;
const input = await json('input.json', fixture.input);
assert.equal(run('adapt', job, input).stage, 'needs_render');
fails('adapt', job, input);
const render = async (revision: number) => {
  if (editor) return run('render', job).next;
  await copyFile(join(job, `revision-${revision}`, 'base.mp4'), join(job, `revision-${revision}`, 'preview_DRAFT.mp4'));
  return run('inspect', job);
};
const makeReview = (next: any, failed: boolean) => ({ adaptationSha256: next.adaptationSha256,
  renderSha256: next.renderSha256, inspectionSha256: next.inspectionSha256,
  reviewer: 'SYNTHETIC REGRESSION FIXTURE — tests state transitions, not actual perception',
  inspectedArtifactIds: next.artifacts.filter((a: any) => a.kind === 'frame').map((a: any) => a.id),
  checks: ['motion','timing','readability','placement','audio'].map(kind => ({ kind,
    status: kind === 'motion' && failed ? 'fail' : 'unknown', note: 'Injected fixture finding; no actual viewing/listening claimed.',
    evidenceIds: kind === 'motion' && failed ? [next.artifacts.find((a: any) => a.kind === 'frame').id] : [] })) });
const preview = await render(0); assert.equal(preview.stage, 'needs_review');
const unknownReview = await json('unknown-review.json', makeReview(preview, false));
assert.equal(run('review', job, unknownReview).stage, 'needs_human_review');
const review0 = await json('review0.json', makeReview(preview, true));
const reviewed = run('review', job, review0); assert.equal(reviewed.stage, 'needs_correction');
const correction = await json('correction.json', { adaptationSha256: reviewed.adaptationSha256, reviewSha256: reviewed.reviewSha256,
  reason: 'Synthetic fixture switches native to canvas to exercise the second renderer', settings: { blurPx: 6, fontSize: .075 } });
assert.equal(run('correct', job, correction).revision, 1);
fails('review', job, review0); fails('correct', job, correction);
const revised = await render(1); const review1 = await json('review1.json', makeReview(revised, true));
const stopped = run('review', job, review1); assert.equal(stopped.stage, 'correction_limit');
const overBudget = await json('over-budget.json', { adaptationSha256: stopped.adaptationSha256, reviewSha256: stopped.reviewSha256,
  reason: 'This must be rejected', settings: { blurPx: 2 } });
fails('correct', job, overBudget);
assert.equal(await readFile(recipePath, 'utf8'), beforeRecipe, 'Per-footage corrections must not change the reusable reference recipe');
const reused = join(root, 'reused'); assert.equal(run('reuse', job, '-o', reused).stage, 'needs_footage');
assert.equal(run('adapt', reused, input).revision, 0);
assert.equal(await fingerprint(source), sourceHash, 'Original source unchanged');
// Reject untracked composition edits and stale rendered bytes before reuse/review.
const generated = join(reused, 'revision-0', 'edit.tsx');
await writeFile(generated, (await readFile(generated, 'utf8')) + '\n// untracked edit');
fails('inspect', reused);
const rendered = join(job, 'revision-1', 'preview_DRAFT.mp4');
const originalRender = await readFile(rendered);
await writeFile(rendered, Buffer.concat([originalRender, Buffer.from('tamper test')]));
fails('next', job);
await writeFile(rendered, originalRender); // Restore only this test's own deliberate tampering.
console.log(JSON.stringify({ passed: true, root, job, actualEditorRenders: editor ? 2 : 0,
  fixtureFindingsAreNotAgentReview: true, externalModelCalls: 0, previewPaths: [0,1].map(i => join(job, `revision-${i}`, 'preview_DRAFT.mp4')) }, null, 2));
