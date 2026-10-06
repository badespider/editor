import {z} from 'zod';
import {motionStyleGuideSchema, styleApplicationsSchema, styleDigest} from '@diffusionstudio/video-understanding/reference-style';
import {motionDigest} from './motion.ts';

const note=z.string().trim().min(1).max(1600),hash=z.string().regex(/^[a-f0-9]{64}$/);
export const motionStyleEntrySchema=z.object({schemaVersion:z.literal(1),kind:z.literal('motion-style-entry'),
  guide:motionStyleGuideSchema,
  recipes:z.array(z.object({template:z.string().regex(/^[a-z][a-z0-9-]{0,59}@[1-9][0-9]{0,3}$/),sha256:hash,
    purpose:note,useWhen:note,avoidWhen:note}).strict()).min(1).max(16),
}).strict().superRefine((entry,ctx)=>{
  if(new Set(entry.recipes.map(r=>r.template)).size!==entry.recipes.length)ctx.addIssue({code:'custom',message:'Duplicate style recipe'});
});
export type MotionStyleEntry=z.infer<typeof motionStyleEntrySchema>;
export const motionStyleSelectionSchema=z.object({profile:z.string().regex(/^[a-z][a-z0-9-]{0,59}@[1-9][0-9]{0,3}$/),
  applications:styleApplicationsSchema}).strict();
export const styleRecipeBindingsSchema=z.array(motionStyleEntrySchema.shape.recipes.element.omit({sha256:true})).min(1).max(16);

export function describeMotionStyle(raw:unknown){
  const entry=motionStyleEntrySchema.parse(raw),guide=entry.guide;
  return {selector:`${guide.id}@${guide.version}`,sha256:motionDigest(entry),guideSha256:styleDigest(guide),
    name:guide.name,description:guide.description,tags:guide.tags,origin:guide.origin,coverage:guide.coverage,
    ruleCount:guide.rules.length,studiedRoles:guide.scenes.map(s=>s.role),limitations:guide.adaptation.limitations,
    recipes:entry.recipes,status:'style_candidate_requires_fresh_adaptation_review',safeToAutoPublish:false};
}
