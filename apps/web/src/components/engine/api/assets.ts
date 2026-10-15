/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";
import { assert } from "@/utils";
import { ALL_FORMATS, InputTrack, UrlSource } from 'mediabunny';
import { BlobSource } from 'mediabunny';
import { Input } from 'mediabunny';
import { nanoid } from "nanoid";
import Sqids from "sqids";
import { saveDirectoryHandle, retrieveDirectoryHandle, getProjectDB } from "../db";
import { GeometryType, PaintType } from "../components";
import { secondsToFrames } from "../utils/time";
import { toast } from "somoto";
import { createEntity } from "./entities";
import { appendChild } from "./hierarchy";
import { addComponent, setComponent } from "./events";
import { resizeEntity } from "./resize";
import { mimeTypeToExtension, showFileDialog } from "@/utils";
import { trpc } from "@/lib/trpc";
import {
  ElectronFileHandle,
  isSerializedElectronFileHandle,
  rehydrateElectronFileHandle,
} from "@/lib/electron-file-handle";

import type { EngineWorld } from "./world";
import type { Asset } from "../db";
import type { Transcript } from "@diffusionstudio/api-contract";

const URL_REGEX = /\b(?:https?|ftp|blob):\/\/[^\s]+/;
const DEFAULT_SEQUENCE_FPS = 30;
const sqids = new Sqids({ minLength: 4 });

type MediaInput =
  | string
  | File
  | FileSystemFileHandle
  | FileSystemDirectoryHandle
  | ElectronFileHandle;

type AssetState = {
  projectId: string;
  counter: number;
  directoryHandle: Promise<FileSystemDirectoryHandle>;
  db: ReturnType<typeof getProjectDB>;
  version: Accessor<number>;
  setVersion: Setter<number>;
  selected: Accessor<Map<string, Asset>>;
  setSelected: Setter<Map<string, Asset>>;
};

const assetStates = new WeakMap<object, AssetState>();
const inflightLoads = new WeakMap<EngineWorld, Map<string, Promise<Asset>>>();

/**
 * Initializes the asset subsystem for a world. Call once, right after the
 * world is created. `world.assets` must already be an (empty) Map.
 */
export function initAssets(world: EngineWorld, projectId: string): void {
  const [version, setVersion] = createSignal(0);
  const [selected, setSelected] = createSignal<Map<string, Asset>>(new Map());

  assetStates.set(world, {
    projectId,
    counter: 0,
    directoryHandle: retrieveDirectoryHandle(),
    db: getProjectDB(projectId),
    version,
    setVersion,
    selected,
    setSelected,
  });
}

function assetState(world: EngineWorld): AssetState {
  const state = assetStates.get(world);
  assert(state, 'Assets not initialized for this world; call initAssets() first');
  return state;
}

/**
 * Reactive version counter. Read inside a tracking scope (memo/effect) to
 * re-run whenever the asset set changes — e.g. after re-granting filesystem
 * permission so previously-failed getFile() calls retry.
 */
export function assetsVersion(world: EngineWorld): number {
  return assetState(world).version();
}

/** Bumps the version signal so reactive consumers (thumbnails, previews) re-run. */
export function invalidateAssets(world: EngineWorld): void {
  assetState(world).setVersion((v) => v + 1);
}

/**
 * Allocates the next id in the project's shared asset/folder id space, so an
 * id never refers to both an asset and a folder.
 */
export function allocateId(world: EngineWorld): string {
  const state = assetState(world);
  state.counter += 1;
  return sqids.encode([state.counter]);
}

/**
 * Raises the id counter past every sqid in `ids`. Non-sqid ids (e.g. legacy
 * "fld-…" folder ids) are ignored. Restores may run in parallel, so this only
 * ever raises the counter.
 */
export function raiseIdCounter(world: EngineWorld, ids: Iterable<string>): void {
  const state = assetState(world);
  for (const id of ids) {
    const decoded = sqids.decode(id);
    const num = decoded[0];
    if (decoded.length === 1 && Number.isFinite(num) && num > state.counter) {
      state.counter = num;
    }
  }
}

type LoadAssetOptions = {
  name?: string;
  generationId?: string | null;
  generationKey?: string | null;
  folderId?: string | null;
};

/**
 * Loads an asset from a handle, URL, File, or DataTransferItem. Detects the
 * MIME type, writes to OPFS when needed, persists the metadata, and returns the
 * created (or pre-existing) Asset.
 */
export async function loadAsset(
  world: EngineWorld,
  handle: MediaInput | DataTransferItem,
  options?: LoadAssetOptions,
): Promise<Asset> {
  const state = assetState(world);

  // If the handle is a data transfer item, get the file from it
  if (handle instanceof DataTransferItem) {
    const file = await getFileFromDataTransferItem(handle);
    assert(file, 'Failed to get file from data transfer item');
    handle = file;
  }

  // Step 1: Generate a hash for the asset
  let hash = '';
  if (typeof handle === 'string') {
    assert(URL_REGEX.test(handle), 'Invalid URL');
    hash = handle;
  } else if (handle instanceof File) {
    hash = `${handle.name}-${handle.size}-${handle.lastModified}`;
  } else if (handle instanceof FileSystemFileHandle) {
    const file = await handle.getFile();
    hash = `${file.name}-${file.size}-${file.lastModified}`;
  } else if (handle instanceof ElectronFileHandle) {
    const file = await handle.getFile();
    hash = `${file.name}-${file.size}-${file.lastModified}`;
  } else if (handle instanceof FileSystemDirectoryHandle) {
    let size = 0;
    let count = 0;
    let modified = 0;
    for await (const [, entry] of handle.entries()) {
      if (entry.kind !== 'file') continue;
      const file = await entry.getFile();
      size += file.size;
      modified += file.lastModified;
      count++;
    }
    hash = `seq:${handle.name}-${size}-${modified}-${count}`;
  } else {
    assert(false, 'Could not generate hash for handle');
  }

  const existingAsset = Array.from(world.assets.values()).find(asset => asset.hash === hash);
  if (existingAsset) {
    return existingAsset;
  };

  // Dedup against a concurrent, still-in-flight load of the same source.
  let pending = inflightLoads.get(world);
  if (!pending) {
    pending = new Map();
    inflightLoads.set(world, pending);
  }

  const running = pending.get(hash);
  if (running) return await running;

  const promise = createAsset(world, handle, options, hash, state);
  pending.set(hash, promise);
  try {
    return await promise;
  } finally {
    pending.delete(hash);
  }
}

/**
 * Creates and persists a brand-new asset for a source whose hash was not found
 * among the existing or in-flight assets. Split out of `loadAsset` so a single
 * promise per hash can be memoized around it (see `inflightLoads`).
 */
async function createAsset(
  world: EngineWorld,
  handle: MediaInput,
  options: LoadAssetOptions | undefined,
  hash: string,
  state: AssetState,
): Promise<Asset> {
  // Step 2: Generate a unique ID for the asset
  const id = allocateId(world);
  const createdAt = new Date().toISOString();
  const mimeType = await detectMimeType(handle);
  assert(mimeType, 'Could not detect MIME type');

  let name = '';
  if (options?.name) {
    name = options.name;
  } else if (typeof handle === 'string') {
    name = (handle.split('/').pop() ?? `Unnamed_${nanoid(8)}`).slice(0, 24);
  } else if (handle instanceof File) {
    name = handle.name;
  } else if (handle instanceof FileSystemFileHandle) {
    const file = await handle.getFile();
    name = file.name;
  } else if (handle instanceof ElectronFileHandle) {
    name = handle.name;
  } else if (handle instanceof FileSystemDirectoryHandle) {
    name = handle.name;
  }

  // Step 3: Write the asset to the file system if necessary
  let writable: FileSystemWritableFileStream | null = null;
  let fileHandle: FileSystemFileHandle | ElectronFileHandle | null = null;

  try {
    const uniqueName = id + mimeTypeToExtension(mimeType);
    const directory = await state.directoryHandle;

    // Get or create the backups folder
    const assetsFolder = await directory.getDirectoryHandle('assets', { create: true });

    if (handle instanceof Blob) {
      fileHandle = await assetsFolder.getFileHandle(uniqueName, { create: true });
      writable = await fileHandle.createWritable();

      // write blob to file handle
      await writable.write(handle);
    } else if (typeof handle === 'string') {
      fileHandle = await assetsFolder.getFileHandle(uniqueName, { create: true });
      writable = await fileHandle.createWritable();

      // stream file to file handle
      const response = await fetch(handle);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to stream file');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } else if (handle instanceof FileSystemFileHandle) {
      fileHandle = handle;
    } else if (handle instanceof ElectronFileHandle) {
      fileHandle = handle; // Electron files live on the user's disk; don't copy into OPFS.
    } else if (handle instanceof FileSystemDirectoryHandle) {
      const entry = await handle.entries().next();
      const firstFile = entry.value[1];
      assert(firstFile instanceof FileSystemFileHandle, 'First entry is not a file handle');
      fileHandle = entry.value[1];
    } else {
      assert(false, 'Invalid handle');
    }
  } catch (error) {
    console.error('Failed to write asset to file system:', error);
  } finally {
    await writable?.close();
  }

  assert(fileHandle, 'File handle not found');

  const file = await fileHandle.getFile();

  const baseAsset = {
    id,
    hash,
    createdAt,
    lastModified: file.lastModified,
    name,
    mimeType,
    size: file.size,
    handle: fileHandle,
    generationId: options?.generationId ?? null,
    generationKey: options?.generationKey ?? null,
    folderId: options?.folderId ?? null,
  }

  if (handle instanceof FileSystemDirectoryHandle) {
    const entry = await handle.entries().next();
    const firstFile = entry.value[1];
    assert(firstFile instanceof FileSystemFileHandle, 'First entry is not a file handle');
    const { width, height } = await getRasterDimensions(
      await firstFile.getFile()
    );

    let count = 0;
    for await (const [, entry] of handle.entries()) {
      if (entry.kind !== 'file') continue;
      count++;
    }
    const duration = count / DEFAULT_SEQUENCE_FPS;

    return saveAsset(world, {
      ...baseAsset,
      type: 'SEQUENCE',
      width,
      height,
      frameRate: DEFAULT_SEQUENCE_FPS,
      duration,
      directoryHandle: handle,
    });
  }

  const metadata = await probeMediaMetadata(file, mimeType);
  return saveAsset(world, { ...baseAsset, ...metadata });
}

/**
 * Derives the type-specific asset properties (dimensions, duration, tracks)
 * of a media file.
 */
async function probeMediaMetadata(file: Blob, mimeType: string) {
  if (mimeType.match(/^image\//)) {
    const { width, height } = mimeType === 'image/svg+xml'
      ? await getSvgDimensions(file)
      : await getRasterDimensions(file);

    return { type: 'IMAGE', width, height } as const;
  } else if (mimeType === 'application/json' || mimeType === 'application/x-subrip' || mimeType === 'text/vtt') {
    return { type: 'TRANSCRIPT' } as const;
  } else if (mimeType.match(/^(audio\/|video\/)/)) {
    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(file),
    });

    const audioTrack = await input.getPrimaryAudioTrack();
    const channels = audioTrack?.numberOfChannels;
    const sampleRate = audioTrack?.sampleRate;

    if (mimeType.startsWith('audio/')) {
      assert(sampleRate, 'Sample rate not found');
      assert(channels, 'Channels not found');

      const duration = await trackContentDuration(audioTrack);

      return { type: 'AUDIO', duration, sampleRate, channels } as const;
    }

    const videoTrack = await input.getPrimaryVideoTrack();
    assert(videoTrack, 'Video track not found');
    const stats = await videoTrack.computePacketStats();
    const duration = await trackContentDuration(videoTrack);

    return {
      type: 'VIDEO',
      width: videoTrack.displayWidth,
      height: videoTrack.displayHeight,
      frameRate: stats.averagePacketRate,
      bitRate: stats.averageBitrate,
      sampleRate,
      duration,
      channels,
    } as const;
  }

  assert(false, 'Unsupported file type');
}

/**
 * Stores a compiled project module (the source a `dapi mount` executed) as a
 * content-addressed SCRIPT asset, so any world can re-run it. The hash is a
 * SHA-256 of the module text, so identical re-mounts dedup to one asset. The
 * bytes live as a `.js` file in the same OPFS `assets` folder as any media.
 */
export async function createScriptAsset(world: EngineWorld, code: string): Promise<Asset> {
  const state = assetState(world);

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  const hash = 'script:' + Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const existing = Array.from(world.assets.values()).find((asset) => asset.hash === hash);
  if (existing) return existing;

  const id = allocateId(world);
  const mimeType = 'text/javascript';
  // Asset IDs repeat across projects, while their backing directory is shared.
  const uniqueName = `${state.projectId}-${id}${mimeTypeToExtension(mimeType)}`;

  const directory = await state.directoryHandle;
  const assetsFolder = await directory.getDirectoryHandle('assets', { create: true });
  const fileHandle = await assetsFolder.getFileHandle(uniqueName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(new Blob([code], { type: mimeType }));
  await writable.close();

  const file = await fileHandle.getFile();

  return saveAsset(world, {
    id,
    hash,
    createdAt: new Date().toISOString(),
    lastModified: file.lastModified,
    name: uniqueName,
    mimeType,
    size: file.size,
    handle: fileHandle,
    generationId: null,
    generationKey: null,
    folderId: null,
    type: 'SCRIPT',
  });
}

/**
 * Describes a local file as an ephemeral Asset: full metadata, but no id
 * allocation and no persistence — the library is never touched. The path
 * doubles as the id so errors and results name the file.
 */
export async function describeFileAsset(handle: ElectronFileHandle): Promise<Asset> {
  const file = await handle.getFile();
  const mimeType = await detectMimeType(handle);
  assert(mimeType, 'Could not detect MIME type');

  return {
    id: handle.path,
    hash: `${file.name}-${file.size}-${file.lastModified}`,
    createdAt: new Date().toISOString(),
    lastModified: file.lastModified,
    name: handle.name,
    mimeType,
    size: file.size,
    handle,
    generationId: null,
    generationKey: null,
    folderId: null,
    ...(await probeMediaMetadata(file, mimeType)),
  };
}

/**
 * Reactive view over the asset set, for use *inside* Solid tracking scopes
 * (memos, effects, JSX). Each accessor reads the version signal so the scope
 * re-runs when assets are added, saved, or removed.
 *
 * Outside a reactive scope (decoders, render, async handlers, …) don't use
 * this — read `world.assets` (a plain `Map<string, Asset>`) directly, e.g.
 * `world.assets.get(id)`. These accessors exist only to establish the
 * dependency; the data is the Map.
 */
export function useAssets(world: EngineWorld) {
  const state = assetState(world);
  return {
    /** All assets, in insertion order. */
    all: (): Asset[] => {
      state.version();
      return Array.from(world.assets.values());
    },
    /** A single asset by id. */
    get: (id: string): Asset | undefined => {
      state.version();
      return world.assets.get(id);
    },
    /** The current selection set. */
    selected: (): Map<string, Asset> => state.selected(),
  };
}

/**
 * Appends one or more assets to the in-memory store without persisting.
 * New assets are ordered first; existing records win on id conflict.
 */
export function appendAssets(world: EngineWorld, ...incoming: Asset[]): void {
  const map = world.assets;
  const existing = Array.from(map.values());
  map.clear();
  for (const asset of incoming) map.set(asset.id, asset);
  for (const asset of existing) map.set(asset.id, asset);
  invalidateAssets(world);
}

/**
 * Saves an asset to the database and the in-memory store.
 */
export async function saveAsset(world: EngineWorld, asset: Asset): Promise<Asset> {
  const state = assetState(world);
  const map = world.assets;

  // Re-insert at the front to preserve the prior signal-replacement ordering.
  const existing = Array.from(map.values()).filter((a) => a.id !== asset.id);
  map.clear();
  map.set(asset.id, asset);
  existing.forEach(a => map.set(a.id, a));

  const sel = state.selected();
  if (sel.has(asset.id)) {
    const next = new Map(sel);
    next.set(asset.id, asset);
    state.setSelected(next);
  }

  const db = await state.db;
  await db.put('assets', serializeAssetForPersist(asset));

  invalidateAssets(world);

  return asset;
}

/**
 * Removes one or more assets from the in-memory store and the database.
 */
export async function removeAsset(world: EngineWorld, ...ids: string[]): Promise<void> {
  const map = world.assets;
  for (const id of ids) map.delete(id);
  invalidateAssets(world);

  const db = await assetState(world).db;
  for (const id of ids) {
    db.delete('assets', id);
  }
}

/**
 * Restores assets from IndexedDB into the in-memory store.
 * Call once during engine init.
 */
export async function restoreAssets(world: EngineWorld): Promise<void> {
  const state = assetState(world);
  const db = await state.db;
  const records = await db.getAll('assets');
  if (records.length === 0) return;

  const map = world.assets;
  map.clear();
  for (const record of records) {
    map.set(record.id, rehydrateAsset(record));
  }

  raiseIdCounter(world, records.map((record) => record.id));

  invalidateAssets(world);
}

/** The file-backing handle shared by every asset variant. */
type AssetHandle = Asset['handle'];

const assetFileCache = new WeakMap<AssetHandle, Promise<File>>();

/**
 * Returns the File backing an asset, reusing an in-flight or already-resolved
 * read for the same handle.
 */
export function getAssetFile(asset: Pick<Asset, 'handle'>): Promise<File> {
  const { handle } = asset;
  const cached = assetFileCache.get(handle);
  if (cached) return cached;

  const promise = handle.getFile();
  assetFileCache.set(handle, promise);
  promise.catch(() => {
    if (assetFileCache.get(handle) === promise) {
      assetFileCache.delete(handle);
    }
  });
  return promise;
}

/** Returns the File/Blob backing an asset, or null if the asset is missing. */
export async function getAssetBlob(world: EngineWorld, id: string): Promise<Blob | null> {
  const asset = world.assets.get(id);
  if (!asset) return null;

  return await getAssetFile(asset);
}

/**
 * Upload a single local asset to the cloud bucket. The bucket key is prefixed
 * with the project id to make it globally unique.
 */
export async function uploadAsset(world: EngineWorld, id: string) {
  const blob = await getAssetBlob(world, id);
  if (!blob) {
    console.error(`Asset ${id} not found`);
    return null;
  }
  return uploadBlob(blob, `${assetState(world).projectId}-${id}`);
}

/**
 * Upload multiple local assets in parallel, filtering out any failures.
 */
export async function uploadAssets(world: EngineWorld, ids?: string[]) {
  if (!ids || ids.length === 0) return undefined;
  const results = await Promise.all(ids.map((id) => uploadAsset(world, id)));
  return results.filter((ref) => ref !== null);
}

/** Prompts the user for a new OPFS root directory and persists the handle. */
export async function changeAssetDirectory(world: EngineWorld): Promise<void> {
  try {
    const directory = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'videos',
    });
    await saveDirectoryHandle(directory);
    assetState(world).directoryHandle = Promise.resolve(directory);
  } catch (error) {
    console.error('Failed to change directory:', error);
  }
}

/** Selects a single asset by id (replacing any prior selection). */
export function selectAsset(world: EngineWorld, id: string): void {
  const asset = world.assets.get(id);
  if (!asset) return;
  assetState(world).setSelected(new Map([[id, asset]]));
}

/** Clears the selected-asset set. */
export function clearSelectedAssets(world: EngineWorld): void {
  assetState(world).setSelected(new Map());
}

/**
 * Upload a Blob to the cloud bucket via a signed URL under the asset id.
 * Returns the FileRef the API can resolve.
 */
export async function uploadBlob(blob: Blob, id: string) {
  const contentType = blob.type || "application/octet-stream";
  const { uploadUrl, fileRef } = await trpc.getUploadUrl.mutate({ id, contentType });

  if (uploadUrl) {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });

    if (!res.ok) {
      console.error(`Failed to upload asset ${id}: ${res.status}`);
      return null;
    }
  }

  return fileRef;
}

/** GCS requires every resumable chunk except the last to be a multiple of 256 KiB. */
const RESUMABLE_CHUNK_SIZE = 8 * 1024 * 1024;

/**
 * Open a GCS resumable upload session against a signed "resumable" URL and
 * return the session URI that the bytes are streamed to.
 */
export async function startResumableSession(uploadUrl: string, mimeType: string): Promise<string> {
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "x-goog-resumable": "start", "Content-Type": mimeType },
  });
  if (!res.ok) {
    throw new Error(`Failed to start resumable upload session: ${res.status}`);
  }
  const sessionUrl = res.headers.get("Location");
  if (!sessionUrl) {
    throw new Error("Resumable upload session response is missing the Location header.");
  }
  return sessionUrl;
}

/**
 * Stream a ReadableStream into an open GCS resumable session, PUTting
 * fixed-size chunks as bytes arrive so the full payload is never buffered.
 */
export async function uploadResumableStream(
  readable: ReadableStream<Uint8Array<ArrayBuffer>>,
  sessionUrl: string,
): Promise<void> {
  const reader = readable.getReader();
  let pending: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let uploaded = 0;
  let done = false;

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) {
      done = true;
    } else if (value) {
      pending = concatBytes(pending, value);
    }

    while (pending.length >= RESUMABLE_CHUNK_SIZE) {
      await putResumableChunk(sessionUrl, pending.subarray(0, RESUMABLE_CHUNK_SIZE), uploaded, null);
      uploaded += RESUMABLE_CHUNK_SIZE;
      pending = pending.subarray(RESUMABLE_CHUNK_SIZE);
    }
  }

  await putResumableChunk(sessionUrl, pending, uploaded, uploaded + pending.length);
}

async function putResumableChunk(
  sessionUrl: string,
  chunk: Uint8Array<ArrayBuffer>,
  offset: number,
  total: number | null,
): Promise<void> {
  const last = offset + chunk.length - 1;
  const contentRange =
    total === null
      ? `bytes ${offset}-${last}/*`
      : chunk.length === 0
        ? `bytes */${total}`
        : `bytes ${offset}-${last}/${total}`;

  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Range": contentRange },
    body: chunk,
  });

  // 308 "Resume Incomplete" is expected while more chunks remain; the final
  // chunk finalizes the object and returns 200/201.
  if (total === null) {
    if (res.status !== 308) {
      throw new Error(`Unexpected status during resumable upload: ${res.status}`);
    }
  } else if (!res.ok) {
    throw new Error(`Failed to finalize resumable upload: ${res.status}`);
  }
}

function concatBytes(a: Uint8Array<ArrayBuffer>, b: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

function serializeAssetForPersist(asset: Asset): Asset {
  // IndexedDB structured-clones records. ElectronFileHandle is a custom class
  // whose methods don't survive cloning — serialize to the persisted shape.
  if (asset.handle instanceof ElectronFileHandle) {
    return { ...asset, handle: asset.handle.toJSON() } as unknown as Asset;
  }
  return asset;
}

function rehydrateAsset(asset: Asset): Asset {
  if (isSerializedElectronFileHandle(asset.handle)) {
    return { ...asset, handle: rehydrateElectronFileHandle(asset.handle) };
  }
  return asset;
}

export async function insertAssetInTimeline(world: EngineWorld, asset: Asset, mode: 'playhead' | 'start') {
  const sceneEid = world.selection.scene;
  if (sceneEid === null) {
    toast("Create a scene first to insert assets");
    return;
  }
  const c = world.components;
  const delay = mode === 'playhead' ? c.Computed.localTime[sceneEid] : 0;

  // Resolve any async asset data up front so all the entity mutations below
  // run in a single synchronous, undoable transaction.
  let transcriptTrim: { start: number; end: number } | null = null;
  if (asset.type === "TRANSCRIPT") {
    // Transcript should be trimmed to the span of recognized words
    const file = await getAssetFile(asset);
    const transcript = JSON.parse(await file.text()) as Transcript;
    const lastWord = transcript.at(-1)?.words.at(-1);
    const firstWord = transcript.at(0)?.words.at(0);
    transcriptTrim = {
      start: secondsToFrames(firstWord?.start),
      end: secondsToFrames(lastWord?.end),
    };
  }

  world.history.transaction('Insert asset', () => {
    const eid = createEntity(world);
    setComponent(world, eid, c.Name, asset.name);
    setComponent(world, eid, c.Delay, delay);

    if (asset.type === 'IMAGE' || asset.type === 'VIDEO' || asset.type === 'SEQUENCE') {
      const width = Math.round(asset.width);
      const height = Math.round(asset.height);
      resizeEntity(world, eid, { width, height });
      setComponent(world, eid, c.KeepAspectRatio, { width, height });
    }

    if (asset.type === "TRANSCRIPT") {
      setComponent(world, eid, c.Geometry, GeometryType.TEXT);
      setComponent(world, eid, c.Caption, {});
      if (transcriptTrim) setComponent(world, eid, c.Trim, transcriptTrim);
    } else {
      setComponent(world, eid, c.Geometry, GeometryType.RECT);

      // Other assets need a paint component
      let paint = PaintType.IMAGE;
      if (asset.type === 'SEQUENCE') paint = PaintType.SEQUENCE;
      if (asset.type === 'VIDEO') paint = PaintType.VIDEO;
      if (asset.type === 'AUDIO') paint = PaintType.WAVEFORM;
      const fillEid = createEntity(world);
      setComponent(world, fillEid, c.Paint, paint);
      setComponent(world, fillEid, c.AssetId, asset.id);
      if (asset.type === 'AUDIO') {
        addComponent(world, fillEid, c.Hidden);
      }
      appendChild(world, fillEid, eid);
    }

    if (asset.type === "AUDIO") {
      addComponent(world, eid, c.Audio);
      resizeEntity(world, eid, { width: 500, height: 150 });
    }

    if (asset.type === "AUDIO" || asset.type === "TRANSCRIPT") {
      setComponent(world, eid, c.AssetId, asset.id);
    }

    appendChild(world, eid, sceneEid);
  });
};

export async function replaceAssetHandle(world: EngineWorld, asset: Asset) {
  const { mimeType } = asset;
  let handle: FileSystemFileHandle | ElectronFileHandle | undefined;

  if (window.desktop) {
    const [picked] = await showFileDialog(mimeType, false);
    handle = picked as FileSystemFileHandle | ElectronFileHandle;
  } else {
    try {
      [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: `${mimeType} files`,
            accept: { [mimeType]: [mimeTypeToExtension(mimeType)] },
          },
        ],
      });
    } catch {
      return;
    }
  }
  if (!handle) return;

  const detected = await detectMimeType(handle);
  if (detected !== mimeType) {
    toast.error("Mime type mismatch", {
      description: `Expected ${mimeType}, got ${detected ?? "unknown"}`,
    });
    return;
  }

  try {
    await saveAsset(world, { ...asset, handle });
  } catch (e) {
    toast.error("Failed to replace media", { description: (e as Error).message });
  }
};

type FileOrHandle = File | FileSystemFileHandle | FileSystemDirectoryHandle | ElectronFileHandle

export async function getFileFromDataTransferItem(item?: DataTransferItem): Promise<FileOrHandle | null> {
  if (!item) return null;

  const file = item.getAsFile();
  if (typeof item.getAsFileSystemHandle !== 'function') return file;
  const handle = await item.getAsFileSystemHandle();

  if (!handle || (handle.kind !== 'file' && handle.kind !== 'directory')) {
    return null;
  }

  if (window.desktop && handle.kind === 'file' && file) {
    const path = window.desktop.getPathForFile(file);
    if (path) return ElectronFileHandle.fromFile(path, file);
  }

  return handle as FileOrHandle;
}


export async function detectMimeType(handle: MediaInput): Promise<string | null> {
  let mimeType: string | null = null;

  if (typeof handle === 'string') {
    mimeType = await fetchMimeType(handle);
  } else if (handle instanceof Blob) {
    mimeType = handle.type;
  } else if (handle instanceof FileSystemDirectoryHandle) {
    const entry = await handle.entries().next();
    mimeType = await detectMimeType(entry.value[1]);
  } else {
    handle = await handle.getFile();
    mimeType = handle.type;
  }

  // Subtitle files: the extension is authoritative — OS registries rarely map .srt.
  const fileName = typeof handle === 'string'
    ? handle.split(/[?#]/)[0]
    : (handle as File).name ?? '';
  if (/\.srt$/i.test(fileName) || mimeType === 'application/x-subrip') {
    return 'application/x-subrip';
  } else if (/\.vtt$/i.test(fileName) || mimeType === 'text/vtt') {
    return 'text/vtt';
  }

  if (mimeType?.startsWith('image/')) {
    return mimeType;
  } else if (mimeType?.startsWith('text/html')) {
    return mimeType;
  } else if (mimeType?.startsWith('application/json')) {
    return mimeType;
  } else if (handle instanceof FileSystemDirectoryHandle) {
    return mimeType?.startsWith('image/') ? mimeType : null;
  }

  // For audio and video, we will do a more thorough detection using mediabunny
  try {
    const input = new Input({
      formats: ALL_FORMATS,
      source: typeof handle === 'string'
        ? new UrlSource(handle)
        : new BlobSource(handle),
    });

    mimeType = await input.getMimeType();
  } catch {
    return null;
  }

  if (mimeType?.startsWith('audio/')) {
    return mimeType;
  } else if (mimeType?.startsWith('video/')) {
    return mimeType;
  } else {
    return null;
  }
}

async function getRasterDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

async function getSvgDimensions(file: Blob): Promise<{ width: number; height: number }> {
  const text = await file.text();
  const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;

  const parseLength = (v: string | null) => {
    if (!v) return 0;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  let width = parseLength(root.getAttribute('width'));
  let height = parseLength(root.getAttribute('height'));

  if ((!width || !height) && root.getAttribute('viewBox')) {
    const parts = root.getAttribute('viewBox')!.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
      width = width || parts[2]!;
      height = height || parts[3]!;
    }
  }

  // SVG spec default when neither width/height nor viewBox is declared.
  return { width: width || 300, height: height || 150 };
}

export async function fetchMimeType(handle: string): Promise<string | null> {
  if (handle.startsWith('<html>')) {
    return 'text/html';
  }

  let response: Response;
  try {
    response = await fetch(handle, { method: 'HEAD' });
  } catch {
    const controller = new AbortController();
    response = await fetch(handle, { signal: controller.signal });
    controller.abort();
  }

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('Content-Type');

  if (!contentType) {
    return null;
  }

  return contentType;
}

/**
 * Playable content length of a media track, in seconds: the end timestamp
 * minus the track's first *presented* timestamp. A track may carry a global
 * time offset (a non-zero first timestamp); using the raw end timestamp as the
 * duration would over-report the length by that offset.
 *
 * A negative first timestamp means the head has been trimmed by an edit list
 * (e.g. a QuickTime `elst` with a non-zero media_time); those pre-roll samples
 * "should not be presented", so the presented content is [0, end]. Clamp the
 * start to 0 — otherwise `end - start` counts the trimmed region and
 * over-reports the duration by the trim amount. Clamped to >= 0.
 */
async function trackContentDuration(track?: InputTrack | null): Promise<number> {
  if (!track) return 0;

  const [start, end] = await Promise.all([
    track.getFirstTimestamp(),
    track.computeDuration(),
  ]);
  return Math.max(0, end - Math.max(0, start));
}
