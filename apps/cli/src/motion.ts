import type { Command } from 'commander';
import { z } from 'zod';
import { MotionWorkflow, readMotionJSON } from '@diffusionstudio/editing-playbook/motion-workflow';
import { motionIntentSchema, motionInputSchema, motionCorrectionSchema, motionReviewSchema } from '@diffusionstudio/editing-playbook/motion';
import { referenceBreakdownSchema } from '@diffusionstudio/video-understanding/reference-schema';
import { renderPreparedComposition } from './playbook-delivery';
import { waitForCliSocket } from './cli-client';
import { registerSceneMotionCommands } from './scene-motion';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
async function action(fn: (signal: AbortSignal) => Promise<unknown>) {
  const controller = new AbortController(), abort = () => controller.abort(); process.once('SIGINT', abort);
  try { print(await fn(controller.signal)); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  finally { process.removeListener('SIGINT', abort); }
}
export function registerMotionCommands(playbook: Command) {
  const motion = playbook.command('motion').description('Agent-driven reference → reusable caption recipe → footage adaptation → bounded render/review corrections');
  registerSceneMotionCommands(motion);
  motion.command('workflow').action(() => print({ schemaVersion: 1, instructions: 'reference/motion.md', skill: 'editor-motion-workflow',
    stages: ['start', 'next (vision inspection)', 'interpret', 'adapt', 'render', 'review', 'correct (only for failed review)', 'render/review'],
    schemas: Object.fromEntries(Object.entries({ breakdown: referenceBreakdownSchema, intent: motionIntentSchema, footage: motionInputSchema,
      review: motionReviewSchema, correction: motionCorrectionSchema }).map(([k, v]) => [k, z.toJSONSchema(v, { io: 'input' })])),
    limits: { previewSeconds: 30, captionCues: 24, defaultCorrections: 2, maxCorrections: 4, fps: 30 },
    agentSupplies: ['actual vision inspection', 'phase mapping and style choices', 'review judgments', 'correction parameters'],
    externalModelCalls: 0, safeToAutoPublish: false,
    limitation: 'No autonomous model process, speech transcription, subject tracker or exact easing recovery. next exposes resumable work to the current capable agent.' }));
  motion.command('start').argument('<reference-video>').requiredOption('--start <seconds>').requiredOption('--end <seconds>')
    .requiredOption('-o, --output <new-directory>').option('--max-corrections <number>', 'bounded correction count', '2')
    .option('--max-decoded-mib <number>', 'native reference storage budget', '1024')
    .action((reference: string, o: { start: string; end: string; output: string; maxCorrections: string; maxDecodedMib: string }) =>
      action(signal => new MotionWorkflow(o.output).create({ reference, start: Number(o.start), end: Number(o.end),
        maxCorrections: Number(o.maxCorrections), maxDecodedMiB: Number(o.maxDecodedMib) }, signal)));
  motion.command('next').argument('<job>').option('--from <frame-index>', 'reference pagination only', '0')
    .action((job: string, o: { from: string }) => action(signal => new MotionWorkflow(job).next(Number(o.from), signal)));
  motion.command('reuse').argument('<existing-job>').requiredOption('-o, --output <new-job>')
    .description('Reuse the reference recipe with its original attribution; never reuse footage review approval')
    .action((job: string, o: { output: string }) => action(() => new MotionWorkflow(o.output).reuse(job)));
  motion.command('interpret').argument('<job>').argument('<breakdown.json>').argument('<intent.json>')
    .action((job: string, report: string, intent: string) => action(async signal => new MotionWorkflow(job).interpret(await readMotionJSON(report), await readMotionJSON(intent), signal)));
  motion.command('adapt').argument('<job>').argument('<input.json>')
    .action((job: string, input: string) => action(async signal => new MotionWorkflow(job).adapt(await readMotionJSON(input), signal)));
  motion.command('render').argument('<job>').description('Create a NEW editor project, render this draft, then prepare actual-frame/audio review evidence')
    .action((job: string) => action(async signal => {
      const workflow = new MotionWorkflow(job);
      await workflow.renderContext(signal); await waitForCliSocket();
      const context = await workflow.claimRender(signal);
      const result = await renderPreparedComposition(context.directory, context.bundle, context.output,
        (_root, path) => workflow.verifyRender(path, signal), message => console.error(message));
      if (result.status === 'technical_review_failed') { process.exitCode = 1; return result; }
      return { render: result, next: await workflow.inspect(signal) };
    }));
  motion.command('inspect').argument('<job>').description('Resume frame/audio evidence preparation after a completed preview export')
    .action((job: string) => action(signal => new MotionWorkflow(job).inspect(signal)));
  motion.command('review').argument('<job>').argument('<review.json>')
    .action((job: string, path: string) => action(async signal => new MotionWorkflow(job).review(await readMotionJSON(path), signal)));
  motion.command('correct').argument('<job>').argument('<correction.json>')
    .action((job: string, path: string) => action(async signal => new MotionWorkflow(job).correct(await readMotionJSON(path), signal)));
}
