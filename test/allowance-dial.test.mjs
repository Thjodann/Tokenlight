import test from 'node:test';
import assert from 'node:assert/strict';
import { dialSegments, allowancePools, allowanceAmount, allowanceDial, allowanceLegend } from '../src/allowance-dial.mjs';
import { desktopView } from '../src/desktop-view.mjs';
import { demoCards } from '../src/fixtures.mjs';

test('segmented arcs preserve fractional usage and bound only their painted extent', () => {
  for (const percent of [0,.6,2.9,34,67,99.9,100,112]) {
    const segments=dialSegments(percent);
    assert.equal(segments.length,12);
    assert.ok(Math.abs(segments.reduce((sum,s)=>sum+s.fraction,0)-Math.min(percent,100)/100*12)<1e-10);
    assert.ok(segments.every(s=>s.fraction>=0&&s.fraction<=1&&!s.track.includes('NaN')));
  }
  assert.equal(dialSegments(0).filter(s=>s.fill).length,0);
  assert.equal(dialSegments(100).filter(s=>s.fill).length,12);
  assert.deepEqual(dialSegments(null),[]);
  assert.deepEqual(dialSegments(30,NaN),[]);
  assert.deepEqual(dialSegments(30,88,0),[]);
  assert.deepEqual(dialSegments(30,88,1.5),[]);
});

test('each active provider pool keeps its own number, label and reset without mutating records', () => {
  const cards=demoCards('2026-11');
  cards[1].windows.push({label:'Expired',percent:88,resetsAt:new Date(Date.now()-1000).toISOString()});
  const before=structuredClone(cards), pools=allowancePools(cards);
  assert.deepEqual(cards,before);
  assert.equal(pools.length,8);
  assert.equal(pools.filter(p=>p.card.id==='claude').length,3);
  assert.ok(!pools.some(p=>p.label==='Expired'));
  const claude=pools.filter(p=>p.card.id==='claude');
  const html=allowanceDial(claude)+allowanceLegend(claude);
  for(const number of [67,42,2.9]) assert.match(html,new RegExp(`data-percent="${number}"`));
  assert.match(html,/Fable · weekly/);
  assert.match(html,/Resets/);
});

test('missing allowances stay unknown and no token budget is inferred from activity or percentages', () => {
  const unknown=allowanceDial([])+allowanceLegend([]);
  assert.match(unknown,/Current allowance not reported/);
  assert.match(unknown,/No fixed token budget supplied/);
  assert.doesNotMatch(unknown,/0%|data-percent=/);
  assert.equal(allowanceAmount({percent:50,monthly:1000,unit:'tokens'}),null);
  assert.equal(allowanceAmount({used:100,limit:200}),null);
  assert.equal(allowanceAmount({used:100,limit:200,unit:'tokens'}),'100 / 200 tokens');
  assert.equal(allowanceAmount({used:27.5,limit:100,unit:'USD'}),'$27.50 / $100.00');
  const over={label:'Cycle <script>',percent:112,card:{title:'Provider <script>'}};
  const html=allowanceDial([over])+allowanceLegend([over]);
  assert.match(html,/112% used/);
  assert.doesNotMatch(html,/<script>/);
  assert.match(html,/&lt;script&gt;/);
});

test('provider instruments preserve separate account and API activity below current allowances', () => {
  const snapshot={month:'2026-11',settings:{},cards:demoCards('2026-11'),demo:true};
  const before=structuredClone(snapshot), html=desktopView(snapshot,'overview','');
  assert.equal((html.match(/class="desk-provider"/g)||[]).length,5);
  assert.equal((html.match(/data-action="details"/g)||[]).length,7);
  assert.match(html,/aria-label="Allowances · current"/);
  assert.match(html,/Activity · Nov/);
  assert.match(html,/Balances · current/);
  assert.match(html,/174.2K \/ 500K credits · Resets/);
  assert.match(html,/data-id="codex"/);
  assert.match(html,/data-id="openai"/);
  assert.doesNotMatch(html,/partial · partial/);
  assert.deepEqual(snapshot,before);
});
