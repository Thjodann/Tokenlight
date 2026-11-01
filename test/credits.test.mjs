import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodex, normalizeClaude, normalizeEleven } from '../src/model.mjs';
import { creditNumber, readMoney } from '../src/account-credits.mjs';
import { creditSection } from '../src/credit-view.mjs';
import { anthropicCosts } from '../src/anthropic-cost.mjs';

test('Codex credits remain visible alongside zero usage and separate reset passes', () => {
  const r = normalizeCodex({ rateLimits: { primary: { usedPercent: 0 }, credits: { balance: '44366.0935560000', hasCredits: true } }, rateLimitResetCredits: { availableCount: 1 } }, { dailyUsageBuckets: [] }, '2026-10');
  assert.equal(r.monthly, 0); assert.equal(r.windows[0].percent, 0);
  assert.equal(r.creditBalances[0].value, 44366.093556);
  assert.equal(r.creditBalances[1].unit, 'resets');
  const html = creditSection(r); assert.match(html, /44,366.09 credits/); assert.match(html, /1 reset/);
});
test('credit absence, explicit zero and unlimited are distinct', () => {
  const r = credits => normalizeCodex({ rateLimits: { credits } }, null, '2026-10');
  assert.equal(r({ balance: '0' }).creditBalances[0].value, 0);
  assert.equal(r({ unlimited: true }).creditBalances[0].unlimited, true);
  assert.deepEqual(r({ balance: 'garbled' }).creditBalances, []);
  for (const bad of [null, '', ' ', false, '1e3', '-1', Infinity, NaN]) assert.equal(creditNumber(bad), null);
});
test('Claude Fable allowance, credit balance and monthly spend cap never merge', () => {
  const r = normalizeClaude({ five_hour: { utilization: 0 }, seven_day: { utilization: 4 }, iguana_necktie: { utilization: 2.868318, limit_dollars: 250, used_dollars: 7.170795, remaining_dollars: 242.829205, resets_at: '2026-11-05T07:59:00Z' }, spend: { enabled: true, used: { amount_minor: 0, exponent: 2, currency: 'USD' }, limit: { amount_minor: 2000, exponent: 2, currency: 'USD' }, balance: { amount_minor: 3500, exponent: 2, currency: 'USD' } } });
  assert.equal(r.windows[2].label, 'Fable · 7 day'); assert.equal(r.creditBalances[0].value, 242.829205);
  assert.equal(r.creditBalances[1].value, 35); assert.equal(r.paidUsage.used, 0); assert.equal(r.paidUsage.limit, 20);
  assert.match(r.creditNote, /not billed charges/);
});
test('opaque Claude fields need their confirmed full shape; explicit Fable zero is valid', () => {
  assert.equal(normalizeClaude({ iguana_necktie: { utilization: 2 } }).fableWindow, null);
  assert.equal(normalizeClaude({ seven_day_fable: { utilization: 0 } }).fableWindow.percent, 0);
  const r = normalizeClaude({ spend: { enabled: false, used: { amount_minor: 0, exponent: 2, currency: 'USD' }, limit: null, balance: null } });
  assert.equal(r.paidUsage.limit, null); assert.deepEqual(r.creditBalances, []);
  assert.match(creditSection(r), /Paid credit balance not reported/); assert.match(creditSection(r), /Paid usage is disabled/);
});
test('legacy Claude spending uses explicit currency precision, never infers cents', () => {
  assert.equal(normalizeClaude({ extra_usage: { is_enabled: true, used_credits: 125, monthly_limit: 2000, decimal_places: 2, currency: 'USD' } }).paidUsage.used, 1.25);
  assert.equal(normalizeClaude({ extra_usage: { is_enabled: true, used_credits: 125, monthly_limit: 2000 } }).paidUsage.used, null);
  assert.equal(readMoney({ amount_minor: 2000, exponent: 99, currency: 'USD' }), null);
});
test('remaining ElevenLabs credits follow the subscription cycle, independent of history', () => {
  const r = normalizeEleven({ character_count: 50, character_limit: 100 }, null, '2026-10');
  assert.equal(r.monthly, null); assert.equal(r.creditBalances[0].value, 50); assert.equal(r.creditBalances[0].allowance, true);
});
test('credit markup escapes provider labels and renders no CSP-blocked inline styles', () => {
  const html = creditSection({ creditBalances: [{ label: '<img onerror="oops">', value: 0, unit: 'USD' }] });
  assert.doesNotMatch(html, /<img|style=/); assert.match(html, /&lt;img/); assert.match(html, /\$0.00/);
});
test('Anthropic cost pagination preserves fractional cents and separates Fable costs', async () => {
  const calls = [];
  const cost = await anthropicCosts('2026-10', async url => { calls.push(url); return calls.length === 1 ? { data: [{ group: { model: 'claude-fable-5-1' }, cost: { amount: '1250.500000', currency: 'USD' } }], has_more: true, next_page: 'next', data_refreshed_at: '2026-10-31T10:00:00Z' } : { data: [{ group: { model: 'claude-sonnet-5-5' }, cost: { amount: '500.000000', currency: 'USD' } }], has_more: false }; }, {});
  assert.equal(cost.total, 17.505); assert.equal(calls[1].searchParams.get('page'), 'next'); assert.equal(calls[0].searchParams.get('group_by[]'), 'model');
  assert.match(creditSection({ apiCost: cost }), /Fable API cost/); assert.match(creditSection({ apiCost: cost }), /\$12.51/);
});
test('empty, missing, malformed and truncated cost reports do not fabricate charges', async () => {
  assert.equal((await anthropicCosts('2026-10', async () => ({ data: [], has_more: false }), {})).total, null);
  assert.equal((await anthropicCosts('2026-10', async () => ({ data: [], data_refreshed_at: '2026-10-31T00:00:00Z' }), {})).total, 0);
  await assert.rejects(anthropicCosts('2026-10', async () => ({ data: [], has_more: true }), {}));
  await assert.rejects(anthropicCosts('2026-10', async () => ({ data: [{ cost: { amount: 'unknown', currency: 'USD' } }] }), {}));
});
