import { constants } from 'node:fs';
import { copyFile, mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { readDeliveryBundle } from '@diffusionstudio/editing-playbook/delivery';
import { verifyDelivery } from '@diffusionstudio/editing-playbook/review';
import { formatChapters } from '@diffusionstudio/editing-playbook';
import { editor, waitForCliSocket } from './cli-client';
import { compileProject } from './compile-project';

async function requireAbsent(path: string) {
  try { await stat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  throw new Error(`Output already exists; choose a new path: ${path}`);
}

/** Explicit user/agent command: creates a NEW project, never modifies an existing edit. */
export async function deliverPreparedEdit(directory: string, destination: string, onProgress?: (message: string) => void) {
  const { root, bundle } = await readDeliveryBundle(directory);
  return renderPreparedComposition(root, bundle, destination, verifyDelivery, onProgress);
}

/** Shared actual-editor export mechanics; each bundle kind retains its own validator/verifier. */
export async function renderPreparedComposition<R extends { technicalPass: boolean; sha256: string }>(root: string,
  bundle: { name: string; height: number; fps: 30; chapters: { seconds: number; title: string }[] }, destination: string,
  verify: (directory: string, path: string, options: { onProgress?: (message: string) => void }) => Promise<R>, onProgress?: (message: string) => void) {
  const output = resolve(destination), reportPath = output + '.review.json', chapterPath = output + '.chapters.txt';
  if (extname(output).toLowerCase() !== '.mp4') throw new Error('Delivery output must end in .mp4');
  await Promise.all([output, reportPath, chapterPath].map(requireAbsent));
  const code = await compileProject({ path: join(root, 'edit.tsx') });
  await waitForCliSocket();
  await mkdir(dirname(output), { recursive: true });
  const run = await mkdtemp(join(root, '.render-'));
  const workingOutput = join(run, 'actual-editor-render.mp4');
  const project = await editor.project.create.mutate({ name: bundle.name });
  const runPath = join(run, 'run.json');
  const runRecord = { project, output, workingOutput, state: 'mounting', reviewRequired: true, error: '' };
  await writeFile(runPath, JSON.stringify(runRecord, null, 2), { flag: 'wx' });
  const recordState = async (state: string, error = '') => {
    runRecord.state = state; runRecord.error = error;
    await writeFile(runPath, JSON.stringify(runRecord, null, 2));
  };
  onProgress?.(`Created new editor project: ${project.name} (${project.id})`);
  // A timeout/disconnected CLI may leave a bounded editor export running. Preserve the project/run
  // for diagnosis; do not delete it or retry automatically against potentially changing app state.
  try {
    await editor.mount.mutate({ code }, { context: { timeoutMs: 600000 } });
    const context = await editor.context.query();
    if (context.projectId !== project.id || context.activeSceneId == null || context.scenes.length !== 1) throw new Error('Unexpected editor context after mount');
    onProgress?.('Rendering the actual editor composition');
    await recordState('rendering');
    await editor.node.render.mutate({ id: context.activeSceneId, output: workingOutput, config: {
      format: 'mp4', video: { codec: 'avc', resolution: bundle.height, fps: bundle.fps, bitrate: 12000000 },
      audio: { enabled: true, codec: 'aac', bitrate: 192000, sampleRate: 48000, numberOfChannels: 2 },
    } }, { context: { timeoutMs: 3_600_000 } });
    await recordState('verifying');
    const review = await verify(root, workingOutput, { onProgress });
    await writeFile(join(run, 'review.json'), JSON.stringify(review, null, 2), { flag: 'wx' });
    if (!review.technicalPass) {
      await recordState('technical_review_failed');
      return { status: 'technical_review_failed', projectId: project.id, run, review, output: null };
    }
    // Only technically checked exports reach the requested filename. COPYFILE_EXCL closes the
    // no-overwrite race even if another process creates the destination during the render.
    await recordState('saving_delivery');
    await copyFile(workingOutput, output, constants.COPYFILE_EXCL);
    await writeFile(reportPath, JSON.stringify({ ...review, path: output, renderedPath: workingOutput, projectId: project.id }, null, 2), { flag: 'wx' });
    await writeFile(chapterPath, formatChapters(bundle.chapters), { flag: 'wx' });
    await recordState('technical_pass_needs_visual_review');
    return { status: 'technical_pass_needs_visual_review', output, reportPath, chapterPath, projectId: project.id,
      run, sha256: review.sha256, reviewRequired: true, safeToAutoPublish: false, aiCalls: 0 };
  } catch (error) {
    // A disconnected export is not necessarily stopped; preserve this uncertainty.
    await recordState('failed_or_interrupted_inspect_before_retry', (error as Error).message).catch(() => {});
    throw error;
  }
}
