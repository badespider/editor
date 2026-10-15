/* @jsxImportSource @diffusionstudio/jsx */
/* Original, illustrative documentary toolkit demo. No footage or remote assets.
 * Mount into a new single-scene project:
 * dapi mount examples/11-documentary-story.tsx
 */
import { ChapterCard, LowerThird, SourceCard, QuoteCard, Timeline, EvidenceCallout, MapRoute, PRESENTATION_THEMES } from "@diffusionstudio/jsx";

export default function DocumentaryStoryDemo() {
  return <rect scene="documentary-story-demo" name="Documentary storytelling kit" width={1920} height={1080} end={24} fill="#101C2B">
    <ChapterCard x={0} y={0} width={1920} height={1000} start={0} end={3}
      chapter="01 / START WITH A QUESTION" title="Why did the route change?"
      subtitle="Give the viewer a reason to look closer." fontSize={38} />

    <text x={72} y={54} width={1700} height={64} fontFamily="Arial" fontSize={42} fontWeight="bold" fill="#F6F0E4" start={3} end={9}>First, establish the place.</text>
    <MapRoute x={72} y={155} width={1776} height={790} start={3} duration={6} revealDuration={4.5}
      title="An illustrative route across the Atlantic"
      points={[
        { longitude: -74.006, latitude: 40.7128, label: "New York" },
        { longitude: -0.1278, latitude: 51.5074, label: "London" },
        { longitude: -9.1393, latitude: 38.7223, label: "Lisbon" },
      ]}
      bounds={{ west: -100, east: 35, south: 0, north: 70 }}
      camera={{ fromZoom: 1, toZoom: 1.04 }} />
    <LowerThird x={120} y={720} width={1090} height={176} start={3.6} end={8.7} fontSize={24}
      name="THREE PLACES. ONE QUESTION." role="Orient before explaining." source="Illustrative route / not a travel claim" />

    <text x={72} y={54} width={1740} height={64} fontFamily="Arial" fontSize={42} fontWeight="bold" fill="#F6F0E4" start={9} end={15}>Then, make the evidence visible.</text>
    <SourceCard theme={PRESENTATION_THEMES.documentary.paper} x={180} y={190} width={1560} height={730} start={9} end={15} fontSize={42}
      title="FIELD NOTE 014 — SAMPLE DOCUMENT"
      source="Demonstration document / fictional field notes"
      detail="The crossing was closed. The route had to change."
      date="Illustrative text" url="Replace with your verified source" />
    <EvidenceCallout theme={PRESENTATION_THEMES.documentary.paper} start={10.2} end={15} width={1920} height={1080} fontSize={25}
      target={{ x: 250, y: 608, width: 900, height: 165 }} labelPosition="right"
      label="THE KEY DETAIL"
      detail="Keep the surrounding document visible."
      source="Sample annotation" />

    <Timeline x={96} y={180} width={1728} height={730} start={15} end={20} fontSize={35}
      title="Build a clear sequence." activeIndex={1}
      events={[
        { date: "01 / QUESTION", title: "Introduce a gap.", detail: "What needs explaining?" },
        { date: "02 / EVIDENCE", title: "Show the clue.", detail: "What changes our understanding?" },
        { date: "03 / REVEAL", title: "Connect the dots.", detail: "Why does it matter to someone?" },
      ]} />

    <QuoteCard theme={PRESENTATION_THEMES.documentary.paper} x={160} y={190} width={1600} height={710} start={20} end={24} fontSize={42}
      quote="The map shows where. The story explains why."
      attribution="Sample narration"
      source="Original demo text / illustrative narration" />

    <text x={72} y={1026} width={1776} height={30} fontFamily="Arial" fontSize={19} fill="#C4C7CC" start={0} end={24}>DOCUMENTARY KIT / ILLUSTRATIVE STORY / EDITABLE NATIVE GRAPHICS</text>
  </rect>;
}
