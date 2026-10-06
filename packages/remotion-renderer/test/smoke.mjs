// Explicit real-Chromium integration test; entirely synthetic pictures and no paid services.
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {sceneFixture} from '../../editing-playbook/test/scene-fixture.ts';
import {adaptScene} from '../../editing-playbook/src/scene-motion.ts';
import {runMedia} from '../../editing-playbook/src/media-process.ts';
import {fingerprint} from '../../editing-playbook/src/preview.ts';
import {verifySceneSegment} from '../../editing-playbook/src/scene-cache.ts';
import {renderPicture} from '../src/render.mjs';
const root=resolve(process.argv[2]);await mkdir(root);
const source=join(root,'synthetic.mp4');
await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i','testsrc2=size=320x480:rate=30:duration=2','-c:v','libx264','-pix_fmt','yuv420p',source]);
const {recipe,input}=sceneFixture();recipe.compositor='layered-v2';input.width=320;input.height=480;
input.assets[0].path=source;input.assets[0].sha256=await fingerprint(source);input.transcript.sourceSha256=input.assets[0].sha256;
const pose={...recipe.templates[0].layers[0].pose,x:.5,y:.18,width:.8,height:.2};
recipe.templates[0].layers.push({id:'title',kind:'text',text:'LOCAL TEST',pose,keys:[],fill:'#FFFFFF',stroke:'#000000',strokeWidth:2,shadow:2,
  font:{family:'Arial',weight:900,size:.12,color:'#FFFFFF',italic:false},textLayout:{minFontSize:.04,maxLines:2,lineGap:1.1}});
const result=await renderPicture({adaptation:adaptScene(recipe,input),prepared:{media:{'one/main':source}},hashes:{[source]:input.assets[0].sha256},
  directory:join(root,'render'),options:{captionEntrance:'spring'},onProgress:console.error});
const check=await verifySceneSegment(result.output,{frames:60,width:320,height:480});
if(!check.technicalPass)throw Error('Synthetic render failed');
await writeFile(join(root,'result.json'),JSON.stringify(check,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output:result.output,technical:check.technicalPass}));
