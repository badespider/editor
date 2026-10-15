import { build } from 'esbuild';
import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.tmp', 'preset-tests');
await mkdir(out, { recursive: true });
const tests = (await readdir(join(root, 'test'))).filter(name => name.endsWith('.test.ts')).sort();
if (tests.length === 0) throw new Error('No native preset tests were found');
const bundles = [];
for (const name of tests) {
  const outfile = join(out, name.replace(/\.ts$/, '.mjs'));
  await build({
    entryPoints: [join(root, 'test', name)], outfile, bundle: true,
    platform: 'node', format: 'esm', target: 'node24', conditions: ['browser'],
    define: { 'process.env.NODE_ENV': '"test"' }, logLevel: 'warning',
  });
  bundles.push(outfile);
}
const result = spawnSync(process.execPath, ['--test', ...bundles], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
