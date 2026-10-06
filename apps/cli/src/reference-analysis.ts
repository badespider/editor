import {readFile,stat,lstat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {Command} from 'commander';
import {z} from 'zod';
import {ReferenceAnalysisService,referenceTrackRequestSchema,referenceDesignSchema,pixelComparisonSchema} from '@diffusionstudio/video-understanding/reference';
import {referenceRequestSchema,referencePageSchema,referenceBreakdownSchema} from '@diffusionstudio/video-understanding/reference-schema';
import {styleSourcesSchema,referenceStyleRequestSchema,motionStyleGuideSchema} from '@diffusionstudio/video-understanding/reference-style';

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
  reference.command('style-template').argument('<sources.json>').option('--cache-dir <directory>').option('-o, --output <json>')
    .description('Create a style-guide worksheet from at least three sealed scene analyses')
    .action((path:string,o:Options)=>action(o,async(s,signal)=>{
      const info=await stat(path);if(!info.isFile()||info.size>64*1024)throw Error('Style sources must be JSON <=64 KiB');
      return s.styleTemplate(JSON.parse(await readFile(path,'utf8')),signal);
    }));
  reference.command('style').argument('<request.json>').option('--cache-dir <directory>').option('-o, --output <json>')
    .description('Seal reusable style principles backed by several distinct inspected scenes')
    .action((path:string,o:Options)=>action(o,async(s,signal)=>{
      const info=await stat(path);if(!info.isFile()||info.size>1024*1024)throw Error('Style request must be JSON <=1 MiB');
      return s.style(JSON.parse(await readFile(path,'utf8')),signal);
    }));
  reference.command('pixels').argument('<session-id>').argument('<sequence-id>').argument('<candidate-session-id>').argument('<candidate-sequence-id>').argument('<request.json>')
    .option('--cache-dir <directory>').option('-o, --output <json>').description('Native-resolution RGB diagnostic with explicit frame alignment and optional pixel region')
    .action((id:string,sequence:string,otherId:string,otherSequence:string,path:string,o:Options)=>action(o,async(s,signal)=>{
      const info=await stat(path);if(!info.isFile()||info.size>64*1024)throw Error('Pixel request must be JSON <=64 KiB');
      return s.pixels(id,sequence,otherId,otherSequence,JSON.parse(await readFile(path,'utf8')),signal);
    }));
  reference.command('design-template').argument('<session-id>').argument('<sequence-id>').option('--cache-dir <directory>').option('-o, --output <json>')
    .action((id:string,sequence:string,o:Options)=>action(o,s=>s.designTemplate(id,sequence)));
  reference.command('design').argument('<session-id>').argument('<sequence-id>').argument('<design.json>').option('--cache-dir <directory>').option('-o, --output <json>')
    .description('Seal a complete agent-authored, frame-backed design analysis; missing details remain explicit')
    .action((id:string,sequence:string,path:string,o:Options)=>action(o,async(s,signal)=>{
      const info=await stat(path);if(!info.isFile()||info.size>1024*1024)throw Error('Design must be local JSON <=1 MiB');
      return s.design(id,sequence,JSON.parse(await readFile(path,'utf8')),signal);
    }));
  reference.command('workflow').action(()=>console.log(JSON.stringify({version:1,instructions:'reference/media/reference-analysis.md',
    commands:['media reference extract <session-id> --start 10 --end 12','media reference page <session-id> <sequence-id> --from 0 --count 24',
      'media reference annotate <session-id> <sequence-id> <breakdown.json>',
      'media reference track <session-id> <sequence-id> <request.json> -o measurements.json',
      'media reference compare <session-id> <sequence-id> <candidate-session-id> <candidate-sequence-id> -o comparison.json'],
    detailedDesign:{instructions:'reference/reference-fidelity.md',template:'media reference design-template SESSION SEQUENCE',record:'media reference design SESSION SEQUENCE design.json',schema:z.toJSONSchema(referenceDesignSchema,{io:'input'}),pixelComparisonSchema:z.toJSONSchema(pixelComparisonSchema)},
    reusableStyle:{instructions:'reference/motion-styles.md',template:'media reference style-template sources.json',record:'media reference style request.json',
      schemas:{sources:z.toJSONSchema(styleSourcesSchema),request:z.toJSONSchema(referenceStyleRequestSchema),guide:z.toJSONSchema(motionStyleGuideSchema)},
      review:'Generalized design principles applied to new content; selected-scene evidence, not an entire creator style or pixel matching.'},
    schemas:{extract:z.toJSONSchema(referenceRequestSchema,{io:'input'}),page:z.toJSONSchema(referencePageSchema,{io:'input'}),breakdown:z.toJSONSchema(referenceBreakdownSchema,{io:'input'}),track:z.toJSONSchema(referenceTrackRequestSchema,{io:'input'})},
    constraints:['Range <=30 seconds, max 1800 frames; explicit pixel/storage budgets. Native resolution, source integer PTS, no fps conversion or deduplication.',
      'RGB24 evidence, not bit-exact source colors or original design layers. V1 refuses HDR, non-square pixels and display-matrix transforms.',
      'Change maps are coarse whole-frame hints, not automatic object/opacity/rotation tracking. Agent keyframes are authored hypotheses.',
      'No automatic analysis, video recreation, audio review, downloads, uploads, or publication. Open the actual evidence and attribute inspected coverage.',
      'V1 is local CLI/Node with an offline frame viewer, not a new desktop IPC endpoint. Reuse the same --cache-dir.'],externalModelCalls:0,safeToAutoEdit:false},null,2)));
  reference.command('extract').argument('<session-id>').requiredOption('--start <seconds>').requiredOption('--end <seconds>')
    .option('--cache-dir <directory>').option('--max-frames <number>','complete-range budget, default 600, ceiling 1800')
    .option('--max-decoded-mib <number>','conservative native-pixel/storage budget, default 1024, ceiling 4096').option('-o, --output <json>')
    .action((id:string,o:Options)=>action(o,(s,signal)=>s.extract(id,{start:Number(o.start),end:Number(o.end),maxFrames:number(o.maxFrames),maxDecodedMiB:number(o.maxDecodedMib)},signal)));
  reference.command('track').argument('<session-id>').argument('<sequence-id>').argument('<request.json>').option('--cache-dir <directory>').option('-o, --output <json>')
    .description('Measure a manually seeded patch across bounded native frames; confirm candidates visually before using them')
    .action((id:string,sequence:string,path:string,o:Options)=>action(o,async(s,signal)=>{
      const info=await stat(path);if(!info.isFile()||info.size>64*1024)throw Error('Tracking request must be a local JSON file <=64 KiB');
      return s.track(id,sequence,JSON.parse(await readFile(path,'utf8')),signal);
    }));
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
