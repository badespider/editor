import type { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { z } from 'zod';
import { MotionCatalog, captureMotionEntry, describeMotionEntry, findMotionCatalogRoot,
  motionCatalogEntrySchema, motionCatalogRequestSchema,motionStyleEntrySchema,styleRecipeBindingsSchema,describeMotionStyle } from '@diffusionstudio/editing-playbook/motion-catalog';
import { readMotionJSON } from '@diffusionstudio/editing-playbook/motion-workflow';

const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
async function run(fn: () => Promise<unknown>) {
  try { print(await fn()); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
export function registerMotionCatalogCommands(motion: Command) {
  const catalog = motion.command('catalog').description('Versioned reusable motion blocks; new text/media, same editable animation')
    .option('--catalog <directory>', 'Explicit shared/private library; defaults to this editor checkout');
  const library = async () => new MotionCatalog(catalog.opts().catalog ?? await findMotionCatalogRoot());
  const style=catalog.command('style').description('Reusable style guides and pinned editable recipes for new stories');
  style.command('workflow').action(()=>print({instructions:'reference/motion-styles.md',
    stages:['inspect several distinct reference scenes','seal generalized style guide','capture/add guide with pinned recipes','show guide before storyboarding','apply with per-rule shot decisions','render/review new content'],
    schemas:{entry:z.toJSONSchema(motionStyleEntrySchema),bindings:z.toJSONSchema(styleRecipeBindingsSchema),request:z.toJSONSchema(motionCatalogRequestSchema,{io:'input'})},externalModelCalls:0,safeToAutoPublish:false}));
  style.command('list').option('--query <text>','Match words in name, description or tags','')
    .action((o:{query:string})=>run(async()=>(await library()).listStyles(o.query)));
  style.command('show').argument('<id@version>')
    .action((pin:string)=>run(async()=>{const entry=await(await library()).getStyle(pin);return {...describeMotionStyle(entry),entry};}));
  style.command('capture').argument('<sealed-guide.json>').argument('<recipe-bindings.json>').requiredOption('-o, --output <new-file>')
    .action((guide:string,bindings:string,o:{output:string})=>run(async()=>{
      const entry=await(await library()).captureStyle(await readMotionJSON(guide),await readMotionJSON(bindings));
      const path=resolve(o.output);await writeFile(path,JSON.stringify(entry,null,2)+'\n',{flag:'wx'});
      return {path,...describeMotionStyle(entry),next:'Inspect generalized rules and recipe purposes; add this candidate explicitly.'};
    }));
  style.command('add').argument('<style-entry.json>')
    .action((path:string)=>run(async()=>(await library()).addStyle(await readMotionJSON(path))));
  catalog.command('workflow').action(() => print({ instructions: 'reference/motion-catalog.md',
    reusableStyles:{instructions:'reference/motion-styles.md',discover:'catalog style list/show',requestField:'style',review:'Fresh style-rule review using new story, media and timing'},
    stages: ['list/show pinned version or style profile', 'bind new footage/text/cues', 'apply', 'scene start/render/review', 'capture/add a new version when authorized'],
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
