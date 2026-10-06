import {motionStyleGuideSchema,styleDigest,type StyleScene} from '../src/reference-style.ts';
import {designFixture} from './design-fixture.ts';
export function styleScenesFixture():StyleScene[]{
  return ['opening','explanation','emphasis'].map((role,i)=>({id:role,role,analysis:designFixture(2,String(i+1).repeat(64))}));
}
export function styleGuideFixture(scenes=styleScenesFixture()){
  return motionStyleGuideSchema.parse({schemaVersion:1,kind:'motion-style-guide',id:'test-style',version:1,name:'Synthetic style',
    description:'Contract test, no actual visual observations',tags:['test'],origin:'Synthetic fixture',coverage:'selected-scenes',
    scenes:scenes.map(s=>({id:s.id,role:s.role,sequenceSha256:s.analysis.sequenceSha256,analysisSha256:styleDigest(s.analysis)})),
    rules:['framing','typography','motion','rhythm'].map((dimension,i)=>({id:`rule-${i}`,category:'composition',dimension,
      principle:`Generalized ${dimension} behavior using new content`,useWhen:'Helps the new explanation',avoidWhen:'Distracts from the subject',essential:true,
      confidence:i===1?'single-example':'repeated',evidence:(i===1?[scenes[2]]:i===3?[scenes[1],scenes[2]]:[scenes[0],scenes[1]])
        .map(s=>({sceneId:s.id,featureId:`feature-${i}`})),verification:'consecutive-frames',review:'Inspect the new rendering',tolerance:'Allow new subjects and text lengths',
      editableControls:['New words','Cue timing']})),
    adaptation:{preserve:['Visual hierarchy'],replace:['Subjects and wording'],retime:'Use real new speech timing',limitations:['Synthetic rules are not production style findings']},
    status:'agent_authored_style_candidate'});
}
