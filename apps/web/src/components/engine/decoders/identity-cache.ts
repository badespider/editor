/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/** Asset ids are project-local. Cache by the actual asset/track, never its id. */
export class IdentityCache<K extends object, V> {
  private values = new WeakMap<K, V>();
  get(key: K): V | undefined { return this.values.get(key); }
  has(key: K): boolean { return this.values.has(key); }
  set(key: K, value: V): void { this.values.set(key, value); }
  delete(key: K): void { this.values.delete(key); }
  clear(): void { this.values = new WeakMap<K, V>(); }
}
