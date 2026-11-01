import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as model from '../src/model.mjs';
import { creditSection } from '../src/credit-view.mjs';

test('Codex history from another month never creates a selected-month zero', () => {
  const limits = { rateLimits: {} };
  assert.equal(model.normalizeCodex(limits, { dailyUsageBuckets: [{ startDate: '2026-10-31', tokens: 50 }] }, '2026-11').monthly, null);
  assert.equal(model.normalizeCodex(limits, { dailyUsageBuckets: [] }, '2026-11').monthly, 0);
  assert.equal(model.normalizeCodex(limits, { dailyUsageBuckets: [{ startDate: '2026-11-01', tokens: 0 }] }, '2026-11').monthly, 0);
});

test('successful empty Anthropic reading remains connected without inventing zero or demanding setup', async () => {
  const source = await readFile(new URL('../src/renderer.mjs', import.meta.url), 'utf8');
  const context = vm.createContext({ ...model, creditSection, window: { tokenlight: {} }, Date, Intl });
  vm.runInContext(source.slice(source.indexOf('const $'), source.indexOf('function render()')) + `
 globalThis.inspectCard = c => { snapshot = { month: '2026-11', demo: false }; return { connected: hasReading(c), html: card(c) }; };`, context);
  const card = context.inspectCard({ ...model.SOURCES.find(s => s.id === 'anthropic'), monthly: null, windows: [], daily: [], status: 'ready', lastUpdatedAt: Date.now() });
  assert.equal(card.connected, true);
  assert.doesNotMatch(card.html, /A little setup needed|Set up usage access/);
  assert.match(card.html, /Monthly usage not reported/);
  assert.match(card.html, /metric-value[^>]*>—/);
});
