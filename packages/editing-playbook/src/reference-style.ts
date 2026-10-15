/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { z } from "zod";

const finite = z.number().finite();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const prose = (max: number, min = 0) => z.string().min(min).max(max)
  .regex(/^[^\u0000-\u0008\u000b-\u001f\u007f]*$/, "Unsupported control characters");
const coordinate = finite.min(-8192).max(8192);
const dimension = finite.positive().max(8192);
const rotation = finite.min(-3600).max(3600);
const opacity = finite.min(0).max(1);
const keyframeSchema = z.object({
  time: finite.min(0).max(120),
  x: coordinate,
  y: coordinate,
  scale: finite.min(0).max(4),
  rotation,
  opacity,
}).strict();
const layerSchema = z.object({
  id: z.string().max(64).regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  name: prose(100, 1),
  type: z.enum(["text", "rect", "ellipse", "line"]),
  start: finite.min(0).max(120),
  end: finite.positive().max(120),
  x: coordinate,
  y: coordinate,
  width: dimension,
  height: dimension,
  rotation,
  opacity,
  fill: hex,
  text: prose(1200),
  fontFamily: z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/, "Use one installed local font family, not CSS or a URL"),
  fontSize: finite.min(8).max(512),
  fontWeight: finite.int().min(100).max(900),
  textAlign: z.enum(["left", "center", "right"]),
  radius: finite.nonnegative().max(4096),
  keyframes: z.array(keyframeSchema).max(20),
}).strict();

const structuralSchema = z.object({
  schemaVersion: z.literal(1),
  title: prose(160, 1),
  summary: prose(4000, 1),
  uncertainties: z.array(prose(600, 1)).max(24),
  width: finite.int().min(1).max(4096),
  height: finite.int().min(1).max(4096),
  fps: z.literal(30),
  duration: finite.min(1 / 30).max(120),
  background: hex,
  layers: z.array(layerSchema).min(1).max(120),
}).strict();

const frame = (seconds: number) => Math.round(seconds * 30);

/**
 * A bounded layer description, never code or media. Times are absolute scene
 * seconds, snapped once to the editor's canonical 30 fps frame grid on import.
 * Only circles are supported under `ellipse`; the native primitive has no
 * nonuniform ellipse transform, and a rounded rectangle is not an ellipse.
 */
export const referenceStylePlanSchema = structuralSchema.superRefine((plan, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (plan.width * plan.height > 8_294_400) issue(["width"], "Canvas exceeds the 8,294,400 pixel budget");
  const ids = new Set<string>();
  let characters = 0;
  for (const [index, layer] of plan.layers.entries()) {
    const path = ["layers", index];
    if (ids.has(layer.id)) issue([...path, "id"], "Layer IDs must be unique");
    ids.add(layer.id);
    if (layer.end <= layer.start || frame(layer.end) <= frame(layer.start)) issue([...path, "end"], "Layer must span at least one native frame");
    if (layer.end > plan.duration) issue([...path, "end"], "Layer extends beyond the composition duration");
    if (layer.width > plan.width * 2 || layer.height > plan.height * 2) issue([...path, "width"], "Layer dimensions must not exceed twice the canvas dimensions");
    if (layer.x < -plan.width || layer.x > plan.width * 2 || layer.y < -plan.height || layer.y > plan.height * 2) issue([...path, "x"], "Layer position exceeds the bounded offscreen canvas area");
    if (layer.radius > Math.min(layer.width, layer.height) / 2) issue([...path, "radius"], "Radius exceeds half the shortest side");
    if (layer.type === "ellipse" && layer.width !== layer.height) issue([...path, "height"], "Native ellipse support is limited to circles: width must equal height");
    if (layer.type === "text") {
      if (!layer.text.trim()) issue([...path, "text"], "Text layers require visible literal text");
      if (layer.fontSize > Math.max(plan.width, plan.height)) issue([...path, "fontSize"], "Font size exceeds the canvas dimensions");
      characters += Array.from(layer.text).length;
    } else if (layer.text !== "") issue([...path, "text"], "Non-text layers must use an empty text field");
    let previousTime = -Infinity, previousFrame = -Infinity;
    for (const [keyIndex, key] of layer.keyframes.entries()) {
      const keyPath = [...path, "keyframes", keyIndex];
      if (key.time < layer.start || key.time > layer.end) issue([...keyPath, "time"], "Keyframe time must be inside its layer's absolute scene interval");
      if (key.time <= previousTime || frame(key.time) <= previousFrame) issue([...keyPath, "time"], "Keyframe times must increase and occupy distinct 30 fps frames");
      if (key.x < -plan.width || key.x > plan.width * 2 || key.y < -plan.height || key.y > plan.height * 2) issue([...keyPath, "x"], "Keyframe position exceeds the bounded offscreen canvas area");
      previousTime = key.time; previousFrame = frame(key.time);
    }
  }
  if (characters > 12_000) issue(["layers"], "Composition exceeds the 12,000 text character budget");
});

export type ReferenceStylePlan = z.infer<typeof referenceStylePlanSchema>;

/** Provider output structure. Runtime validation also enforces cross-field, frame and total-resource bounds. */
export const referenceStyleJsonSchema = z.toJSONSchema(structuralSchema, { target: "draft-7" });

type NativeKeyframe = { time: string; value: number; easing: "linear" };
type NativeValue = number | NativeKeyframe[];
type NativeLayer = {
  type: ReferenceStylePlan["layers"][number]["type"];
  props: {
    key: string; name: string; start: string; end: string; width: number; height: number;
    x: NativeValue; y: NativeValue; scale: NativeValue; rotation: NativeValue; opacity: NativeValue;
    fill: string; cornerRadius: number;
    fontFamily?: string; fontSize?: number; fontWeight?: number; textAlign?: "left" | "center" | "right";
    textBaseline?: "top"; children?: string;
  };
};

function nativeLayer(layer: ReferenceStylePlan["layers"][number]): NativeLayer {
  const startFrame = frame(layer.start);
  const base = { time: layer.start, x: layer.x, y: layer.y, scale: 1, rotation: layer.rotation, opacity: layer.opacity };
  const keys = layer.keyframes.length && frame(layer.keyframes[0].time) === startFrame ? layer.keyframes : [base, ...layer.keyframes];
  function track(property: "x" | "y" | "scale" | "rotation" | "opacity"): NativeValue {
    if (keys.every(key => key[property] === keys[0][property])) return keys[0][property];
    return keys.map(key => ({ time: `${frame(key.time) - startFrame}f`, value: key[property], easing: "linear" as const }));
  }
  return {
    type: layer.type,
    props: {
      key: layer.id, name: layer.name, start: `${startFrame}f`, end: `${frame(layer.end)}f`,
      width: layer.width, height: layer.height, x: track("x"), y: track("y"), scale: track("scale"),
      rotation: track("rotation"), opacity: track("opacity"), fill: layer.fill,
      cornerRadius: layer.type === "ellipse" ? layer.width / 2 : layer.type === "text" ? 0 : layer.radius,
      ...(layer.type === "text" ? { fontFamily: layer.fontFamily, fontSize: layer.fontSize, fontWeight: layer.fontWeight, textAlign: layer.textAlign, textBaseline: "top" as const, children: layer.text } : {}),
    },
  };
}

/**
 * Generate native text/shapes and ordinary inspector-editable keyframes. The
 * module has no clock callback, asset resolver, shader, HTML, external import or
 * model invocation. Linear tracks hold their final value after the last key.
 */
export function buildReferenceStyleModule(input: unknown, options: { sceneKey?: string } = {}): string {
  const plan = referenceStylePlanSchema.parse(input);
  const settings = z.object({ sceneKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/).optional() }).strict().parse(options);
  const sceneKey = settings.sceneKey ?? `reference-style-${globalThis.crypto.randomUUID()}`;
  const data = {
    sceneKey, title: plan.title, summary: plan.summary, uncertainties: plan.uncertainties,
    width: plan.width, height: plan.height, fps: plan.fps, duration: frame(plan.duration) / 30,
    sourceDuration: plan.duration, background: plan.background,
    timing: "Absolute scene seconds rounded once to 30 fps; native layer tracks are node-local and linear.",
    layers: plan.layers.map(nativeLayer),
  };
  // Literal strings stay JSON values, including displayed code/URLs. None is executed or fetched.
  const literal = JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  return `import { Rect, Text } from "dapi-host:@diffusionstudio/jsx";
const data = ${literal};
export const referenceStyleManifest = data;
export default function Project() {
  const background = Rect({key:"_reference-style-background",name:"Reference style background",x:0,y:0,width:data.width,height:data.height,fill:data.background,start:"0f",end:String(Math.round(data.duration*30))+"f"});
  const layers = data.layers.map(layer => layer.type === "text" ? Text(layer.props) : Rect(layer.props));
  return Rect({scene:data.sceneKey,name:data.title,width:data.width,height:data.height,fill:data.background,children:[background,...layers]});
}
`;
}
