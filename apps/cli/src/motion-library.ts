import { randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Command } from 'commander';
import { z } from 'zod';
import { MotionLibrary } from '@diffusionstudio/editing-playbook/motion-library';
import { buildLearnedMotionModule, buildLearnedMotionMixModule } from '@diffusionstudio/editing-playbook/motion-learned';

const print=(value:unknown)=>console.log(JSON.stringify(value,null,2));
function safe<T extends unknown[]>(action:(...args:T)=>Promise<void>){return async(...args:T)=>{try{await action(...args);}catch(error){print({error:error instanceof Error?error.message:String(error),externalCalls:0});process.exitCode=1;}};}
async function json(path:string){const target=resolve(path),info=await stat(target);if(!info.isFile()||info.size>8*1024**2)throw new Error('Expected a local JSON file up to 8 MiB');const bytes=await readFile(target);if(bytes.length>8*1024**2)throw new Error('JSON file grew beyond its budget');return JSON.parse(bytes.toString('utf8')) as unknown;}
async function write(path:string,content:string){const target=resolve(path);await mkdir(dirname(target),{recursive:true});await writeFile(target,content,{flag:'wx',mode:0o600});return target;}
const recipeSchema=z.object({schemaVersion:z.literal(1),width:z.number().int().min(2).max(4096),height:z.number().int().min(2).max(4096),duration:z.number().finite().positive().max(120),
  instances:z.array(z.object({id:z.string(),key:z.string(),values:z.record(z.string(),z.union([z.string(),z.number().finite()])).optional(),start:z.number().finite().nonnegative(),end:z.number().finite().positive(),box:z.object({x:z.number().finite(),y:z.number().finite(),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict()}).strict()).min(1).max(24)}).strict();

/** The same filesystem library used by the desktop; no AI call is made by these commands. */
export function registerMotionLibraryCommands(motion:Command){
  const library=motion.command('library').description('List, read and reuse machine-reviewed user motion drafts; local, no model calls');
  library.option('--directory <path>','override the user library directory');
  const store=()=>new MotionLibrary({directory:library.opts<{directory?:string}>().directory});
  library.command('list').action(safe(async()=>print({entries:await store().list(),externalCalls:0})));
  library.command('read').argument('<id>').action(safe(async(id:string)=>print({...await store().read(id),externalCalls:0})));
  library.command('create').argument('<id>').option('--values <values.json>','literal parameter value object').option('--format <format>','source | portrait | landscape','source').option('--duration <seconds>','retime the native motion').requiredOption('-o, --output <module.js>','new native module file').action(safe(async(id:string,options:{values?:string;format:string;duration?:string;output:string})=>{
    const {component}=await store().read(id),format=z.enum(['source','portrait','landscape']).parse(options.format);
    const values=options.values?z.record(z.string(),z.union([z.string(),z.number().finite()])).parse(await json(options.values)):undefined;
    const module=buildLearnedMotionModule(component,{values,format,duration:options.duration===undefined?undefined:Number(options.duration),sceneKey:`learned-${randomUUID()}`});
    print({path:await write(options.output,module),libraryId:id,externalCalls:0,humanReview:'pending'});
  }));
  library.command('mix-schema').description('Describe the same-canvas recipe format for learned components').action(()=>print({schema:z.toJSONSchema(recipeSchema),example:{schemaVersion:1,width:1920,height:1080,duration:8,instances:[{id:'learned-<fingerprint>',key:'first',start:0,end:8,box:{x:0,y:0,width:1920,height:1080},values:{}}]},notes:['IDs come from library list. Instances are bottom to top. Each box clips its own layers.','Changing aspect ratio contains the artwork; it does not infer responsive reflow.'],externalCalls:0}));
  library.command('mix').argument('<recipe.json>').requiredOption('-o, --output <module.js>','new module file').action(safe(async(path:string,options:{output:string})=>{
    const recipe=recipeSchema.parse(await json(path)),instances=[];
    for(const instance of recipe.instances){const {component}=await store().read(instance.id);const {id:_id,...settings}=instance;instances.push({...settings,component});}
    print({path:await write(options.output,buildLearnedMotionMixModule({width:recipe.width,height:recipe.height,duration:recipe.duration,instances,sceneKey:`learned-mix-${randomUUID()}`})),externalCalls:0,humanReview:'pending'});
  }));
}
