/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { renderProject } from "@diffusionstudio/jsx";
import { nanoid } from "nanoid";

import { reorderEntity, switchActiveScene } from "@/components/engine";
import { createScriptAsset } from "@/components/engine/api/assets";
import { WorldDocument, importProjectModule } from "@/utils/jsx";
import { documentRootKeys } from "@/utils/mount";
import { assert } from "@/utils";
import { resolveEntityEid } from "./node";
import { hasComponent } from "bitecs";

import type { Accessor } from "solid-js";
import type { MountRequest, NodeInsertRequest } from "@diffusionstudio/cli/channels";
import type { Engine } from "@/components/engine";

/**
 * `dapi mount` — evaluates a compiled project module and renders it directly into the ECS world
 */
export function handleMount(engine: Accessor<Engine>, signal?: AbortSignal) {
  return async ({ code }: MountRequest): Promise<void> => {
    const e = engine();
    const world = e.world;
    const c = world.components;
    const assertActive = () => {
      signal?.throwIfAborted();
      assert(!e.disposed, "The editor was closed before this mount completed");
    };
    let dispose = () => { };
    let registered = false;

    try {
      assertActive();
      // Evaluate — top-level code (including top-level await) runs here.
      const module = await importProjectModule(code);
      assertActive();
      const project = module.default as () => unknown;
      assert(typeof project === "function", "The project module must default-export a Solid component");

      // Persist the compiled module as a content-addressed SCRIPT asset so any
      // world (export, capture, reload) can re-run it in adopt mode. `mountId`
      // ties every entity of this mount together for that re-run.
      const scriptAsset = await createScriptAsset(world, code);
      assertActive();
      const mountId = nanoid();

      const document = new WorldDocument(world, {
        engine: e,
        mode: "author",
        mountId,
        scriptAssetId: scriptAsset.id,
      });

      try {
        world.history.startTransaction("Render project");
        dispose = renderProject(project, document);
        world.history.commitTransaction();
      } catch (error) {
        world.history.rollbackTransaction();
        throw error;
      }

      // The keyed root replacement above deleted any same-key entities, so
      // graphs that were driving them are dead; dispose them before their
      // next effect can write to a recycled entity id.
      world.liveMounts.supersede(documentRootKeys(world, document));

      try {
        world.history.startTransaction("Commit document");
        await document.commit();
      } finally {
        world.history.commitTransaction();
      }

      // Project cleanup can run while media/fonts are being resolved. Never
      // register a graph after the engine's live mounts were disposed.
      assertActive();

      // A mount always stays live: its reactive graph keeps driving the
      // entities until a later mount claims a root key or the app closes.
      world.liveMounts.register({
        mountId,
        rootKeys: () => documentRootKeys(world, document),
        advance: () => document.advanceTicker(),
        dispose,
      });
      registered = true;

      if (document.rootEid && hasComponent(world, document.rootEid, c.Scene)) {
        switchActiveScene(world, document.rootEid);
        e.camera.fitToActiveScene();
      }
    } finally {
      // Only the error path (before registration) needs to dispose the graph.
      if (!registered) dispose?.();
    }
  };
}

/**
 * `dapi node insert` — the mount pipeline, but rendered into an existing
 * parent entity instead of the document: roots take no key, nothing is
 * reconciled or deleted, every run inserts fresh entities. The parent may be
 * any live entity that takes children — a node, or a gradient paint for
 * `<ColorStop>` roots.
 */
export function handleNodeInsert(engine: Accessor<Engine>) {
  return async ({ code, parentId, index }: NodeInsertRequest): Promise<void> => {
    const e = engine();
    const world = e.world;
    let dispose = () => { };

    try {
      const parentEid = resolveEntityEid(world, parentId);
      const module = await importProjectModule(code);
      const project = module.default as () => unknown;
      assert(typeof project === "function", "The project module must default-export a Solid component");

      const document = new WorldDocument(e.world, { parentEid, engine: e });

      try {
        world.history.startTransaction("Insert nodes");
        dispose = renderProject(project, document);
        if (index !== undefined && document.rootEid !== null) {
          reorderEntity(world, document.rootEid, index);
        }
        world.history.commitTransaction();
      } catch (error) {
        world.history.rollbackTransaction();
        throw error;
      }

      try {
        world.history.startTransaction("Commit document");
        await document.commit();
      } finally {
        world.history.commitTransaction();
      }
    } finally {
      dispose?.();
    }
  };
}
