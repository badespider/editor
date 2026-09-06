// Local integration regression. Run ONLY against an isolated desktop profile.
// Bundle with esbuild (Node/CJS), then pass a new scratch directory.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { editor, waitForCliSocket } from '../cli-client';
import { compileProject } from '../compile-project';

function ffmpeg(args: string[]) {
  const result = spawnSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-nostdin', ...args],
    { windowsHide: true, maxBuffer: 8_000_000, timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr?.toString() || String(result.error));
  return result.stdout;
}
function pcm(file: string, start: number) {
  const bytes = ffmpeg(['-ss', String(start), '-i', file, '-t', '0.5', '-vn', '-ar', '16000', '-ac', '1', '-f', 'f32le', '-']);
  return Array.from({ length: bytes.length / 4 }, (_, i) => bytes.readFloatLE(i * 4));
}
function correlation(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let xy = 0, xx = 0, yy = 0;
  for (let i = 0; i < n; i++) { xy += a[i] * b[i]; xx += a[i] ** 2; yy += b[i] ** 2; }
  return xy / Math.sqrt(xx * yy || 1);
}
async function main() {
  const root = resolve(process.argv[2] || 'missing-output-directory');
  await mkdir(root); // No overwrite / reuse of an old test run.
  const created: string[] = [];
  const reports: unknown[] = [];
  for (const [name, color, frequency] of [['a', 'red', 300], ['b', 'blue', 730]] as const) {
    ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=30:d=6`, '-f', 'lavfi', '-i',
      `aevalsrc=0.15*sin(2*PI*(${frequency}*t+17*t*t)):s=48000:d=6`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-n', join(root, `${name}.mp4`)]);
  }
  await waitForCliSocket();
  const before = await editor.project.active.query();
  try {
    for (const name of ['a', 'b']) {
      const project = await editor.project.create.mutate({ name: `Render cache regression ${name}` });
      created.push(project.id);
      const media = JSON.stringify(join(root, `${name}.mp4`).replaceAll('\\', '/'));
      const code = await compileProject({ code: `export default function Test(){return <rect scene="cache-regression" width={320} height={180} end={4} fill="#121A1A"><video src={${media}} sourceIn={0.5} sourceOut={2.5} start={0} width={320} height={180}/><video src={${media}} sourceIn={3} sourceOut={5} start={2} width={320} height={180}/></rect>;}` });
      await editor.mount.mutate({ code });
      const context = await editor.context.query();
      const output = join(root, `${name}-render.mp4`);
      await editor.node.render.mutate({ id: context.activeSceneId!, output, config: { format: 'mp4', video: { resolution: 180, fps: 30, codec: 'avc' }, audio: { codec: 'aac', sampleRate: 48000, bitrate: 192000 } } }, { context: { timeoutMs: 120000 } });
      const checks = [{ at: .4, sourceAt: .9 }, { at: 2.4, sourceAt: 3.4 }].map(({ at, sourceAt }) => ({
        at, sourceAt, correlation: correlation(pcm(join(root, `${name}.mp4`), sourceAt), pcm(output, at)),
      }));
      const report = { project: name, output, checks, pass: checks.every(c => c.correlation > .96) };
      reports.push(report);
      console.log(JSON.stringify(report));
    }
    await writeFile(join(root, 'regression.json'), JSON.stringify(reports, null, 2));
    assert(reports.every(r => (r as { pass: boolean }).pass), 'Wrong source audio after switching projects');
  } finally {
    if (before) await editor.project.open.mutate({ id: before.id });
    for (const id of created) await editor.project.delete.mutate({ id });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
