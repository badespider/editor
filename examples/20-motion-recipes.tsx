/* @jsxImportSource @diffusionstudio/jsx */
import { Backdrop, CounterReveal, DataBars, SourceCard, Text, PRESENTATION_THEMES } from "@diffusionstudio/jsx";

/** Original silent example: two instances of one pattern, with independently
 * authored values/timing, beside existing data/source components. No footage. */
export function createMotionRecipesDemo(format: "landscape" | "portrait" = "landscape") {
  const portrait = format === "portrait", width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080;
  const theme = {...PRESENTATION_THEMES.education.technical, fontFamily: "Arial"};
  const docTheme = {background: theme.background, surface: theme.surface, text: theme.text,
    muted: theme.muted, accent: theme.accent, fontFamily: theme.fontFamily};
  return <rect scene={`motion-recipes-${format}`} name="Reusable patterns / original illustrative remix"
    width={width} height={height} start={0} end={8} fill={theme.background}>
    <Backdrop width={width} height={height} start={0} duration={8} kind="grid" spacing={96} strength={.07} seed={7} theme={theme} />
    <Text x={72} y={60} width={width - 144} height={90} start={0} end={8}
      fontFamily="Arial" fontSize={portrait ? 42 : 46} fontWeight={700} fill={theme.text}>PRACTICE. REPEAT. CONNECT.</Text>
    <CounterReveal key="practice-count" name="Practice count / reusable counter"
      values={["01", "02", "04", "08"]} x={portrait ? 72 : 96} y={portrait ? 180 : 150}
      width={portrait ? 936 : 960} height={portrait ? 560 : 360} start={0} duration={8}
      stepDurations={[.2, .4, .8]} revealDuration="4f" minHold={3}
      color="#57D6C7" echo={{opacity: .12, scale: 2.4, offsetY: -30}} />
    <CounterReveal key="second-count" name="Second counter / independent instance"
      values={["10", "20", "30"]} x={portrait ? 600 : 1300} y={portrait ? 760 : 210}
      width={portrait ? 408 : 500} height={220} start={2} duration={6}
      stepDurations={[.5, .8]} revealDuration="4f" minHold={3}
      color="#F6C66A" />
    <DataBars x={72} y={portrait ? 1000 : 550} width={portrait ? 936 : 1056} height={portrait ? 550 : 480}
      start={1.5} duration={6.5} fontSize={24} theme={theme} title={portrait ? "Illustrative comparison" : "An illustrative comparison"}
      data={[{label: "First pass", value: 20}, {label: portrait ? "Repeat" : "With practice", value: 70}]}
      valueDomain={[0,100]} baseline={0} unit="units"
      disclosure={{kind: "illustrative", text: "Example"}} />
    <SourceCard x={portrait ? 72 : 1248} y={portrait ? 1600 : 550}
      width={portrait ? 936 : 576} height={portrait ? 250 : 420}
      start={2} duration={6} fontSize={portrait ? 35 : 20} theme={docTheme}
      title="PATTERN + PATTERN" source="Original editable example"
      detail={portrait ? "Two counters + one chart." : "Two counters, one chart, shared design."} />
  </rect>;
}
export function MotionRecipesPortrait() { return createMotionRecipesDemo("portrait"); }
export default function MotionRecipesLandscape() { return createMotionRecipesDemo("landscape"); }
