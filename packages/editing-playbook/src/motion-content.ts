import { z } from "zod";

const short = z.string().trim().min(1).max(80);
const prose = z.string().trim().min(1).max(240);
const finite = z.number().finite();
const domain = z.tuple([finite, finite]).refine(([lo, hi]) => lo < hi, "Domain must increase");
const disclosure = z.discriminatedUnion("kind", [
  z.object({kind:z.literal("illustrative"),text:prose.optional()}).strict(),
  z.object({kind:z.literal("source"),text:prose}).strict(),
]);
const point = z.object({longitude:finite.min(-180).max(180),latitude:finite.min(-90).max(90),label:short}).strict();
const word = z.object({start:finite.nonnegative(),end:finite.positive(),text:short}).strict().refine(w=>w.end>w.start,"Word end must follow start");
const cue = z.object({start:finite.nonnegative(),end:finite.positive(),text:prose,words:z.array(word).min(1).max(40).optional()}).strict().refine(c=>c.end>c.start,"Cue end must follow start");
const background = z.object({seed:z.number().int().min(0).max(2_147_483_647),spacing:finite.min(32).max(240),strength:finite.min(0).max(.25)}).strict();
const effect = z.object({strength:finite.min(0).max(1),seed:z.number().int().min(0).max(65536)}).strict();
const caption = z.object({cues:z.array(cue).min(1).max(40)}).strict();
const kinetic = z.object({text:prose,emphasisWords:z.array(z.number().int().positive()).max(30)}).strict();
const color = z.string().regex(/^#[\da-f]{6}$/i);
const dataNumber = finite.min(-1e12).max(1e12);
const line = short.regex(/^[^\u0000-\u001f\u007f]+$/);
const dataDomain = z.tuple([dataNumber,dataNumber]).refine(([lo,hi])=>hi-lo>=1e-9,"Data domain must increase by at least 1e-9");
const bars = z.object({title:line,data:z.array(z.object({label:line.max(64),value:dataNumber,color:color.optional()}).strict()).min(1).max(8),valueDomain:dataDomain,baseline:z.literal(0),unit:line.max(24),disclosure}).strict().superRefine((value,ctx)=>{
  const [lo,hi]=value.valueDomain;
  if(lo>0 || hi<0)ctx.addIssue({code:"custom",message:"Bar domain must include its zero baseline"});
  if(value.data.some(item=>item.value<lo || item.value>hi))ctx.addIssue({code:"custom",message:"Bar values must fit the declared domain"});
  if(new Set(value.data.map(item=>item.label)).size!==value.data.length)ctx.addIssue({code:"custom",message:"Bar labels must be unique"});
});
const time = finite.nonnegative().max(120);
const singleLine=z.string().trim().min(1).regex(/^[^\u0000-\u001f\u007f]+$/);
const fontFamily=singleLine.max(120);
const canonicalPositive=time.positive().refine(value=>Math.round(value*30)>=1,"Time must occupy at least one canonical frame");
const milestone=z.object({
  value:singleLine.max(16),label:singleLine.max(80),labelSide:z.enum(["left","right","below"]).optional(),
  popDuration:canonicalPositive.refine(value=>Math.round(value*30)>=2,"Pop needs at least two frames").optional(),labelDelay:time.optional(),minHold:canonicalPositive.optional(),
  fontFamily:fontFamily.optional(),fontSize:finite.min(8).max(512).optional(),labelFontSize:finite.min(8).max(256).optional(),
  color:color.optional(),textColor:color.optional(),backgroundColor:color.optional(),
}).strict();
const ascii=z.string().trim().min(1).regex(/^[\x20-\x7e]+$/);
const assembly=z.object({
  text:ascii.max(48),subtitle:ascii.max(96).nullable().optional(),fontFamily:ascii.max(120).optional(),
  revealDuration:canonicalPositive.optional(),glyphDuration:canonicalPositive.optional(),subtitleDelay:time.optional(),minHold:canonicalPositive.optional(),
  fontSize:finite.min(8).max(256).optional(),fontWeight:z.number().int().min(100).max(900).multipleOf(100).optional(),
  color:color.optional(),subtitleColor:color.optional(),scatter:finite.min(0).max(1).optional(),blur:z.boolean().optional(),
}).strict().superRefine((value,ctx)=>{
  if(Math.round((value.glyphDuration??.4)*30)>Math.round((value.revealDuration??1.2)*30))ctx.addIssue({code:"custom",message:"glyphDuration must fit revealDuration"});
});
const concept=z.object({
  term:singleLine.max(20),definition:singleLine.max(100),direction:z.enum(["down","right"]).optional(),
  nodeSize:finite.min(48).max(2375.68).optional(),cardWidth:finite.min(64).max(4096).optional(),
  nodeDuration:canonicalPositive.optional(),linkDelay:time.optional(),cardDelay:time.optional(),revealDuration:canonicalPositive.optional(),minHold:canonicalPositive.optional(),
  fontFamily:fontFamily.optional(),fontSize:finite.min(8).max(256).optional(),
  accent:color.optional(),textColor:color.optional(),surfaceColor:color.optional(),lineColor:color.optional(),
}).strict();
const exchange=z.object({
  spentLabel:singleLine.max(18),earnedLabel:singleLine.max(18),moneyLabel:singleLine.max(8),goodsLabel:singleLine.max(12).optional(),
  presentation:z.enum(["cycle","handoff"]).optional(),
  transferStart:time.optional(),transferDuration:canonicalPositive.refine(value=>Math.round(value*30)>=4,"Transfer needs at least four frames").optional(),labelDelay:time.optional(),minHold:canonicalPositive.optional(),
  outlineColor:color.optional(),clothingColor:color.optional(),hairColor:color.optional(),skinColor:color.optional(),moneyColor:color.optional(),goodsColor:color.optional(),textColor:color.optional(),fontFamily:fontFamily.optional(),
}).strict();
const counter = z.object({
  values:z.array(z.union([z.number().int().safe(),z.string().trim().min(1).max(16).regex(/^[A-Za-z0-9$€£¥ .,:%+\-/−]+$/).regex(/[0-9]/)])).min(1).max(48),
  stepDuration:time.positive().optional(),stepDurations:z.array(time.positive()).max(47).optional(),
  revealDuration:time.positive().optional(),minHold:time.positive().optional(),direction:z.enum(["up","down"]).optional(),
  fontSize:finite.min(8).max(2048).optional(),fontWeight:z.union([z.number().int().min(100).max(900),z.enum(["normal","bold"])]).optional(),
  color:color.optional(),cellGap:finite.min(0).max(256).optional(),rowHeight:finite.min(16).max(4096).optional(),
  glyphScaleX:finite.min(.1).max(4).optional(),glyphScaleY:finite.min(.1).max(4).optional(),
  echo:z.union([z.literal(false),z.object({color:color.optional(),opacity:finite.min(0).max(1).optional(),scale:finite.min(.5).max(4).optional(),offsetX:finite.min(-4096).max(4096).optional(),offsetY:finite.min(-4096).max(4096).optional()}).strict()]).optional(),
}).strict().superRefine((value,ctx)=>{
  const issue=(message:string)=>ctx.addIssue({code:"custom",message});
  if(value.stepDuration!==undefined && value.stepDurations!==undefined)issue("Use stepDuration or stepDurations, not both");
  if(value.stepDurations!==undefined && value.stepDurations.length!==value.values.length-1)issue("stepDurations requires one interval between each supplied value");
  const intervals=value.stepDurations??Array.from({length:value.values.length-1},()=>value.stepDuration??.2);
  const reveal=Math.round((value.revealDuration??4/30)*30);
  if(reveal<1 || intervals.some(interval=>Math.round(interval*30)<reveal))issue("revealDuration must fit every interval at canonical 30 fps");
  if((value.minHold!==undefined && Math.round(value.minHold*30)<1) || intervals.some(interval=>Math.round(interval*30)<1))issue("Counter timing must occupy at least one canonical frame");
});
const schemas: Record<string, z.ZodType> = {
  "milestone-badge":milestone,"assemble-title":assembly,"concept-link":concept,"exchange-diagram":exchange,
  "counter-reveal":counter,
  "background-grid":background,"background-dots":background,"background-gradient":background,
  "caption-clean":caption,"caption-highlight":caption,
  "chart-bars":bars,
  "chart-trend":z.object({title:short,points:z.array(z.object({x:finite,y:finite}).strict().nullable()).min(2).max(60),xDomain:domain,yDomain:domain,xLabel:short,yLabel:short,xUnit:short,yUnit:short,disclosure}).strict(),
  "metric-card":z.object({title:line,value:dataNumber,unit:line.max(24),comparison:z.object({label:line,value:dataNumber}).strict().optional(),disclosure}).strict(),
  "effect-film":effect,"effect-duotone":effect,
  "layout-compare":z.object({firstTitle:short,firstBody:prose,secondTitle:short,secondBody:prose}).strict(),
  "map-compare":z.object({firstLabel:short,secondLabel:short,first:z.array(point).min(2).max(12),second:z.array(point).min(2).max(12),bounds:z.object({west:finite,east:finite,south:finite,north:finite}).strict()}).strict(),
  "overlay-name":z.object({name:short,role:short}).strict(),
  "overlay-source":z.object({title:short,source:prose,detail:prose}).strict(),
  "story-quote":z.object({quote:prose,attribution:short}).strict(),
  "story-chapters":z.object({events:z.array(z.object({date:short,title:short,detail:short.optional()}).strict()).min(2).max(4)}).strict(),
  "story-turn":z.object({beats:z.array(z.object({title:short,body:prose}).strict()).length(3)}).strict(),
  "text-reveal":kinetic,"text-emphasis":kinetic,
};
const sampleDisclosure = {kind:"illustrative",text:"Authored sample data"};
const captions = {cues:[
  {start:.5,end:3.4,text:"Let each line land.",words:[{start:.5,end:.9,text:"Let"},{start:.9,end:1.4,text:"each"},{start:1.4,end:2,text:"line"},{start:2,end:3.4,text:"land."}]},
  {start:4,end:7.5,text:"Keep words true.",words:[{start:4,end:4.5,text:"Keep"},{start:4.5,end:5.7,text:"words"},{start:5.7,end:7.5,text:"true."}]},
]};
const backgroundSample = {seed:7,spacing:96,strength:.12};
const textSample = {text:"Make the important words clear.",emphasisWords:[3,4]};
const examples: Record<string,Record<string,unknown>> = {
  "milestone-badge":{value:"8",label:"Practice rounds",labelSide:"right",popDuration:.4,labelDelay:4/30,minHold:2,labelFontSize:32,color:"#57D6C7",textColor:"#101C2B"},
  "assemble-title":{text:"MAKE IT CLEAR",subtitle:"One idea, built together.",revealDuration:1.2,glyphDuration:.4,subtitleDelay:.1,minHold:2,scatter:.5,blur:true},
  "concept-link":{term:"CACHE",definition:"Reuse work you already computed.",direction:"down",nodeDuration:10/30,linkDelay:.4,cardDelay:.8,revealDuration:10/30,minHold:1,accent:"#F08A18",textColor:"#161B22",lineColor:"#58616B"},
  "exchange-diagram":{spentLabel:"SPENT",earnedLabel:"EARNED",moneyLabel:"$",presentation:"cycle",transferStart:.5,transferDuration:3.5,labelDelay:4.1,minHold:1,outlineColor:"#363B32",clothingColor:"#C6C9B5",moneyColor:"#89D761",goodsColor:"#DEB887"},
  "counter-reveal":{values:[100,200,400,800],stepDuration:.2,revealDuration:4/30,minHold:1,direction:"up",color:"#E8682C",echo:{opacity:.12,scale:2.6}},
  "background-grid":backgroundSample,"background-dots":backgroundSample,"background-gradient":backgroundSample,
  "caption-clean":captions,"caption-highlight":captions,
  "chart-bars":{title:"Compare on one scale",data:[{label:"A",value:12},{label:"B",value:24},{label:"C",value:-4}],valueDomain:[-10,30],baseline:0,unit:"units",disclosure:sampleDisclosure},
  "chart-trend":{title:"Supplied points",points:[{x:0,y:8},{x:1,y:14},{x:2,y:11},{x:3,y:22},{x:4,y:26}],xDomain:[0,4],yDomain:[0,30],xLabel:"Time",yLabel:"Value",xUnit:"s",yUnit:"units",disclosure:sampleDisclosure},
  "metric-card":{title:"Your value",value:72,unit:"units",comparison:{label:"Reference",value:60},disclosure:sampleDisclosure},
  "effect-film":{strength:.25,seed:7},"effect-duotone":{strength:.65,seed:7},
  "layout-compare":{firstTitle:"Context",firstBody:"Keep the starting point visible.",secondTitle:"Focus",secondBody:"Explain the one thing that changed."},
  "map-compare":{firstLabel:"Route A",secondLabel:"Route B",first:[{longitude:2.3522,latitude:48.8566,label:"Paris"},{longitude:4.8357,latitude:45.764,label:"Lyon"},{longitude:5.3698,latitude:43.2965,label:"Marseille"}],second:[{longitude:2.3522,latitude:48.8566,label:"Paris"},{longitude:5.38,latitude:43.3,label:"Marseille"}],bounds:{west:-6,east:12,south:40,north:52}},
  "overlay-name":{name:"Your speaker",role:"Role / context"},
  "overlay-source":{title:"Keep the source visible",source:"Caller-supplied source",detail:"Replace with a verifiable reference."},
  "story-quote":{quote:"A quote needs its speaker and context.",attribution:"Authored example"},
  "story-chapters":{events:[{date:"01",title:"Question",detail:"What does the viewer need?"},{date:"02",title:"Evidence",detail:"Show the relevant observation."},{date:"03",title:"Answer",detail:"Resolve the same question."}]},
  "story-turn":{beats:[{title:"Context",body:"Start with the question."},{title:"Turn",body:"One observation changes the picture."},{title:"Payoff",body:"Answer the opening question."}]},
  "text-reveal":textSample,"text-emphasis":textSample,
};

/** Return fresh, editable example data; never a measured claim or transcript. */
export function getMotionContentExample(id:string): Record<string,unknown> {
  return structuredClone(examples[id.replace(/^@/,"")] ?? {});
}
export type MotionContent = Readonly<Record<string,Readonly<Record<string,unknown>>>>;

/** Validate selected choreography against its local lifetime, before creating a module. */
export function validateMotionContentTiming(id:string,content:Readonly<Record<string,unknown>>,duration:number,animate=true):void {
  const frames=Math.round(duration*30),f=(key:string,fallback:number)=>Math.round(((content[key] as number|undefined)??fallback)*30);
  let settled:number,hold:number;
  if(id==="milestone-badge"){
    settled=animate?Math.max(f("popDuration",.4),f("labelDelay",4/30)+6):0;hold=f("minHold",2);
  }else if(id==="assemble-title"){
    const reveal=f("revealDuration",1.2);
    settled=content.subtitle?reveal+f("subtitleDelay",.1)+6:reveal;hold=f("minHold",2);
  }else if(id==="concept-link"){
    const node=f("nodeDuration",10/30),link=f("linkDelay",.4),card=f("cardDelay",.8),reveal=f("revealDuration",10/30);
    if(animate && node<3)throw new RangeError("concept-link nodeDuration needs at least three frames for its pop");
    if(link<(animate?node:0) || card<link+(animate?reveal:0))throw new RangeError("concept-link must settle its node, reveal its connector, then open its definition");
    settled=card+(animate?reveal:0);hold=f("minHold",1);
  }else if(id==="exchange-diagram"){
    const start=f("transferStart",.5),travel=f("transferDuration",3.5),label=f("labelDelay",4.1);
    if(travel<4)throw new RangeError("exchange-diagram transferDuration needs at least four frames");
    if(label<start+travel)throw new RangeError("exchange-diagram labels follow the completed transfer");
    settled=Math.max(start+travel,label+6);hold=f("minHold",1);
  }else return;
  if(settled+hold>frames)throw new RangeError(`${id} stages and final reading hold do not fit its lifetime`);
}

/** Strict, bounded parameters; only selected IDs are accepted, and input stays JSON data. */
export function resolveMotionContent(ids:readonly string[],input:unknown): MotionContent {
  if(input!==undefined && (!input || typeof input!=="object" || Array.isArray(input))) throw new TypeError("content must map selected moment IDs to preset settings");
  const supplied=(input??{}) as Record<string,unknown>;
  for(const id of Object.keys(supplied)) if(!ids.includes(id)) throw new RangeError(`Content supplied for unselected moment: ${id}`);
  const result:Record<string,Record<string,unknown>>={};
  for(const id of ids){
    const values=supplied[id];
    if(values!==undefined && (!values || typeof values!=="object" || Array.isArray(values))) throw new TypeError(`${id} content must be an object`);
    if(!schemas[id]){
      if(values && Object.keys(values).length) throw new RangeError(`${id} uses headline, supporting text and source fields`);
      result[id]={}; continue;
    }
    const merged={...getMotionContentExample(id),...(values as object??{})};
    // Uneven counter intervals replace its default uniform interval.
    if(id==="counter-reveal" && values && Object.hasOwn(values,"stepDurations") && !Object.hasOwn(values,"stepDuration"))delete merged.stepDuration;
    result[id]=schemas[id].parse(merged) as Record<string,unknown>;
  }
  const freeze=(value:unknown):unknown=>{
    if(value && typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
    return value;
  };
  return freeze(result) as MotionContent;
}
