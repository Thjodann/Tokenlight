import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopView, reportedDays } from '../src/desktop-view.mjs';
import { wideView } from '../src/wide-view.mjs';
import { demoCards } from '../src/fixtures.mjs';
const snapshot = {month:'2026-10',settings:{},cards:demoCards('2026-10'),demo:true};
test('desktop and wide layouts expose an exhausted paid cap with or without a separate allowance', () => {
  for (const creditBalances of [[], [{ label:'Fable allowance remaining',value:198.38,unit:'USD',allowance:true }]]) {
    const s={...snapshot,cards:[{...snapshot.cards[1],creditBalances,paidUsage:{capReached:true,used:21.31,limit:20,unit:'USD'}}]};
    for (const desktop of [true,false]) {
      const html=wideView(s,'overview',{desktop});
      assert.match(html,/Cap reached/);
      assert.match(html,/paid usage unavailable/);
      assert.match(html,/\$21.31 used of \$20.00/);
    }
  }
});
test('desktop ledger preserves seven sources, filters and source details without stretched tiles', () => {
  for(const [view,count] of [['overview',7],['account',3],['api',4]]) {
    const html = wideView(snapshot,view,{desktop:true});
    assert.equal((html.match(/class="desk-source-row"/g)||[]).length,count);
    assert.doesNotMatch(html,/class="wide-instrument"/);
    assert.doesNotMatch(html,/style="/);
    assert.match(html,/Allowances · current/);assert.match(html,/Balances · current/);
    assert.match(html,/not an extra charge/);assert.match(html,/before credits \/ tax/);
  }
  assert.match(wideView(snapshot,'overview'),/class="wide-instrument"/);
  assert.match(wideView(snapshot,'insights',{desktop:true}),/Monthly provider costs/);
});
test('daily chart excludes future, invalid and other-month days while preserving reported zero and gaps', () => {
  const c={daily:[{date:'2026-10-01',value:0},{date:'2026-10-03',value:12},{date:'2026-10-04',value:20},{date:'2026-09-01',value:25},{date:'2026-10-32',value:3},{date:'2026-10-00',value:4},{date:'2026-10-02',value:null}]};
  assert.deepEqual(reportedDays(c,'2026-10','2026-10-03'),[{date:'2026-10-01',value:0},{date:'2026-10-03',value:12}]);
});
test('chart selection stays within active filter and missing history is explicit', () => {
  const html=desktopView(snapshot,'api','', 'claude');
  assert.doesNotMatch(html,/<option value="claude"/);
  assert.match(html,/<option value="openai" selected>/);
  const empty={...snapshot,cards:[{...snapshot.cards[0],daily:[],monthly:null,title:'<script>bad</script>',status:'stale'}]};
  const rendered=desktopView(empty,'overview','');
  assert.match(rendered,/Daily history unavailable/);assert.match(rendered,/Stale reading/);
  assert.doesNotMatch(rendered,/<script>/);assert.match(rendered,/&lt;script&gt;/);
});
