/* @jsxImportSource @diffusionstudio/jsx */
/* Original, display-only fixture. Compare information as well as treatment. */
import { Effects, createLook, LOOK_PRESETS, motion, useTicker } from "@diffusionstudio/jsx";
import type { LookName } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

const names: readonly LookName[] = ["documentary", "clean-teaching", "archive", "night-tech"];
const source = "http://localhost:5173/examples/editor-readability-scene.svg";
export default function EditorLooks() {
  const ticker = useTicker();
  const index = createMemo(() => Math.min(3, Math.max(0, Math.floor(ticker.time() / 6))));
  const name = createMemo(() => names[index()]);
  const look = createMemo(() => createLook(name(), { strength: 1, seed: 17 }));
  return <rect scene="editor-looks-readability" name="Looks on code, text and diagrams" width={1920} height={1080} end={24} fill="#142125">
    <text x={72} y={58} width={1776} height={104} fontFamily="Georgia" fontSize={68} fill="#F2EEE4" start={0} end={24}
      {...motion.reveal({ duration: 24, minHold: 22, direction: "left", distance: 24 })}>Preserve the information.</text>
    <text x={72} y={178} width={1776} height={62} fontFamily="Arial" fontSize={28} fill="#BCC9C6" start={0} end={24}>{LOOK_PRESETS[name()].purpose}</text>
    <text x={72} y={270} width={846} height={52} fontFamily="Georgia" fontSize={38} fill="#F2EEE4" start={0} end={24}>Original fixture</text>
    <text x={1002} y={270} width={846} height={52} fontFamily="Georgia" fontSize={38} fill="#B3E2C8" start={0} end={24}>{LOOK_PRESETS[name()].title}</text>
    <image name="Unchanged readability reference" src={source} x={72} y={340} width={846} height={476} start={0} end={24} />
    <image name="Treated readability fixture" src={source} x={1002} y={340} width={846} height={476} start={0} end={24}>
      <Effects effects={look()} />
    </image>
    <text x={72} y={858} width={1776} height={48} fontFamily="Consolas" fontSize={30} fill="#F2EEE4" start={0} end={24}>{`createLook("${name()}", { strength: 1, seed: 17 })`}</text>
    <text x={72} y={934} width={1776} height={42} fontFamily="Arial" fontSize={26} fill="#BCC9C6" start={0} end={24}>Original authored fixture · constant-mass SI example · code displayed, never executed.</text>
    <text x={72} y={1024} width={1776} height={32} fontFamily="Consolas" fontSize={22} fill="#B3E2C8" start={0} end={24}>{`${index() + 1} / 4   SAME SOURCE / SAME FRAMING / NEUTRAL PROVENANCE LABEL`}</text>
  </rect>;
}
