/* @jsxImportSource @diffusionstudio/jsx */
/* Authored cue/timing demonstration. Silent: no transcription or speech-sync claim. */
import { CaptionTrack } from "@diffusionstudio/jsx";

const cues = [
  {start: 0, end: 2.5, text: "Keep the words.", words: [
    {text: "Keep", start: 0, end: .7}, {text: "the", start: .7, end: 1.2}, {text: "words.", start: 1.2, end: 2.5},
  ]},
  {start: 3, end: 6, text: "Punctuation, too!\nKeep context.", words: [
    {text: "Punctuation,", start: 3, end: 3.8}, {text: "too!", start: 3.8, end: 4.4},
    {text: "Keep", start: 4.4, end: 5}, {text: "context.", start: 5, end: 6},
  ]},
];

export default function AuthoredCaptionPresets() {
  return <rect scene="authored-caption-presets" name="Authored native captions" width={1920} height={1080} start={0} end={18} fill="#101C2B">
    <text x={96} y={76} width={1728} height={120} fontFamily="Arial" fontSize={64} fontWeight={700} fill="#F6F0E4" start={0} end={18}>The same words. Three treatments.</text>
    <text x={96} y={230} width={1728} height={120} fontFamily="Arial" fontSize={34} fill="#BAC7D6" start={0} end={18}>Authored text and timing / silent demonstration.</text>
    <text x={96} y={380} width={1728} height={100} fontFamily="Arial" fontSize={42} fill="#54D6C7" start={0} end={6}>CLEAN / a complete phrase</text>
    <text x={96} y={380} width={1728} height={100} fontFamily="Arial" fontSize={42} fill="#54D6C7" start={6} end={12}>BOXED / contrast behind the phrase</text>
    <text x={96} y={380} width={1728} height={100} fontFamily="Arial" fontSize={42} fill="#54D6C7" start={12} end={18}>KARAOKE / one timed word receives emphasis</text>
    <CaptionTrack cues={cues} preset="clean" start={0} duration={6} fontSize={52} />
    <CaptionTrack cues={cues} preset="boxed" start={6} duration={6} fontSize={52} />
    <CaptionTrack cues={cues} preset="karaoke" start={12} duration={6} fontSize={52} />
    <text x={96} y={1020} width={1728} height={32} fontFamily="Arial" fontSize={20} fill="#BAC7D6" start={0} end={18}>ORIGINAL AUTHORED EXAMPLE / NO AUDIO / NO ASR OR SPEECH VERIFICATION</text>
  </rect>;
}
