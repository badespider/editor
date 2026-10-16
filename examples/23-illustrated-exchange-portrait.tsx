/** Reframe the native drawing's unused margins for a larger phone illustration. */
import { AssembleTitle, ConceptLink, ExchangeDiagram, Rect, SourceCard } from "@diffusionstudio/jsx";

export default function Project() {
  const background = <Rect name="Paper" width={1080} height={1920} start={0} end={10} fill="#F4F1E8" />;
  const title = <AssembleTitle name="Reusable title" x={72} y={140} width={936} height={270}
    start={0} duration={10} text="REUSE THE PARTS" subtitle="Build a new explanation."
    fontFamily="Arial" fontSize={72} color="#243E42" subtitleColor="#5B6664" />;
  const exchange = <Rect name="Portrait illustration framing" x={36} y={420} width={1008}
    height={720} start={0} end={10} clipToBox>
    <ExchangeDiagram key="portrait-exchange" name="Large editable exchange" x={-396} y={-90}
      width={1800} height={1080} start={0} duration={10} presentation="cycle"
      spentLabel="PAID" earnedLabel="RECEIVED" moneyLabel="€" goodsLabel="BOOK"
      outlineColor="#25464B" textColor="#25464B" clothingColor="#98B6CD"
      moneyColor="#69C6B0" goodsColor="#E4AE78" skinColor="#F4F1E8" />
  </Rect>;
  const concept = <ConceptLink name="Trade explanation" x={72} y={1170} width={936} height={470}
    start={2} duration={8} term="TRADE" definition="Money out. Goods back." direction="down"
    fontFamily="Arial" fontSize={36} accent="#69C6B0" textColor="#243E42" lineColor="#5B6664" />;
  const source = <SourceCard x={72} y={1680} width={936} height={180}
    start={0} duration={10} fontSize={22} title="Original editable example"
    source="Native vector library demo" detail="Separate editable drawings and text."
    theme={{background:"#F4F1E8",surface:"#E1E8E5",text:"#243E42",muted:"#5B6664",accent:"#297C77",fontFamily:"Arial"}} />;
  return <Rect scene="exchange-remix-portrait-large" name="Portrait native motion remix"
    width={1080} height={1920}>{background}{title}{exchange}{concept}{source}</Rect>;
}
