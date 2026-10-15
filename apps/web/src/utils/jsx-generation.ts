/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getAssetSpec, isAssetRef } from "@diffusionstudio/jsx";
import { loadAsset, uploadAsset } from "@/components/engine";
import {
  PROMPT_INPUT_AUDIO_MODEL_OPTIONS,
  PROMPT_INPUT_IMAGE_MODEL_OPTIONS,
  PROMPT_INPUT_VIDEO_MODEL_OPTIONS,
  PROMPT_INPUT_VOICE_OPTIONS,
} from "@/components/genai/config";
import { ensureGenerationFolder } from "@/utils/genai";
import { assert } from "@/utils";
import { ElectronFileHandle } from "@/lib/electron-file-handle";
import { trpc } from "@/lib/trpc";
import { inlineImageFile } from "./inline-image";

import type { AspectRatio, AssetInput, AssetRef, AssetSpecInput } from "@diffusionstudio/jsx";
import type { EngineWorld } from "@/components/engine";
import type { Asset } from "@/components/engine/db";

const URL_RE = /^https?:\/\//;

/**
 * Resolves a plain `src` — a remote URL, a global filesystem path, or an existing asset id.
 */
export async function resolveAsset(world: EngineWorld, src: string): Promise<Asset> {
  const value = src.trim();

  if(value.startsWith("data:"))return await loadAsset(world,await inlineImageFile(value));

  if (URL_RE.test(value)) {
    return await loadAsset(world, value);
  }

  // A global filesystem path (absolute or containing a separator).
  if (value.startsWith("/") || value.includes("/") || value.includes("\\")) {
    return await loadAsset(world, new ElectronFileHandle(value));
  }

  // Otherwise treat it as an existing asset id.
  const existing = world.assets.get(value);
  assert(existing, `Could not resolve media src: ${src}`);

  return existing;
}

// The UI offers a fixed set of voices on a fixed model (see prompt-input.tsx).
const VOICE_MODEL = "elevenlabs-v3";

/**
 * A spec with defaults applied and every `AssetInput` reduced to an asset id.
 * Field order is fixed, so `JSON.stringify` of it is a stable `generationKey`.
 */
type ResolvedSpec =
  | { type: "image"; model: string; prompt: string; aspectRatio: AspectRatio; seed?: number; refIds: string[] }
  | { type: "video"; model: string; prompt: string; aspectRatio: AspectRatio; duration: number; audio: boolean; seed?: number; startFrameId?: string; endFrameId?: string }
  | { type: "voice"; model: string; prompt: string; voice: string }
  | { type: "audio"; model: string; prompt: string; duration?: number };

/**
 * In-flight generations per world, keyed by `generationKey`, so identical
 * concurrent declarations collapse to one request. Entries are removed once
 * settled; finished generations are found via `asset.generationKey`.
 */
const inflight = new WeakMap<EngineWorld, Map<string, Promise<Asset>>>();

/**
 * Declarations already resolved within one `generateAssets` run, keyed by ref
 * identity — a ref consumed by several elements resolves (and validates) once.
 */
export type GenerationMemo = Map<AssetRef, Promise<Asset>>;

/** Resolves a `generate.*` declaration to a finished, imported asset. */
export function resolveGeneratedAsset(world: EngineWorld, ref: AssetRef, memo: GenerationMemo): Promise<Asset> {
  let promise = memo.get(ref);
  if (!promise) {
    promise = generateFromRef(world, ref, memo);
    memo.set(ref, promise);
  }
  return promise;
}

function resolveInput(world: EngineWorld, input: AssetInput, memo: GenerationMemo): Promise<Asset> {
  return isAssetRef(input) ? resolveGeneratedAsset(world, input, memo) : resolveAsset(world, input);
}

async function generateFromRef(world: EngineWorld, ref: AssetRef, memo: GenerationMemo): Promise<Asset> {
  const resolved = await resolveSpec(world, getAssetSpec(ref), memo);
  const generationKey = JSON.stringify(resolved);

  const cached = Array.from(world.assets.values()).find((asset) => asset.generationKey === generationKey);
  if (cached) return cached;

  let pending = inflight.get(world);
  if (!pending) {
    pending = new Map();
    inflight.set(world, pending);
  }

  const running = pending.get(generationKey);
  if (running) return await running;

  const promise = runGeneration(world, resolved, generationKey);
  pending.set(generationKey, promise);
  try {
    return await promise;
  } finally {
    pending.delete(generationKey);
  }
}

async function resolveSpec(world: EngineWorld, spec: AssetSpecInput, memo: GenerationMemo): Promise<ResolvedSpec> {
  switch (spec.type) {
    case "image": {
      const refs = await Promise.all((spec.refs ?? []).map((ref) => resolveInput(world, ref, memo)));
      return {
        type: "image",
        model: spec.model ?? PROMPT_INPUT_IMAGE_MODEL_OPTIONS[0].id,
        prompt: spec.prompt,
        aspectRatio: spec.aspectRatio ?? "16:9",
        seed: spec.seed,
        refIds: refs.map((asset) => asset.id),
      };
    }
    case "video": {
      const [startFrame, endFrame] = await Promise.all([
        spec.startFrame !== undefined ? resolveInput(world, spec.startFrame, memo) : undefined,
        spec.endFrame !== undefined ? resolveInput(world, spec.endFrame, memo) : undefined,
      ]);
      const resolved = {
        type: "video",
        model: spec.model ?? PROMPT_INPUT_VIDEO_MODEL_OPTIONS[0].id,
        prompt: spec.prompt,
        aspectRatio: spec.aspectRatio ?? "16:9",
        duration: spec.duration ?? 5,
        audio: spec.audio ?? false,
        seed: spec.seed,
        startFrameId: startFrame?.id,
        endFrameId: endFrame?.id,
      } satisfies ResolvedSpec;
      checkVideoConstraints(resolved);
      return resolved;
    }
    case "voice": {
      return {
        type: "voice",
        model: VOICE_MODEL,
        prompt: spec.prompt,
        voice: spec.voice ?? PROMPT_INPUT_VOICE_OPTIONS[0].value,
      };
    }
    case "audio": {
      return {
        type: "audio",
        model: spec.model ?? PROMPT_INPUT_AUDIO_MODEL_OPTIONS[0].id,
        prompt: spec.prompt,
        duration: spec.duration,
      };
    }
  }
}

/**
 *  Per-model constraints (`dapi models video`); unknown models are left to the server.
 */
function checkVideoConstraints(spec: Extract<ResolvedSpec, { type: "video" }>): void {
  const model = PROMPT_INPUT_VIDEO_MODEL_OPTIONS.find((option) => option.id === spec.model);
  if (!model) return;

  assert(model.aspectRatios.includes(spec.aspectRatio), `${spec.model} does not support aspect ratio ${spec.aspectRatio}`);
  assert(model.durations.includes(`${spec.duration}s`), `${spec.model} does not support a duration of ${spec.duration}s`);
  assert(!spec.audio || model.features.includes("audio"), `${spec.model} does not support audio generation`);
  assert(spec.endFrameId === undefined || model.features.includes("end-frame"), `${spec.model} does not support an end frame`);
}

async function runGeneration(world: EngineWorld, spec: ResolvedSpec, generationKey: string): Promise<Asset> {
  const { name, results, generationId } = await requestGeneration(world, spec);
  assert(results.length > 0, "No results returned from the model");

  const folderId = await ensureGenerationFolder(world, name, 1);
  return await loadAsset(world, results[0].url, { name, generationId, generationKey, folderId });
}

function requestGeneration(world: EngineWorld, spec: ResolvedSpec) {
  switch (spec.type) {
    case "image": {
      return (async () => {
        const images = spec.refIds.length > 0
          ? await Promise.all(spec.refIds.map((id) => uploadInput(world, id)))
          : undefined;

        return await trpc.generateImage.mutate({
          model: spec.model,
          prompt: spec.prompt,
          aspectRatio: spec.aspectRatio,
          count: 1,
          seed: spec.seed,
          images,
        });
      })();
    }
    case "video": {
      return (async () => {
        const [startFrame, endFrame] = await Promise.all([
          spec.startFrameId ? uploadInput(world, spec.startFrameId) : undefined,
          spec.endFrameId ? uploadInput(world, spec.endFrameId) : undefined,
        ]);

        return await trpc.generateVideo.mutate({
          model: spec.model,
          prompt: spec.prompt,
          aspectRatio: spec.aspectRatio,
          duration: spec.duration,
          generateAudio: spec.audio,
          seed: spec.seed,
          startFrame,
          endFrame,
        });
      })();
    }
    case "voice": {
      return trpc.textToSpeech.mutate({
        model: spec.model,
        prompt: spec.prompt,
        voice: spec.voice,
      });
    }
    case "audio": {
      return trpc.generateSound.mutate({
        model: spec.model,
        prompt: spec.prompt,
        duration: spec.duration,
      });
    }
  }
}

async function uploadInput(world: EngineWorld, assetId: string) {
  const uploaded = await uploadAsset(world, assetId);
  assert(uploaded, `Failed to upload referenced asset ${assetId}`);
  return uploaded;
}
