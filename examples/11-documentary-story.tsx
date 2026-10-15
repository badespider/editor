/* @jsxImportSource @diffusionstudio/jsx */
/* Original, explicitly fictional mail-route case. No historical mail journey is claimed.
 * Real city coordinates and Natural Earth geometry provide geographic context only.
 * No footage or remote assets.
 * Mount into a new single-scene project:
 * dapi mount examples/11-documentary-story.tsx
 */
import { ChapterCard, LowerThird, SourceCard, QuoteCard, Timeline, EvidenceCallout, MapRoute, PRESENTATION_THEMES, useTicker } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

export default function DocumentaryStoryDemo() {
  const ticker = useTicker();
  const activeEvent = createMemo(() => ticker.time() < 16.6 ? 0 : ticker.time() < 18.2 ? 1 : 2);
  return <rect scene="documentary-story-demo" name="Documentary storytelling kit" width={1920} height={1080} end={24} fill="#101C2B">
    <ChapterCard x={0} y={0} width={1920} height={1000} start={0} end={3}
      chapter="FICTIONAL CASE / 01" title="Why the detour?"
      subtitle="A fictional letter bound for London." fontSize={38} />

    <text x={72} y={54} width={1700} height={64} fontFamily="Arial" fontSize={42} fontWeight="bold" fill="#F6F0E4" start={3} end={9}>The letter takes a detour.</text>
    <MapRoute x={72} y={155} width={1776} height={790} start={3} duration={6} revealDuration={4.5}
      title="Fictional route: New York → Lisbon → London"
      points={[
        { longitude: -74.006, latitude: 40.7128, label: "New York" },
        { longitude: -9.1393, latitude: 38.7223, label: "Lisbon" },
        { longitude: -0.1278, latitude: 51.5074, label: "London" },
      ]}
      bounds={{ west: -100, east: 35, south: 0, north: 70 }}
      camera={{ fromZoom: 1, toZoom: 1.04 }} />
    <LowerThird x={120} y={760} width={1090} height={144} start={3.6} end={8.7} fontSize={22}
      name="NEW YORK → LISBON → LONDON" role="Fictional itinerary" source="Illustration / no historical claim" />

    <text x={72} y={54} width={1740} height={64} fontFamily="Arial" fontSize={42} fontWeight="bold" fill="#F6F0E4" start={9} end={15}>The dispatch gives the reason.</text>
    <SourceCard theme={PRESENTATION_THEMES.documentary.paper} x={120} y={180} width={1080} height={740} start={9} end={15} fontSize={42}
      title="MAIL DISPATCH 014"
      source="Fictional dispatch / demo text"
      detail={"Direct service suspended.\nRedirect mail via Lisbon."}
      date="Not a historical record" />
    <EvidenceCallout theme={PRESENTATION_THEMES.documentary.paper} start={10.2} end={15} width={1920} height={1080} fontSize={25}
      target={{ x: 160, y: 606, width: 1000, height: 170 }} labelPosition="right"
      protectedAreas={[
        { x: 170, y: 275, width: 980, height: 320 },
        { x: 170, y: 780, width: 980, height: 130 },
        { x: 72, y: 1026, width: 1776, height: 30 },
      ]}
      label="SERVICE SUSPENDED"
      detail="Mail is redirected via Lisbon."
      source="Fictional dispatch 014" />

    <Timeline x={96} y={180} width={1728} height={730} start={15} end={20} fontSize={35}
      title="The detour, in order." activeIndex={activeEvent()}
      events={[
        { date: "01 / NEW YORK", title: "Direct link stops.", detail: "Service suspended." },
        { date: "02 / LISBON", title: "Mail is rerouted.", detail: "The detour point." },
        { date: "03 / LONDON", title: "Same destination.", detail: "A new path." },
      ]} />

    <QuoteCard theme={PRESENTATION_THEMES.documentary.paper} x={160} y={190} width={1600} height={710} start={20} end={24} fontSize={38}
      quote={"Direct service stopped.\nLisbon became the detour."}
      attribution="Conclusion of the fictional case"
      source="Invented dispatch 014 / illustrative itinerary" />

    <text x={72} y={1026} width={1776} height={30} fontFamily="Arial" fontSize={19} fill="#C4C7CC" start={0} end={24}>FICTIONAL CASE / INVENTED DISPATCH / REAL CITY COORDINATES</text>
  </rect>;
}
