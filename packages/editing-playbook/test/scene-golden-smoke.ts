/** Explicit local integration check; needs a running desktop editor and a prior
 * verified job. Not run by unit tests; never publishes or changes that baseline. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {SceneWorkflow} from '../src/scene-workflow.ts';
import {compareSceneGoldens} from '../src/scene-precision.ts';

const [baselinePath,newDirectory]=process.argv.slice(2);
if(!baselinePath||!newDirectory)throw Error('Usage: node scene-golden-smoke.ts BASELINE_JOB NEW_DIRECTORY');
const root=resolve(newDirectory);await mkdir(root); // Exclusive: never overwrite prior evidence.
const save=(name:string,value:unknown)=>writeFile(join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const baseline=new SceneWorkflow(baselinePath),context=await baseline.renderContext();
const frames=context.value.adaptation.input.shots.flatMap(s=>{
  const start=Math.round(s.start*30),end=Math.round(s.end*30)-1;
  return [start,Math.min(end,start+5),Math.round((start+end)/2),end];
}).slice(0,24);
const settings={frames,width:128};
const golden=await baseline.golden(settings);await save('baseline.json',golden);
const candidate=new SceneWorkflow(join(root,'job'));
await candidate.create(context.value.adaptation.recipe,context.value.adaptation.input,0);
const cli=fileURLToPath(new URL('../../../apps/cli/dist/index.js',import.meta.url));
// CLI output is bounded diagnostics; stderr shows progress to the caller.
await new Promise<void>((ok,fail)=>{const child=spawn(process.execPath,[cli,'playbook','motion','scene','render',candidate.root],{stdio:['ignore','pipe','inherit']});
  let output='';child.stdout.on('data',b=>{output+=b;if(output.length>8*1024**2){child.kill();fail(Error('Unexpected CLI output budget'));}});
  child.on('error',fail);child.on('close',async code=>{if(code!==0){fail(Error('Actual editor regression render failed'));return;}try{await save('render.json',JSON.parse(output));ok();}catch(e){fail(e);}});
});
const next=await candidate.golden(settings),comparison=compareSceneGoldens(golden,next,1);
await save('candidate.json',next);await save('comparison.json',comparison);
assert.equal(comparison.status,'within_regression_tolerance','Inspect changed frames; do not automatically bless a new baseline');
console.log(JSON.stringify({status:comparison.status,samples:comparison.differences.length,maximumMeanRgbDifference:Math.max(...comparison.differences.map(d=>d.meanRgbDifference)),directory:root}));
