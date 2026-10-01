import type { Command } from 'commander';
import { z } from 'zod';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { SceneWorkflow, preflightScene, verifySceneSegment, reflowSceneLayout, sceneLayoutOptionsSchema, sceneMeasurementSchema, goldenRequestSchema } from '@diffusionstudio/editing-playbook/scene-workflow';
import { adaptScene, sceneRecipeSchema, sceneInputSchema, sceneReviewSchema, sceneCorrectionSchema } from '@diffusionstudio/editing-playbook/scene-motion';
import { readMotionJSON } from '@diffusionstudio/editing-playbook/motion-workflow';
import { renderPreparedComposition } from './playbook-delivery';
import { waitForCliSocket } from './cli-client';
import { sceneRendererId } from './scene-renderer-id';

const print = (x: unknown) => console.log(JSON.stringify(x, null, 2));
async function run(fn: (signal: AbortSignal) => Promise<unknown>) {
  const controller = new AbortController(), abort = () => controller.abort(); process.once('SIGINT', abort);
  try { print(await fn(controller.signal)); } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', abort); }
}
export function registerSceneMotionCommands(motion: Command) {
  const scene = motion.command('scene').description('Reference specification → layered scenes + aligned words → actual editor → fidelity review');
  scene.command('workflow').action(() => print({ instructions: 'reference/scene-motion.md', skill: 'editor-motion-workflow',
    stages: ['inspect bounded reference sequences', 'author recipe and source/asset/framing input', 'check', 'start', 'render', 'review every reference criterion', 'correct (bounded)'],
    schemas: Object.fromEntries(Object.entries({ recipe: sceneRecipeSchema, input: sceneInputSchema, review: sceneReviewSchema, correction: sceneCorrectionSchema,
      layout:sceneLayoutOptionsSchema,measurement:sceneMeasurementSchema,golden:goldenRequestSchema })
      .map(([k,v]) => [k,z.toJSONSchema(v,{io:'input'})])), externalModelCalls: 0, safeToAutoPublish: false,
    limits: 'Legacy: 30s / 32 layers. layered-v2: 60s / 48 layers, ordered media/graphics, image masks, uniform-scale groups, source-word cues, precision curves and constrained text layout. Both: 16 shots / original continuous audio / 0–4 corrections. Seeded tracking and sampled visual regressions are fallible measurements, not semantic detection, listening or 3D recovery. See reference/scene-precision.md.' }));
  scene.command('layout').argument('<recipe.json>').argument('<input.json>').argument('<options.json>').requiredOption('-o, --output <new-directory>')
    .description('Propose constrained readable title layout; inspect unresolved placements before starting a render job')
    .action((recipe:string,input:string,options:string,o:{output:string})=>run(async()=>{
      const result=reflowSceneLayout(await readMotionJSON(recipe),await readMotionJSON(input),await readMotionJSON(options)),root=resolve(o.output);await mkdir(root);
      for(const [name,value]of Object.entries(result))await writeFile(join(root,`${name}.json`),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
      return {directory:root,...result.report};
    }));
  scene.command('measure').argument('<job>').argument('<targets.json>').description('Seeded measurements from the actual rendered pixels; no automatic corrections or approval')
    .action((job:string,path:string)=>run(async signal=>new SceneWorkflow(job).measure(await readMotionJSON(path),signal)));
  scene.command('golden').argument('<job>').argument('<frames.json>').requiredOption('-o, --output <new-json>')
    .action((job:string,path:string,o:{output:string})=>run(async signal=>{
      const result=await new SceneWorkflow(job).golden(await readMotionJSON(path),signal);await writeFile(resolve(o.output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
      return {path:resolve(o.output),sourceSha256:result.sourceSha256,frames:result.frames,safeToAutoPublish:false};
    }));
  scene.command('compare-golden').argument('<job>').argument('<baseline.json>').option('--tolerance <number>','mean RGB difference, 0–20','1')
    .action((job:string,path:string,o:{tolerance:string})=>run(async signal=>{
      const baseline=await readMotionJSON(path),settings=z.object({frames:z.array(z.number()),width:z.number()}).parse(baseline);
      return new SceneWorkflow(job).compareGolden(baseline,settings,Number(o.tolerance),signal);
    }));
  scene.command('check').argument('<recipe.json>').argument('<input.json>').action((recipe:string,input:string)=>run(async()=>{
    const adaptation=adaptScene(await readMotionJSON(recipe),await readMotionJSON(input));return {...adaptation,preflight:preflightScene(adaptation)};
  }));
  scene.command('start').argument('<recipe.json>').argument('<input.json>').requiredOption('-o, --output <new-directory>').option('--max-corrections <n>','bounded retries','2')
    .action((recipe:string,input:string,o:{output:string;maxCorrections:string})=>run(async signal=>new SceneWorkflow(o.output).create(await readMotionJSON(recipe),await readMotionJSON(input),Number(o.maxCorrections),signal)));
  scene.command('next').argument('<job>').action((job:string)=>run(()=>new SceneWorkflow(job).next()));
  scene.command('render').argument('<job>').option('--full','Render the complete composition without scene cache').action((job:string,options:{full?:boolean})=>run(async signal=>{
    const workflow=new SceneWorkflow(job);await workflow.renderContext(signal);await waitForCliSocket();
    if(!options.full) {
      const render=await workflow.renderIncremental(await sceneRendererId(),async ({directory,output,segment})=>{
        const result=await renderPreparedComposition(directory,{name:`Scene DRAFT ${segment.shotId}`,height:segment.height,fps:30,chapters:[]},output,
          (_root,path)=>verifySceneSegment(path,segment,signal),message=>console.error(message),{audio:false});
        if(result.status==='technical_review_failed')throw Error('Scene render failed technical review');
        return result;
      },signal,message=>console.error(message));
      return {render,next:await workflow.inspect(signal)};
    }
    const c=await workflow.claimRender(signal);
    const render=await renderPreparedComposition(c.directory,c.bundle,c.output,(_root,path)=>workflow.verifyRender(path,signal),message=>console.error(message));
    if(render.status==='technical_review_failed'){process.exitCode=1;return render;}
    return {render,next:await workflow.inspect(signal)};
  }));
  scene.command('inspect').argument('<job>').action((job:string)=>run(signal=>new SceneWorkflow(job).inspect(signal)));
  scene.command('review').argument('<job>').argument('<review.json>').action((job:string,path:string)=>run(async signal=>new SceneWorkflow(job).review(await readMotionJSON(path),signal)));
  scene.command('correct').argument('<job>').argument('<correction.json>').action((job:string,path:string)=>run(async signal=>new SceneWorkflow(job).correct(await readMotionJSON(path),signal)));
}
