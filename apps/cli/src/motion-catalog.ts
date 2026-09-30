import type { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { MotionCatalog, captureMotionEntry, describeMotionEntry, findMotionCatalogRoot,
  motionCatalogEntrySchema, motionCatalogRequestSchema } from '@diffusionstudio/editing-playbook/motion-catalog';
import { readMotionJSON } from '@diffusionstudio/editing-playbook/motion-workflow';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
async function run(fn: () => Promise<unknown>) {
  try { print(await fn()); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
export function registerMotionCatalogCommands(motion: Command) {
  const catalog = motion.command('catalog').description('Versioned reusable motion blocks; new text/media, same editable animation')
    .option('--catalog <directory>', 'Explicit shared/private library; defaults to this editor checkout');
  const library = async () => new MotionCatalog(catalog.opts().catalog ?? await findMotionCatalogRoot());
  catalog.command('workflow').action(() => print({ instructions: 'reference/motion-catalog.md',
    stages: ['list/show pinned version', 'bind new footage/text/cues', 'apply', 'scene start/render/review', 'capture/add a new version when authorized'],
    schemas: { entry: z.toJSONSchema(motionCatalogEntrySchema, { io: 'input' }), request: z.toJSONSchema(motionCatalogRequestSchema, { io: 'input' }) },
    safeToAutoPublish: false, externalModelCalls: 0 }));
  catalog.command('list').option('--query <text>', 'Match all words in name, description or tags', '')
    .action((o: { query: string }) => run(async () => (await library()).list(o.query)));
  catalog.command('show').argument('<id@version>')
    .action((pin: string) => run(async () => { const entry = await (await library()).get(pin); return { ...describeMotionEntry(entry), entry }; }));
  catalog.command('capture').argument('<recipe.json>').argument('<template-id>').argument('<metadata.json>')
    .requiredOption('-o, --output <new-file>')
    .description('Extract a portable candidate with text placeholders; inspect masks and licensing before add')
    .action((recipe: string, template: string, meta: string, o: { output: string }) => run(async () => {
      const entry = captureMotionEntry(await readMotionJSON(recipe), template, await readMotionJSON(meta));
      const path = resolve(o.output); await writeFile(path, JSON.stringify(entry, null, 2) + '\n', { flag: 'wx' });
      return { path, ...describeMotionEntry(entry), next: 'Inspect candidate portability; add explicitly. Capture never promotes automatically.' };
    }));
  catalog.command('add').argument('<entry.json>').description('Add immutable id/version; use a new version instead of overwriting')
    .action((path: string) => run(async () => (await library()).add(await readMotionJSON(path))));
  catalog.command('apply').argument('<request.json>').requiredOption('-o, --output <new-directory>')
    .description('Save editable recipe/input + pinned reuse receipt; then use the existing scene render/review workflow')
    .action((path: string, o: { output: string }) => run(async () => {
      const result = await (await library()).apply(await readMotionJSON(path)), root = resolve(o.output);
      await mkdir(root); // Never merge with a previous output or inherit its review.
      for (const [name, value] of Object.entries(result)) await writeFile(join(root, `${name}.json`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
      return { directory: root, ...result.receipt, preflight: result.preflight, next: 'scene start recipe.json input.json -o NEW_JOB; render and review the new output' };
    }));
}
