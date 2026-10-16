/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Rect, Text } from "./elements";
import { educationFrames, educationNumber, eduTime } from "./education-core";
import { wrapDocumentaryText } from "./documentary";
import type { Animatable, Time } from "./types";

export type ConceptLinkProps = Readonly<{
  /** Caller-authored short term and its definition; no relationship is inferred. */
  term: string; definition: string;
  key?: string; name?: string;
  x?: number; y?: number; width?: number; height?: number;
  start?: Time; end?: Time; duration?: Time;
  direction?: "down" | "right";
  nodeSize?: number; cardWidth?: number;
  nodeDuration?: Time; linkDelay?: Time; cardDelay?: Time;
  /** Duration of the connector growth and, independently, the card reveal. */
  revealDuration?: Time;
  /** Author-chosen fully readable hold; not a reading-speed estimate. */
  minHold?: Time;
  fontFamily?: string; fontSize?: number;
  accent?: string; textColor?: string; surfaceColor?: string; lineColor?: string;
  /** False preserves the authored stage times with instantaneous reveals. */
  animate?: boolean;
}>;
type Box = Readonly<{x: number; y: number; width: number; height: number}>;
type Point = Readonly<{x: number; y: number}>;
export type ConceptLinkLayout = Readonly<{
  x: number; y: number; width: number; height: number;
  startFrame: number; endFrame: number; frames: number; animate: boolean;
  term: string; definition: string; wrappedDefinition: string;
  direction: "down" | "right"; node: Box; card: Box;
  line: Readonly<{from: Point; to: Point; length: number; rotation: number; thickness: number}>;
  nodeFrames: number; linkFrame: number; cardFrame: number;
  revealFrames: number; settledFrame: number; holdFrames: number;
  fontFamily: string; fontSize: number; termFontSize: number; cardPadding: number;
  accent: string; textColor: string; surfaceColor: string; lineColor: string;
}>;

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001F\u007F]/.test(value)) throw new TypeError(`${label} must be nonempty single-line text of at most ${max} characters`);
  return value.trim();
}
function color(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^#[\da-f]{6}$/i.test(value)) throw new TypeError(`${label} must be a #RRGGBB color`);
  return value;
}

/** Pure bounded geometry and canonical 30fps timing, independent of playback. */
export function getConceptLinkLayout(props: ConceptLinkProps): ConceptLinkLayout {
  const keys = ["term", "definition", "key", "name", "x", "y", "width", "height", "start", "end", "duration", "direction", "nodeSize", "cardWidth", "nodeDuration", "linkDelay", "cardDelay", "revealDuration", "minHold", "fontFamily", "fontSize", "accent", "textColor", "surfaceColor", "lineColor", "animate"];
  if (!props || typeof props !== "object" || Array.isArray(props)) throw new TypeError("ConceptLink must be an object");
  for (const key of Object.keys(props)) if (!keys.includes(key)) throw new TypeError(`Unknown ConceptLink field: ${key}`);
  if (props.key !== undefined) text(props.key, "ConceptLink.key", 120);
  if (props.name !== undefined) text(props.name, "ConceptLink.name", 160);
  if (props.end !== undefined && props.duration !== undefined) throw new TypeError("Use ConceptLink.end or duration, not both");
  if (props.animate !== undefined && typeof props.animate !== "boolean") throw new TypeError("ConceptLink.animate must be boolean");
  const term = text(props.term, "ConceptLink.term", 20), definition = text(props.definition, "ConceptLink.definition", 100);
  const x = educationNumber(props.x ?? 0, "ConceptLink.x"), y = educationNumber(props.y ?? 0, "ConceptLink.y");
  const width = educationNumber(props.width ?? 640, "ConceptLink.width", 160, 4096), height = educationNumber(props.height ?? 420, "ConceptLink.height", 160, 4096);
  if (width * height > 8_388_608) throw new RangeError("ConceptLink box exceeds the 8-megapixel limit");
  const direction = props.direction ?? "down";
  if (direction !== "down" && direction !== "right") throw new TypeError("ConceptLink.direction must be down or right");
  const startFrame = educationFrames(props.start ?? 0, "ConceptLink.start");
  const frames = props.end === undefined ? educationFrames(props.duration ?? 5, "ConceptLink.duration", true) : educationFrames(props.end, "ConceptLink.end") - startFrame;
  if (frames < 1 || startFrame + frames > 108000) throw new RangeError("ConceptLink needs a positive lifetime within 108000 frames");
  const animate = props.animate !== false;
  const nodeFrames = educationFrames(props.nodeDuration ?? "10f", "ConceptLink.nodeDuration", true);
  const revealFrames = educationFrames(props.revealDuration ?? "10f", "ConceptLink.revealDuration", true);
  const linkFrame = educationFrames(props.linkDelay ?? "12f", "ConceptLink.linkDelay");
  const cardFrame = educationFrames(props.cardDelay ?? "24f", "ConceptLink.cardDelay");
  const holdFrames = educationFrames(props.minHold ?? 1, "ConceptLink.minHold", true);
  if (animate && nodeFrames < 3) throw new RangeError("ConceptLink.nodeDuration needs at least 3 frames for the native pop/settle");
  if (linkFrame < (animate ? nodeFrames : 0) || cardFrame < linkFrame + (animate ? revealFrames : 0)) throw new RangeError("ConceptLink stages must show the settled node, connector, then definition in order");
  const settledFrame = cardFrame + (animate ? revealFrames : 0);
  if (frames - settledFrame < holdFrames) throw new RangeError(`ConceptLink reading hold has ${frames - settledFrame} frames but minHold requires ${holdFrames}`);
  const nodeSize = educationNumber(props.nodeSize ?? Math.max(48, Math.min(width * .24, height * .38, 160)), "ConceptLink.nodeSize", 48, Math.min(width, height) * .58);
  const padding = Math.max(6, nodeSize * .06), fontSize = educationNumber(props.fontSize ?? Math.min(28, nodeSize * .22), "ConceptLink.fontSize", 8, 256);
  const cardWidth = educationNumber(props.cardWidth ?? width * (direction === "down" ? .72 : .55), "ConceptLink.cardWidth", 64, width - padding * 2);
  const cardPadding = Math.max(8, fontSize * .65);
  const wrappedDefinition = wrapDocumentaryText(definition, {width: cardWidth - cardPadding * 2, fontSize, maxLines: 3, label: "ConceptLink.definition"});
  const cardHeight = wrappedDefinition.split("\n").length * fontSize * 1.35 + cardPadding * 2;
  if (cardHeight + padding * 2 > height) throw new RangeError("ConceptLink definition card does not fit its box");
  const termFontSize = Math.min(fontSize * 1.15, nodeSize * .32, nodeSize * .78 / (Array.from(term).length * 1.1));
  if (termFontSize < 8) throw new RangeError("ConceptLink term needs a larger circle or shorter text; conservative term font would be below 8px");
  const node = Object.freeze(direction === "down" ? {x: width * .34 - nodeSize / 2, y: padding, width: nodeSize, height: nodeSize} : {x: padding, y: height * .35 - nodeSize / 2, width: nodeSize, height: nodeSize});
  const card = Object.freeze(direction === "down" ? {x: (width - cardWidth) * .62, y: height - padding - cardHeight, width: cardWidth, height: cardHeight} : {x: width - padding - cardWidth, y: Math.min(height - padding - cardHeight, Math.max(padding, height * .62 - cardHeight / 2)), width: cardWidth, height: cardHeight});
  // The connector is a single rotated native thin rectangle. Its start stays
  // on the circle boundary while its center and width grow toward the tag.
  const center = {x: node.x + nodeSize / 2, y: node.y + nodeSize / 2};
  const to = Object.freeze(direction === "down" ? {x: card.x + card.width / 2, y: card.y} : {x: card.x, y: card.y + card.height / 2});
  const dx = to.x - center.x, dy = to.y - center.y, distance = Math.hypot(dx, dy), radius = nodeSize / 2;
  if (direction === "down" ? card.y <= node.y + nodeSize + 16 : card.x <= node.x + nodeSize + 16) throw new RangeError("ConceptLink needs at least 16px between the circle and definition card; enlarge the box or reduce their sizes");
  const from = Object.freeze({x: center.x + dx / distance * radius, y: center.y + dy / distance * radius});
  const line = Object.freeze({from, to, length: distance - radius, rotation: Math.atan2(dy, dx) * 180 / Math.PI, thickness: Math.max(1.5, Math.min(4, nodeSize / 60))});
  return Object.freeze({x, y, width, height, startFrame, endFrame: startFrame + frames, frames, animate, term, definition, wrappedDefinition, direction, node, card, line, nodeFrames, linkFrame, cardFrame, revealFrames, settledFrame, holdFrames, fontFamily: text(props.fontFamily ?? "Arial", "ConceptLink.fontFamily", 120), fontSize, termFontSize, cardPadding, accent: color(props.accent ?? "#F08A18", "ConceptLink.accent"), textColor: color(props.textColor ?? "#161B22", "ConceptLink.textColor"), surfaceColor: color(props.surfaceColor ?? props.accent ?? "#F08A18", "ConceptLink.surfaceColor"), lineColor: color(props.lineColor ?? "#58616B", "ConceptLink.lineColor")});
}

function grow(value: number, duration: number, enabled: boolean, initial = 0): Animatable<number> {
  return enabled ? [{time: "0f", value: initial, easing: "easeOut"}, {time: eduTime(duration), value}] : value;
}
function shifted(from: number, to: number, duration: number, enabled: boolean): Animatable<number> {return grow(to, duration, enabled, from);}

/** One editable term-circle → growing connector → clipped definition tag. */
export function ConceptLink(props: ConceptLinkProps): JSX.Element {
  const data = createMemo(() => getConceptLinkLayout(props), undefined, {equals: (a, b) => JSON.stringify(a) === JSON.stringify(b)});
  return Rect({
    get key(){return props.key;}, get name(){return props.name ?? "ConceptLink";},
    get x(){return data().x;}, get y(){return data().y;}, get width(){return data().width;}, get height(){return data().height;},
    get start(){return eduTime(data().startFrame);}, get end(){return eduTime(data().endFrame);}, clipToBox: true,
    get children(){
      const d = data(), l = d.line, n = d.node, c = d.card;
      const scale: Animatable<number> = d.animate ? [{time: "0f", value: .05, easing: "easeOut"}, {time: eduTime(Math.max(1, Math.floor(d.nodeFrames * .8))), value: 1.06, easing: "easeInOut"}, {time: eduTime(d.nodeFrames), value: 1}] : 1;
      const connector = Rect({name: "Concept connector", x: shifted(l.from.x, (l.from.x + l.to.x - l.length) / 2, d.revealFrames, d.animate), y: shifted(l.from.y - l.thickness / 2, (l.from.y + l.to.y - l.thickness) / 2, d.revealFrames, d.animate), width: grow(l.length, d.revealFrames, d.animate), height: l.thickness, rotation: l.rotation, fill: d.lineColor, start: eduTime(d.linkFrame), end: eduTime(d.frames)});
      const termDelay = d.animate ? Math.max(1, Math.floor(d.nodeFrames * .2)) : 0;
      const node = Rect({name: "Concept term circle", ...n, cornerRadius: n.width / 2, fill: d.accent, scale, start: "0f", end: eduTime(d.frames), children: Text({name: "Concept term", x: 0, y: 0, width: n.width, height: n.height, start: eduTime(termDelay), end: eduTime(d.frames), opacity: grow(1, Math.max(1, Math.floor(d.nodeFrames * .3)), d.animate), fontFamily: d.fontFamily, fontSize: d.termFontSize, fontWeight: 700, fill: d.textColor, textAlign: "center", textBaseline: "middle", children: d.term})});
      const card = Rect({name: "Concept definition reveal", x: c.x, y: c.y, width: grow(c.width, d.revealFrames, d.animate), height: c.height, clipToBox: true, start: eduTime(d.cardFrame), end: eduTime(d.frames), children: [
        Rect({name: "Concept definition surface", x: 0, y: 0, width: c.width, height: c.height, cornerRadius: Math.min(12, c.height * .15), fill: d.surfaceColor, start: "0f", end: eduTime(d.frames - d.cardFrame)}),
        Text({name: "Concept definition", x: d.cardPadding, y: d.cardPadding, width: c.width - d.cardPadding * 2, height: c.height - d.cardPadding * 2, fontFamily: d.fontFamily, fontSize: d.fontSize, fontWeight: 500, fill: d.textColor, textAlign: "center", textBaseline: "middle", start: "0f", end: eduTime(d.frames - d.cardFrame), children: d.wrappedDefinition}),
      ]});
      return [connector, node, card];
    },
  });
}
