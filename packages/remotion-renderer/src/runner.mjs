import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {SceneWorkflow} from '../../editing-playbook/src/scene-workflow.ts';
import {save} from '../../editing-playbook/src/motion-workflow.ts';
import {runMedia} from '../../editing-playbook/src/media-process.ts';
import {remotionOptionsSchema,buildPayload} from './payload.ts';
import {renderPicture,rendererIdentity} from './render.mjs';

const [job,optionsPath]=process.argv.slice(2);
if(!job||process.argv.length>4)throw Error('Usage: runner.mjs JOB [OPTIONS.json]');
let options={};if(optionsPath){const s=await stat(optionsPath);if(!s.isFile()||s.size>65536)throw Error('Options must be a local JSON file <=64 KiB');options=JSON.parse(await readFile(optionsPath,'utf8'));}
options=remotionOptionsSchema.parse(options);
const controller=new AbortController(),abort=()=>controller.abort();process.once('SIGINT',abort);process.once('SIGTERM',abort);
process.stdin.on('data',abort);
const deadline=setTimeout(abort,30*60*1000),signal=controller.signal;
try{
  const workflow=new SceneWorkflow(resolve(job)),initial=await workflow.renderContext(signal),renderer=await rendererIdentity();
  // Validate compatibility before claiming a revision or loading renderer dependencies in the browser.
  buildPayload(initial.value.adaptation,Object.fromEntries(Object.entries(initial.value.prepared.media).map(([key,path])=>
    [key,`asset-${initial.value.preparedHashes[path]}${path.slice(path.lastIndexOf('.')).toLowerCase()}`])),options);
  const c=await workflow.claimRender(signal);
  await save(join(c.directory,'remotion-attempt.json'),{renderer,options,revisionSha256:c.sha256});
  const picture=await renderPicture({adaptation:c.value.adaptation,prepared:c.value.prepared,hashes:c.value.preparedHashes,
    directory:join(c.directory,'remotion'),options,signal,onProgress:message=>console.error(message)});
  // Preserve the original uninterrupted prepared narration; encode once, using the same settings as the editor assembly.
  await runMedia(['-v','error','-nostdin','-n','-i',picture.output,'-i',c.value.prepared.audio,'-map','0:v:0','-map','1:a:0',
    '-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t',String(c.value.adaptation.duration),'-movflags','+faststart',c.output],{signal});
  await workflow.renderContext(signal);
  if(JSON.stringify(await rendererIdentity())!==JSON.stringify(renderer))throw Error('Renderer implementation changed during the attempt');
  const check=await workflow.verifyRender(c.output,signal);if(!check.technicalPass)throw Error('Remotion output failed scene technical checks');
  await save(join(c.directory,'scene-render.json'),{renderer,options,output:c.output,sha256:check.sha256,
    frames:picture.frames,status:'technical_pass_needs_visual_review',externalModelCalls:0,safeToAutoPublish:false});
  console.error('Render verified; preparing the existing scene-review evidence');
  const next=await workflow.inspect(signal);
  console.log(JSON.stringify({renderer,output:c.output,technical:check,next},null,2));
}catch(e){console.error(e.stack??e);process.exitCode=1;}
finally{clearTimeout(deadline);process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);process.stdin.destroy();}
