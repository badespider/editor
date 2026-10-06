import { buildChannelTemplate } from '../../editing-playbook/src/channel-template.ts';
import type { RemotionPayload } from './payload.ts';
import type { SceneLayer } from '../../editing-playbook/src/scene-motion.ts';

/** Generated-only demo branch. Deliberately no audio asset or pretend transcript. */
export function buildChannelDemoPayload(request: unknown): RemotionPayload {
  const built = buildChannelTemplate(request);
  if (built.request.mode !== 'layout-demo') throw Error('The silent demo renderer accepts layout-demo only; use the scene workflow for footage');
  if (built.recipe.templates.some(t => t.layers.some(l => l.kind === 'video' || l.kind === 'image')))
    throw Error('A layout demo cannot load source media');
  const resolveKeys = (keys: SceneLayer['keys']) => keys.map(k => {
    if (typeof k.at !== 'number') throw Error('Generated layout demo cannot resolve speech cues');
    return { ...k, at: k.at };
  });
  return { width: built.width, height: built.height, fps: 30, duration: built.duration,
    recipe: { caption: built.recipe.caption }, input: { width: built.width, height: built.height,
      audio: { start: 0 }, transcript: { words: [] }, captions: [] },
    shots: built.sections.map(s => ({ ...s, criteria: built.recipe.style.criteria.map(c => c.id),
      framing: { rationale: 'Generated, clearly labeled layout demonstration only.', evidence: ['user-channel-brief'], protectedRegions: [] },
      bindings: [], template: (() => {
        const t = built.recipe.templates.find(t => t.id === s.templateId)!;
        return { ...t, layers: t.layers.map(l => ({ ...l, keys: resolveKeys(l.keys) })),
          ...(t.groups ? { groups: t.groups.map(g => ({ ...g, keys: resolveKeys(g.keys) })) } : {}) };
      })(), paths: {} })),
    remotion: { captionEntrance: 'recipe' } };
}
