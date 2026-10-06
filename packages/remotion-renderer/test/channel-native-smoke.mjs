// Actual browser/staged-media integration. Synthetic fixture words are not ASR or listening evidence.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {sceneFixture} from '../../editing-playbook/test/scene-fixture.ts';
import {channelDemoRequest,adaptChannelTemplate} from '../../editing-playbook/src/channel-template.ts';
import {runMedia} from '../../editing-playbook/src/media-process.ts';
import {fingerprint} from '../../editing-playbook/src/preview.ts';
import {verifySceneSegment} from '../../editing-playbook/src/scene-cache.ts';
import {renderPicture} from '../src/render.mjs';
const root=resolve(process.argv[2]);await mkdir(root);
const source=join(root,'synthetic.mp4');
await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=3','-c:v','libx264','-pix_fmt','yuv420p',source]);
const request={...channelDemoRequest(),visualStyle:'editorial',mode:'footage',sections:[{id:'hook',kind:'hook',duration:3,headline:'Native camera binding'}]};
const {input}=sceneFixture();input.width=1920;input.height=1080;input.audio={assetId:'a',start:0,end:3};
input.assets[0].path=source;input.assets[0].sha256=await fingerprint(source);input.transcript.sourceSha256=input.assets[0].sha256;
input.transcript.words=input.transcript.words.map(w=>({...w,start:w.start-10,end:w.end-10}));
input.shots[0]={...input.shots[0],id:'hook',start:0,end:3,bindings:[{slot:'camera',assetId:'a',sourceIn:0}]};
input.captions[0].end=3;input.shots[0].framing.protectedRegions=[];
const result=await renderPicture({adaptation:adaptChannelTemplate(request,input),prepared:{media:{'hook/camera':source}},hashes:{[source]:input.assets[0].sha256},
  directory:join(root,'render'),options:{concurrency:1},onProgress:console.error});
const check=await verifySceneSegment(result.output,{frames:90,width:1920,height:1080});
if(!check.technicalPass)throw Error('Native channel media render failed');
await runMedia(['-v','error','-nostdin','-n','-ss','1','-i',result.output,'-frames:v','1',join(root,'frame.png')]);
await writeFile(join(root,'result.json'),JSON.stringify(check,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:result.output,technical:check.technicalPass}));
