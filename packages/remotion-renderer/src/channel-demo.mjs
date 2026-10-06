import {mkdir,readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {buildChannelTemplate} from '../../editing-playbook/src/channel-template.ts';
import {save} from '../../editing-playbook/src/motion-workflow.ts';
import {verifySceneSegment} from '../../editing-playbook/src/scene-cache.ts';
import {runMedia} from '../../editing-playbook/src/media-process.ts';
import {renderChannelDemo,rendererIdentity} from './render.mjs';

const [requestPath,directory]=process.argv.slice(2);
if(!requestPath||!directory||process.argv.length!==4)throw Error('Usage: channel-demo.mjs REQUEST.json NEW_DIRECTORY');
const info=await stat(requestPath);if(!info.isFile()||info.size>1_000_000)throw Error('Use a local request <=1 MB');
const built=buildChannelTemplate(JSON.parse(await readFile(requestPath,'utf8')));
if(built.request.mode!=='layout-demo')throw Error('Only the generated-only layout-demo mode is accepted');
const root=resolve(directory),controller=new AbortController(),signal=controller.signal,abort=()=>controller.abort();
process.once('SIGINT',abort);process.once('SIGTERM',abort);process.stdin.on('data',abort);
const deadline=setTimeout(abort,30*60*1000);
try{
  await mkdir(root);const renderer=await rendererIdentity();
  await save(join(root,'attempt.json'),{renderer,request:built.request,status:'render_attempt_no_automatic_retry'});
  await save(join(root,'template.json'),built);
  const result=await renderChannelDemo({request:built.request,directory:join(root,'render'),signal,onProgress:console.error});
  if(JSON.stringify(await rendererIdentity())!==JSON.stringify(renderer))throw Error('Renderer changed during the attempt');
  const technical=await verifySceneSegment(result.output,{frames:Math.round(built.duration*30),width:built.width,height:built.height},signal);
  if(!technical.technicalPass)throw Error('Demo failed technical checks; partial output retained');
  const frames=[],evidence=join(root,'evidence');await mkdir(evidence);
  for(const s of built.sections){
    // Both sides of cuts, entrance/hold/exit. These are samples, not continuous viewing.
    const times=[s.start,s.start+.1,s.start+.4,s.start+(s.end-s.start)/2,s.end-.3,s.end-1/30];
    const special=built.request.sections.find(p=>p.id===s.id);
    if(special.kind==='roadmap')for(const p of special.steps)times.push(s.start+p.activateAt+.4);
    if(special.kind==='demonstration')times.push(s.start+special.highlightAt+.4);
    for(const [i,t]of [...new Set(times)].sort((a,b)=>a-b).entries()){
      const path=join(evidence,`${s.id}-${i}.png`),at=Math.round(t*30)/30;
      await runMedia(['-v','error','-nostdin','-n','-ss',String(at),'-i',result.output,'-frames:v','1',path],{signal});
      frames.push({id:`${s.id}-${i}`,section:s.id,time:at,path});
    }
  }
  const report={output:result.output,sha256:technical.sha256,technical,frames,renderer,duration:built.duration,layout:built.request.layout,
    status:'technical_pass_needs_visual_review',audio:'intentionally_silent',speechAlignment:'not_applicable_no_speech',
    placeholders:true,externalModelCalls:0,safeToAutoPublish:false};
  await save(join(root,'demo-render.json'),report);console.log(JSON.stringify(report));
}catch(e){console.error(e.stack??e);process.exitCode=1;}
finally{clearTimeout(deadline);process.removeListener('SIGINT',abort);process.removeListener('SIGTERM',abort);process.stdin.destroy();}
