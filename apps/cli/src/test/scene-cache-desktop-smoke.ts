// Real editor regression. Run against an isolated hidden desktop profile.
// Synthetic media/assertions are test evidence, never a style/listening review.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { sceneFixture } from '../../../../packages/editing-playbook/test/scene-fixture';
import { adaptScene } from '../../../../packages/editing-playbook/src/scene-motion';
import { sceneComposition } from '../../../../packages/editing-playbook/src/scene-composition';
import { sceneSegments, renderSceneSegments, verifySceneSegment } from '../../../../packages/editing-playbook/src/scene-cache';
import { preflightScene, scanSceneFrames } from '../../../../packages/editing-playbook/src/scene-quality';
import { fingerprint } from '../../../../packages/editing-playbook/src/preview';
import { runMedia } from '../../../../packages/editing-playbook/src/media-process';
import { renderPreparedComposition } from '../playbook-delivery';
import { sceneRendererId } from '../scene-renderer-id';

async function main() {
  const root=resolve(process.argv[2]);await mkdir(root);
  const source=join(root,'source.mp4'),image=join(root,'red.png'),audio=join(root,'narration.wav');
  await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i','color=c=blue:s=320x480:r=30:d=14','-f','lavfi','-i',
    'aevalsrc=0.15*sin(2*PI*(230*t+17*t*t)):s=48000:d=14','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',source]);
  await runMedia(['-v','error','-nostdin','-n','-f','lavfi','-i','color=c=red:s=80x80','-frames:v','1',image]);
  await runMedia(['-v','error','-nostdin','-n','-ss','10','-i',source,'-t','4','-vn','-ar','48000','-ac','2','-c:a','pcm_s16le',audio]);
  const {recipe,input}=sceneFixture();recipe.compositor='layered-v2';input.width=320;input.height=480;
  const sha=await fingerprint(source);input.assets[0]={...input.assets[0],path:source,sha256:sha};input.transcript.sourceSha256=sha;
  input.assets.push({id:'still',kind:'image',path:image,sha256:await fingerprint(image),provenance:'Synthetic red tracking target',permission:'original'});
  const layer=recipe.templates[0].layers[0];layer.kind='image';layer.slot='photo';layer.id='moving-target';
  layer.pose={...layer.pose,x:.2,y:.3,width:.25,height:1/6};layer.keys=[{at:1,pose:{x:.8},easing:'linear'}];
  recipe.templates[0].background='#123456';
  input.audio.end=14;input.shots[0].bindings=[{slot:'photo',assetId:'still',sourceIn:0}];
  input.shots.push({...structuredClone(input.shots[0]),id:'two',start:2,end:4});
  input.transcript.words.push({id:'w3',text:'Across',start:11.8,end:12.4},{id:'w4',text:'cut',start:12.5,end:13.5});
  input.captions=[{id:'first',start:0,end:1.6,words:[{wordId:'w1',row:0,scale:1},{wordId:'w2',row:0,scale:1}]},
    {id:'cross',start:1.7,end:3.7,words:[{wordId:'w3',row:0,scale:1},{wordId:'w4',row:0,scale:1}]}];
  const a=adaptScene(recipe,input),prepared={audio,media:{'one/photo':image,'two/photo':image}},hashes={[image]:await fingerprint(image)};
  const rendererId=await sceneRendererId(),verify=(path:string)=>verifySceneSegment(path,{frames:120,width:320,height:480});
  const monolithic=join(root,'full');await mkdir(monolithic);await writeFile(join(monolithic,'edit.tsx'),sceneComposition(a,prepared),{flag:'wx'});
  const full=join(monolithic,'preview_DRAFT.mp4');
  const fullStart=performance.now();
  const fullResult=await renderPreparedComposition(monolithic,{name:'Synthetic full motion regression',height:480,fps:30,chapters:[]},full,(_root,path)=>verify(path),console.error);
  assert.notEqual(fullResult.status,'technical_review_failed');
  const fullMs=performance.now()-fullStart;
  const scaled=join(monolithic,'scaled_DRAFT.mp4');
  const scaledResult=await renderPreparedComposition(monolithic,{name:'Synthetic 2x HTML raster regression',height:960,fps:30,chapters:[]},scaled,
    (_root,path)=>verifySceneSegment(path,{frames:120,width:640,height:960}),console.error);
  assert.notEqual(scaledResult.status,'technical_review_failed');
  const render=async({directory,output,segment}:Parameters<Parameters<typeof renderSceneSegments>[0]['render']>[0])=>{
    const result=await renderPreparedComposition(directory,{name:`Synthetic segment ${segment.shotId}`,height:480,fps:30,chapters:[]},output,
      (_root,path)=>verifySceneSegment(path,segment),console.error,{audio:false});
    assert.notEqual(result.status,'technical_review_failed');return result;
  };
  const firstDir=join(root,'revision-0');await mkdir(firstDir);const firstStart=performance.now();
  const first=await renderSceneSegments({root,directory:firstDir,segments:sceneSegments(a,prepared,hashes,rendererId),audio,duration:4,render,verify,onProgress:console.error});
  const firstMs=performance.now()-firstStart;assert.equal(first.renderedScenes,2);assert.equal(first.reusedScenes,0);
  recipe.caption.font.color='#FFFFFF';input.captions[0].words[0].color='#FFFF00';
  const b=adaptScene(recipe,input),secondDir=join(root,'revision-1');await mkdir(secondDir);const secondStart=performance.now();
  const second=await renderSceneSegments({root,directory:secondDir,segments:sceneSegments(b,prepared,hashes,rendererId),audio,duration:4,render,verify,onProgress:console.error});
  const secondMs=performance.now()-secondStart;assert.equal(second.renderedScenes,1);assert.equal(second.reusedScenes,1);assert.equal(second.renderedFrames,60);
  const raw=async(path:string)=>runMedia(['-v','error','-i',path,'-an','-pix_fmt','rgb24','-fps_mode','passthrough','-f','rawvideo','-'],{limit:120*320*480*3+100});
  const [fullPixels,segPixels]=await Promise.all([raw(full),raw(first.output)]);
  assert.equal(fullPixels.length,120*320*480*3);assert.equal(segPixels.length,fullPixels.length);
  let delta=0;for(let i=0;i<fullPixels.length;i++)delta+=Math.abs(fullPixels[i]-segPixels[i]);const meanPixelError=delta/fullPixels.length;
  assert(meanPixelError<2,`Full/segmented mean pixel error ${meanPixelError}`);
  const centers:number[]=[];
  for(let f=0;f<120;f++) {let sum=0,count=0;
    for(let y=90;y<195;y++)for(let x=0;x<320;x++){const p=((f*480+y)*320+x)*3;
      if(segPixels[p]>180&&segPixels[p+1]<70&&segPixels[p+2]<70){sum+=x;count++;}}
    assert(count>1000,`Missing image layer at frame ${f}`);const center=sum/count;centers.push(center);
    assert(Math.abs(center-(.2+.6*(f%60)/60)*320)<4,`Wrong animation pose frame ${f}: ${center}`);
  }
  const pcm=async(path:string)=>runMedia(['-v','error','-i',path,'-vn','-ar','16000','-ac','1','-f','f32le','-']);
  const [original,out]=await Promise.all([pcm(audio),pcm(second.output)]);let xy=0,xx=0,yy=0;
  for(let i=0;i<Math.min(original.length,out.length);i+=4){const x=original.readFloatLE(i),y=out.readFloatLE(i);xy+=x*y;xx+=x*x;yy+=y*y;}
  const audioCorrelation=xy/Math.sqrt(xx*yy);assert(audioCorrelation>.99);
  const pixels=await runMedia(['-v','error','-i',first.output,'-an','-vf','scale=96:96,format=gray','-fps_mode','passthrough','-f','rawvideo','-'],{limit:120*96*96+100});
  const motion=scanSceneFrames(pixels,96*96,preflightScene(a));assert.equal(motion.suspectedStalls.length,0);
  // Corruption must stop before a new render; it never turns into an implicit miss.
  const cached=join(root,'scene-cache',first.segments[1].key,'preview_DRAFT.mp4');await writeFile(cached,'synthetic tampering');
  const badDir=join(root,'corrupt-check');await mkdir(badDir);
  await assert.rejects(renderSceneSegments({root,directory:badDir,segments:sceneSegments(b,prepared,hashes,rendererId),audio,duration:4,
    render:async()=>{throw Error('Must not render on corrupt cache');},verify}),/Cached scene changed/);
  const report={passed:true,root,fullMs,firstMs,secondMs,meanPixelError,audioCorrelation,first,second,motion,
    animationFramesChecked:centers.length,renderedFrameReduction:.5,actualEditorRenders:5,scaledExport:scaled,
    limitation:'Synthetic technical regression, not a reference-style or listening review. Timing measurements are local to this fixture.'};
  await writeFile(join(root,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
