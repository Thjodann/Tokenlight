import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SOURCES } from '../src/model.mjs';
import { demoCards } from '../src/fixtures.mjs';
import { MARKS, providerFor, providerLogo } from '../src/provider-branding.mjs';
import { miniReading, miniCredit, miniView } from '../src/mini-view.mjs';
test('mini balance stays a balance even when the paid cap is reached', () => {
  const card = { paidUsage: { capReached: true, used: 21.31, limit: 20, unit: 'USD' }, creditBalances: [{ label: 'Fable allowance remaining', value: 198.38, unit: 'USD', allowance: true }] };
  assert.equal(miniCredit(card).text, '$198.38');
  assert.doesNotMatch(miniCredit(card).title, /Cap reached|\$21.31/);
  assert.match(miniCredit(card).title, /\$198.38/);
  assert.match(miniCredit(card).title, /allowance value, not a charge/);
});
import layout from '../src/layout.cjs';

test('all seven sources share five original, self-contained provider marks', () => {
  assert.equal(new Set(SOURCES.map(s => providerFor(s.id))).size, 5);
  assert.equal(providerFor('codex'), providerFor('openai'));
  assert.equal(providerFor('claude'), providerFor('anthropic'));
  for (const [id, mark] of Object.entries(MARKS)) {
    assert.match(providerLogo(id), /<img .*alt="" aria-hidden="true"/);
    const bytes = Buffer.from(mark.data.split(',')[1], 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), mark.sha256);
    if (mark.data.startsWith('data:image/svg')) {
      const svg = bytes.toString();
      assert.match(svg, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      assert.doesNotMatch(svg, /<script|<foreignObject|\bon\w+\s*=|\b(?:href|src)\s*=|<!ENTITY/i);
    }
  }
  assert.equal(providerLogo('unknown'), '');
});

test('mini metrics retain zero, units, incomplete history and unknown values', () => {
  assert.equal(miniReading({ monthly: 0, unit: 'tokens' }), '0 tok');
  assert.equal(miniReading({ monthly: 0, unit: 'credits', partial: true }), '~0 cr');
  assert.equal(miniReading({ monthly: null }), 'Not reported');
  assert.equal(miniReading({ monthly: null, status: 'setup' }), 'Not reported');
  assert.equal(miniReading({ monthly: null, windows: [{ percent: 100, resetsAt: Date.now() + 999999 }] }), 'Not reported');
  assert.equal(miniReading({ monthly: null, windows: [{ percent: 100, resetsAt: Date.now() - 1 }] }), 'Not reported');
  assert.equal(miniCredit({ creditBalances: [{ label: 'Available credits', value: 0, unit: 'credits' }] }).text, '0 cr');
  assert.equal(miniCredit({ paidUsage: { limit: 100, used: 2, unit: 'USD' } }).text, '—');
  assert.equal(miniCredit({ creditBalances: [{ label: 'Fable allowance remaining', value: 242.83, unit: 'USD', allowance: true }] }).text, '$242.83');
  assert.equal(miniCredit({ apiCost: { total: 0, unit: 'USD' } }).text, '—');
  assert.doesNotMatch(miniCredit({ apiCost: { total: 18.35, unit: 'USD' } }).title, /18.35/);
});

test('mini rows keep every source actionable, named and labeled as sample, partial or stale', () => {
  const cards = demoCards('2026-10'); cards[0].status = 'stale'; cards[0].error = '<script>bad</script>';
  const html = miniView({ month: '2026-10', demo: true, cards });
  assert.equal((html.match(/class="mini-row /g) || []).length, 7);
  for (const c of cards) assert.ok(html.includes(`Details for ${c.title}:`));
  assert.match(html, /SAMPLE DATA/); assert.match(html, /partial history/); assert.match(html, /Last reading · stale/);
  assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
});

test('native layout validates requests and restores the dashboard size after repeated mini requests', () => {
  let size = [1110, 740];
  const controller = new layout.LayoutController({ getSize: () => [...size], setSize: (w, h) => { size = [w, h]; } });
  controller.apply('mini'); assert.deepEqual(size, [360, 300]);
  controller.apply('mini'); controller.apply('dashboard'); assert.deepEqual(size, [1110, 740]);
  assert.throws(() => controller.apply('unknown')); assert.deepEqual(size, [1110, 740]);
  assert.equal(layout.normalizeLayout('old value'), 'dashboard');
  assert.deepEqual(layout.initialSize('260x180', 'dashboard'), [260, 180]);
  assert.deepEqual(layout.initialSize('320x240', 'mini'), [320, 240]);
  assert.deepEqual(layout.initialSize('260x179', 'mini'), [360, 300]);
  assert.deepEqual(layout.initialSize('9999x9999', 'dashboard'), [1320, 900]);
  const restored = new layout.LayoutController({ getSize: () => [260, 180], setSize: (w, h) => { size = [w, h]; } }, 'mini');
  restored.apply('dashboard'); assert.deepEqual(size, [1320, 900]);
});

test('entering explicit Mini from an automatic compact window still lets Full expand', () => {
  for (const compact of [[320, 240], [260, 180], [350, 740], [440, 440], [740, 320]]) {
    let size = compact;
    const controller = new layout.LayoutController({ getSize: () => size, setSize: (w, h) => { size = [w, h]; } });
    controller.apply('mini'); controller.apply('dashboard');
    assert.deepEqual(size, [1320, 900]);
  }
});

test('Mini filters account/API rows and provides a compact Insights summary',()=>{
 const cards=demoCards('2026-10'),snapshot={month:'2026-10',demo:true,cards,settings:{}};
 assert.equal((miniView(snapshot,'account').match(/class="mini-row /g)||[]).length,3);
 assert.equal((miniView(snapshot,'api').match(/class="mini-row /g)||[]).length,4);
 const insights=miniView(snapshot,'insights');assert.match(insights,/Mini insights/);assert.match(insights,/Known monthly cost/);assert.match(insights,/Favorite model/);
});
