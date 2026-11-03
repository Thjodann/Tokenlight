import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedDays, activityPlot, insightGraphics } from '../src/usage-visuals.mjs';
import { demoCards } from '../src/fixtures.mjs';

test('plots keep zero distinct from missing and exclude impossible/future/negative readings', () => {
 const c = { title: 'Source', unit: 'tokens', daily: [{ date: '2026-01-01', value: 0 }, { date: '2026-01-03', value: 50 }, { date: '2026-01-32', value: 99 }, { date: '2026-01-04', value: -10 }, { date: '2026-02-01', value: 22 }, { date: '2026-01-31', value: 100 }] };
 assert.deepEqual(reportedDays(c, '2026-01', '2026-01-20').map(d => d.value), [0, 50]);
 const html = activityPlot({ ...c, daily: c.daily.slice(0, 2) }, '2026-01');
 assert.equal((html.match(/class="usage-bar"/g) || []).length, 2);
 assert.match(html, /2026-01-01: 0 tokens/); assert.match(html, /gaps are unreported/);
 assert.match(activityPlot({ ...c, daily: [] }, '2026-01'), /usage-missing/);
 assert.doesNotMatch(activityPlot({ ...c, daily: [] }, '2026-01'), /class="usage-bar"/);
});
test('graph labels are escaped and monetary charts keep value separate from known charges', () => {
 const cards = demoCards('2026-01'); cards[0].title = '<script>bad</script>';
 const s = { cards, settings: { accountProfiles: {}, targets: {} }, month: '2026-01' };
 const html = insightGraphics(s);
 assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
 assert.match(html, /Known cost/); assert.match(html, /Usage value/); assert.match(html, /not an extra charge/);
 assert.match(html, /visual-unknown/); assert.match(html, /rankings approximate/);
});

test('sparklines preserve gaps, observed zeroes and missing history', async () => {
 const { activityLine } = await import('../src/usage-visuals.mjs');
 const card = {title:'Test',unit:'tokens',daily:[{date:'2026-01-01',value:0},{date:'2026-01-02',value:10},{date:'2026-01-05',value:5}]};
 const html=activityLine(card,'2026-01');
 assert.match(html,/2026-01-01: 0 tokens/);
 assert.match(html,/class="line-stroke" d="M[^L]+L[^M]+M/);
 assert.equal((html.match(/<circle /g)||[]).length,3);
 const empty=activityLine({...card,daily:[]},'2026-01');
 assert.match(empty,/history not reported/);assert.match(empty,/line-gap/);assert.doesNotMatch(empty,/<circle /);
});
test('pop-out distributions omit absent values from arcs without inventing balances', async () => {
 const { dashboardInsights } = await import('../src/usage-visuals.mjs');
 const s={cards:demoCards('2026-01'),settings:{accountProfiles:{},targets:{}},month:'2026-01'};
 const html=dashboardInsights(s);
 assert.match(html,/monitor-orbits/);assert.match(html,/orbit-segment/);assert.match(html,/Usage value/);assert.match(html,/not an extra charge/);
 assert.doesNotMatch(html,/NaN|Infinity|visual-chart/);
 const empty=dashboardInsights({...s,cards:[]});assert.match(empty,/orbit-missing/);assert.doesNotMatch(empty,/class="orbit-segment"/);
});
