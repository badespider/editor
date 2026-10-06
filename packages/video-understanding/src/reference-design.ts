import {z} from 'zod';
import type {ReferenceManifest} from './reference-schema.ts';

const id=z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),hash=z.string().regex(/^[a-f0-9]{64}$/),note=z.string().trim().min(1).max(2000);
const frame=z.number().int().min(0).max(1799),frames=z.array(frame).max(1800),unit=z.number().finite().min(0).max(1);
export const designCategories=['composition','typography','palette','texture','layers','masks','lighting','depth','camera','motion','transitions','timing','assets','audio'] as const;
const section=z.object({category:z.enum(designCategories),state:z.enum(['observed','absent','unknown']),frames,
  description:note,uncertainty:note,properties:z.array(z.object({name:note,value:note,basis:z.enum(['measured','estimated','observed']),method:note}).strict()).max(24)}).strict();
export const referenceDesignSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('reference-design'),sequenceSha256:hash,
  author:note,inspectedFrames:frames.min(2),sections:z.array(section).length(designCategories.length),
  elements:z.array(z.object({id,label:note,role:note,backToFrontOrder:z.number().int().min(0).max(99),
    bounds:z.array(z.object({frame,x:unit,y:unit,width:unit.positive(),height:unit.positive(),basis:z.enum(['measured','estimated'])}).strict()
      .refine(b=>b.x+b.width<=1.001&&b.y+b.height<=1.001,'Visible bounds must fit picture')).min(1).max(120),
    appearance:note,mask:note,depth:note,uncertainty:note}).strict()).min(1).max(32),
  phases:z.array(z.object({id,startFrame:frame,endFrame:frame,elementIds:z.array(id).min(1),description:note}).strict()
    .refine(p=>p.endFrame>=p.startFrame,'Reversed phase')).min(1).max(32),
  features:z.array(z.object({id,category:z.enum(designCategories),dimension:z.enum(['framing','typography','motion','rhythm']),
    essential:z.boolean(),target:note,frames:frames.min(1),elementIds:z.array(id).min(1),
    verification:z.enum(['native-frame','consecutive-frames','audio-listening']),tolerance:note}).strict()).min(4).max(20),
  adaptation:z.object({fixed:z.array(note).min(1).max(20),replaceable:z.array(note).min(1).max(20),timing:note,
    unsupported:z.array(note).max(20)}).strict(),
  audioReview:z.enum(['unknown','listened']),limitations:z.array(note).min(1).max(20),
}).strict().superRefine((d,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:'custom',message});
  for(const [values,name] of [[d.inspectedFrames,'frame'],[d.sections.map(s=>s.category),'category'],[d.elements.map(e=>e.id),'element'],[d.features.map(f=>f.id),'feature'],[d.phases.map(p=>p.id),'phase']] as [unknown[],string][])
    if(new Set(values).size!==values.length)issue(`Duplicate ${name}`);
  const known=new Set(d.inspectedFrames),elements=new Set(d.elements.map(e=>e.id));
  const evidence=(values:number[])=>{if(values.some(f=>!known.has(f)))issue('Design cites uninspected frames');};
  for(const s of d.sections){evidence(s.frames);if(s.state!=='unknown'&&!s.frames.length&&s.category!=='audio')issue('Observed/absent visual section needs evidence');
    if(s.state==='unknown'&&s.properties.length)issue('Unknown section cannot assert properties');
    if(s.category==='audio'&&s.state!=='unknown'&&d.audioReview!=='listened')issue('Frames do not establish listening');}
  for(const e of d.elements)evidence(e.bounds.map(b=>b.frame));
  for(const p of d.phases){evidence([p.startFrame,p.endFrame]);if(p.elementIds.some(e=>!elements.has(e)))issue('Unknown phase element');}
  for(const f of d.features){evidence(f.frames);if(f.elementIds.some(e=>!elements.has(e)))issue('Unknown feature element');
    if(d.sections.find(s=>s.category===f.category)?.state!=='observed')issue('Feature must cite an observed category');
    if(f.verification==='audio-listening'&&d.audioReview!=='listened')issue('Audio feature lacks listening');
    if(f.verification==='consecutive-frames'&&(f.frames.length<2||!f.frames.some((v,i)=>i&&v===f.frames[i-1]+1)))issue('Motion feature needs consecutive evidence');}
});
export type ReferenceDesign=z.infer<typeof referenceDesignSchema>;

export const portableDesignSchema=z.object({
  categories:z.array(section.omit({frames:true})).length(designCategories.length),
  features:z.array(referenceDesignSchema.shape.features.element.omit({frames:true,elementIds:true})).min(4).max(20),
  adaptation:referenceDesignSchema.shape.adaptation,limitations:referenceDesignSchema.shape.limitations,
  status:z.literal('reference_analysis_not_fidelity_approval'),
}).strict();

/** Stable requirements cannot be softened between analysis, adaptation and review. */
export function designRequirement(feature:{target:string;tolerance:string;verification:string}){
  return `${feature.target}\nTolerance: ${feature.tolerance}\nVerify with: ${feature.verification}`;
}
export function designCriteria(referenceId:string,analysis:ReferenceDesign,index=0){
  return analysis.features.map((f,i)=>({id:`design-${index}-${i}`,dimension:f.dimension,essential:f.essential,
    requirement:designRequirement(f),evidence:[{referenceId,frames:f.frames}]}));
}

/** A checklist for a vision-capable caller, not an automatic description of unseen pixels. */
export function draftReferenceDesign(sequence:ReferenceManifest){return {schemaVersion:1,kind:'reference-design',sequenceSha256:sequence.sequenceSha256,
  author:'',inspectedFrames:[],sections:designCategories.map(category=>({category,state:'unknown',frames:[],description:'Not assessed',uncertainty:'Not assessed',properties:[]})),
  elements:[],phases:[],features:[],adaptation:{fixed:[],replaceable:[],timing:'Not assessed',unsupported:[]},audioReview:'unknown',
  limitations:['Caller must inspect every native frame in this bounded scene. Original layers, fonts and easing remain hypotheses.']};}

export function validateReferenceDesign(raw:unknown,sequence:ReferenceManifest){
  const d=referenceDesignSchema.parse(raw);
  if(d.sequenceSha256!==sequence.sequenceSha256)throw Error('Design belongs to a different reference sequence');
  if(d.inspectedFrames.length!==sequence.frames.length||sequence.frames.some(f=>!d.inspectedFrames.includes(f.index)))throw Error('Detailed design requires inspection of every frame in the bounded sequence');
  return d;
}

/** Portable requirements retain detail, but contain no local evidence, source imagery or inherited approval. */
export function portableDesign(d:ReferenceDesign){return {categories:d.sections.map(s=>({category:s.category,state:s.state,description:s.description,uncertainty:s.uncertainty,properties:s.properties})),
  features:d.features.map(({frames:_frames,elementIds:_ids,...f})=>f),adaptation:d.adaptation,limitations:d.limitations,
  status:'reference_analysis_not_fidelity_approval' as const};}
