import test from 'node:test';
import assert from 'node:assert/strict';
import { selectClaudeSession, readClaudeUsage, loadClaudeSession } from '../src/claude-session.mjs';
class SessionError extends Error { constructor(message, code) { super(message); this.code = code; } }
const expired = { accessToken: 'fixture-expired', expiresAt: 1 };
const fresh = { accessToken: 'fixture-fresh', expiresAt: Date.now() + 3600000 };

test('an expired Keychain record cannot mask a renewed fallback session', () => {
  assert.equal(selectClaudeSession(expired, fresh).accessToken, fresh.accessToken);
  assert.equal(selectClaudeSession(fresh, expired).accessToken, fresh.accessToken);
});

test('a credential rotated during a rejected usage request is retried once', async () => {
  let reads = 0; const sent = [];
  const result = await readClaudeUsage({ ErrorType: SessionError, load: async () => ++reads === 1 ? { ...fresh, accessToken: 'fixture-old' } : fresh,
    request: async token => { sent.push(token); if (sent.length === 1) throw new SessionError('denied', 'auth'); return { seven_day: { utilization: 12 } }; } });
  assert.deepEqual(sent, ['fixture-old', fresh.accessToken]);
  assert.equal(result.usage.seven_day.utilization, 12);
});

test('an expired read is checked again for a concurrent Claude renewal', async () => {
  let reads = 0;
  const result = await readClaudeUsage({ ErrorType: SessionError, load: async () => ++reads === 1 ? expired : fresh, request: async () => ({ ok: true }) });
  assert.equal(result.usage.ok, true);
});

test('a genuinely expired or revoked session gives an actionable reconnect error without loops', async () => {
  let requests = 0;
  await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => expired, request: async () => requests++ }), e => e.code === 'setup' && /Sign in/.test(e.message));
  await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => fresh, request: async () => { requests++; throw new SessionError('private response', 'auth'); } }), e => e.code === 'setup' && !e.message.includes('private response'));
  assert.equal(requests, 1);
});

test('rate limits and network failures are not retried as token rotation', async () => {
  for (const code of ['rate_limit', 'network']) {
    let reads = 0, requests = 0; const failure = new SessionError('wait', code);
    await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => { reads++; return fresh; }, request: async () => { requests++; throw failure; } }), e => e === failure);
    assert.equal(reads, 1); assert.equal(requests, 1);
  }
});


test('a rejected unexpired Keychain credential can yield to the valid fallback without another Connect', async () => {
  const rejected = { ...fresh, accessToken: 'fixture-rejected' }; const sent = [];
  const result = await readClaudeUsage({ ErrorType: SessionError,
    load: async exclude => selectClaudeSession(rejected, fresh, Date.now(), exclude),
    request: async token => { sent.push(token); if (token === rejected.accessToken) throw new SessionError('denied', 'auth'); return { ok: true }; } });
  assert.equal(result.usage.ok, true); assert.deepEqual(sent, [rejected.accessToken, fresh.accessToken]);
});

test('an expired renewable session is maintained before requesting usage', async () => {
  let stored = { ...expired, refreshToken: 'fixture-refresh' }, renewals = 0;
  const result = await readClaudeUsage({ ErrorType: SessionError, load: async () => stored,
    renew: async () => { renewals++; stored = fresh; }, request: async token => { assert.equal(token, fresh.accessToken); return { ok: true }; } });
  assert.equal(result.usage.ok, true); assert.equal(renewals, 1);
});

test('near-expiry maintenance keeps a still-valid session usable during a temporary renewal failure', async () => {
  const current = { ...fresh, expiresAt: Date.now() + 60000, refreshToken: 'fixture-refresh' }; let renewals = 0;
  const result = await readClaudeUsage({ ErrorType: SessionError, load: async () => current,
    renew: async () => { renewals++; throw new SessionError('Retry later', 'session_refresh'); }, request: async () => ({ ok: true }) });
  assert.equal(result.usage.ok, true); assert.equal(renewals, 1);
});

test('an expired session reports a temporary renewal failure without demanding a fresh login', async () => {
  const failure = new SessionError('Retry later', 'session_refresh'); let requests = 0;
  await assert.rejects(readClaudeUsage({ ErrorType: SessionError, load: async () => ({ ...expired, refreshToken: 'fixture-refresh' }),
    renew: async () => { throw failure; }, request: async () => { requests++; } }), e => e === failure);
  assert.equal(requests, 0);
});

test('a rejected session tries the official maintainer only once when no alternate credential works', async () => {
  let stored = { ...fresh, accessToken: 'fixture-rejected', refreshToken: 'fixture-refresh' }, renewals = 0;
  const sent = [];
  const result = await readClaudeUsage({ ErrorType: SessionError,
    load: async excluded => stored.accessToken === excluded ? null : stored,
    renew: async () => { renewals++; stored = fresh; },
    request: async token => { sent.push(token); if (token === 'fixture-rejected') throw new SessionError('denied', 'auth'); return { ok: true }; } });
  assert.equal(result.usage.ok, true); assert.equal(renewals, 1); assert.deepEqual(sent, ['fixture-rejected', fresh.accessToken]);
});

test('locked credential stores are temporary failures, and cannot mask a valid fallback', async () => {
  const locked = async () => { throw Object.assign(new Error('fixture-private'), { code: 36 }); };
  const absent = async () => { throw Object.assign(new Error('absent'), { code: 'ENOENT' }); };
  await assert.rejects(loadClaudeSession({ ErrorType: SessionError, readKeychain: locked, readFallback: absent }), e => e.code === 'credentials' && !e.message.includes('fixture-private'));
  assert.equal((await loadClaudeSession({ ErrorType: SessionError, readKeychain: locked, readFallback: async () => fresh })).accessToken, fresh.accessToken);
  assert.equal(await loadClaudeSession({ ErrorType: SessionError, readKeychain: async () => { throw Object.assign(new Error('missing'), { code: 44 }); }, readFallback: absent }), null);
});
