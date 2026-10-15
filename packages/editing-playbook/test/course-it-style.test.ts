import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommend, skills } from '../src/catalog.ts';
import { readSkill } from '../src/skill-reader.ts';
import { checkCreativePlan, creativeWorkflow, draftCreativePlan, listCreativeTechniques,
  loadCreativeLibrary, showCreativeTechnique } from '../src/creative.ts';
import { courseRequest } from './course-it-style-fixture.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const library = await loadCreativeLibrary(root);

test('course style is readable through the regular skill catalog and linked kit', async () => {
  assert.ok(skills.some(entry => entry.id === 'course-it-style-1'));
  const skill = await readSkill('course-it-style-1', root);
  assert.ok(skill.instructions.replaceAll('\r\n', '\n').startsWith('---\nname: course-it-style-1\n'));
  assert.ok(skill.instructions.includes('not a native motion-catalog recipe'));
  for (const match of skill.instructions.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (!match[1].startsWith('http')) await access(resolve(dirname(skill.absolutePath), match[1]));
  }
  assert.ok(skill.relationships.some(edge => edge.to === 'editor-review'));
});

test('only explicit course-style edit requests select the style, not ordinary work or copy-only tasks', () => {
  for (const goal of ['Use Course IT Style 1 for this lesson', 'Apply course-it-style-1']) {
    assert.ok(recommend('tutorial', goal).skills.some(entry => entry.id === 'course-it-style-1'));
  }
  for (const [format, goal, task] of [
    ['tutorial', 'Explain a connection', 'edit'],
    ['story', 'Edit my daily vlog', 'edit'],
    ['tutorial', 'SEO for Course IT Style 1', 'package'],
    ['tutorial', 'Review Course IT Style 1', 'evaluate'],
  ] as const) assert.ok(!recommend(format, goal, false, task).skills.some(entry => entry.id === 'course-it-style-1'));
});

test('versioned catalog returns full instructions, clone-safe metadata and scoped implementations', () => {
  const listed = listCreativeTechniques(library);
  assert.ok(listed.some(entry => entry.key === 'course-it-style-1@1'));
  assert.ok(listed.every(entry => !('instructions' in entry)));
  const entry = showCreativeTechnique('course-it-style-1@1', library);
  assert.ok(entry.instructions.startsWith('---\nname: course-it-style-1\n'));
  assert.deepEqual(entry.placements, ['direction', 'full-frame']);
  assert.deepEqual(entry.implementations.map(impl => [impl.renderer, impl.aspects, impl.placements]),
    [['hyperframes', ['landscape'], ['full-frame']]]);
  assert.match(entry.fingerprint, /^[a-f0-9]{64}$/);
  entry.preserve.push('mutated returned copy');
  assert.ok(!showCreativeTechnique('course-it-style-1@1', library).preserve.includes('mutated returned copy'));
  assert.throws(() => showCreativeTechnique('course-it-style-1@latest', library));
  assert.throws(() => showCreativeTechnique('../escape@1', library));
  assert.throws(() => showCreativeTechnique('unknown@1', library), /Unknown technique/);
});

test('a valid illustrative plan remains unbound, unrenderable and unapproved', () => {
  const plan = draftCreativePlan(courseRequest(), library);
  assert.equal(plan.pins.length, 1);
  const report = checkCreativePlan(plan, library);
  assert.equal(report.structuralPass, true);
  for (const field of ['renderable', 'userApproved', 'sourceVerified', 'speechSyncVerified', 'aestheticUniquenessVerified'] as const) {
    assert.equal(report[field], false);
  }
  assert.equal(report.binding, 'unbound');
  assert.ok(report.findings.some(finding => finding.code === 'unbound-content'));
  assert.deepEqual(report.buildRequired, []);
  assert.equal(creativeWorkflow().providerRequired, false);
  assert.equal(creativeWorkflow().renders, false);
  assert.equal(creativeWorkflow().instructionsCommand, 'creative show <id@version>');
});

test('unsupported portrait, overlays, stale pins and invalid timings fail rather than inherit approval', () => {
  const plan = draftCreativePlan(courseRequest(), library);
  plan.request.aspect = 'portrait';
  assert.ok(checkCreativePlan(plan, library).findings.some(finding => finding.code === 'implementation-unsupported'));
  plan.request.aspect = 'landscape';
  plan.request.beats[0].uses[0].placement = 'overlay';
  assert.ok(checkCreativePlan(plan, library).findings.some(finding => finding.code === 'placement-unsupported'));
  plan.request.beats[0].uses[0].placement = 'full-frame';
  plan.pins[0].fingerprint = '0'.repeat(64);
  assert.ok(checkCreativePlan(plan, library).findings.some(finding => finding.code === 'stale-pin'));
  const invalid = courseRequest();
  invalid.beats[0].uses[0].end = 9;
  assert.throws(() => draftCreativePlan(invalid, library), /use-timing/);
});

test('a new implementation is explicit work, and supplied history is not visual originality evidence', () => {
  const input = courseRequest();
  input.beats[0].uses[0].implementation = null;
  const report = checkCreativePlan(draftCreativePlan(input, library), library,
    [{videoId: 'synthetic-prior-choice', leadSequence: ['course-it-style-1@1'], signatureMotif: null}]);
  assert.equal(report.structuralPass, true);
  assert.equal(report.buildRequired.length, 1);
  assert.equal(report.history.inspectedVideos, 0);
  assert.ok(report.findings.some(finding => finding.code === 'new-build-required'));
  assert.ok(report.findings.some(finding => finding.code === 'repeated-sequence'));
});

test('published kit contains only authoring files, licensed assets and the diagram-only still', async () => {
  const kit = resolve(root, 'demos/course-it-style-1-kit');
  const walk = async (directory: string): Promise<string[]> => (await Promise.all(
    (await readdir(resolve(kit, directory), {withFileTypes: true})).map(entry => {
      const name = directory ? directory + '/' + entry.name : entry.name;
      return entry.isDirectory() ? walk(name) : Promise.resolve([name]);
    }))).flat();
  assert.deepEqual((await walk('')).sort(), [
    'README.md', 'style.json', 'approved-example/build.mjs', 'approved-example/contact-sheet.jpg',
    'approved-example/assets/Geist-Variable.woff2', 'approved-example/assets/OFL-Geist.txt',
    'approved-example/assets/gsap.min.js',
  ].sort());
  const style = JSON.parse(await readFile(resolve(kit, 'style.json'), 'utf8'));
  assert.equal(style.id, 'course-it-style-1');
  assert.equal(style.approvedExample.narrationIncluded, false);
  assert.equal(style.approvedExample.sourceFootageIncluded, false);
  const readme = await readFile(resolve(kit, 'README.md'), 'utf8');
  assert.ok(readme.includes('not a self-contained audio'));
  const source = await readFile(resolve(kit, 'approved-example/build.mjs'), 'utf8');
  assert.ok(source.includes('assets/usb-lesson-voice.wav'));
  assert.ok(!/[A-Z]:[\\/]Users[\\/]|AIza[0-9A-Za-z_-]{35}/i.test(source));
  assert.match(await readFile(resolve(kit, 'approved-example/assets/OFL-Geist.txt'), 'utf8'), /SIL OPEN FONT LICENSE/);
  assert.match(await readFile(resolve(kit, 'approved-example/assets/gsap.min.js'), 'utf8'), /@license/);
  const still = await readFile(resolve(kit, 'approved-example/contact-sheet.jpg'));
  assert.equal(still.subarray(0, 3).toString('hex'), 'ffd8ff');
});
