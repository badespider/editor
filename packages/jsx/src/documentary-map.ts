/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, createMemo } from "solid-js";
import type { JSX } from "solid-js";
import { Surface } from "./elements";
import { useTicker } from "./renderer";
import { parseTime, TIME_FPS } from "./time";
import type { Time } from "./types";
import { NATURAL_EARTH_LAND } from "./documentary-land";

export { DOCUMENTARY_LAND_SOURCE, NATURAL_EARTH_LAND } from "./documentary-land";
export type MapCoordinate = readonly [longitude: number, latitude: number];
/** One polygon's rings, including optional holes. Longitude/latitude order. */
export type MapLandPolygon = readonly (readonly MapCoordinate[])[];
export type MapRoutePoint = Readonly<{ longitude: number; latitude: number; label?: string }>;
export type MapBounds = Readonly<{ west: number; east: number; south: number; north: number }>;
export type MapCameraOptions = Readonly<{ fromZoom?: number; toZoom?: number }>;
export type MapRouteOptions = Readonly<{
  points: readonly MapRoutePoint[];
  width: number;
  height: number;
  x?: number;
  y?: number;
  /** Parent-local placement. Direct scene children use scene-local ticker time. */
  start?: Time;
  /** Total visible duration, default 6s; positive, rounded to canonical 30fps. */
  duration?: Time;
  /** Default 75% of duration, leaving a final held route. Must fit duration. */
  revealDuration?: Time;
  bounds?: MapBounds;
  camera?: MapCameraOptions;
  /** Override with real longitude/latitude land polygons; no network tiles. */
  land?: readonly MapLandPolygon[];
  title?: string;
  /** Source of custom land data. Natural Earth credit remains for bundled data. */
  credits?: string;
}>;

export const WORLD_MAP_BOUNDS: MapBounds = Object.freeze({ west: -180, east: 180, south: -90, north: 90 });
const DEFAULT_LAND = Object.freeze(NATURAL_EARTH_LAND.map(ring => Object.freeze([ring])));
const validatedBrand: unique symbol = Symbol("ValidatedMapRouteOptions");
export type ValidatedMapRouteOptions = Readonly<{
  points: readonly MapRoutePoint[];
  width: number; height: number; x: number; y: number;
  startFrame: number; durationFrames: number; revealFrames: number;
  bounds: MapBounds;
  camera: Readonly<{ fromZoom: number; toZoom: number }>;
  land: readonly MapLandPolygon[];
  title: string; credits: string;
  segmentDistances: readonly number[];
  totalDistance: number;
  [validatedBrand]: true;
}>;

function finite(name: string, value: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`MapRoute.${name}: expected a finite number in ${min}..${max}`);
  }
  return value;
}
function boundsOf(bounds: MapBounds): MapBounds {
  if (!bounds || typeof bounds !== "object") throw new TypeError("MapRoute.bounds: expected west/east/south/north");
  const west = finite("bounds.west", bounds.west, -180, 180);
  const east = finite("bounds.east", bounds.east, -180, 180);
  const south = finite("bounds.south", bounds.south, -90, 90);
  const north = finite("bounds.north", bounds.north, -90, 90);
  if (west >= east || south >= north) throw new RangeError("MapRoute.bounds: require west < east and south < north; dateline-crossing bounds are not supported");
  if (east - west < 0.01 || north - south < 0.01) throw new RangeError("MapRoute.bounds: each span must be at least 0.01 degrees");
  return Object.freeze({ west, east, south, north });
}
function coordinate(longitude: number, latitude: number): void {
  finite("longitude", longitude, -180, 180);
  finite("latitude", latitude, -90, 90);
}

/** Equirectangular longitude/latitude projection; points outside bounds extrapolate for clipping. */
export function projectMapPoint(longitude: number, latitude: number, width: number, height: number, bounds: MapBounds = WORLD_MAP_BOUNDS): Readonly<{ x: number; y: number }> {
  coordinate(longitude, latitude);
  finite("projection.width", width, Number.MIN_VALUE, 16384);
  finite("projection.height", height, Number.MIN_VALUE, 16384);
  const b = boundsOf(bounds);
  return { x: (longitude - b.west) / (b.east - b.west) * width, y: (b.north - latitude) / (b.north - b.south) * height };
}

/** Great-circle distance in kilometers; the displayed route uses projected straight segments. */
export function mapPointDistance(a: MapRoutePoint, b: MapRoutePoint): number {
  coordinate(a.longitude, a.latitude); coordinate(b.longitude, b.latitude);
  const rad = Math.PI / 180;
  const lat = Math.sin((b.latitude - a.latitude) * rad / 2);
  const lon = Math.sin((b.longitude - a.longitude) * rad / 2);
  const h = Math.min(1, Math.max(0, lat * lat + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * lon * lon));
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function timeFrames(name: string, time: Time, positive: boolean): number {
  if (typeof time === "string" && !/^(?:\d+(?:\.\d+)?f?|\d+:[0-5]?\d(?:\.\d+)?|\d+:[0-5]?\d:[0-5]?\d(?:\.\d+)?)$/i.test(time.trim())) {
    throw new RangeError(`MapRoute.${name}: expected seconds, frame time or a valid clock time`);
  }
  const seconds = parseTime(time);
  if (seconds === undefined || seconds < 0 || (positive && seconds <= 0)) throw new RangeError(`MapRoute.${name}: expected ${positive ? "positive" : "nonnegative"} time`);
  const frames = Math.round(seconds * TIME_FPS);
  if (!Number.isSafeInteger(frames) || frames > 108000 || (positive && frames < 1)) throw new RangeError(`MapRoute.${name}: must round to ${positive ? "1" : "0"}..108000 canonical 30fps frames`);
  return frames;
}
function text(name: string, value: string, max: number): string {
  if (typeof value !== "string" || value.length > max || /[\r\n\u0000]/.test(value)) throw new TypeError(`MapRoute.${name}: expected a single line of at most ${max} characters`);
  return value;
}

/** Snapshot and validate all input. Invalid data is rejected, never silently clamped. */
export function validateMapRouteOptions(options: MapRouteOptions): ValidatedMapRouteOptions {
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("MapRoute: expected options");
  const width = finite("width", options.width, 320, 4096);
  const height = finite("height", options.height, 180, 4096);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 8388608) throw new RangeError("MapRoute: integer canvas dimensions must fit 8 megapixels");
  const bounds = boundsOf(options.bounds ?? WORLD_MAP_BOUNDS);
  if (!Array.isArray(options.points) || options.points.length < 2 || options.points.length > 32) throw new RangeError("MapRoute.points: expected 2..32 route points");
  const points = Array.from(options.points, (p: MapRoutePoint, index) => {
    if (!p || typeof p !== "object") throw new TypeError(`MapRoute.points[${index}]: expected longitude/latitude`);
    coordinate(p.longitude, p.latitude);
    if (p.longitude < bounds.west || p.longitude > bounds.east || p.latitude < bounds.south || p.latitude > bounds.north) throw new RangeError(`MapRoute.points[${index}]: outside map bounds`);
    return Object.freeze({ longitude: p.longitude, latitude: p.latitude, label: text("label", p.label ?? "", 80) });
  });
  const distances: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if (Math.abs(points[i].longitude - points[i - 1].longitude) > 180) throw new RangeError("MapRoute: route crosses the dateline; split it into separate maps (v1 does not wrap routes)");
    const distance = mapPointDistance(points[i - 1], points[i]);
    if (distance < 0.000001) throw new RangeError("MapRoute: adjacent route points must represent distinct locations");
    distances.push(distance);
  }
  let land = DEFAULT_LAND as readonly MapLandPolygon[];
  if (options.land !== undefined) {
    if (!Array.isArray(options.land) || options.land.length < 1 || options.land.length > 1024) throw new RangeError("MapRoute.land: expected 1..1024 real land polygons");
    let vertices = 0;
    land = Object.freeze(Array.from(options.land, polygon => {
      if (!Array.isArray(polygon) || polygon.length < 1) throw new TypeError("MapRoute.land: each polygon needs an exterior ring");
      return Object.freeze(Array.from(polygon, ring => {
        if (!Array.isArray(ring) || ring.length < 3) throw new TypeError("MapRoute.land: each ring needs at least three coordinates");
        return Object.freeze(Array.from(ring, point => {
          if (!Array.isArray(point) || point.length !== 2 || ++vertices > 20000) throw new RangeError("MapRoute.land: use longitude/latitude pairs and at most 20000 vertices");
          coordinate(point[0], point[1]);
          return Object.freeze([point[0], point[1]] as const);
        }));
      }));
    }));
  }
  const durationFrames = timeFrames("duration", options.duration ?? 6, true);
  const revealFrames = options.revealDuration === undefined ? Math.max(1, Math.round(durationFrames * 0.75)) : timeFrames("revealDuration", options.revealDuration, true);
  if (revealFrames > durationFrames) throw new RangeError("MapRoute.revealDuration: cannot exceed total duration");
  const sourceCredit = options.credits === undefined ? "" : text("credits", options.credits, 140);
  return Object.freeze({
    points: Object.freeze(points), width, height,
    x: finite("x", options.x ?? 0, -100000, 100000), y: finite("y", options.y ?? 0, -100000, 100000),
    startFrame: timeFrames("start", options.start ?? 0, false), durationFrames, revealFrames, bounds,
    camera: Object.freeze({ fromZoom: finite("camera.fromZoom", options.camera?.fromZoom ?? 1, 1, 4), toZoom: finite("camera.toZoom", options.camera?.toZoom ?? 1, 1, 4) }),
    land, title: text("title", options.title ?? "Route map", 100),
    credits: options.land === undefined ? `Made with Natural Earth · Equirectangular${sourceCredit ? ` · ${sourceCredit}` : ""}` : (sourceCredit || "Provided land geometry · Equirectangular"),
    segmentDistances: Object.freeze(distances), totalDistance: distances.reduce((a, b) => a + b, 0), [validatedBrand]: true as const,
  });
}

export type MapRouteFrame = Readonly<{ progress: number; cameraZoom: number; revealed: readonly MapRoutePoint[] }>;
/** Clip-local canonical frame. Reveal is sequential and proportional to geodesic segment lengths. */
export function getMapRouteFrame(options: ValidatedMapRouteOptions, localFrame: number): MapRouteFrame {
  if (!Number.isFinite(localFrame)) throw new TypeError("MapRoute frame must be finite");
  const progress = Math.max(0, Math.min(1, localFrame < 0 ? 0 : options.revealFrames === 1 ? 1 : localFrame / (options.revealFrames - 1)));
  const cameraProgress = Math.max(0, Math.min(1, localFrame / Math.max(1, options.durationFrames - 1)));
  const eased = 0.5 - Math.cos(cameraProgress * Math.PI) / 2;
  const cameraZoom = options.camera.fromZoom + (options.camera.toZoom - options.camera.fromZoom) * eased;
  let remaining = progress * options.totalDistance;
  const revealed: MapRoutePoint[] = [options.points[0]];
  for (let i = 0; i < options.segmentDistances.length; i++) {
    const a = options.points[i], b = options.points[i + 1], distance = options.segmentDistances[i];
    if (remaining >= distance) { revealed.push(b); remaining -= distance; continue; }
    if (remaining > 0) revealed.push({ longitude: a.longitude + (b.longitude - a.longitude) * remaining / distance, latitude: a.latitude + (b.latitude - a.latitude) * remaining / distance });
    break;
  }
  // Floating-point summation must not leave the final stop microscopically short.
  return { progress, cameraZoom, revealed: progress === 1 ? options.points : revealed };
}

/** Small structural Canvas2D contract, usable in Node CPU tests without DOM types. */
export interface MapDrawingContext {
  fillStyle: unknown; strokeStyle: unknown; lineWidth: number; font: string;
  textAlign: string; textBaseline: string; lineCap: string; lineJoin: string;
  save(): void; restore(): void; beginPath(): void; closePath(): void;
  rect(x: number, y: number, w: number, h: number): void; clip(): void;
  moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  fill(rule?: "evenodd"): void; stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number): void;
  fillText(text: string, x: number, y: number): void;
  measureText(text: string): { width: number };
}
type Box = { x: number; y: number; width: number; height: number };
function intersects(a: Box, b: Box): boolean { return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y; }
type LabelPlacement = { label: string; box: Box; pin: { x: number; y: number }; leader: boolean };
function mapLabels(ctx: MapDrawingContext, options: ValidatedMapRouteOptions, plot: Box, project: (longitude: number, latitude: number) => { x: number; y: number }, fontSize: number): LabelPlacement[] {
  const pinRadius = Math.max(4, options.width / 150) + 3;
  const pins = options.points.map(point => project(point.longitude, point.latitude));
  const protectedPins = pins.map(p => ({ x: p.x - pinRadius, y: p.y - pinRadius, width: pinRadius * 2, height: pinRadius * 2 }));
  const placements: LabelPlacement[] = [], seen = new Set<string>();
  for (let index = 0; index < options.points.length; index++) {
    const point = options.points[index];
    if (!point.label) continue;
    const key = JSON.stringify([point.longitude, point.latitude, point.label]);
    if (seen.has(key)) continue; // A return visit needs one visible city label, not two overlapping copies.
    seen.add(key);
    const pin = pins[index];
    if (pin.x < plot.x - 0.000001 || pin.x > plot.x + plot.width + 0.000001 || pin.y < plot.y - 0.000001 || pin.y > plot.y + plot.height + 0.000001) {
      throw new RangeError(`MapRoute label "${point.label}" leaves the viewport; widen the map bounds or reduce camera zoom`);
    }
    const width = ctx.measureText(point.label).width + 16, height = fontSize + 12;
    if (width - 16 > Math.max(60, plot.width * 0.43) || width > plot.width - 4 || height > plot.height - 4) {
      throw new RangeError(`MapRoute label "${point.label}" does not fit in full; use a wider map or a shorter authored label`);
    }
    // Preserve the old preferred placements for uncrowded maps and existing demos.
    const offsets = [[12, -height - 10], [12, 10], [-width - 12, -height - 10], [-width - 12, 10]];
    for (let ring = 1; ring <= 3; ring++) {
      const gap = 14 + ring * (height + 8);
      offsets.push([gap, -height - gap], [gap, gap], [-width - gap, -height - gap], [-width - gap, gap], [-width / 2, -height - gap], [-width / 2, gap], [gap, -height / 2], [-width - gap, -height / 2]);
    }
    const tried = new Set<string>();
    let selected: LabelPlacement | undefined;
    for (let candidateIndex = 0; candidateIndex < offsets.length; candidateIndex++) {
      const [dx, dy] = offsets[candidateIndex];
      const box = { x: Math.max(plot.x + 2, Math.min(plot.x + plot.width - width - 2, pin.x + dx)), y: Math.max(plot.y + 2, Math.min(plot.y + plot.height - height - 2, pin.y + dy)), width, height };
      const location = `${box.x}:${box.y}`;
      if (tried.has(location)) continue; tried.add(location);
      const clearance = { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 };
      if (placements.some(other => intersects(clearance, other.box)) || protectedPins.some((p, i) => {
        if (pins[i].x === pin.x && pins[i].y === pin.y) {
          // Preserve the established 12px preferred offset when it clears its own marker.
          const radius = pinRadius - 3;
          return intersects(box, { x: pin.x - radius, y: pin.y - radius, width: radius * 2, height: radius * 2 });
        }
        return intersects(clearance, p);
      })) continue;
      selected = { label: point.label, box, pin, leader: candidateIndex >= 4 }; break;
    }
    if (!selected) throw new RangeError(`MapRoute labels are too crowded near "${point.label}"; enlarge the map, widen its geographic context or use separate route maps`);
    placements.push(selected);
  }
  return placements;
}
function shortened(ctx: MapDrawingContext, value: string, width: number): string {
  if (ctx.measureText(value).width <= width) return value;
  let shortened = value;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > width) shortened = shortened.slice(0, -1);
  return `${shortened}…`;
}

/** Pure deterministic draw into the supplied context. No timers, fetches or DOM allocation. */
export function drawMapRouteFrame(ctx: MapDrawingContext, options: ValidatedMapRouteOptions, localFrame: number): MapRouteFrame {
  const state = getMapRouteFrame(options, localFrame);
  const { width, height, bounds } = options;
  const padding = Math.max(14, Math.min(width, height) * 0.045);
  const header = Math.max(48, height * 0.14), footer = Math.max(28, height * 0.07);
  const aspect = (bounds.east - bounds.west) / (bounds.north - bounds.south);
  const plotWidth = Math.min(width - padding * 2, (height - header - footer) * aspect);
  const plotHeight = plotWidth / aspect;
  const plot = { x: (width - plotWidth) / 2, y: header + (height - header - footer - plotHeight) / 2, width: plotWidth, height: plotHeight };
  const project = (longitude: number, latitude: number) => {
    const p = projectMapPoint(longitude, latitude, plot.width, plot.height, bounds);
    return { x: plot.x + plot.width / 2 + (p.x - plot.width / 2) * state.cameraZoom, y: plot.y + plot.height / 2 + (p.y - plot.height / 2) * state.cameraZoom };
  };
  const fontSize = Math.max(12, Math.min(22, width / 42)), creditFontSize = Math.max(10, Math.min(22, width / 65));
  let labels: LabelPlacement[];
  // Fail before painting, preserving complete place names and source provenance.
  ctx.save();
  try {
    ctx.font = `bold ${fontSize}px Arial`;
    labels = mapLabels(ctx, options, plot, project, fontSize);
    ctx.font = `${creditFontSize}px Arial`;
    if (ctx.measureText(options.credits).width > width - padding * 2) throw new RangeError("MapRoute source credits do not fit in full; use a wider map or a shorter authored credit");
  } finally { ctx.restore(); }
  ctx.save(); ctx.fillStyle = "#E9E1CE"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#132E3C"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.max(17, Math.min(36, width / 27))}px Arial`;
  ctx.fillText(shortened(ctx, options.title, width - padding * 2), padding, header * 0.48);
  ctx.save(); ctx.beginPath(); ctx.rect(plot.x, plot.y, plot.width, plot.height); ctx.clip();
  ctx.fillStyle = "#CBD6D3"; ctx.fillRect(plot.x, plot.y, plot.width, plot.height);
  ctx.strokeStyle = "#A9BAB7"; ctx.lineWidth = 1; ctx.beginPath();
  for (let longitude = -180; longitude <= 180; longitude += 30) {
    const a = project(longitude, bounds.south), b = project(longitude, bounds.north); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  for (let latitude = -90; latitude <= 90; latitude += 30) {
    const a = project(bounds.west, latitude), b = project(bounds.east, latitude); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke(); ctx.fillStyle = "#D9D0B9"; ctx.strokeStyle = "#687C7C"; ctx.lineWidth = 1;
  for (const polygon of options.land) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([longitude, latitude], index) => { const p = project(longitude, latitude); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
    }
    ctx.fill("evenodd"); ctx.stroke();
  }
  ctx.strokeStyle = "#D35B2E"; ctx.lineWidth = Math.max(3, width / 230); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath();
  state.revealed.forEach((point, index) => { const p = project(point.longitude, point.latitude); if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
  ctx.strokeStyle = "#687C7C"; ctx.lineWidth = 1;
  for (const placement of labels) if (placement.leader) {
    const { box, pin } = placement;
    ctx.beginPath(); ctx.moveTo(pin.x, pin.y); ctx.lineTo(Math.max(box.x, Math.min(box.x + box.width, pin.x)), Math.max(box.y, Math.min(box.y + box.height, pin.y))); ctx.stroke();
  }
  ctx.font = `bold ${fontSize}px Arial`; ctx.textBaseline = "middle";
  for (const point of options.points) {
    const p = project(point.longitude, point.latitude);
    if (p.x < plot.x || p.x > plot.x + plot.width || p.y < plot.y || p.y > plot.y + plot.height) continue;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(4, width / 150), 0, Math.PI * 2); ctx.fillStyle = "#132E3C"; ctx.fill();
    ctx.strokeStyle = "#F4EEDB"; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const { label, box } of labels) { ctx.fillStyle = "#F4EEDB"; ctx.fillRect(box.x, box.y, box.width, box.height); ctx.fillStyle = "#132E3C"; ctx.textAlign = "left"; ctx.fillText(label, box.x + 8, box.y + box.height / 2); }
  const tip = state.revealed[state.revealed.length - 1], marker = project(tip.longitude, tip.latitude);
  ctx.beginPath(); ctx.arc(marker.x, marker.y, Math.max(4, width / 170), 0, Math.PI * 2); ctx.fillStyle = "#D35B2E"; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "#687C7C"; ctx.lineWidth = 1; ctx.beginPath(); ctx.rect(plot.x, plot.y, plot.width, plot.height); ctx.stroke();
  ctx.font = `${creditFontSize}px Arial`; ctx.fillStyle = "#39505A"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(options.credits, padding, height - footer * 0.45);
  ctx.restore(); return state;
}

/**
 * Scene-local component clock: localFrame = floor(sceneTime*30)-startFrame.
 * Put directly inside the scene, or match start to the scene-local placement.
 * Nested/trimmed parent clock inference is deliberately not guessed.
 */
export function MapRoute(props: MapRouteOptions): JSX.Element {
  const options = createMemo(() => validateMapRouteOptions(props));
  return Surface({
    get x() { return options().x; }, get y() { return options().y; },
    get width() { return options().width; }, get height() { return options().height; },
    get start(): Time { return `${options().startFrame}f`; },
    get end(): Time { return `${options().startFrame + options().durationFrames}f`; },
    ref(canvas) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true }) as MapDrawingContext | null;
      if (!ctx || typeof ctx.fillText !== "function") throw new Error("MapRoute requires a Canvas2D surface");
      const ticker = useTicker();
      // Camera motion can continue after route reveal, so clamp to total duration.
      const effectiveFrame = createMemo(() => {
        const current = options();
        return Math.max(0, Math.min(current.durationFrames - 1, Math.floor(ticker.time() * TIME_FPS + 0.0001) - current.startFrame));
      });
      createEffect(() => {
        const current = options();
        if (canvas.width !== current.width) canvas.width = current.width;
        if (canvas.height !== current.height) canvas.height = current.height;
        drawMapRouteFrame(ctx, current, effectiveFrame());
      });
    },
  });
}
