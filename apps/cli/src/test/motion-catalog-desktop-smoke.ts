// Run with Node 24 after building the CLI, against an isolated running desktop.
// Synthetic tone/graphics only. It tests reuse/export, not subjective style/listening.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MotionCatalog, findMotionCatalogRoot } from '../../../../packages/editing-playbook/src/motion-catalog.ts';
import { catalogRequest } from '../../../../packages/editing-playbook/test/motion-catalog-fixture.ts';
import { fingerprint } from '../../../../packages/editing-playbook/src/preview.ts';
import { runMedia } from '../../../../packages/editing-playbook/src/media-process.ts';

const exec = promisify(execFile);
async function main() {
  assert.ok(process.argv[2], 'Pass a new output directory');
  const root = resolve(process.argv[2]); await mkdir(root);
  const source = join(root, 'synthetic.mp4'), still = join(root, 'orange.png'), alternate = join(root, 'cyan.png');
  await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i', 'color=c=0x173355:s=320x480:r=30:d=40',
    '-f', 'lavfi', '-i', 'sine=frequency=350:sample_rate=48000:duration=40', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source]);
  for (const [path, color] of [[still, 'orange'], [alternate, 'cyan']]) await runMedia(['-v', 'error', '-nostdin', '-n', '-f', 'lavfi', '-i',
    `color=c=${color}:s=320x160`, '-vf', 'drawbox=x=10:y=10:w=300:h=140:color=white:t=5', '-frames:v', '1', path]);
  const catalog = new MotionCatalog(await findMotionCatalogRoot());
  const cli = async (...args: string[]) => {
    const result = await exec(process.execPath, [resolve('apps/cli/dist/index.js'), ...args], { timeout: 300000, maxBuffer: 12 * 1024 * 1024 });
    return JSON.parse(result.stdout);
  };
  const receipts = [];
  for (const variant of ['portrait', 'landscape']) {
    const pins = variant === 'portrait' ? ['one-to-many@1', 'layered-image@1', 'scale-title@1', 'word-stack@1'] : ['one-to-many@1'];
    const entry = await catalog.get(pins[0]), request = catalogRequest(entry);
    request.input.width = variant === 'portrait' ? 360 : 640; request.input.height = variant === 'portrait' ? 640 : 360;
    request.input.audio.end = 10 + pins.length * 6; request.input.shots = []; request.instances = [];
    request.input.transcript.words = []; request.input.captions = [];
    for (const [i, pin] of pins.entries()) {
      const next = catalogRequest(await catalog.get(pin)), offset = i * 6, shotId = `shot-${i}`;
      const wordIds = new Map(next.input.transcript.words.map(w => [w.id, `${w.id}-${i}`]));
      const shot = next.input.shots[0]; shot.id = shotId; shot.start += offset; shot.end += offset;
      shot.cues = Object.fromEntries(Object.entries(shot.cues ?? {}).map(([k, v]) => [k, wordIds.get(v)!]));
      request.input.shots.push(shot); request.instances.push({ ...next.instances[0], shotId });
      request.input.transcript.words.push(...next.input.transcript.words.map(w => ({ ...w, id: wordIds.get(w.id)!, start: w.start + offset, end: w.end + offset })));
      request.input.captions.push(...next.input.captions.map(c => ({ ...c, id: `${c.id}-${i}`, start: c.start + offset, end: c.end + offset,
        words: c.words.map(w => ({ ...w, wordId: wordIds.get(w.wordId)! })) })));
    }
    const videoHash = await fingerprint(source), image = variant === 'portrait' ? still : alternate;
    request.input.assets[0] = { ...request.input.assets[0], path: source, sha256: videoHash };
    request.input.assets[1] = { ...request.input.assets[1], path: image, sha256: await fingerprint(image) };
    request.input.transcript.sourceSha256 = videoHash;
    request.mediaDimensions = { a: { width: 320, height: 480 }, still: { width: 320, height: 160 } };
    if (variant === 'landscape') {
      for (const key of Object.keys(request.instances[0].text)) request.instances[0].text[key] = 'ANOTHER SUBJECT';
      request.instances[0].colors = { '#173FAD': '#71358A' };
    }
    const path = join(root, `${variant}-request.json`), output = join(root, variant), job = join(root, `${variant}-job`);
    await writeFile(path, JSON.stringify(request, null, 2), { flag: 'wx' });
    const applied = await cli('playbook', 'motion', 'catalog', 'apply', path, '-o', output);
    assert.equal(applied.entries.length, pins.length);
    await cli('playbook', 'motion', 'scene', 'start', join(output, 'recipe.json'), join(output, 'input.json'), '-o', job);
    const rendered = await cli('playbook', 'motion', 'scene', 'render', job);
    assert.equal(rendered.next.stage, 'needs_template_review');
    assert.ok(rendered.next.evidence.every((e: { role: string }) => e.role === 'render'));
    const preview = join(job, 'revision-0', 'preview_DRAFT.mp4');
    const thumb = join(root, `${variant}-contact.jpg`);
    await runMedia(['-v', 'error', '-nostdin', '-n', '-i', preview, '-vf', 'fps=1/2,scale=320:-1,tile=4x3', '-frames:v', '1', thumb]);
    receipts.push({ variant, preview, sha256: await fingerprint(preview), render: rendered.render,
      stage: rendered.next.stage, warnings: applied.warnings, contact: thumb });
    console.error(`${variant}: ${pins.length} templates rendered; fresh review required`);
  }
  await writeFile(join(root, 'result.json'), JSON.stringify({ status: 'technical_pass', receipts, approval: 'none; synthetic media only' }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ root, status: 'technical_pass' }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
