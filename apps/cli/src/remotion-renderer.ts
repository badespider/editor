import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

/** Keep React/Chromium out of the desktop's SolidJS bundle and the CLI's startup path. */
export async function renderWithRemotion(job:string,options:string|undefined,signal:AbortSignal) {
  return runWorker('@diffusionstudio/remotion-renderer/runner',[resolve(job),...(options?[resolve(options)]:[])],signal);
}
export async function renderChannelDemoWithRemotion(request:string,directory:string,signal:AbortSignal) {
  return runWorker('@diffusionstudio/remotion-renderer/channel-demo',[resolve(request),resolve(directory)],signal);
}
async function runWorker(module:string,args:string[],signal:AbortSignal){
  const require=createRequire(resolve(process.argv[1]));
  const entry=require.resolve(module);
  return new Promise<unknown>((done,reject)=>{
    const child=spawn(process.execPath,[entry,...args],{windowsHide:true,stdio:['pipe','pipe','inherit']});
    const chunks:Buffer[]=[];let bytes=0,overflow=false;
    // Use a pipe rather than Windows' forceful kill so the worker can close its browser.
    const stop=()=>child.stdin.end('cancel\n');
    child.stdin.on('error',()=>{}); // A completed child may close before cancellation arrives.
    child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>8_000_000){overflow=true;stop();}else chunks.push(chunk);});
    signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
    child.once('error',e=>{signal.removeEventListener('abort',stop);reject(e);});
    child.once('close',code=>{
      signal.removeEventListener('abort',stop);
      if(code!==0||overflow)return reject(Error(`Remotion worker failed (${overflow?'output budget':code}); inspect retained job diagnostics`));
      try{done(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}
    });
  });
}
