/* @jsxImportSource @diffusionstudio/jsx */
import { AssembleTitle, Backdrop, ConceptLink, CounterReveal, MilestoneBadge, SourceCard, Text, PRESENTATION_THEMES } from "@diffusionstudio/jsx";

/** Original silent demonstration. Each idea arrives in order and stays editable. */
export function createReferenceMotionMixDemo(format: "landscape" | "portrait" = "landscape") {
  const portrait = format === "portrait", width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080;
  const theme = {...PRESENTATION_THEMES.education.classroom, fontFamily: "Arial"};
  const documentary = {background: theme.background, surface: theme.surface, text: theme.text,
    muted: theme.muted, accent: theme.accent, fontFamily: theme.fontFamily};
  const title = portrait ? {x:72,y:70,width:936,height:300} : {x:96,y:60,width:1728,height:280};
  const badge = portrait ? {x:160,y:400,width:760,height:260} : {x:96,y:400,width:720,height:260};
  const first = portrait ? {x:72,y:750,width:430,height:480} : {x:840,y:360,width:480,height:440};
  const second = portrait ? {x:578,y:750,width:430,height:480} : {x:1360,y:360,width:480,height:440};
  const count = portrait ? {x:72,y:1320,width:936,height:230} : {x:100,y:710,width:580,height:220};
  const label = portrait ? {x:72,y:1500,width:936,height:120} : {x:100,y:910,width:580,height:120};
  const source = portrait ? {x:72,y:1640,width:936,height:220} : {x:840,y:840,width:1000,height:180};
  const concept = {fontFamily:theme.fontFamily,fontSize:28,nodeSize:144,cardWidth:portrait?380:400,
    direction:"down" as const,accent:"#E97029",surfaceColor:"#E97029",textColor:"#1A2730",lineColor:"#58616B"};
  return <rect scene={`reference-motion-mix-${format}`} name="Original motion library / parts become a story"
    width={width} height={height} start={0} end={14} fill={theme.background}>
    <Backdrop width={width} height={height} start={0} duration={14} theme={theme}
      kind="grid" spacing={96} seed={7} strength={.035} />
    <AssembleTitle key="main-title" name="Main assembled title" {...title} start={0} end={14}
      text="MAKE IT CLEAR" subtitle="Ideas become reusable parts." fontFamily={theme.fontFamily}
      fontSize={portrait?80:96} color={theme.text} subtitleColor={theme.muted} />
    <MilestoneBadge key="new-motions" name="Reusable motions milestone" {...badge} start={1.8} end={14}
      value="NEW" label="Reusable motions" labelSide="right" fontFamily={theme.fontFamily}
      labelFontSize={42} color="#E97029" textColor="#1A2730" />
    <ConceptLink key="form" name="Form / shape the idea" {...first} {...concept} start={3.4} end={14}
      term="FORM" definition="Shape the idea." />
    <ConceptLink key="flow" name="Flow / give it direction" {...second} {...concept} start={4.6} end={14}
      term="FLOW" definition="Give it direction." />
    <CounterReveal key="pattern-count" name="Three reusable patterns" {...count} start={6.2} end={14}
      values={["01","02","03"]} stepDuration={.4} revealDuration="4f" minHold={3}
      fontFamily={theme.fontFamily} rowHeight={portrait?150:140} color="#E97029" echo={{opacity:.08,scale:2.3}} />
    <Text key="pattern-label" name="New patterns label" {...label} start={7.2} end={14}
      fontFamily={theme.fontFamily} fontSize={24} fontWeight={700} fill={theme.text}
      textAlign="center" textBaseline="middle">NEW PATTERNS</Text>
    <SourceCard {...source} start={0} end={14} fontSize={portrait?28:20} theme={documentary}
      title="EDIT EVERY LAYER" source="Native text + shapes + tracks" detail="Silent, original demonstration." />
  </rect>;
}
export function ReferenceMotionMixPortrait() { return createReferenceMotionMixDemo("portrait"); }
export default function ReferenceMotionMixLandscape() { return createReferenceMotionMixDemo("landscape"); }
