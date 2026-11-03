import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardView, dashboardLayout } from '../src/dashboard-view.mjs';
import { demoCards } from '../src/fixtures.mjs';
const snapshot = () => ({ month: '2026-11', demo: true, settings: { accountProfiles: {}, targets: {} }, cards: demoCards('2026-11', Date.parse('2026-11-02T00:00:00Z')) });
test('four display views allow only local filters and preserve their source filter', () => {
  for (const [view, count] of [['overview', 7], ['account', 3], ['api', 4], ['insights', 0]]) {
    const html = dashboardView(snapshot(), view);
    assert.equal((html.match(/<article /g) || []).length, count);
    assert.doesNotMatch(html, /<(input|select|a|form)\b|data-action=/);
    assert.equal((html.match(/data-dashboard-view=/g) || []).length, 4);
    assert.match(html, new RegExp(`data-dashboard-view="${view}"[^>]*aria-pressed="true"`));
    assert.match(html, /SAMPLE DATA/); assert.match(html, /Nov 2026/);
    assert.match(html, /not an extra charge/);
    assert.match(html, /Activity · 2026-11/);
    assert.match(html, /role="img"/);
  }
});
test('display readings keep zero, missing, stale, credit cap and separate allowance semantics', () => {
  const s = snapshot();
  s.cards[0].monthly = 0; s.cards[0].status = 'stale';
  const claude = s.cards.find(c => c.id === 'claude'); claude.paidUsage = { capReached: true, used: 21.31, limit: 20, unit: 'USD' };
  const html = dashboardView(s);
  assert.match(html, /0 tok/); assert.match(html, /Stale reading/);
  assert.match(html, /Cap reached/); assert.match(html, /paid usage unavailable/);
  assert.match(html, /Fable allowance remaining/); assert.match(html, /allowance value, not a charge/); assert.match(html, /~7\.47M tok/);
  assert.match(html, /Grok \/ Composer/); assert.match(html, /Third-party models/);
});
test('provider strings are escaped in passive display markup', () => {
  const s = snapshot(); s.cards[0].title = '<img src=x onerror=alert(1)>'; s.cards[0].windows[0].label = '<script>bad</script>';
  const html = dashboardView(s); assert.doesNotMatch(html, /<img src=x|<script>/); assert.match(html, /&lt;img/);
});
test('instrument grid fits every source at common and extreme sizes', () => {
  for (const [w, h] of [[250, 115], [310, 470], [760, 400], [1400, 650], [2500, 200], [3800, 1600]]) {
    for (const count of [3, 4, 7]) {
      const fit = dashboardLayout(w, h, count);
      assert.ok(fit.columns * fit.rows >= count); assert.ok(fit.columns <= count);
      assert.ok((h - (fit.rows - 1) * 10) / fit.rows > 0);
    }
  }
});
test('a tall sidebar keeps one instrument per row to retain room for each source metric', () => {
  for (const width of [248, 308, 508, 688]) for (const count of [3, 4, 7]) {
    const fit = dashboardLayout(width, 900, count);
    assert.equal(fit.columns, 1);
    assert.equal(fit.rows, count);
  }
});

test('micro dashboard avoids seven clipped single-column rows', () => {
  const layout = dashboardLayout(248, 106, 7);
  assert.equal(layout.columns, 2);
  assert.equal(layout.rows, 4);
});
