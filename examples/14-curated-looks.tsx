/* @jsxImportSource @diffusionstudio/jsx */
/* One local illustrated source, four native looks, real-time-safe changes. */
import { Effects, createLook, LOOK_PRESETS, motion, useTicker } from "@diffusionstudio/jsx";
import type { LookName } from "@diffusionstudio/jsx";
import { createMemo } from "solid-js";

const names: readonly LookName[] = ["documentary", "clean-teaching", "archive", "night-tech"];
const source = "http://localhost:5173/examples/native-effects-scene.svg";
export default function CuratedLooks() {
  const ticker = useTicker();
  const index = createMemo(() => Math.min(3, Math.max(0, Math.floor(ticker.time() / 4))));
  const name = createMemo(() => names[index()]);
  const look = createMemo(() => createLook(name(), { strength: 1, seed: 17 }));
  return <rect scene="curated-native-looks" name="Four curated native looks" width={1920} height={1080} end={16} fill="#142125">
    <text x={72} y={60} width={1776} height={100} fontFamily="Georgia" fontSize={68} fill="#F2EEE4" {...motion.reveal({ duration: 16, direction: "left", distance: 32 })}>Four looks. One simple control.</text>
    <text x={72} y={170} width={1776} height={70} fontFamily="Arial" fontSize={28} fill="#BCC9C6">{LOOK_PRESETS[name()].purpose}</text>
    <text x={72} y={270} width={846} height={52} fontFamily="Georgia" fontSize={38} fill="#F2EEE4">Original</text>
    <text x={1002} y={270} width={846} height={52} fontFamily="Georgia" fontSize={38} fill="#B3E2C8">{LOOK_PRESETS[name()].title}</text>
    <image src={source} x={72} y={340} width={846} height={476} start={0} end={16} />
    <image src={source} x={1002} y={340} width={846} height={476} start={0} end={16}>
      <Effects effects={look()} />
    </image>
    <text x={72} y={860} width={1776} height={48} fontFamily="Consolas" fontSize={30} fill="#F2EEE4">{`createLook("${name()}", { strength: 1, seed: 17 })`}</text>
    <text x={72} y={934} width={1776} height={40} fontFamily="Arial" fontSize={26} fill="#BCC9C6">Same source and framing. Adjustable strength. Repeatable texture.</text>
    <text x={72} y={1026} width={1776} height={30} fontFamily="Consolas" fontSize={20} fill="#B3E2C8">{`${index() + 1} / 4   READY-MADE LOOKS   /   ORIGINAL ILLUSTRATED SOURCE`}</text>
  </rect>;
}
