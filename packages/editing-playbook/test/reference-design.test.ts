import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {designFixture} from '../../video-understanding/test/design-fixture.ts';
import {designCriteria} from '@diffusionstudio/video-understanding/reference-design';
import {adaptScene} from '../src/scene-motion.ts';
import {sceneComposition,condensedTitles} from '../src/scene-composition.ts';
import {layeredRuntime} from '../src/scene-layered.ts';
import {captureMotionEntry,MotionCatalog,composeMotionCatalog} from '../src/motion-catalog.ts';
import {sceneFixture} from './scene-fixture.ts';
import {catalogRequest} from './motion-catalog-fixture.ts';
test('detailed requirements cannot be dropped, weakened or rebound',()=>{
 const {recipe,input}=sceneFixture(),analysis=designFixture();recipe.style.design=[{referenceId:'ref',analysis}];
 recipe.style.criteria.push(...designCriteria('ref',analysis));input.shots[0].criteria.push(...designCriteria('ref',analysis).map(c=>c.id));
 assert.equal(adaptScene(recipe,input).recipe.style.design?.length,1);
 const missing=structuredClone(recipe);missing.style.criteria.pop();assert.throws(()=>adaptScene(missing,input),/detailed requirement/);
 const weakened=structuredClone(recipe);weakened.style.criteria.at(-1)!.essential=false;assert.throws(()=>adaptScene(weakened,input),/detailed requirement/);
 const rebound=structuredClone(recipe);rebound.style.design![0].analysis.sequenceSha256='b'.repeat(64);assert.throws(()=>adaptScene(rebound,input),/exact inspected reference/);
});
test('catalog keeps detailed knowledge and creates fresh per-feature review requirements',async()=>{
 const catalog=new MotionCatalog(fileURLToPath(new URL('../../../motion-catalog/',import.meta.url))),base=await catalog.get('word-stack@1');
 const {schemaVersion,kind,sourceRecipeSha256,block,caption,...metadata}=base;
 const {recipe}=sceneFixture();recipe.compositor='layered-v2';recipe.style.design=[{referenceId:'ref',analysis:designFixture()}];recipe.style.criteria.push(...designCriteria('ref',recipe.style.design[0].analysis));
 const entry=captureMotionEntry(recipe,'picture',metadata);assert.equal(entry.designKnowledge?.[0].features.length,4);
 assert.doesNotMatch(JSON.stringify(entry.designKnowledge),/sequenceSha256|inspectedFrames|elementIds/);
 const result=composeMotionCatalog([entry],catalogRequest(entry));assert.equal(result.recipe.style.criteria.length,8);
 assert.equal(result.input.shots[0].criteria.length,8);assert.equal(result.recipe.style.design,undefined);assert.equal(result.recipe.style.basis,'catalog');
});
test('finishing cannot silently fall back to the editor renderer',()=>{
 const {recipe,input}=sceneFixture();recipe.compositor='layered-v2';recipe.templates[0].finish={grain:.2,vignette:.3,seed:7};
 assert.match(sceneComposition(adaptScene(recipe,input),{audio:'test.wav',media:{'one/main':'test.mp4'}}),/Remotion-only/);
});
test('condensed glyph aspect is explicit and refuses unsupported text modes',()=>{
 assert.match(condensedTitles(layeredRuntime),/ctx\.scale\(f\.horizontalScale\|\|1,1\)/);
 const {recipe,input}=sceneFixture();recipe.compositor='layered-v2';
 recipe.caption.font.horizontalScale=.7;assert.throws(()=>adaptScene(recipe,input),/unwrapped layered titles/);
 delete recipe.caption.font.horizontalScale;
 const l=recipe.templates[0].layers[0];l.kind='text';delete l.slot;l.text='TEST';l.font={...recipe.caption.font,horizontalScale:.7};
 input.shots[0].bindings=[];
 assert.doesNotThrow(()=>adaptScene(recipe,input));
 l.textLayout={maxLines:2,minFontSize:.03,lineGap:1};assert.throws(()=>adaptScene(recipe,input),/unwrapped layered titles/);
});
