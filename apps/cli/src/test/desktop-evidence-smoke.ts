// Manual integration check against a separately launched, isolated desktop profile.
// Bundle with esbuild --platform=node --format=cjs, then pass a short test video.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {editor,waitForCliSocket} from '../cli-client';
async function main(){
 const path=resolve(process.argv[2] || 'missing-test-fixture');
 await waitForCliSocket();
 const before=await editor.project.active.query();
 const testProject=await editor.project.create.mutate({name:'Agent evidence default smoke test'});
 try{
  const workflow=await editor.media.workflow.query();assert.equal(workflow.defaultProvider,'agent');
  // Omit provider entirely: tests the actual renderer → main default, not just CLI routing.
  const session=await editor.media.understand.mutate({path,overviewCount:2});
  assert('kind' in session && session.kind==='agent-video-evidence');
  assert.equal(session.externalModelCalls,0);
  const inspection=await editor.media.inspect.mutate({id:session.id,request:{start:.1,end:1.5,count:3,audio:true,clip:true}});
  const transcript=await editor.media.transcriptImport.mutate({id:session.id,transcript:{sourceSha256:session.source.sha256,origin:'Synthetic integration fixture, not a real speech assessment',verification:'unverified_transcript',segments:[{start:.2,end:1,text:'synthetic phrase'}]}});
  await editor.media.observe.mutate({id:session.id,report:{sourceSha256:session.source.sha256,author:'desktop smoke fixture',observations:[{id:'desktop-note',start:.1,end:1.5,observation:'Synthetic protocol placeholder, not a visual assessment',modalities:['visual','transcript'],evidenceIds:[inspection.artifacts[0].id,transcript.id]}]}});
  const dossier=await editor.media.dossier.query({id:session.id,query:'placeholder'});
  assert.equal(dossier.observations.length,1);assert.equal(dossier.safeToAutoEdit,false);
  await assert.rejects(editor.media.understand.mutate({path,provider:'gemini'}),/consent/);
  const assets=await editor.asset.add.mutate({paths:[path]});
  assert.equal(assets.length,1);
  const assetSession=await editor.media.understand.mutate({id:assets[0].id,overviewCount:2});
  assert('kind' in assetSession);assert.equal(assetSession.id,session.id);
  console.log(JSON.stringify({passed:true,sessionId:session.id,sourceSha256:session.source.sha256,desktopDefault:'agent',externalModelCalls:0,checks:['omitted-provider API request','inspection','transcript import','observation write','dossier read','Gemini consent rejection','desktop asset-id resolution']}));
 } finally{
  if(before)await editor.project.open.mutate({id:before.id});
  await editor.project.delete.mutate({id:testProject.id}); // Only this script's test project.
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
