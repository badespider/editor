/* @jsxImportSource @diffusionstudio/jsx */
import { LessonCard, QuizCard, useTicker, PRESENTATION_THEMES } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

export default function PortraitLesson() {
  const ticker = useTicker();
  const answer = createMemo(() => ticker.time() < 9 ? undefined : 1);
  const theme = PRESENTATION_THEMES.education.classroom;
  return <rect scene="portrait-education-demo" name="Portrait education cards" width={1080} height={1920} end={12} fill={theme.background}>
    <LessonCard theme={theme} x={72} y={120} width={936} height={1620} start={0} end={6} fontSize={48}
      eyebrow="Keep both sides equal." title="Find x."
      body={"2x + 4 = 10\nBoth sides − 4\n2x = 6\nBoth sides ÷ 2\nx = 3"}
      footer="Solve, then check." />
    <QuizCard theme={theme} x={72} y={120} width={936} height={1620} start={6} end={12} fontSize={48}
      question="What is 2×3+4?" choices={["6", "10", "12"]}
      answerIndex={answer()}
      explanation={"2×3+4 = 10.\nBoth sides match."} />
    <text x={72} y={1810} width={936} height={40} fontFamily={theme.monoFamily} fontSize={24} fill={theme.muted} start={0} end={12}>EDUCATION KIT / MOBILE EXAMPLE</text>
  </rect>;
}
