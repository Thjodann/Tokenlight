import test from 'node:test';
import assert from 'node:assert/strict';
import cachePolicy from '../src/credential-cache.cjs';

test('rotating a key invalidates every cached month before freshness can reuse it', () => {
  const oldScope = cachePolicy.fingerprint('fixture-old-key');
  const cache = {
    '2026-09:openai': { scope: oldScope, monthly: 300, lastUpdatedAt: Date.now() },
    '2026-10:openai': { scope: oldScope, monthly: 400, lastUpdatedAt: Date.now() },
    '2026-10:codex': { scope: 'desktop-account', monthly: 500 }
  };
  const errors = { '2026-09:openai': { code: 'auth' } }, scopes = { openai: oldScope };
  const result = cachePolicy.reconcileCredentials(cache, errors, scopes, { openai: 'fixture-new-key' });
  assert.equal(result.removed, true); assert.ok(result.changed.has('openai'));
  assert.deepEqual(Object.keys(cache), ['2026-10:codex']); assert.deepEqual(errors, {});
  assert.equal(scopes.openai, cachePolicy.fingerprint('fixture-new-key'));
});

test('startup hides unvalidated API cache while retaining matching validated readings', () => {
  const scope = cachePolicy.fingerprint('fixture-key'), entry = { scope, monthly: 900 };
  assert.equal(cachePolicy.cacheAllowed('anthropic', entry, {}), false);
  const cache = { '2026-10:anthropic': entry }, scopes = {};
  cachePolicy.reconcileCredentials(cache, {}, scopes, { anthropic: 'fixture-key' });
  assert.equal(cachePolicy.cacheAllowed('anthropic', entry, scopes), true);
  assert.equal(cache['2026-10:anthropic'], entry);
  cachePolicy.reconcileCredentials(cache, {}, scopes, {});
  assert.deepEqual(cache, {});
  assert.equal(cachePolicy.cacheAllowed('anthropic', entry, scopes), false);
});
