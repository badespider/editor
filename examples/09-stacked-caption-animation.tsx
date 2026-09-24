/* @jsxImportSource @diffusionstudio/jsx */
/* Stacked phrase animation adapted from an authorized local caption-style test.
 *
 *   dapi mount examples/09-stacked-caption-animation.tsx
 *
 * Runs on a plain background by default. Set source to your own caption-free
 * local clip and replace cards with source-aligned text/times before delivery.
 * No reference footage, private transcripts, fonts, or API calls are included.
 * This is an editable example, not a production caption-import preset or skill.
 */
import { createEffect } from "solid-js";
import { useTicker } from "@diffusionstudio/jsx";

const source: string | null = null;
const duration = 6;
const cards = [
  { s: .6, e: 1.93, lines: [["A short", 112], ["phrase", 76]] },
  { s: 1.93, e: 3.7, lines: [["Make one", 76], ["word", 148], ["stand out.", 76]] },
  { s: 3.7, e: 5.75, lines: [["Then let it", 78], ["fade away.", 118]] },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3);

export default function StackedCaptionAnimation() {
  const { time } = useTicker();
  return (
    <rect scene="example-stacked-captions" name="Stacked caption animation example"
      width={1080} height={1920} fill="#18212b">
      {source && <video src={source} start={0} end={duration} width={1080} height={1920} />}
      <surface name="Staggered phrases with blur-fade exits"
        width={1080} height={1920} start={0} end={duration}
        ref={(canvas) => {
          const ctx = canvas.getContext("2d")!;
          createEffect(() => {
            const t = time();
            ctx.clearRect(0, 0, 1080, 1920);
            for (const card of cards) {
              if (t < card.s || t >= card.e + .13) continue;
              const elapsed = t - card.s;
              const exit = clamp((t - (card.e - .12)) / .25);
              const delay = card.e - card.s < 1 ? .09 : .16;
              // Manual portrait placement, not face tracking or certified safe areas.
              const cx = 492, cy = card.lines.length === 3 ? 1610 : 1590;
              const heights = card.lines.map(([, size]) => size * .86);
              const total = heights.reduce((a, b) => a + b, 0) + 10 * (heights.length - 1);
              let y = cy - total / 2;
              card.lines.forEach(([text, size], i) => {
                const reveal = easeOut((elapsed - i * delay) / .18);
                const scale = (.975 + .025 * reveal) * (1 - .055 * exit);
                const blur = exit * exit * 13;
                ctx.save();
                ctx.translate(cx, y + heights[i] / 2 + 10 * (1 - reveal) - 10 * exit);
                ctx.scale(scale, scale);
                // Uses installed fonts; the fallback may change metrics/appearance.
                ctx.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
                ctx.scale(Math.min(1, 770 / ctx.measureText(text).width), 1);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.lineJoin = "round";
                ctx.globalAlpha = reveal * (1 - exit * exit);
                ctx.filter = blur > .1 ? `blur(${blur.toFixed(2)}px)` : "none";
                ctx.shadowColor = "rgba(0,0,0,.75)";
                ctx.shadowBlur = 11;
                ctx.shadowOffsetY = 4;
                ctx.strokeStyle = "rgba(12,18,24,.83)";
                ctx.lineWidth = 4;
                ctx.strokeText(text, 0, 0);
                ctx.fillStyle = "#fffdf8";
                ctx.fillText(text, 0, 0);
                ctx.restore();
                y += heights[i] + 10;
              });
            }
          });
        }} />
    </rect>
  );
}
