import type { Command } from 'commander';
import { z } from 'zod';
import { SceneWorkflow } from '@diffusionstudio/editing-playbook/scene-workflow';
import { adaptScene, sceneRecipeSchema, sceneInputSchema, sceneReviewSchema, sceneCorrectionSchema } from '@diffusionstudio/editing-playbook/scene-motion';
import { readMotionJSON } from '@diffusionstudio/editing-playbook/motion-workflow';
import { renderPreparedComposition } from './playbook-delivery';
import { waitForCliSocket } from './cli-client';

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
    schemas: Object.fromEntries(Object.entries({ recipe: sceneRecipeSchema, input: sceneInputSchema, review: sceneReviewSchema, correction: sceneCorrectionSchema })
      .map(([k,v]) => [k,z.toJSONSchema(v,{io:'input'})])), externalModelCalls: 0, safeToAutoPublish: false,
    limits: 'Legacy: 30s / 32 layers. layered-v2: 60s / 48 layers, ordered media/graphics, image masks, uniform-scale groups and source-word cues. Both: 16 shots / original continuous audio / 0–4 corrections. No automatic tracking, listening or 3D project recovery.' }));
  scene.command('check').argument('<recipe.json>').argument('<input.json>').action((recipe:string,input:string)=>run(async()=>adaptScene(await readMotionJSON(recipe),await readMotionJSON(input))));
  scene.command('start').argument('<recipe.json>').argument('<input.json>').requiredOption('-o, --output <new-directory>').option('--max-corrections <n>','bounded retries','2')
    .action((recipe:string,input:string,o:{output:string;maxCorrections:string})=>run(async signal=>new SceneWorkflow(o.output).create(await readMotionJSON(recipe),await readMotionJSON(input),Number(o.maxCorrections),signal)));
  scene.command('next').argument('<job>').action((job:string)=>run(()=>new SceneWorkflow(job).next()));
  scene.command('render').argument('<job>').action((job:string)=>run(async signal=>{
    const workflow=new SceneWorkflow(job);await workflow.renderContext(signal);await waitForCliSocket();const c=await workflow.claimRender(signal);
    const render=await renderPreparedComposition(c.directory,c.bundle,c.output,(_root,path)=>workflow.verifyRender(path,signal),message=>console.error(message));
    if(render.status==='technical_review_failed'){process.exitCode=1;return render;}
    return {render,next:await workflow.inspect(signal)};
  }));
  scene.command('inspect').argument('<job>').action((job:string)=>run(signal=>new SceneWorkflow(job).inspect(signal)));
  scene.command('review').argument('<job>').argument('<review.json>').action((job:string,path:string)=>run(async signal=>new SceneWorkflow(job).review(await readMotionJSON(path),signal)));
  scene.command('correct').argument('<job>').argument('<correction.json>').action((job:string,path:string)=>run(async signal=>new SceneWorkflow(job).correct(await readMotionJSON(path),signal)));
}
