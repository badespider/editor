import { styleDimensions, type SceneRecipe, type SceneInput } from '../src/scene-motion.ts';

const hash='a'.repeat(64);
export function sceneFixture() {
  const pose={x:.5,y:.5,width:1,height:1,rotation:0,opacity:1,blur:0,skewX:0,reveal:1};
  const font={family:'Arial',size:.06,weight:800,color:'#FFFFFF',italic:false};
  const recipe: SceneRecipe={schemaVersion:1,kind:'scene-motion-recipe',style:{name:'Synthetic fixture; no real viewing',
    references:[{id:'ref',cache:'/synthetic',sessionId:hash,sequenceId:hash,sequenceSha256:hash,inspectedFrames:[0,1]}],
    criteria:styleDimensions.map(d=>({id:d,dimension:d,essential:true,requirement:'Synthetic '+d,evidence:[{referenceId:'ref',frames:[0,1]}]})),avoid:[],uncertainties:['Synthetic fixture only']},
    templates:[{id:'picture',background:'#111111',layers:[{id:'footage',kind:'video',slot:'main',pose,keys:[],fill:'#FFFFFF',stroke:'#FFFFFF',strokeWidth:0,shadow:0}]}],
    caption:{font,box:{x:.1,y:.65,width:.8,height:.2},minFontSize:.025,lineGap:1.2,entrySeconds:.08,lift:.01,blur:2,uppercase:true,shadow:4}};
  const input:SceneInput={width:1080,height:1920,fps:30,assets:[{id:'a',path:'/synthetic/source.mp4',sha256:hash,kind:'video',provenance:'Synthetic test source',permission:'original'}],
    audio:{assetId:'a',start:10,end:12},transcript:{sourceSha256:hash,provenance:'Synthetic not ASR',verification:'unverified',words:[{id:'w1',text:'Hello',start:10.1,end:10.5},{id:'w2',text:'world',start:10.8,end:11.5}]},
    shots:[{id:'one',templateId:'picture',start:0,end:2,purpose:'Synthetic',criteria:[...styleDimensions],framing:{rationale:'Synthetic',evidence:['fixture'],protectedRegions:[]},bindings:[{slot:'main',assetId:'a',sourceIn:10}]}],
    captions:[{id:'words',start:0,end:2,words:[{wordId:'w1',row:0,scale:1},{wordId:'w2',row:1,scale:1.5}]}]};return {recipe,input};
}
