import {mkdir,readFile,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import type {Command} from 'commander';
import {adaptChannelTemplate,buildChannelTemplate,channelDemoRequest,channelWorkflow} from '@diffusionstudio/editing-playbook/channel-template';
import {renderChannelDemoWithRemotion} from './remotion-renderer';

const print=(value:unknown)=>console.log(JSON.stringify(value,null,2));
const read=async(path:string)=>{const file=resolve(path),info=await stat(file);if(!info.isFile()||info.size>1_000_000)throw Error('Use local JSON <=1 MB');return JSON.parse(await readFile(file,'utf8')) as unknown;};
const run=<A extends unknown[]>(fn:(...args:A)=>Promise<void>)=>async(...args:A)=>{try{await fn(...args);}catch(e){console.error((e as Error).message);process.exitCode=1;}};
async function saveBundle(output:string,values:Record<string,unknown>){
  const root=resolve(output);await mkdir(dirname(root),{recursive:true});await mkdir(root);
  for(const[name,value]of Object.entries(values))await writeFile(join(root,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
  print({directory:root,files:Object.keys(values),status:'draft_requires_fresh_review',safeToAutoPublish:false});
}
export function registerChannelCommands(playbook:Command){
  const channel=playbook.command('channel').description('Reusable navy/cyan channel sections, separate landscape/portrait layouts and silent placeholder demos');
  channel.command('workflow').action(()=>print(channelWorkflow()));
  channel.command('example').option('--layout <layout>','landscape | portrait','landscape')
    .action(run(async(options:{layout:string})=>{if(options.layout!=='landscape'&&options.layout!=='portrait')throw Error('Choose landscape or portrait');print(channelDemoRequest(options.layout));}));
  channel.command('build').argument('<request.json>').requiredOption('-o, --output <directory>','new reusable template bundle')
    .action(run(async(path:string,options:{output:string})=>{const b=buildChannelTemplate(await read(path));await saveBundle(options.output,{'request.json':b.request,'template.json':b,'recipe.json':b.recipe});}));
  channel.command('adapt').argument('<request.json>').argument('<input.json>').requiredOption('-o, --output <directory>','new source-bound scene bundle')
    .action(run(async(path:string,input:string,options:{output:string})=>{const a=adaptChannelTemplate(await read(path),await read(input));await saveBundle(options.output,{'recipe.json':a.recipe,'input.json':a.input,'adaptation.json':a});}));
  channel.command('demo').argument('<request.json>').requiredOption('-o, --output <directory>','new immutable demo job')
    .description('Render a silent, generated-only layout demonstration locally; no fake transcript or AI calls')
    .action(run(async(path:string,options:{output:string})=>{
      const built=buildChannelTemplate(await read(path));if(built.request.mode!=='layout-demo')throw Error('Use layout-demo mode; real footage requires the scene workflow');
      const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);
      try{print(await renderChannelDemoWithRemotion(path,options.output,controller.signal));}finally{process.removeListener('SIGINT',abort);}
    }));
}
