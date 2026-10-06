import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referenceDesignSchema,portableDesign,portableDesignSchema} from '../src/reference-design.ts';
import {compareRGB,pixelComparisonSchema} from '../src/reference-pixels.ts';
import {designFixture} from './design-fixture.ts';
test('rejects omitted categories, invented evidence and unlistened audio',()=>{
 for(const change of [
 (d:ReturnType<typeof designFixture>)=>d.sections.pop(),
 (d:ReturnType<typeof designFixture>)=>d.sections[1]=d.sections[0],
 (d:ReturnType<typeof designFixture>)=>d.sections[0].frames.push(9),
 (d:ReturnType<typeof designFixture>)=>d.sections.at(-1)!.state='observed',
 (d:ReturnType<typeof designFixture>)=>d.features[0].verification='audio-listening',
 (d:ReturnType<typeof designFixture>)=>d.features[0].frames=[0],
 (d:ReturnType<typeof designFixture>)=>d.sections[0].state='unknown',
 (d:ReturnType<typeof designFixture>)=>d.features[0].elementIds=['missing'],
 ]){const d=designFixture();change(d);assert.equal(referenceDesignSchema.safeParse(d).success,false);}
 const portable=portableDesignSchema.parse(portableDesign(designFixture()));assert.equal(portable.features.length,4);
 assert.doesNotMatch(JSON.stringify(portable),/inspectedFrames|sequenceSha256|elementIds|"frames"/);
 assert.equal(portable.status,'reference_analysis_not_fidelity_approval');
});
test('RGB diagnostics are exact arithmetic, not a similarity percentage',()=>{
 const a=Uint8Array.from([0,0,0,255,255,255]);assert.equal(compareRGB(a,a).meanAbsoluteChannelError,0);
 const r=compareRGB(a,Uint8Array.from([30,0,0,255,255,255]));assert.equal(r.meanAbsoluteChannelError,5);assert.equal(r.maxChannelError,30);assert.equal(r.fractionPixelsWithAnyChannelErrorAbove10,.5);
 assert.throws(()=>compareRGB(a,new Uint8Array(3)));assert.throws(()=>pixelComparisonSchema.parse({referenceFrame:0,candidateFrame:0,rationale:''}));
});
