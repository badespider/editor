/* @jsxImportSource @diffusionstudio/jsx */
/* One authored constant-mass lesson: prerequisite -> action -> visible check.
 * Uses the editor's story-plan, pacing, visual-focus and review guidance.
 * Silent original graphics; code and expected result are text, never executed.
 */
import { LessonCard, EquationCard, WorkedExample, VectorDiagram, CodeWalkthrough, QuizCard, PRESENTATION_THEMES, useTicker } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

const theme = PRESENTATION_THEMES.education.classroom;
const definition = Object.freeze([1, 2]), call = Object.freeze([4, 5]), expected = Object.freeze([6]);
const code = Object.freeze([
  "def net_force(mass, acceleration):",
  "    return mass * acceleration",
  "",
  "force = net_force(2, 3)",
  'print(f"{force} N")',
  "# AUTHORED EXPECTED: 6 N",
]);

export default function EditorGuidedForceLesson() {
  const ticker = useTicker();
  const step = createMemo(() => ticker.time() < 11.5 ? 0 : ticker.time() < 14 ? 1 : 2);
  const throughLine = createMemo(() => ticker.time() < 23.5 ? 2 : ticker.time() < 25.5 ? 5 : 6);
  const highlighted = createMemo(() => ticker.time() < 23.5 ? definition : ticker.time() < 25.5 ? call : expected);
  const answer = createMemo(() => ticker.time() < 32 ? undefined : 1);
  return <rect scene="editor-guided-force-lesson" name="One force lesson — prerequisite, action, proof" width={1920} height={1080} end={35} fill={theme.background}>
    <LessonCard theme={theme} start={0} end={5} fontSize={36}
      eyebrow="GOAL / NET FORCE ALONG X" title="Find the net force."
      body={"Mass is constant. Use SI units.\nm = 2 kg\na = +3 m/s²\nPositive x points right."}
      footer="Given values / an authored teaching example" />

    <EquationCard theme={theme} start={5} end={9} fontSize={36} mathSize={84}
      title="For constant mass: F = ma"
      equation={{type: "row", items: ["F =", "m × a"]}}
      caption="Match the force and acceleration axes."
      variables={[{symbol: "F", meaning: "net force along x", unit: "N"}, {symbol: "m", meaning: "mass", unit: "kg"}, {symbol: "a", meaning: "acceleration along x", unit: "m/s²"}]} />

    <WorkedExample theme={theme} start={9} end={17} fontSize={36}
      title="Find F in three steps" activeStep={step()} revealThroughActive
      steps={[
        {label: "SUBSTITUTE", expression: "F = 2 kg × 3 m/s²", explanation: "Use the given SI values."},
        {label: "MULTIPLY", expression: "F = 6 kg·m/s²", explanation: "Keep the force unit."},
        {label: "STATE THE RESULT", expression: "F = +6 N", explanation: "1 N = 1 kg·m/s²; +x is right."},
      ]} />

    <VectorDiagram theme={theme} x={96} y={96} width={1728} height={760} start={17} duration={4} revealDuration={1}
      title="Result: +6 N points right" origin={{x: 0, y: 0}}
      xDomain={[-1, 10]} yDomain={[-3, 3]} xLabel="Force x" yLabel="Force y"
      vectors={[{x: 6, y: 0, label: "F", unit: "N"}]} />
    <text x={182} y={904} width={1556} height={70} start={17} end={21} fontFamily={theme.fontFamily} fontSize={34} fill={theme.text}>6 N to the right; constant mass.</text>

    <CodeWalkthrough theme={theme} start={21} end={28} fontSize={36}
      title="Apply the same relationship" lines={code}
      visibleThroughLine={throughLine()} highlightedLines={highlighted()}
      note="SI inputs. Literal Python; not executed." />

    <QuizCard theme={theme} start={28} end={35} fontSize={34}
      question="Same acceleration. If m = 4 kg, what is F?"
      choices={["6 N", "12 N", "24 N"]} answerIndex={answer()}
      explanation="F = 4 × 3 = 12 N. Doubling mass doubles force." />
    <text x={72} y={1026} width={1776} height={30} start={0} end={35} fontFamily={theme.monoFamily} fontSize={19} fill={theme.muted}>CONSTANT MASS / SI UNITS / AUTHORED LESSON AND EXPECTED RESULT / NO CODE EXECUTION</text>
  </rect>;
}
