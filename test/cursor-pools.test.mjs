import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCursor } from '../src/model.mjs';

const month = '2026-10';
const summary = plan => ({ membershipType: 'ultra', billingCycleEnd: '2026-11-24T12:00:00Z', individualUsage: { plan: { enabled: true, ...plan } } });

test('Cursor exposes an exhausted third-party pool even when the aggregate looks low', () => {
  const r = normalizeCursor(summary({ autoPercentUsed: 0.6, apiPercentUsed: 100, totalPercentUsed: 14.864 }), [
    { usageEventId: '1', timestamp: String(Date.UTC(2026, 9, 31)), tokenUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20 } },
  ], month);
  assert.deepEqual(r.windows, [
    { label: 'Grok / Composer', pool: 'cursor', percent: 0.6, resetsAt: Date.parse('2026-11-24T12:00:00Z') },
    { label: 'Third-party models', pool: 'thirdParty', percent: 100, resetsAt: Date.parse('2026-11-24T12:00:00Z') },
  ]);
  assert.equal(r.monthly, 35);
  assert.match(r.allowanceNote, /separate from the selected calendar month/);
});

test('Cursor preserves an explicit zero and never manufactures the missing pool', () => {
  const r = normalizeCursor(summary({ autoPercentUsed: 0, apiPercentUsed: null, totalPercentUsed: 30 }), [], month);
  assert.deepEqual(r.windows.map(w => [w.pool, w.percent]), [['cursor', 0]]);
  assert.match(r.allowanceNote, /did not report the other pool/);
  const thirdPartyOnly = normalizeCursor(summary({ apiPercentUsed: 101.2, autoPercentUsed: -1 }), [], month);
  assert.deepEqual(thirdPartyOnly.windows.map(w => [w.pool, w.percent]), [['thirdParty', 101.2]]);
});

test('Cursor supports older aggregate-only summaries without inventing a split', () => {
  const r = normalizeCursor(summary({ totalPercentUsed: 40 }), [], month);
  assert.deepEqual(r.windows, [{ label: 'Billing cycle', percent: 40, resetsAt: Date.parse('2026-11-24T12:00:00Z') }]);
  assert.equal(r.allowanceNote, null);
  assert.deepEqual(normalizeCursor(summary({ enabled: false, autoPercentUsed: 12, apiPercentUsed: 30 }), [], month).windows, []);
});

test('Cursor keeps current pool windows distinct from historical calendar token totals', () => {
  const r = normalizeCursor({ ...summary({ autoPercentUsed: 6, apiPercentUsed: 50 }), billingCycleEnd: 'invalid' }, [
    { timestamp: String(Date.UTC(2026, 8, 15)), tokenUsage: { inputTokens: 8, outputTokens: 2 } },
    { timestamp: String(Date.UTC(2026, 9, 15)), tokenUsage: { inputTokens: 80, outputTokens: 20 } },
  ], '2026-09');
  assert.equal(r.monthly, 10);
  assert.equal(r.windows[1].percent, 50);
  assert.equal(r.windows[0].resetsAt, null);
});
