import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {ensureBrowser,makeCancelSignal,openBrowser,renderMedia,selectComposition} from '@remotion/renderer';
import {buildPayload,remotionOptionsSchema} from './payload.ts';
import {buildChannelDemoPayload} from './channel-payload.ts';
import {drawingModule} from './runtime.ts';
import {fingerprint} from '../../editing-playbook/src/preview.ts';

const source=dirname(fileURLToPath(import.meta.url));
export async function rendererIdentity(){
  const hash=createHash('sha256');
  for(const name of (await readdir(join(source,'channel'))).sort()){
    hash.update('channel/'+name);hash.update(await readFile(join(source,'channel',name)));
  }
  hash.update(await readFile(join(source,'../../editing-playbook/src/channel-contract.ts')));
  hash.update(await readFile(join(source,'../../editing-playbook/src/scene-motion.ts')));
  for(const name of ['composition.tsx','paper.ts','index.tsx','payload.ts','channel-payload.ts','runtime.ts','render.mjs','runner.mjs','channel-demo.mjs','../../editing-playbook/src/channel-template.ts','../package.json']){
    hash.update(name);hash.update(await readFile(join(source,name)));
  }
  hash.update(drawingModule());hash.update(await readFile(join(source,'../../../package-lock.json')));
  return {engine:'remotion',version:'4.0.532',sha256:hash.digest('hex'),platform:process.platform,arch:process.arch};
}

/** Local adapter: stages only bound media, renders muted picture, closes its browser on all exits. */
export async function renderPicture({adaptation,prepared,hashes,directory,options:rawOptions={},signal,onProgress=()=>{}}){
  const options=remotionOptionsSchema.parse(rawOptions),media={},publicDir=join(directory,'public');
  await mkdir(directory);await mkdir(publicDir);
  const copied=new Set();
  for(const [key,path] of Object.entries(prepared.media)){
    signal?.throwIfAborted();
    const hash=await fingerprint(path,signal);if(hash!==hashes[path])throw Error('Prepared media changed before Remotion staging');
    const name=`asset-${hash}${extname(path).toLowerCase()}`;
    if(!copied.has(name)){
      await copyFile(path,join(publicDir,name),constants.COPYFILE_EXCL);
      if(await fingerprint(join(publicDir,name),signal)!==hash)throw Error('Staged media differs');copied.add(name);
    }
    media[key]=name;
  }
  const data=buildPayload(adaptation,media,options);
  const result=await renderPayload({data,directory,publicDir,options,signal,onProgress});
  for(const [path,hash] of Object.entries(hashes))if(await fingerprint(path,signal)!==hash)throw Error('Prepared media changed during Remotion render');
  return result;
}

/** Silent, generated-only layout demo. Real footage cannot bypass the scene job/review gates. */
export async function renderChannelDemo({request,directory,signal,onProgress=()=>{}}){
  const data=buildChannelDemoPayload(request),options=remotionOptionsSchema.parse({concurrency:2});
  const publicDir=join(directory,'public');await mkdir(directory);await mkdir(publicDir);
  return renderPayload({data,directory,publicDir,options,signal,onProgress});
}

async function renderPayload({data,directory,publicDir,options,signal,onProgress}){
  await writeFile(join(directory,'payload.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  const drawing=join(directory,'drawing.js');await writeFile(drawing,drawingModule(),{flag:'wx'});
  onProgress('Bundling the local Remotion composition');
  const serveUrl=await bundle({entryPoint:join(source,'index.tsx'),rootDir:join(source,'..'),outDir:join(directory,'bundle'),
    publicDir,enableCaching:false,gitSource:null,askAIEnabled:false,
    webpackOverride:config=>({...config,resolve:{...config.resolve,modules:[join(source,'../../../node_modules'),'node_modules'],alias:{...config.resolve?.alias,'@scene-drawing':drawing}}})});
  signal?.throwIfAborted();await ensureBrowser({logLevel:'warn'});signal?.throwIfAborted();
  const browser=await openBrowser('chrome',{logLevel:'warn',chromiumOptions:{headless:true}});
  const {cancelSignal,cancel}=makeCancelSignal();const abort=()=>cancel();signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)cancel();
  try{
    const inputProps={data};
    const composition=await selectComposition({serveUrl,id:'EditorScene',inputProps,puppeteerInstance:browser,logLevel:'warn',timeoutInMilliseconds:60000});
    const output=join(directory,'picture.mp4');let last=-1;
    await renderMedia({serveUrl,composition,inputProps,codec:'h264',crf:18,pixelFormat:'yuv420p',imageFormat:'png',
      outputLocation:output,overwrite:false,muted:true,concurrency:options.concurrency,puppeteerInstance:browser,cancelSignal,
      logLevel:'warn',timeoutInMilliseconds:60000,envVariables:{},
      onProgress:p=>{const percent=Math.floor(p.progress*100);if(percent>=last+5){last=percent;onProgress(`Remotion ${percent}% (${p.renderedFrames}/${composition.durationInFrames} frames)`);}}});
    signal?.throwIfAborted();
    return {output,frames:composition.durationInFrames,width:composition.width,height:composition.height,options};
  }finally{signal?.removeEventListener('abort',abort);await browser.close({silent:true});}
}
