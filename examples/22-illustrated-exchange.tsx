/** Original editable illustration: no source media or source artwork is bundled. */
import { ExchangeDiagram, Rect, Text } from "@diffusionstudio/jsx";

export default function Project() {
  // Create the native background before foreground entities to preserve stacking.
  const background = <Rect name="Paper background" width={1920} height={1080}
    start={0} end={7} fill="#FBFBEA" />;
  const exchange = <ExchangeDiagram name="Money for goods / reusable vector parts"
    width={1920} height={1080} start={0} duration={7}
    spentLabel="SPENT" earnedLabel="EARNED" moneyLabel="$" presentation="cycle"
    transferStart={0.5} transferDuration={3.5} labelDelay={4.1} minHold={1} />;
  const source = <Text name="Example provenance" x={80} y={1010} width={1760}
    height={40} start={0} end={7} fontFamily="Arial" fontSize={20} fill="#616557"
  >Original editable illustration / money-for-goods example</Text>;
  return <Rect scene="illustrated-exchange-example" name="Editable vector exchange"
    width={1920} height={1080} fill="#FBFBEA">{background}{exchange}{source}</Rect>;
}
