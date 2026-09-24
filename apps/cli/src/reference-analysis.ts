import {readFile,stat,lstat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Command} from 'commander';
import {z} from 'zod';
import {ReferenceAnalysisService} from '@diffusionstudio/video-understanding/reference';
import {referenceRequestSchema,referencePageSchema,referenceBreakdownSchema} from '@diffusionstudio/video-understanding/reference-schema';

type Options={cacheDir?:string;start?:string;end?:string;maxFrames?:string;maxDecodedMib?:string;from?:string;count?:string;offset?:string;output?:string};
const number=(v?:string)=>v===undefined?undefined:Number(v);
async function action(options:Options,fn:(service:ReferenceAnalysisService,signal:AbortSignal)=>Promise<unknown>){
  const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);
  try{
    if(options.output){try{await lstat(resolve(options.output));throw Error('Output already exists');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
    const value=await fn(new ReferenceAnalysisService(options.cacheDir),controller.signal);
    if(options.output)await writeFile(resolve(options.output),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(value,null,2));
  }catch(error){console.error((error as Error).message);process.exitCode=1;}
  finally{process.removeListener('SIGINT',abort);}
}
export function registerReferenceAnalysis(media:Command){
  const reference=media.command('reference').description('Native frame-by-frame animation evidence. Local CLI/Node tools; no cloud model or automatic review.');
  reference.command('workflow').action(()=>console.log(JSON.stringify({version:1,instructions:'reference/media/reference-analysis.md',
    commands:['media reference extract <session-id> --start 10 --end 12','media reference page <session-id> <sequence-id> --from 0 --count 24',
      'media reference annotate <session-id> <sequence-id> <breakdown.json>',
      'media reference compare <session-id> <sequence-id> <candidate-session-id> <candidate-sequence-id> -o comparison.json'],
    schemas:{extract:z.toJSONSchema(referenceRequestSchema,{io:'input'}),page:z.toJSONSchema(referencePageSchema,{io:'input'}),breakdown:z.toJSONSchema(referenceBreakdownSchema,{io:'input'})},
    constraints:['Range <=30 seconds, max 1800 frames; explicit pixel/storage budgets. Native resolution, source integer PTS, no fps conversion or deduplication.',
      'RGB24 evidence, not bit-exact source colors or original design layers. V1 refuses HDR, non-square pixels and display-matrix transforms.',
      'Change maps are coarse whole-frame hints, not automatic object/opacity/rotation tracking. Agent keyframes are authored hypotheses.',
      'No automatic analysis, video recreation, audio review, downloads, uploads, or publication. Open the actual evidence and attribute inspected coverage.',
      'V1 is local CLI/Node with an offline frame viewer, not a new desktop IPC endpoint. Reuse the same --cache-dir.'],externalModelCalls:0,safeToAutoEdit:false},null,2)));
  reference.command('extract').argument('<session-id>').requiredOption('--start <seconds>').requiredOption('--end <seconds>')
    .option('--cache-dir <directory>').option('--max-frames <number>','complete-range budget, default 600, ceiling 1800')
    .option('--max-decoded-mib <number>','conservative native-pixel/storage budget, default 1024, ceiling 4096').option('-o, --output <json>')
    .action((id:string,o:Options)=>action(o,(s,signal)=>s.extract(id,{start:Number(o.start),end:Number(o.end),maxFrames:number(o.maxFrames),maxDecodedMiB:number(o.maxDecodedMib)},signal)));
  reference.command('page').argument('<session-id>').argument('<sequence-id>').option('--cache-dir <directory>')
    .option('--from <index>','zero-based range-local frame index').option('--count <number>','1–48 consecutive frames, default 24').option('-o, --output <json>')
    .action((id:string,sequence:string,o:Options)=>action(o,(s,signal)=>s.page(id,sequence,{from:number(o.from),count:number(o.count)},signal)));
  reference.command('annotate').argument('<session-id>').argument('<sequence-id>').argument('<breakdown.json>').option('--cache-dir <directory>').option('-o, --output <json>')
    .action((id:string,sequence:string,path:string,o:Options)=>action(o,async(s,signal)=>{
      const file=await stat(path);if(!file.isFile()||file.size>4*1024**2)throw Error('Breakdown must be a local JSON file <=4 MiB');
      return s.annotate(id,sequence,JSON.parse(await readFile(path,'utf8')),signal);
    }));
  reference.command('compare').argument('<session-id>').argument('<sequence-id>').argument('<candidate-session-id>').argument('<candidate-sequence-id>')
    .option('--cache-dir <directory>').option('--offset <seconds>','candidate-time alignment offset, default 0')
    .option('--from <index>','reference frame index').option('--count <number>','1–48 frame pairs, default 24').option('-o, --output <json>')
    .action((id:string,sequence:string,otherId:string,otherSequence:string,o:Options)=>action(o,(s,signal)=>s.compare(id,sequence,otherId,otherSequence,
      {offsetSeconds:number(o.offset),from:number(o.from),count:number(o.count)},signal)));
}
