/* @jsxImportSource @diffusionstudio/jsx */
/* Local, generated-only gallery. Run the desktop development editor, then:
 * dapi mount examples/09-native-effects.tsx
 * The static SVG is served by the dev server; no remote media or paid calls.
 */
import {
  Effects, colorGrade, filmLook, vignette, grain, chromaticAberration,
  pixelate, scanlines, duotone, motion,
} from "@diffusionstudio/jsx";
import type { EffectSpec, MotionPreset } from "@diffusionstudio/jsx";

const SOURCE = "http://localhost:5173/examples/native-effects-scene.svg";
const ACCENT = "#A9E4CB";
const WHITE = "#F2F1E8";
const MUTED = "#91A29F";
const tiles: { title: string; detail: string; effects: EffectSpec[] }[] = [
  { title: "Original", detail: "Unchanged source", effects: [] },
  { title: "Film look", detail: "Warmth + texture + soft edges", effects: [filmLook({ warmth: 0.35, grain: 0.18, vignette: 0.35 })] },
  { title: "Vignette", detail: "Shapeable edge falloff", effects: [vignette({ strength: 0.7, softness: 0.7 })] },
  { title: "Grain", detail: "Seeded, playhead-driven texture", effects: [grain({ amount: 0.5, seed: 17 })] },
  { title: "RGB split", detail: "Channel offset in pixels", effects: [chromaticAberration({ amount: 7 })] },
  { title: "Pixelate", detail: "A controllable sampling grid", effects: [pixelate({ size: 16 })] },
  { title: "Duotone", detail: "Two colors, adjustable blend", effects: [duotone({ dark: "#1D3045", light: "#EABFB1" })] },
  { title: "Scanlines", detail: "Spacing + strength", effects: [scanlines({ strength: 0.4, spacing: 6 })] },
  { title: "Color grade + grain", detail: "Two effects, one ordered stack", effects: [colorGrade({ exposure: 0.25, contrast: 1.2, saturation: 0.7, warmth: -0.25 }), grain({ amount: 0.2, seed: 5 })] },
];

export function Gallery() {
  return <rect scene="native-effects-gallery" name="Native effects gallery" width={1920} height={1080} fill="#101D21" end={8}>
    <text x={72} y={46} width={1400} height={72} fontFamily="Arial" fontSize={56} fontWeight="bold" fill={WHITE}>Your native effects library.</text>
    <text x={76} y={125} width={1750} height={36} fontFamily="Arial" fontSize={25} fill={MUTED}>Eight reusable treatments. Simple parameters. The same source in every tile.</text>
    {tiles.map((tile, i) => {
      const x = 76 + (i % 3) * 596;
      const y = 204 + Math.floor(i / 3) * 264;
      return <>
        <image name={tile.title + " image"} src={SOURCE} x={x} y={y} width={560} height={180} cornerRadius={14} start={0} end={8}>
          {tile.effects.length > 0 && <Effects effects={tile.effects} />}
        </image>
        <text x={x} y={y + 190} width={560} height={34} fontFamily="Arial" fontSize={27} fontWeight="bold" fill={WHITE}>{tile.title}</text>
        <text x={x} y={y + 224} width={560} height={26} fontFamily="Arial" fontSize={20} fill={MUTED}>{tile.detail}</text>
      </>;
    })}
    <text x={76} y={1028} width={1770} height={28} fontFamily="Arial" fontSize={19} fill={ACCENT}>NATIVE WEBGPU   /   ADJUSTABLE PARAMETERS   /   NO EXTERNAL EFFECT RENDERER</text>
  </rect>;
}

const samples: { title: string; subtitle: string; preset: MotionPreset; label: string; start?: number }[] = [
  { title: "Caption pop", subtitle: "Fast scale + opacity, with a soft overshoot", preset: motion.captionPop({ delay: 0.2 }), label: "A LITTLE MOMENT" },
  { title: "Slide + fade", subtitle: "Combine independent native tracks", preset: motion.combine(motion.slideIn({ direction: "left", distance: 96, duration: 0.7, delay: 0.2 }), motion.fadeIn({ duration: 0.7, delay: 0.2 })), label: "BACK OUTSIDE" },
  { title: "Slow zoom", subtitle: "A gentle eight-second push", preset: motion.slowZoom({ duration: 8, from: 1, to: 1.12 }), label: "TAKE IT IN" },
  { title: "Float", subtitle: "Smooth keyframes, repeatable on every seek", preset: motion.float({ duration: 8, distance: 18, cycles: 2 }), label: "SMALL DETAILS" },
  { title: "Build / hold / resolve", subtitle: "Includes an authored three-second reading minimum", preset: motion.reveal({ duration: 8, minHold: 3, direction: "right", distance: 36 }), label: "LET THE IDEA LAND" },
  { title: "Fade out", subtitle: "Begins at a precise local time", preset: motion.fadeOut({ at: 5, duration: 1.2 }), label: "SEE YOU NEXT TIME" },
];

export function MotionGallery() {
  return <rect scene="native-motion-gallery" name="Native motion presets" width={1920} height={1080} fill="#101D21" end={8}>
    <text x={72} y={46} width={1740} height={72} fontFamily="Arial" fontSize={56} fontWeight="bold" fill={WHITE}>Motion with a purpose.</text>
    <text x={76} y={125} width={1770} height={36} fontFamily="Arial" fontSize={25} fill={MUTED}>Reusable entrances, exits and movement, expressed as editable timeline keyframes.</text>
    {samples.map((sample, i) => {
      const x = 76 + (i % 3) * 596;
      const y = 230 + Math.floor(i / 3) * 388;
      return <>
        <rect x={x} y={y} width={560} height={244} cornerRadius={18} fill="#1A3036" end={8} />
        <text name={sample.title + " animated label"} x={x + 30} y={y + 90} width={500} height={70} fontFamily="Arial" fontSize={32} fontWeight="bold" textAlign="center" textBaseline="middle" fill={ACCENT} start={0} end={8} {...sample.preset}>{sample.label}</text>
        <text x={x} y={y + 264} width={560} height={38} fontFamily="Arial" fontSize={29} fontWeight="bold" fill={WHITE}>{sample.title}</text>
        <text x={x} y={y + 306} width={560} height={40} fontFamily="Arial" fontSize={20} fill={MUTED}>{sample.subtitle}</text>
      </>;
    })}
    <text x={76} y={1028} width={1770} height={28} fontFamily="Arial" fontSize={19} fill={ACCENT}>EDITABLE KEYFRAMES   /   LOCAL CLIP TIME   /   FRAME-BASED PLAYBACK AND EXPORT</text>
  </rect>;
}
