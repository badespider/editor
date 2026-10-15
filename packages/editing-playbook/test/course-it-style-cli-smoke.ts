// Run after building the CLI: node --test packages/editing-playbook/test/course-it-style-cli-smoke.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { courseRequest } from './course-it-style-fixture.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = (...args: string[]) => spawnSync(process.execPath,
  [resolve(root, 'apps/cli/dist/index.js'), 'playbook', ...args], {cwd: tmpdir(), encoding: 'utf8'});

test('built CLI discovers complete course instructions from an unrelated working directory', () => {
  const listed = cli('skills');
  assert.equal(listed.status, 0, listed.stderr);
  assert.ok(JSON.parse(listed.stdout).skills.some((entry: {id: string}) => entry.id === 'course-it-style-1'));
  for (const args of [
    ['skill', 'course-it-style-1'],
    ['skill', 'course-it-style-1', '--repo', root],
    ['creative', 'show', 'course-it-style-1@1'],
    ['creative', 'show', 'course-it-style-1@1', '--repo', root],
  ]) {
    const shown = cli(...args);
    assert.equal(shown.status, 0, shown.stderr);
    assert.ok(JSON.parse(shown.stdout).instructions.replaceAll('\r\n', '\n').startsWith('---\nname: course-it-style-1\n'));
  }
  const creative = cli('creative', 'list');
  assert.equal(creative.status, 0, creative.stderr);
  assert.ok(JSON.parse(creative.stdout).techniques.some((entry: {key: string}) => entry.key === 'course-it-style-1@1'));
  const recommendation = cli('recommend', '--goal', 'Apply Course IT Style 1', '--profile', 'none');
  assert.equal(recommendation.status, 0, recommendation.stderr);
  assert.ok(JSON.parse(recommendation.stdout).skills.some((entry: {id: string}) => entry.id === 'course-it-style-1'));
  assert.equal(cli('creative', 'show', 'course-it-style-1@latest').status, 1);
});

test('built CLI drafts and checks a course plan without private media and never overwrites a plan', async () => {
  // Keep isolated diagnostic files in the OS temporary directory, outside the checkout.
  const directory = await mkdtemp(resolve(tmpdir(), 'course-it-style-cli-'));
  const requestPath = resolve(directory, 'request.json'), planPath = resolve(directory, 'plan.json');
  await writeFile(requestPath, JSON.stringify(courseRequest()));
  const drafted = cli('creative', 'draft', requestPath, '-o', planPath);
  assert.equal(drafted.status, 0, drafted.stderr);
  assert.equal(JSON.parse(drafted.stdout).structuralPass, true);
  assert.equal(JSON.parse(drafted.stdout).renderable, false);
  const before = await readFile(planPath, 'utf8');
  const repeated = cli('creative', 'draft', requestPath, '-o', planPath);
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /EEXIST/);
  assert.equal(await readFile(planPath, 'utf8'), before);
  const checked = cli('creative', 'check', planPath);
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).binding, 'unbound');
  const plan = JSON.parse(before);
  plan.request.aspect = 'portrait';
  const invalidPath = resolve(directory, 'unsupported.json');
  await writeFile(invalidPath, JSON.stringify(plan));
  const invalid = cli('creative', 'check', invalidPath);
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).structuralPass, false);
});
