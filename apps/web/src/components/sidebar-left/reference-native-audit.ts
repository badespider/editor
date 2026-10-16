/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { entityExists, getRelationTargets, hasComponent } from "bitecs";
import { getEntityTree, GeometryType, PaintType } from "@/components/engine";
import { ChildOf } from "@/components/engine/components";
import type { EngineWorld } from "@/components/engine";
import type { ReconstructionPlan } from "@diffusionstudio/editing-playbook/reference-reconstruction";

export type ReconstructionWorldAudit = {
  sceneId: number; layers: number; geometryNodes: number; textNodes: number;
  videoPaints: number; imagePaints: number; audioNodes: number;
};

/** Check the mounted native structure before any export can be called a reconstruction. */
export function auditReconstructionWorld(world: EngineWorld, sceneId: number, plan: ReconstructionPlan, hasAudio: boolean): ReconstructionWorldAudit {
  const c = world.components;
  const require = (value: unknown, message: string): void => { if (!value) throw new Error(`Native reconstruction audit: ${message}`); };
  require(Number.isInteger(sceneId) && entityExists(world, sceneId) && !hasComponent(world, sceneId, c.Deleted) && hasComponent(world, sceneId, c.Scene), "the mounted scene is missing or deleted");
  const tree = getEntityTree(world, sceneId);
  const ids = new Set(tree), byKey = new Map<string, number[]>(), parent = new Map<number, number>();
  const paints = new Map<number, { all: number; video: number; image: number }>();
  const strokes = new Map<number, number[]>();
  let geometryNodes = 0, textNodes = 0, audioNodes = 0;
  for (const eid of tree) {
    require(!hasComponent(world, eid, c.Deleted), "the scene contains a deleted node");
    if (eid !== sceneId) {
      const parents = getRelationTargets(world, eid, ChildOf);
      require(parents.length === 1 && ids.has(parents[0]), `node ${eid} has an invalid scene parent`);
      parent.set(eid, parents[0]);
    }
    if (hasComponent(world, eid, c.Key)) {
      const key = c.Key[eid];
      byKey.set(key, [...(byKey.get(key) ?? []), eid]);
    }
    if (hasComponent(world, eid, c.Geometry)) { geometryNodes++; if (c.Geometry[eid] === GeometryType.TEXT) textNodes++; }
    if (hasComponent(world, eid, c.Audio)) audioNodes++;
    const isPaint = hasComponent(world, eid, c.Paint);
    if (hasComponent(world, eid, c.Stroke)) { const above = parent.get(eid)!; strokes.set(above, [...(strokes.get(above) ?? []), eid]); }
    paints.set(eid, { all: Number(isPaint), video: Number(isPaint && c.Paint[eid] === PaintType.VIDEO), image: Number(isPaint && c.Paint[eid] === PaintType.IMAGE) });
  }
  // getEntityTree is parent-first. Accumulate all descendant paints once,
  // including an unexpected nested paint that a direct-child check would miss.
  for (let i = tree.length - 1; i > 0; i--) {
    const own = paints.get(tree[i])!, above = paints.get(parent.get(tree[i])!)!;
    above.all += own.all; above.video += own.video; above.image += own.image;
  }
  const unique = (key: string, parentKey: string | null = null): number => {
    const found = byKey.get(key);
    require(found?.length === 1, `expected exactly one node for key ${JSON.stringify(key)}`);
    const eid = found![0];
    const above = parentKey === null ? sceneId : byKey.get(parentKey)?.[0];
    require(parent.get(eid) === above, `layer ${JSON.stringify(key)} lost its declared native parent`);
    return eid;
  };
  const rect = (eid: number): boolean => hasComponent(world, eid, c.Geometry) && c.Geometry[eid] === GeometryType.RECT && !hasComponent(world, eid, c.Audio) && !hasComponent(world, eid, c.Group) && !hasComponent(world, eid, c.Scene);
  const expected = new Set<number>([sceneId]);
  const background = unique("_reconstruction-background"); expected.add(background);
  require(rect(background) && paints.get(background)!.video === 0 && paints.get(background)!.image === 0, "background must be native rectangle geometry without media paints");
  const authored = new Set<string>();
  for (const layer of plan.layers) {
    require(!authored.has(layer.id), `duplicate authored key ${JSON.stringify(layer.id)}`); authored.add(layer.id);
    const eid = unique(layer.id, layer.parentId ?? null), paint = paints.get(eid)!; expected.add(eid);
    const axes = hasComponent(world, eid, c.Scale) ? { x: c.Scale.x[eid] ?? 1, y: c.Scale.y[eid] ?? 1 } : { x: 1, y: 1 };
    require(axes.x === (layer.scaleX ?? 1) && axes.y === (layer.scaleY ?? 1), `layer ${layer.id} lost its independent scale axes`);
    require(hasComponent(world, eid, c.ClipToBox) === (layer.clipToBox ?? false), `layer ${layer.id} lost its box clipping setting`);
    const pivot = hasComponent(world, eid, c.Anchor) ? { x: c.Anchor.x[eid] ?? .5, y: c.Anchor.y[eid] ?? .5 } : { x: .5, y: .5 };
    require(pivot.x === (layer.anchorX ?? .5) && pivot.y === (layer.anchorY ?? .5), `layer ${layer.id} lost its transform pivot`);
    if (layer.type === "text") {
      require(hasComponent(world, eid, c.Geometry) && c.Geometry[eid] === GeometryType.TEXT && !hasComponent(world, eid, c.Audio), `text layer ${layer.id} has the wrong native kind`);
      require(hasComponent(world, eid, c.Chars) && c.Chars[eid] === layer.text, `text layer ${layer.id} does not retain its literal wording`);
      require(paint.video === 0 && paint.image === 0, `text layer ${layer.id} contains a media paint`);
    } else if (layer.type === 'group') {
      require(hasComponent(world, eid, c.Group) && hasComponent(world, eid, c.Geometry) && c.Geometry[eid] === GeometryType.RECT && hasComponent(world, eid, c.Size), `group ${layer.id} lost its fixed native logical box`);
      require(!tree.some(node => parent.get(node) === eid && hasComponent(world, node, c.Paint)), `group ${layer.id} unexpectedly paints over its children`);
    } else if (layer.type === 'path') {
      require(hasComponent(world, eid, c.Geometry) && c.Geometry[eid] === GeometryType.PATH && hasComponent(world, eid, c.VectorPath) && !hasComponent(world, eid, c.Group), `vector path ${layer.id} has the wrong native kind`);
      const canonical = (commands: unknown) => JSON.stringify(Array.isArray(commands) ? commands.map(command => Object.entries(command).sort(([a], [b]) => a.localeCompare(b))) : commands);
      require(canonical(c.VectorPath.commands[eid]) === canonical(layer.pathCommands), `vector path ${layer.id} lost its editable commands`);
      require((c.VectorPath.fillEnabled[eid] ?? true) === (layer.fillEnabled ?? true), `vector path ${layer.id} lost its fill setting`);
      require((c.StrokeStyle.width[eid] ?? 0) === (layer.strokeWidth ?? 0), `vector path ${layer.id} lost its stroke width`);
      require((c.StrokeStyle.cap[eid] ?? 0) === ['butt', 'round', 'square'].indexOf(layer.strokeCap ?? 'butt') && (c.StrokeStyle.join[eid] ?? 0) === ['miter', 'round', 'bevel'].indexOf(layer.strokeJoin ?? 'miter'), `vector path ${layer.id} lost its stroke cap or join`);
      if ((layer.strokeWidth ?? 0) > 0) {
        const painted = strokes.get(eid) ?? [];
        require(painted.length === 1 && hasComponent(world, painted[0], c.Color) && c.Color[painted[0]] === parseInt((layer.strokeColor ?? '#000000').slice(1), 16), `vector path ${layer.id} lost its native stroke paint`);
      }
      require(paint.video === 0 && paint.image === 0, `vector path ${layer.id} contains media instead of editable geometry`);
    } else {
      require(rect(eid), `layer ${layer.id} has the wrong native kind`);
      const wantedVideo = Number(layer.type === "video"), wantedImage = Number(layer.type === "image");
      require(paint.video === wantedVideo && paint.image === wantedImage, `layer ${layer.id} has unexpected media paints`);
    }
  }
  if (hasAudio) {
    const audio = unique("_reconstruction-audio"); expected.add(audio);
    require(hasComponent(world, audio, c.Audio), "original audio is not an Audio node");
    require(paints.get(audio)!.all === 0, "original Audio contains picture or other paint descendants");
    const source = hasComponent(world, audio, c.AssetId) ? world.assets.get(c.AssetId[audio]) : undefined;
    require(source?.type === "AUDIO" || source?.type === "VIDEO", "original Audio has no audio-capable source binding");
  } else require(!byKey.has("_reconstruction-audio"), "unexpected original audio node");
  require(audioNodes === Number(hasAudio), "unexpected Audio node count");
  require(geometryNodes === expected.size, "unexpected or missing native geometry layers");
  for (const eid of tree) {
    if (hasComponent(world, eid, c.Geometry)) require(expected.has(eid), `unplanned geometry node ${eid}`);
    if (!hasComponent(world, eid, c.Paint)) continue;
    const type = c.Paint[eid];
    require(![PaintType.HTML, PaintType.SURFACE, PaintType.SHADER, PaintType.SEQUENCE].includes(type), 'unexpected procedural or HTML paint in bounded native reconstruction');
    if (type !== PaintType.VIDEO && type !== PaintType.IMAGE) continue;
    const source = hasComponent(world, eid, c.AssetId) ? world.assets.get(c.AssetId[eid]) : undefined;
    require(source?.type === (type === PaintType.VIDEO ? "VIDEO" : "IMAGE"), "media paint asset has the wrong native kind");
  }
  const totals = paints.get(sceneId)!;
  require(totals.video === plan.layers.filter(layer => layer.type === "video").length, "VIDEO paint count differs from declared video layers");
  require(totals.image === plan.layers.filter(layer => layer.type === "image").length, "IMAGE paint count differs from declared image layers");
  return { sceneId, layers: plan.layers.length, geometryNodes, textNodes, videoPaints: totals.video, imagePaints: totals.image, audioNodes };
}
