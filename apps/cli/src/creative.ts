import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Command } from 'commander';
import { checkCreativePlan, creativeWorkflow, draftCreativePlan, listCreativeTechniques, loadCreativeLibrary, showCreativeTechnique } from '@diffusionstudio/editing-playbook/creative';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const readJson = async (file: string) => JSON.parse(await readFile(resolve(file), 'utf8')) as unknown;
const safe = <Args extends unknown[]>(action: (...args: Args) => Promise<void>) => async (...args: Args) => {
  try { await action(...args); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
};
const root = (options: { repo?: string }) => options.repo ? resolve(options.repo) : resolve(__dirname, '../../..');

export function registerCreativeCommands(playbook: Command) {
  const creative = playbook.command('creative').description('Story-led skill combinations and compatibility checks; planning only, no model calls or rendering');
  creative.command('workflow').action(() => print(creativeWorkflow()));
  creative.command('list').option('--repo <directory>', 'checkout containing the extensible creative library')
    .action(safe(async (options: { repo?: string }) => {
      print({ techniques: listCreativeTechniques(await loadCreativeLibrary(root(options))), note: 'Read complete instructions with creative show. Implementations are scoped proofs, not inherited approval.' });
    }));
  creative.command('show').argument('<id@version>').option('--repo <directory>')
    .action(safe(async (identity: string, options: { repo?: string }) => print(showCreativeTechnique(identity, await loadCreativeLibrary(root(options))))));
  creative.command('draft').argument('<request.json>').option('--repo <directory>')
    .requiredOption('-o, --output <new-plan.json>', 'new planning file; never overwritten')
    .action(safe(async (file: string, options: { repo?: string; output: string }) => {
      const library = await loadCreativeLibrary(root(options));
      const plan = draftCreativePlan(await readJson(file), library);
      await writeFile(resolve(options.output), JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' });
      print({ path: resolve(options.output), ...checkCreativePlan(plan, library) });
    }));
  creative.command('check').argument('<plan.json>').option('--repo <directory>')
    .option('--history <history.json>', 'at most 10 explicitly supplied episode choices; never inferred or overwritten')
    .action(safe(async (file: string, options: { repo?: string; history?: string }) => {
      const report = checkCreativePlan(await readJson(file), await loadCreativeLibrary(root(options)), options.history ? await readJson(options.history) : []);
      print(report); if (!report.structuralPass) process.exitCode = 1;
    }));
}
