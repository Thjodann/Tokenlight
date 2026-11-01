import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthRange, tokenRow, aggregateCursor, normalizeCodex, normalizeEleven, dailySeries, resetCountdown } from '../src/model.mjs';

test('reset countdown rounds across an hour without losing sixty minutes', () => {
  assert.equal(resetCountdown(7199999, 0), 'in 2h 0m');
  assert.equal(resetCountdown(3600001, 0), 'in 1h 1m');
  assert.equal(resetCountdown(1, 0), 'in 1 min');
  assert.equal(resetCountdown(0, 0), 'Reset passed · refresh');
  assert.equal(resetCountdown(null, 0), 'Reset not reported');
});

test('reset countdown uses the rounded duration at its whole-day boundary', () => {
  assert.equal(resetCountdown(172799999, 0), 'in 2 days');
  assert.equal(resetCountdown(172740000, 0), 'in 47h 59m');
  assert.equal(resetCountdown(172800000, 0), 'in 2 days');
  assert.equal(resetCountdown(259199999, 0), 'in 3 days');
});

test('OpenAI totals include cached input once and preserve the breakdown', () => {
  assert.deepEqual(tokenRow({ input_tokens: 100, output_tokens: 20, input_cached_tokens: 70 }, 'openai'), { input: 30, output: 20, cache: 70, total: 120 });
  assert.throws(() => tokenRow({ input_tokens: 10, output_tokens: 1, input_cached_tokens: 11 }, 'openai'));
});
test('Anthropic counts disjoint cache reads and creation tokens once', () => {
  assert.deepEqual(tokenRow({ uncached_input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 40, ephemeral_1h_input_tokens: 50 } }, 'anthropic'), { input: 10, output: 20, cache: 120, total: 150 });
  assert.throws(() => tokenRow({ input_tokens: -1, output_tokens: 2 }, 'anthropic'));
});
test('month ranges handle leap years and year rollover', () => {
  assert.equal(monthRange('2024-02').days, 29);
  assert.equal(monthRange('2026-02').days, 28);
  assert.equal(monthRange('2026-12').end, Date.UTC(2027, 0, 1));
  assert.throws(() => monthRange('2026-13'));
});
test('Cursor deduplicates stable event IDs without merging distinct anonymous events', () => {
  const row = { usageEventId: 'event-1', timestamp: String(Date.UTC(2026, 9, 4)), tokenUsage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 20, cacheWriteTokens: 7 } };
  const { daily, events, partial } = aggregateCursor([row, row, { ...row, usageEventId: undefined }, { ...row, usageEventId: undefined }, { usageEventId: 'no-tokens' }]);
  assert.equal(events, 4); assert.equal(daily.reduce((a, b) => a + b.value, 0), 126); assert.equal(partial, true);
});
test('missing history differs from a verified empty usage response', () => {
  assert.equal(normalizeCodex({}, { dailyUsageBuckets: null }, '2026-10').monthly, null);
  assert.equal(normalizeCodex({}, { dailyUsageBuckets: [] }, '2026-10').monthly, 0);
  assert.equal(normalizeCodex({}, { dailyUsageBuckets: [{ startDate: '2026-06-01', tokens: 12 }] }, '2026-04').monthly, null);
  assert.throws(() => normalizeCodex({}, { dailyUsageBuckets: [{ startDate: '2026-10-01', tokens: -1 }] }, '2026-10'));
  assert.equal(normalizeEleven({ character_count: 25, character_limit: 100 }, null, '2026-10').monthly, null);
});
test('daily aggregation respects selected month and merges model rows', () => {
  assert.deepEqual(dailySeries('2026-10', [{ date: '2026-09-30', value: 8 }, { date: '2026-10-01', value: 3 }, { date: '2026-10-01', value: 7 }]), [{ date: '2026-10-01', value: 10 }]);
});
