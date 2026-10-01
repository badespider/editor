// Fixed, owned drawing source: never interpolate reference data here.
// Mirrors the typed helpers; runtime parity tests guard both implementations.
// Unlike Function.toString(), this is byte-stable across CLI bundling and Node.
export const precisionMotionRuntime = String.raw`const precisionEase=function precisionEase(t, e) {
  t = Math.max(0, Math.min(1, t));
  if (t === 0 || t === 1) return t;
  if (typeof e === "object") {
    if (e.kind === "spring") return (1 - Math.exp(-e.damping * t) * Math.cos(2 * Math.PI * e.cycles * t)) / (1 - Math.exp(-e.damping) * Math.cos(2 * Math.PI * e.cycles));
    const cubic = (u, a, b) => 3 * (1 - u) ** 2 * u * a + 3 * (1 - u) * u * u * b + u ** 3;
    let lo = 0, hi = 1;
    for (let n = 0; n < 28; n++) {
      const m = (lo + hi) / 2;
      if (cubic(m, e.x1, e.x2) < t) lo = m;
      else hi = m;
    }
    return cubic((lo + hi) / 2, e.y1, e.y2);
  }
  if (e === "hold") return 0;
  if (e === "easeOut") return 1 - (1 - t) ** 3;
  if (e === "easeIn") return t ** 3;
  if (e === "easeInOut") return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
  if (e === "bounce") {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) {
      t -= 1.5 / d;
      return n * t * t + 0.75;
    }
    if (t < 2.5 / d) {
      t -= 2.25 / d;
      return n * t * t + 0.9375;
    }
    t -= 2.625 / d;
    return n * t * t + 0.984375;
  }
  return t;
};const precisionPose=function precisionPose(layer, time8) {
  let pose = { ...layer.pose }, previous = { at: 0, pose: {}, easing: "linear" };
  for (const key of layer.keys) {
    const next = { ...pose, ...key.pose };
    if (time8 < key.at) {
      const u = (time8 - previous.at) / (key.at - previous.at), out = { ...pose };
      for (const property2 of Object.keys(pose)) {
        const timing2 = previous.propertyTiming?.[property2];
        const f = precisionEase(timing2 ? (u - timing2.start) / (timing2.end - timing2.start) : u, timing2?.easing ?? previous.easing);
        out[property2] = pose[property2] + (next[property2] - pose[property2]) * f;
      }
      if (previous.path) {
        const f = precisionEase(u, previous.easing), q = previous.path;
        out.x = (1 - f) ** 3 * pose.x + 3 * (1 - f) ** 2 * f * q.x1 + 3 * (1 - f) * f * f * q.x2 + f ** 3 * next.x;
        out.y = (1 - f) ** 3 * pose.y + 3 * (1 - f) ** 2 * f * q.y1 + 3 * (1 - f) * f * f * q.y2 + f ** 3 * next.y;
      }
      out.width = Math.max(1e-4, out.width);
      out.height = Math.max(1e-4, out.height);
      out.opacity = Math.max(0, Math.min(1, out.opacity));
      out.reveal = Math.max(0, Math.min(1, out.reveal));
      out.blur = Math.max(0, Math.min(40, out.blur));
      return out;
    }
    pose = next;
    previous = key;
  }
  return pose;
};
function easeScene(t,e){return precisionEase(t,e);}function poseScene(l,t){return precisionPose(l,t);}`;
export const measuredTextRuntime = String.raw`const measuredTextLayout=function measuredTextLayout(ctx, text9, font2, width, height, preferred, minimum, maxLines, lineGap) {
  const words2 = text9.trim().split(/\s+/);
  const attempt = (size) => {
    ctx.font = (font2.italic ? "italic " : "") + font2.weight + " " + size + 'px "' + font2.family + '"';
    ctx.letterSpacing = size * (font2.tracking || 0) + "px";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const lines = [];
    let line = "";
    for (const word of words2) {
      if (ctx.measureText(word).width > width) return null;
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) return null;
    const metrics = lines.map((s) => {
      const m = ctx.measureText(s);
      return { text: s, width: m.width, ascent: m.actualBoundingBoxAscent ?? size * 0.8, descent: m.actualBoundingBoxDescent ?? size * 0.2 };
    });
    const advance = size * lineGap, total = (metrics.length - 1) * advance + metrics[0].ascent + metrics.at(-1).descent;
    if (total > height) return null;
    let baseline = -total / 2 + metrics[0].ascent;
    return { size, font: ctx.font, tracking: ctx.letterSpacing, lines: metrics.map((m) => {
      const y = baseline;
      baseline += advance;
      return { ...m, x: -m.width / 2, y };
    }), height: total };
  };
  if (minimum > preferred) throw Error("Text layout minimum exceeds requested font size");
  const atMin = attempt(minimum);
  if (!atMin) throw Error("Text cannot fit at minimum readable size; enlarge/reflow the box or shorten approved title");
  let result = attempt(preferred);
  if (result) return result;
  let lo = minimum, hi = preferred;
  result = atMin;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2, next = attempt(mid);
    if (next) {
      lo = mid;
      result = next;
    } else hi = mid;
  }
  return result;
};`;
