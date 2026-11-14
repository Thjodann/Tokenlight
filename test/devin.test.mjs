import test from 'node:test';
import assert from 'node:assert/strict';
import { readProvider, ProviderError } from '../src/providers.mjs';
import { normalizeQuota, pacificDayFromUnix } from '../src/devin.mjs';
import { activityReading, activityCaption, balanceReading } from '../src/metric-view.mjs';
import { activityUnit, sourceCost } from '../src/insights.mjs';

const month = '2026-10';
const day = Math.floor(Date.UTC(2026, 9, 2, 8) / 1000);
const self = { principal_type: 'pat_user', user_id: 'user_1', user_name: 'Ada', api_key_id: 'key_1', api_key_name: 'tokenlight', devin_sessions_org_id: 'org-abc12345', org_id: null };
const product = { devin: 3.5, cascade: 0, terminal: 0 };
const daily = { total_acus: 3.5, consumption_by_date: [{ date: day, acus: 3.5, acus_by_product: product }] };
const quota = { hide_daily_quota: false, plan_name: 'Pro', daily: { percent_used: 40, resets_at: '2026-11-15T08:00:00Z' }, weekly: { percent_used: 55, resets_at: '2026-11-17T08:00:00Z' }, overage_balance: 12.5 };

function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }

test('Devin bills a documented midnight on the Pacific day Devin names', () => {
  assert.equal(pacificDayFromUnix(1733385600), '2024-12-05');
});

test('an Enterprise key uses daily ACU history and quota remaining', async () => {
  const original = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, options) => {
    const address = String(url); seen.push([address, options.headers.Authorization]);
    if (address.endsWith('/v3/self')) return json(self);
    if (address.includes('/consumption/daily')) return json(daily);
    if (address.includes('/quota/usage')) return json(quota);
    return json({}, 404);
  };
  try {
    const reading = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value' } });
    assert.equal(reading.monthly, 3.5); assert.equal(reading.unit, 'acus'); assert.equal(reading.organization, 'Ada');
    assert.equal(reading.windows.length, 2); assert.equal(reading.plan, 'Pro');
    assert.equal(reading.creditBalances[0].value, 12.5); assert.equal(reading.modelUsage.length, 0);
    assert.equal(seen.filter(([address]) => address.includes('/sessions')).length, 0);
    assert.ok(seen.every(([, auth]) => auth === 'Bearer cog_test_key_value'));
    assert.equal(activityReading(reading), '3.5 ACU');
    assert.match(activityCaption(reading, month), /ACU · PT/);
    assert.equal(activityUnit('devin'), 'sessions');
  } finally { globalThis.fetch = original; }
});

test('a refused daily history falls back to each session once, including a child', async () => {
  const original = globalThis.fetch;
  const sessions = { items: [
    { session_id: 'parent', created_at: day, status: 'completed', acus_consumed: 2 },
    { session_id: 'child', parent_session_id: 'parent', created_at: day, status: 'completed', acus_consumed: 0, on_demand_usage: 4.5 },
  ], has_next_page: false, end_cursor: null };
  globalThis.fetch = async url => {
    const address = String(url);
    if (address.endsWith('/v3/self')) return json(self);
    if (address.includes('/consumption/daily')) return json({ detail: 'no' }, 403);
    if (address.includes('/sessions')) return json(sessions);
    if (address.includes('/quota/usage')) return json({ hide_daily_quota: true, weekly: { percent_used: 10, resets_at: '2026-11-17T08:00:00Z' } });
    return json({}, 404);
  };
  try {
    const reading = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value' } });
    assert.equal(reading.monthly, 2); assert.equal(reading.requestCount, 2);
    assert.equal(reading.apiCost.total, 4.5); assert.equal(reading.apiCost.basis, 'Teams on-demand overage');
    assert.equal(reading.windows.map(window => window.label).join(','), 'Weekly allowance');
    assert.equal(sourceCost({ ...reading, id: 'devin' }, { accountProfiles: {} }, month).basis, 'Teams on-demand overage');
    assert.equal(sourceCost({ ...reading, id: 'devin' }, { accountProfiles: {} }, month).value.total, null);
  } finally { globalThis.fetch = original; }
});

test('a missing ACU field, an unfinished page, an unfamiliar payload and several organizations publish nothing', async () => {
  const cases = [
    { sessions: { items: [{ session_id: 'broken', created_at: day, status: 'completed' }], has_next_page: false }, code: 'format' },
    { sessions: { items: [], has_next_page: true, end_cursor: null }, code: 'coverage' },
    { daily: { total_acus: 'soon' }, code: 'format', enterprise: true },
  ];
  for (const item of cases) {
    const original = globalThis.fetch;
    globalThis.fetch = async url => {
      const address = String(url);
      if (address.endsWith('/v3/self')) return json(self);
      if (address.includes('/consumption/daily')) return item.enterprise ? json(item.daily) : json({}, 403);
      if (address.includes('/sessions')) return json(item.sessions);
      return json({}, 404);
    };
    try { await assert.rejects(readProvider('devin', month, { credentials: { devin: 'cog_test_key_value' } }), error => error instanceof ProviderError && error.code === item.code); }
    finally { globalThis.fetch = original; }
  }
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).endsWith('/v3/self') ? json({ principal_type: 'service_user' }) : json({ items: [{ org_id: 'org-aaaa1111', name: 'One' }, { org_id: 'org-bbbb2222', name: 'Two' }] });
  try { await assert.rejects(readProvider('devin', month, { credentials: { devin: 'cog_test_key_value' } }), error => error.code === 'setup' && /more than one/.test(error.message)); }
  finally { globalThis.fetch = original; }
});

test('a refused quota page keeps the ACU reading, and a saved session is used only for that page', async () => {
  const original = globalThis.fetch; const quotaAuth = [];
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (address.endsWith('/v3/self')) return json(self);
    if (address.includes('/consumption/daily')) return json(daily);
    if (address.includes('/quota/usage')) { quotaAuth.push(options.headers.Authorization); return json({}, 403); }
    return json({}, 404);
  };
  try {
    const kept = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value' } });
    assert.equal(kept.monthly, 3.5); assert.equal(kept.windows.length, 0); assert.match(kept.allowanceNote, /left blank|not returned|refused/);
  } finally { globalThis.fetch = original; }
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    if (address.includes('api.devin.ai')) {
      assert.equal(options.headers.Authorization, 'Bearer cog_test_key_value');
      if (address.endsWith('/v3/self')) return json(self);
      if (address.includes('/consumption/daily')) return json(daily);
    }
    if (address.includes('/quota/usage')) {
      quotaAuth.push(options.headers.Authorization);
      return options.headers.Authorization.includes('session') ? json(quota) : json({}, 403);
    }
    return json({}, 404);
  };
  try {
    const reading = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value', devinQuota: 'website-session-token' } });
    assert.equal(reading.windows.length, 2);
    assert.ok(quotaAuth.includes('Bearer website-session-token'));
  } finally { globalThis.fetch = original; }
});

test('a missing quota address still uses the saved website login on the organization page', async () => {
  const original = globalThis.fetch; const seen = [];
  globalThis.fetch = async (url, options) => {
    const address = String(url);
    seen.push(`${address} ${options.headers.Authorization}`);
    if (address.includes('api.devin.ai')) {
      if (address.endsWith('/v3/self')) return json(self);
      if (address.includes('/consumption/daily')) return json(daily);
    }
    if (address === 'https://app.devin.ai/api/org-abc12345/billing/quota/usage' && options.headers.Authorization === 'Bearer website-session-token') return json(quota);
    return json({}, 404);
  };
  try {
    const reading = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value', devinQuota: 'website-session-token' } });
    assert.equal(reading.windows.length, 2);
    assert.equal(seen.some(line => line.includes('api.devin.ai') && line.includes('website-session-token')), false);
  } finally { globalThis.fetch = original; }
});

test('an explicit organization skips a combined total, and a hidden daily quota is omitted', () => {
  const hidden = normalizeQuota({ hide_daily_quota: true, weekly: { percent_used: 12, resets_at: '2026-11-17T08:00:00Z' } });
  assert.deepEqual(hidden.windows.map(window => window.label), ['Weekly allowance']);
  const flat = normalizeQuota({ hide_daily_quota: false, daily_percentage: 2, weekly_percentage: 1, daily_reset_at: '2026-11-15T00:00:00-08:00', weekly_reset_at: '2026-11-15T00:00:00-08:00', overage_balance: -0.1 });
  assert.deepEqual(flat.windows.map(window => [window.label, window.percent]), [['Daily allowance', 2], ['Weekly allowance', 1]]);
  assert.equal(flat.creditBalances[0].value, -0.1);
  assert.equal(balanceReading({ creditBalances: flat.creditBalances }).text, '-$0.10');
  assert.throws(() => normalizeQuota({ hello: true }));
});

test('an older Devin key is explained before any request, and a personal token skips the enterprise organization', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  try {
    await assert.rejects(readProvider('devin', month, { credentials: { devin: 'apk_user_legacy_key' } }), error => error.code === 'setup' && /cog_/.test(error.message));
    assert.equal(called, false);
  } finally { globalThis.fetch = original; }
  const seen = [];
  const sessions = { items: [{ session_id: 'mine', created_at: day, status: 'completed', acus_consumed: 1 }], has_next_page: false, end_cursor: null };
  globalThis.fetch = async url => {
    const address = String(url); seen.push(address);
    if (address.endsWith('/v3/self')) return json({ ...self, org_id: 'org-enterprise9', primary_billing_org_id: 'org-billing999' });
    if (address.includes('/consumption/daily')) return json({}, 401);
    if (address.includes('/sessions')) return address.includes('org-abc12345') ? json(sessions) : json({}, 403);
    return json({}, 404);
  };
  try {
    const reading = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value' } });
    assert.equal(reading.monthly, 1); assert.equal(reading.orgId, 'org-abc12345');
    assert.equal(seen.some(address => address.includes('org-enterprise9')), false);
  } finally { globalThis.fetch = original; }
});

test('DEVIN_ORG_ID selects one organization without listing the enterprise', async () => {
  const original = globalThis.fetch; const seen = [];
  globalThis.fetch = async url => {
    const address = String(url); seen.push(address);
    if (address.includes('/consumption/daily')) return json(daily);
    if (address.includes('/quota/usage')) return json({}, 404);
    throw new Error(address);
  };
  try {
    const reading = await readProvider('devin', month, { credentials: { devin: 'cog_test_key_value', devinOrg: 'org-chosen123' } });
    assert.equal(reading.orgId, 'org-chosen123');
    assert.equal(seen.some(address => address.includes('/v3/self') || address.includes('/organizations?')), false);
  } finally { globalThis.fetch = original; }
});
