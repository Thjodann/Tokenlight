import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardView, dashboardLayout } from '../src/dashboard-view.mjs';
import { demoCards } from '../src/fixtures.mjs';
const snapshot = () => ({ month: '2026-11', demo: true, settings: { accountProfiles: {}, targets: {} }, cards: demoCards('2026-11', Date.parse('2026-11-02T00:00:00Z')) });
test('all four display views are passive and preserve their source filter', () => {
  for (const [view, count] of [['overview', 7], ['account', 3], ['api', 4], ['insights', 7]]) {
    const html = dashboardView(snapshot(), view);
    assert.equal((html.match(/<article /g) || []).length, count);
    assert.doesNotMatch(html, /<(button|input|select|a|form)\b|data-action=|tabindex=/);
    assert.match(html, /SAMPLE DATA/); assert.match(html, /November 2026/);
    assert.match(html, /not an extra charge/);
    if (view === 'insights') assert.match(html, /Known monthly cost · USD/);
  }
});
test('display readings keep zero, missing, stale, credit cap and separate allowance semantics', () => {
  const s = snapshot();
  s.cards[0].monthly = 0; s.cards[0].status = 'stale';
  const claude = s.cards.find(c => c.id === 'claude'); claude.paidUsage = { capReached: true, used: 21.31, limit: 20, unit: 'USD' };
  const html = dashboardView(s);
  assert.match(html, /0 tok/); assert.match(html, /Stale reading/);
  assert.match(html, /Cap reached/); assert.match(html, /Paid usage unavailable/);
  assert.match(html, /separate reported allowance/); assert.match(html, /~7\.47M tok/);
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
