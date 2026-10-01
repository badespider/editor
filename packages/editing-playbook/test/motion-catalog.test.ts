import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MotionCatalog, captureMotionEntry, composeMotionCatalog, findMotionCatalogRoot } from '../src/motion-catalog.ts';
import { adaptScene, motionDigest, resolveSceneTemplate, reviewScene, scenePoseAt, sceneRecipeSchema, styleDimensions } from '../src/scene-motion.ts';
import { sceneComposition } from '../src/scene-composition.ts';
import { sceneFixture } from './scene-fixture.ts';
import { catalogRequest } from './motion-catalog-fixture.ts';

const root = fileURLToPath(new URL('../../../motion-catalog/', import.meta.url));
const catalog = new MotionCatalog(root);

test('shared catalog is discoverable, searchable, pinned and portable', async () => {
  assert.equal(await findMotionCatalogRoot(join(root, '..', 'packages')), root.replace(/[\\/]$/, ''));
  const all = await catalog.list(); assert.equal(all.length, 4);
  assert.deepEqual((await catalog.list('stagger images')).map(e => e.selector), ['one-to-many@1']);
  for (const item of all) {
    const entry = await catalog.get(item.selector), json = JSON.stringify(entry);
    assert.equal(item.sha256, motionDigest(entry)); assert.equal(item.safeToAutoPublish, false);
    assert.doesNotMatch(json, /C:[\\/]|\.mp4|"cache"|"transcript"|"permission"|"approved"/);
    assert.ok(entry.block.layers.every(l => l.kind !== 'text' || l.text === l.id));
  }
  for (const pin of ['one-to-many', '../escape@1', 'scale-title@0', 'scale-title@99999']) await assert.rejects(catalog.get(pin), /Pin a catalog/);
});

test('capture keeps editable motion but strips project evidence, source text and approval', async () => {
  const { recipe } = sceneFixture();
  recipe.templates[0].layers.push({ ...recipe.templates[0].layers[0], id: 'title', kind: 'text', slot: undefined,
    text: 'PRIVATE SOURCE TEXT', font: recipe.caption.font });
  const base = await catalog.get('word-stack@1');
  const { schemaVersion, kind, sourceRecipeSha256, block, caption, ...metadata } = base;
  void schemaVersion; void kind; void sourceRecipeSha256; void block; void caption;
  const result = captureMotionEntry(recipe, 'picture', metadata);
  assert.equal(result.block.layers[1].text, 'title'); assert.equal(result.sourceRecipeSha256, motionDigest(sceneRecipeSchema.parse(recipe)));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE SOURCE TEXT|\/synthetic/);
  assert.throws(() => captureMotionEntry(recipe, 'missing', metadata), /Unknown source/);
});

test('versions cannot overwrite one another and corruption is rejected', async () => {
  const c = new MotionCatalog(await mkdtemp(join(tmpdir(), 'motion-catalog-'))), e = await catalog.get('scale-title@1');
  const saved = await c.add(e); await assert.rejects(c.add(e), /EEXIST/);
  const v2 = { ...e, version: 2, name: 'Revised title' }; await c.add(v2);
  assert.equal((await c.get('scale-title@1')).name, e.name); assert.equal((await c.list()).length, 2);
  const bytes = JSON.parse(await readFile(saved.path, 'utf8')); bytes.entry.name = 'Tampered';
  await writeFile(saved.path, JSON.stringify(bytes)); await assert.rejects(c.get('scale-title@1'), /fingerprint/);
  await assert.rejects(c.list(), /fingerprint/);
});

for (const pin of ['one-to-many@1', 'layered-image@1', 'scale-title@1', 'word-stack@1']) {
  test(`${pin} reuses animation with new media/text/cues in portrait, square and landscape`, async () => {
    const entry = await catalog.get(pin), sourceHash = motionDigest(entry);
    for (const [width, height] of [[1080, 1920], [1080, 1080], [1920, 1080]]) {
      const request = catalogRequest(entry); request.input.width = width; request.input.height = height;
      const original = structuredClone(request), result = await catalog.apply(request);
      assert.deepEqual(request, original); assert.equal(motionDigest(entry), sourceHash);
      assert.equal(result.recipe.style.basis, 'catalog'); assert.deepEqual(result.recipe.style.references, []);
      assert.equal(result.receipt.safeToAutoPublish, false); assert.equal(result.receipt.entries![0].sha256, sourceHash);
      assert.deepEqual(result.input.transcript, request.input.transcript); assert.deepEqual(result.input.audio, request.input.audio);
      assert.deepEqual(result.input.shots[0].framing, request.input.shots[0].framing);
      const adaptation = adaptScene(result.recipe, result.input), shot = result.input.shots[0];
      const template = resolveSceneTemplate(result.recipe.templates[0], shot, result.input);
      for (const layer of template.layers.filter(l => l.kind === 'video' || l.kind === 'image')) {
        const expected = layer.kind === 'image' ? 2 : 1080 / 1920;
        for (const time of [0, .15, .5, 1]) {
          const p = scenePoseAt(layer, time); assert.ok(Math.abs(p.width * width / (p.height * height) - expected) < 1e-7);
        }
      }
      const media = Object.fromEntries(shot.bindings.map(b => [`${shot.id}/${b.slot}`, '/synthetic/prepared.png']));
      const code = sceneComposition(adaptation, { audio: '/synthetic/audio.wav', media });
      assert.ok(code.includes('New')); assert.ok(code.includes('Source-aligned typography'));
      assert.deepEqual(result, await catalog.apply(request));
    }
  });
}

test('aspect adaptation respects an opted-in measured-text minimum', async () => {
  const entry = structuredClone(await catalog.get('scale-title@1'));
  const title = entry.block.layers.find(l => l.id === 'stadium-title')!;
  title.textLayout = { maxLines: 2, minFontSize: title.font!.size, lineGap: 1.1 };
  const original = structuredClone(entry), request = catalogRequest(entry);
  request.input.width = 1920; request.input.height = 1080;
  const result = composeMotionCatalog([entry], request);
  const adapted = result.recipe.templates[0].layers.find(l => l.id === 'stadium-title')!;
  assert.equal(adapted.font!.size, title.textLayout.minFontSize);
  assert.deepEqual(adapted.textLayout, title.textLayout);
  assert.deepEqual(entry, original);
  assert.doesNotThrow(() => adaptScene(result.recipe, result.input));
});

test('multiple scene instances share versioned blocks without sharing text or edits', async () => {
  const entry = await catalog.get('scale-title@1'), request = catalogRequest(entry);
  request.input.audio.end = 22;
  request.input.shots.push({ ...structuredClone(request.input.shots[0]), id: 'two', start: 6, end: 12, cues: { accent: 'w3', reveal: 'w4' } });
  request.input.transcript.words.push({ id: 'w3', text: 'Different', start: 17, end: 17.5 }, { id: 'w4', text: 'subject', start: 19, end: 19.5 });
  request.input.captions.push({ id: 'second', start: 6.9, end: 11, words: [{ wordId: 'w3', row: 0, scale: 1 }, { wordId: 'w4', row: 1, scale: 1.5 }] });
  request.instances.push({ ...structuredClone(request.instances[0]), shotId: 'two', text: { 'stadium-back': 'SECOND SHOT', 'stadium-title': 'NEW SUBJECT' },
    colors: { '#D7D7D0': '#ABCDEF' }, fontFamily: 'Arial' });
  const result = await catalog.apply(request);
  assert.equal(result.recipe.templates[0].background, '#D7D7D0'); assert.equal(result.recipe.templates[1].background, '#ABCDEF');
  assert.equal(result.receipt.entries!.length, 1); assert.equal(result.recipe.templates[1].layers.find(l => l.id === 'stadium-title')!.text, 'NEW SUBJECT');
});

test('missing/unknown text, media, dimensions, cues, shots and controls fail closed', async () => {
  const entry = await catalog.get('scale-title@1');
  const mutations: ((r: ReturnType<typeof catalogRequest>) => void)[] = [
    r => { delete r.instances[0].text['stadium-title']; }, r => { r.instances[0].text.extra = 'unexpected'; },
    r => { r.input.shots[0].bindings = []; }, r => { delete r.mediaDimensions.still; },
    r => { r.input.shots[0].cues = {}; }, r => { r.input.shots[0].cues!.reveal = 'missing'; },
    r => { r.input.shots[0].cues!.extra = 'w1'; }, r => { r.input.shots[0].cues!.reveal = 'w1'; r.input.transcript.words[0].start = 10.05; },
    r => { r.instances[0].colors = { '#123456': '#FFFFFF' }; }, r => { r.instances[0].fontFamily = 'Arial;fetch(url)'; },
    r => { r.captionFromShot = 'missing'; }, r => { r.instances.push(r.instances[0]); },
    r => { r.instances[0].shotId = 'missing'; }, r => { r.input.shots[0].end = 20; },
  ];
  for (const mutate of mutations) { const r = catalogRequest(entry); mutate(r); assert.throws(() => composeMotionCatalog([entry], r)); }
});

test('explicit crop is aspect-correct; unknown entry fields cannot hide executable code', async () => {
  const entry = await catalog.get('scale-title@1'), request = catalogRequest(entry);
  request.input.shots[0].bindings[0].crop = { x: .25, y: 0, width: .5, height: 1 };
  const result = await catalog.apply(request), image = result.recipe.templates[0].layers.find(l => l.kind === 'image')!;
  assert.ok(Math.abs(image.pose.width * result.input.width / (image.pose.height * result.input.height) - 1) < 1e-8);
  assert.throws(() => composeMotionCatalog([{ ...entry, code: 'execute me' }], request));
});

test('catalog review needs fresh render evidence, never reports reference match or listening approval', async () => {
  const entry = await catalog.get('scale-title@1'), result = await catalog.apply(catalogRequest(entry));
  const adaptation = adaptScene(result.recipe, result.input), hash = 'a'.repeat(64);
  const expected = { adaptation, evidence: [{ id: 'frame', role: 'render' as const, kind: 'frame' as const }],
    revisionSha256: hash, renderSha256: hash, inspectionSha256: hash, revision: 0, maxCorrections: 2 };
  const finding = { status: 'pass', note: 'Synthetic assertion only', renderEvidenceIds: ['frame'], referenceEvidenceIds: [] as string[] };
  const review = { revisionSha256: hash, renderSha256: hash, inspectionSha256: hash, reviewer: 'Synthetic', inspectedEvidenceIds: ['frame'],
    criteria: styleDimensions.map(d => ({ ...finding, criterionId: d })),
    checks: ['readability', 'continuity', 'speech_sync', 'audio'].map(kind => ({ ...finding, kind, status: ['speech_sync', 'audio'].includes(kind) ? 'unknown' : 'pass' })) };
  const checked = reviewScene(review, expected);
  assert.equal(checked.styleMatch, 'agent_reported_template_conformance'); assert.equal(checked.status, 'needs_human_review');
  review.criteria[0].renderEvidenceIds = []; assert.throws(() => reviewScene(review, expected), /matching rendered evidence/);
  const reference = sceneFixture(); reference.recipe.style.references = []; assert.throws(() => adaptScene(reference.recipe, reference.input), /evidence-backed/);
  result.recipe.style.references = sceneFixture().recipe.style.references; assert.throws(() => adaptScene(result.recipe, result.input), /evidence-backed/);
});
