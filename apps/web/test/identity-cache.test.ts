import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityCache } from '../src/components/engine/decoders/identity-cache.ts';

test('equal project-local ids do not share decoded media', () => {
  const a = { id: 'same-id', file: 'first.mp4' };
  const b = { id: 'same-id', file: 'second.mp4' };
  const cache = new IdentityCache<object, string>();
  cache.set(a, 'first sound');
  assert.equal(cache.get(a), 'first sound');
  assert.equal(cache.get(b), undefined);
  cache.set(b, 'second sound');
  assert.equal(cache.get(a), 'first sound');
  assert.equal(cache.get(b), 'second sound');
  cache.clear();
  assert.equal(cache.get(a), undefined);
  assert.equal(cache.get(b), undefined);
});
