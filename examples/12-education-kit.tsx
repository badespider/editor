/* @jsxImportSource @diffusionstudio/jsx */
/* One scene. Authored teaching examples; no footage, remote assets or code execution. */
import { LessonCard, EquationCard, WorkedExample, CartesianPlot, VectorDiagram, FlowDiagram, CodeWalkthrough, QuizCard, useTicker, PRESENTATION_THEMES } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

const parabola = Array.from({ length: 121 }, (_, index) => { const x = -3 + index / 20; return { x, y: x * x }; });
const definitionHighlights = Object.freeze([1, 2]);
const callHighlights = Object.freeze([4, 5]);
const theme = PRESENTATION_THEMES.education.classroom;
export default function EducationKitDemo() {
  const ticker = useTicker();
  const activeStep = createMemo(() => ticker.time() < 12.3 ? 0 : ticker.time() < 14.5 ? 1 : 2);
  const highlightedLines = createMemo(() => ticker.time() < 38 ? definitionHighlights : callHighlights);
  const quizAnswer = createMemo(() => ticker.time() < 44 ? undefined : 2);
  return <rect scene="education-kit-demo" name="Education kit — math, physics and IT" width={1920} height={1080} fill={theme.background} end={47}>
    <LessonCard theme={theme} start={0} end={4} title="Teach one idea at a time."
      eyebrow="EDUCATION KIT / MATH · PHYSICS · IT"
      body={"Define it. Show it.\nWork through it. Check it."}
      footer="Reusable native teaching graphics" />

    <EquationCard theme={theme} start={4} end={10} title="MATH / THE QUADRATIC FORMULA" mathSize={76}
      equation={{ type: "row", items: ["x =", { type: "fraction",
        numerator: { type: "row", items: ["−b ±", { type: "root", radicand: { type: "row", items: [{ type: "power", base: "b", exponent: "2" }, "−4ac"] } }] },
        denominator: "2a" }] }}
      caption="For ax² + bx + c = 0. Real roots: b² − 4ac ≥ 0; a ≠ 0."
      variables={[{ symbol: "a", meaning: "quadratic coefficient" }, { symbol: "b", meaning: "linear coefficient" }, { symbol: "c", meaning: "constant term" }]} />

    <WorkedExample theme={theme} start={10} end={17} title="MATH / SOLVE 2x + 4 = 10"
      activeStep={activeStep()} revealThroughActive
      steps={[
        { label: "START WITH THE EQUATION", expression: "2x + 4 = 10", explanation: "Keep both sides equal." },
        { label: "SUBTRACT 4 FROM BOTH SIDES", expression: "2x = 6", explanation: "Remove the constant term." },
        { label: "DIVIDE BOTH SIDES BY 2", expression: "x = 3", explanation: "Check: 2 × 3 + 4 = 10." },
      ]} />

    <CartesianPlot theme={theme} x={96} y={96} width={1728} height={888} start={17} duration={6} revealDuration={4.5}
      title="MATH / Trace a function" xDomain={[-3.5, 3.5]} yDomain={[-1, 10]}
      xLabel="x" yLabel="y" series={[{ label: "y = x²", points: parabola }]} marker />

    <VectorDiagram theme={theme} x={96} y={96} width={1728} height={760} start={23} duration={6} revealDuration={4}
      title="PHYSICS / A 6 N net force" origin={{ x: 0, y: 0 }}
      xDomain={[-1, 10]} yDomain={[-3, 3]} xLabel="Force x" yLabel="Force y"
      vectors={[{ x: 6, y: 0, label: "F_net", unit: "N" }]} />
    <text x={182} y={904} width={1556} height={64} start={23} end={29} fontFamily={theme.fontFamily} fontSize={30} fill={theme.text}>Constant mass: F_net = ma = 2 kg × 3 m/s² = 6 N.</text>

    <FlowDiagram theme={theme} x={96} y={96} width={1728} height={760} start={29} duration={6} revealDuration={4.5}
      title="IT / Follow a packet — illustrative path"
      nodes={[{ id: "client", label: "Client", x: .08, y: .5 }, { id: "switch", label: "Switch", x: .35, y: .5 }, { id: "router", label: "Router", x: .62, y: .5 }, { id: "server", label: "Server", x: .89, y: .5 }]}
      edges={[{ id: "cs", from: "client", to: "switch" }, { id: "sr", from: "switch", to: "router" }, { id: "rs", from: "router", to: "server" }]}
      packetPath={["cs", "sr", "rs"]} />
    <text x={182} y={904} width={1556} height={64} start={29} end={35} fontFamily={theme.fontFamily} fontSize={30} fill={theme.muted}>An authored teaching diagram. No live network traffic.</text>

    <CodeWalkthrough theme={theme} start={35} end={41} title="CODE / Compute net force"
      lines={["def net_force(mass, acceleration):", "    return mass * acceleration", "", "force = net_force(2, 3)", "print(force)  # 6 N, using SI inputs"]}
      highlightedLines={highlightedLines()}
      note="Python example / displayed as literal text" />

    <QuizCard theme={theme} start={41} end={47} fontSize={29}
      question="If m = 2 kg and a = 3 m/s², what is F_net?"
      choices={["3 N", "5 N", "6 N", "9 N"]}
      answerIndex={quizAnswer()}
      explanation="For constant mass: F_net = ma = 2 × 3 = 6 N." />

    <text x={72} y={1026} width={1776} height={30} fontFamily={theme.monoFamily} fontSize={19} fill={theme.muted} start={0} end={47}>EDUCATION KIT / AUTHORED EXAMPLES / MATH · PHYSICS · IT</text>
  </rect>;
}
