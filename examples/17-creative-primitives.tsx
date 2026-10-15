/* @jsxImportSource @diffusionstudio/jsx */
/* Silent authored design lesson: context -> detail -> retained point.
 * Uses native editor motion/focus/pacing/review guidance; no footage claim.
 */
import { Backdrop, KineticText, PanelLayout, StoryBeatCard, PRESENTATION_THEMES, Text } from "@diffusionstudio/jsx";
import type { PanelSlotBox } from "@diffusionstudio/jsx";

const theme = PRESENTATION_THEMES.education.classroom;
export function createCreativePrimitivesDemo(format: "landscape" | "portrait" = "landscape") {
  const portrait = format === "portrait", width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080;
  const margin = portrait ? 72 : 96, inner = width - margin * 2, panelHeight = portrait ? 1640 : 888;
  const slot = (title: string, body: string) => (box: PanelSlotBox) => <>
    <Text x={32} y={48} width={box.width - 64} height={100} start={box.start} end={box.end} fontFamily={theme.fontFamily} fontSize={48} fill={theme.accent} fontWeight={700}>{title}</Text>
    <Text x={32} y={190} width={box.width - 64} height={box.height - 230} start={box.start} end={box.end} fontFamily={theme.fontFamily} fontSize={portrait ? 44 : 40} fill={theme.text}>{body}</Text>
  </>;
  return <rect scene={`creative-primitives-${format}`} name="Context before detail / authored graphic" width={width} height={height} end={18} fill={theme.background}>
    <Backdrop width={width} height={height} start={0} duration={6} kind="gradient" theme={theme} />
    <StoryBeatCard x={margin} y={portrait ? 120 : 96} width={inner} height={panelHeight} start={0} duration={6} fontSize={portrait ? 48 : 40} minHold={3} theme={theme}
      eyebrow="A CLEAR EXPLANATION" title="Start with context."
      body="Show what the viewer needs before pointing to a detail."
      source="Authored design example / no footage used" />
    <Backdrop width={width} height={height} start={6} duration={6} kind="dots" spacing={112} seed={42} strength={.1} theme={theme} />
    <PanelLayout x={margin} y={portrait ? 120 : 96} width={inner} height={panelHeight} start={6} duration={6} direction={portrait ? "stack" : "columns"} gap={40} theme={theme}
      first={slot("CONTEXT", "Where are we?\nWhat changed?")}
      second={slot("DETAIL", "What matters here?\nKeep the source visible.")} />
    <Backdrop width={width} height={height} start={12} duration={6} kind="grid" spacing={112} seed={42} strength={.08} theme={theme} />
    <KineticText x={margin} y={portrait ? 480 : 300} width={inner} height={portrait ? 1000 : 600} start={12} duration={6} fontSize={portrait ? 72 : 96} revealDuration={1.2} minHold={3} emphasisWords={[1,4]} theme={theme}
      text="Context makes the detail meaningful." />
    <text x={margin} y={portrait ? 1800 : 1000} width={inner} height={portrait ? 100 : 50} start={6} end={18} fontFamily={theme.fontFamily} fontSize={portrait ? 28 : 22} fill={theme.muted}>AUTHORED GRAPHIC / NO SOURCE EVENT IMPLIED</text>
  </rect>;
}
export function CreativePrimitivesPortrait() { return createCreativePrimitivesDemo("portrait"); }
export default function CreativePrimitivesLandscape() { return createCreativePrimitivesDemo("landscape"); }
