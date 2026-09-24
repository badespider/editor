import {spawn} from 'node:child_process';

/** Bounded binary capture; unlike the overview runner, retains all showinfo lines. */
export function referenceProcess(binary:string,args:string[],signal?:AbortSignal,limit=32*1024**2) {
  signal?.throwIfAborted();
  return new Promise<{stdout:Buffer;stderr:string}>((resolve,reject)=>{
    const child=spawn(binary,args,{windowsHide:true,signal,stdio:['ignore','pipe','pipe']});
    const stdout:Buffer[]=[],stderr:Buffer[]=[];let bytes=0,overflow=false;
    const add=(chunks:Buffer[]) => (chunk:Buffer)=>{bytes+=chunk.length;if(bytes>limit){overflow=true;child.kill();}else chunks.push(chunk);};
    child.stdout.on('data',add(stdout));child.stderr.on('data',add(stderr));child.on('error',reject);
    child.on('close',code=>{const error=Buffer.concat(stderr).toString('utf8');if(overflow)reject(Error('Reference process output budget exceeded'));
      else if(code!==0)reject(Error(`${binary} exited ${code}: ${error.slice(-2000)}`));
      else resolve({stdout:Buffer.concat(stdout),stderr:error});});
  });
}
