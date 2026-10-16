/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * IndexedDB persistence for the ECS engine.
 *
 * Each project gets its own database (`db-{projectId}`).
 * Entity records are stored as plain objects keyed by numeric eid
 * (converted to string for IDB). World-level state (camera, background)
 * lives in the `world` store under a single fixed key.
 *
 * A `WriteQueue` batches put/delete operations via requestIdleCallback
 * so persistence never blocks the render loop.
 */

import { deleteDB, openDB } from 'idb';
import { serializeEntity } from '../api';
import { migrateToV2, migrateToV3, migrateToV4, migrateToV5, migrateToV6, migrateToV7 } from './migrations';

import type * as idb from 'idb';
import type { DBEntity, Camera2D } from '../types';
import type { EngineWorld } from '../api/world';
import type { Asset, Folder } from './schemas';
import type { FontSource } from '../font';

if (typeof window !== 'undefined' && typeof requestIdleCallback !== 'function') {
	Object.assign(window, { requestIdleCallback: requestAnimationFrame });
}

export const WORLD_STATE_KEY = 'world';
export const DEFAULT_PROJECT_ID = 'V1StGXR8_Z5jdHi6B-myT';

export type DBWorldState = {
	id: string;       // always WORLD_STATE_KEY
	camera: Camera2D;
	background: number;
};

export interface EngineDBSchema extends idb.DBSchema {
	entities: {
		value: DBEntity;
		key: string;
	};
	assets: {
		value: Asset;
		key: string;
	};
	folders: {
		value: Folder;
		key: string;
	};
	fonts: {
		value: FontSource;
		key: string;
	};
	world: {
		value: DBWorldState;
		key: string;
	};
}

const dbPromises = new Map<string, Promise<idb.IDBPDatabase<EngineDBSchema>>>();

const STORE_KEY_PATHS: Record<string, string> = {
	entities: 'id',
	assets: 'id',
	folders: 'id',
	fonts: 'source',
	world: 'id',
};

/**
 * In-memory stand-in for a project database, covering the subset of the idb
 * API the engine uses. Backs the session-only default project.
 */
function createMemoryDB(): idb.IDBPDatabase<EngineDBSchema> {
	const stores = new Map<string, Map<string, unknown>>(
		Object.keys(STORE_KEY_PATHS).map((name) => [name, new Map()]),
	);

	const objectStore = (name: string) => {
		const store = stores.get(name)!;
		return {
			put: async (value: Record<string, unknown>) => {
				const key = String(value[STORE_KEY_PATHS[name]!]);
				store.set(key, value);
				return key;
			},
			delete: async (key: string) => {
				store.delete(key);
			},
		};
	};

	return {
		get: async (name: string, key: string) => stores.get(name)!.get(key),
		getAll: async (name: string) => Array.from(stores.get(name)!.values()),
		put: (name: string, value: Record<string, unknown>) => objectStore(name).put(value),
		delete: (name: string, key: string) => objectStore(name).delete(key),
		transaction: () => ({ objectStore, done: Promise.resolve() }),
		close: () => { },
	} as unknown as idb.IDBPDatabase<EngineDBSchema>;
}

export function getProjectDB(projectId: string, version = 8) {
	const dbName = `db-v2-${projectId}`;
	let cacheKey = `${dbName}@${version}`;

	if (projectId === DEFAULT_PROJECT_ID) {
		cacheKey = `${dbName}@memory`;
	}

	const cached = dbPromises.get(cacheKey);
	if (cached) return cached;

	if (projectId === DEFAULT_PROJECT_ID) {
		const promise = Promise.resolve(createMemoryDB());
		dbPromises.set(cacheKey, promise);
		return promise;
	}

	const promise = openDB<EngineDBSchema>(dbName, version, {
		async upgrade(db, oldVersion, _newVersion, tx) {
			if (!db.objectStoreNames.contains('entities')) {
				db.createObjectStore('entities', { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains('assets')) {
				db.createObjectStore('assets', { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains('folders')) {
				db.createObjectStore('folders', { keyPath: 'id' });
			}
			if (!db.objectStoreNames.contains('fonts')) {
				db.createObjectStore('fonts', { keyPath: 'source' });
			}
			if (!db.objectStoreNames.contains('world')) {
				db.createObjectStore('world', { keyPath: 'id' });
			}

			if (oldVersion < 2) {
				await migrateToV2(tx);
			}
			if (oldVersion < 3) {
				await migrateToV3(tx);
			}
			if (oldVersion < 4) {
				await migrateToV4(tx);
			}
			if (oldVersion < 5) {
				await migrateToV5(tx);
			}
			if (oldVersion < 6) {
				await migrateToV6(tx);
			}
			if (oldVersion < 7) {
				await migrateToV7(tx);
			}
		},
	});

	dbPromises.set(cacheKey, promise);
	return promise;
}

/**
 * Deletes the per-project IndexedDB database and clears any cached DB handles.
 */
export async function deleteProjectDB(projectId: string): Promise<void> {
	const dbName = `db-v2-${projectId}`;
	const cachePrefix = `${dbName}@`;

	for (const [cacheKey, dbPromise] of dbPromises) {
		if (!cacheKey.startsWith(cachePrefix)) continue;

		try {
			const db = await dbPromise;
			db.close();
		} catch {
			// Ignore failed opens; cache still needs to be cleared.
		}

		dbPromises.delete(cacheKey);
	}

	await deleteDB(dbName);
}

// ─── Write queue ─────────────────────────────────────────────────

/**
 * Batches put and delete operations into single IDB transactions.
 * Uses requestIdleCallback so writes never block the main thread.
 */
export class WriteQueue {
	private puts = new Map<string, DBEntity>();
	private deletes = new Set<string>();
	private writing: Promise<void> | null = null;
	private failure: { error: unknown } | null = null;
	private db: Promise<idb.IDBPDatabase<EngineDBSchema>>;

	public constructor(db: Promise<idb.IDBPDatabase<EngineDBSchema>>) {
		this.db = db;
	}

	/** Enqueue an entity upsert. */
	public scheduleWrite(world: EngineWorld, eid?: number): void {
		if (!eid) return;

		this.deletes.delete(eid.toString());
		this.puts.set(eid.toString(), serializeEntity(world, eid));
		requestIdleCallback(this.flush.bind(this));
	}

	/** Enqueue an entity deletion. */
	public scheduleDelete(_world: EngineWorld, eid?: number): void {
		if (!eid) return;

		this.puts.delete(eid.toString());
		this.deletes.add(eid.toString());
		requestIdleCallback(this.flush.bind(this));
	}

	/** Flush all pending puts and deletes in one transaction. */
	public async flush(): Promise<void> {
		const db = await this.db;

		if (this.writing || (this.puts.size === 0 && this.deletes.size === 0)) {
			return;
		}

		const putData = Array.from(this.puts.values());
		const deleteKeys = Array.from(this.deletes);
		this.puts.clear();
		this.deletes.clear();
		const writing = (async () => {
			const tx = db.transaction('entities', 'readwrite');

			await Promise.all([
				...putData.map(data => tx.objectStore('entities').put(data)),
				...deleteKeys.map(key => tx.objectStore('entities').delete(key)),
				tx.done,
			]);
		})();
		this.writing = writing;
		try {
			await writing;

			// Re-check in case new items were queued during the await
			requestIdleCallback(this.flush.bind(this));
		} catch (e) {
			this.failure = { error: e };
			console.error('[engine] WriteQueue flush failed:', e);
		} finally {
			this.writing = null;
		}
	}

	/** Await the active transaction and every write queued while it settles. */
	public async drain(): Promise<void> {
		await this.db;
		while (this.writing || this.puts.size || this.deletes.size) {
			if (this.failure) throw this.failure.error;
			if (this.writing) await this.writing;
			else await this.flush();
		}
		// Idle flushes preserve their historical logging behavior. A save
		// barrier must still report a failure rather than certify stale data.
		if (this.failure) throw this.failure.error;
	}
}

/**
 * Persists the single world-state record (camera + background). Unlike the
 * entity WriteQueue, there's no key-space to track — every schedule call
 * replaces the same row, so we just remember which world is dirty and snapshot
 * its current state at flush time.
 */
export class WorldStateWriter {
	private dirty: EngineWorld | null = null;
	private isWriting = false;
	private db: Promise<idb.IDBPDatabase<EngineDBSchema>>;

	public constructor(db: Promise<idb.IDBPDatabase<EngineDBSchema>>) {
		this.db = db;
	}

	/** Schedule a write of the current world state. Rapid calls coalesce. */
	public schedule(world: EngineWorld): void {
		this.dirty = world;
		requestIdleCallback(this.flush.bind(this));
	}

	private async flush(): Promise<void> {
		if (this.isWriting || !this.dirty) return;

		const world = this.dirty;
		this.dirty = null;
		this.isWriting = true;

		try {
			const db = await this.db;
			await db.put('world', {
				id: WORLD_STATE_KEY,
				camera: { ...world.camera },
				background: world.background,
			});
		} catch (e) {
			console.error('[engine] WorldStateWriter flush failed:', e);
		} finally {
			this.isWriting = false;
			// Something dirtied us during the await — re-queue.
			if (this.dirty) requestIdleCallback(this.flush.bind(this));
		}
	}
}

export type Store = {
	queue: WriteQueue;
	worldState: WorldStateWriter;
	db: Promise<idb.IDBPDatabase<EngineDBSchema>>;
};

export function createStore(projectId: string): Store {
	const db = getProjectDB(projectId);
	return {
		queue: new WriteQueue(db),
		worldState: new WorldStateWriter(db),
		db,
	};
}
