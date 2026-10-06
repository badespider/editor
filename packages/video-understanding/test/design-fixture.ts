import {designCategories,referenceDesignSchema} from '../src/reference-design.ts';
/** Synthetic contract fixture, not a claim of inspection. */
export function designFixture(count=2,hash='a'.repeat(64)){
 return referenceDesignSchema.parse({schemaVersion:1,kind:'reference-design',sequenceSha256:hash,author:'Synthetic fixture',inspectedFrames:Array.from({length:count},(_,i)=>i),
 sections:designCategories.map(category=>({category,state:category==='audio'?'unknown':'observed',frames:category==='audio'?[]:[0,1],description:'Synthetic appearance',uncertainty:'Not real observation',properties:[]})),
 elements:[{id:'title',label:'Synthetic',role:'title',backToFrontOrder:0,bounds:[{frame:0,x:0,y:0,width:1,height:1,basis:'estimated'}],appearance:'Test',mask:'Unknown',depth:'Unknown',uncertainty:'Synthetic'}],
 phases:[{id:'entry',startFrame:0,endFrame:1,elementIds:['title'],description:'Synthetic'}],
 features:['framing','typography','motion','rhythm'].map((dimension,i)=>({id:`feature-${i}`,category:'composition',dimension,essential:true,target:`Synthetic ${dimension}`,frames:[0,1],elementIds:['title'],verification:'consecutive-frames',tolerance:'Test only'})),
 adaptation:{fixed:['Layout'],replaceable:['Text'],timing:'Source aligned',unsupported:['Original camera unknown']},audioReview:'unknown',limitations:['Synthetic fixture']});
}
