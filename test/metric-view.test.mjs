import test from 'node:test';
import assert from 'node:assert/strict';
import { activityReading, activityCaption, balanceReading, allowanceMarkup, allowanceSummary } from '../src/metric-view.mjs';
import { dashboardView } from '../src/dashboard-view.mjs';
import { desktopView } from '../src/desktop-view.mjs';
import { wideView } from '../src/wide-view.mjs';
import { miniView } from '../src/mini-view.mjs';

const card = { id:'ollama', title:'Ollama Cloud', kind:'api', status:'ready', monthly:null, unit:'tokens', daily:[], windows:[{label:'Session',percent:100},{label:'Weekly',percent:18.1}], creditBalances:[{label:'Purchased credit balance',value:0,unit:'USD'}] };
test('absent activity never borrows an allowance; balances never borrow a cost or cap warning', () => {
  assert.equal(activityReading(card),'Not reported');
  assert.equal(activityReading({...card,monthly:0}),'0 tok');
  assert.equal(activityReading({...card,monthly:5500,unit:'credits',partial:true}),'~5.5K cr');
  assert.equal(activityCaption({...card,id:'claude'},'2026-11'),'Nov · tokens · this Mac');
  assert.equal(balanceReading({...card,creditBalances:[],apiCost:{total:18.35,unit:'USD'}}).text,'—');
  const claude={...card,id:'claude',creditBalances:[{label:'Fable allowance remaining',value:198.38,unit:'USD',allowance:true}],paidUsage:{capReached:true,used:21.31,limit:20,unit:'USD'}};
  assert.equal(balanceReading(claude).text,'$198.38');
  assert.doesNotMatch(balanceReading(claude).title,/Cap reached/);
  assert.match(allowanceMarkup(claude),/Cap reached · paid usage unavailable/);
  assert.match(allowanceSummary(claude),/\$21.31 used of \$20.00/);
});
test('all layouts keep the same metric meaning and preserve the input snapshot', () => {
  const snapshot={month:'2026-11',settings:{},cards:[structuredClone(card)],demo:true};
  const before=JSON.stringify(snapshot);
  for(const render of [s=>desktopView(s,'overview',''),s=>dashboardView(s),s=>wideView(s,'overview'),s=>miniView(s)]) {
    const html=render(snapshot);
    assert.match(html,/Not reported/); assert.match(html,/Nov · tokens/);
    assert.match(html,/Session/); assert.match(html,/100% used/);
    assert.match(html,/Purchased credit balance/); assert.match(html,/\$0.00/);
    assert.doesNotMatch(html,/(?:desk-reading|display-reading|instrument-reading|mini-reading)[^>]*>100%/);
    assert.equal(JSON.stringify(snapshot),before);
  }
});
test('all active reported pools retain their original numbers; expired pools stay absent', () => {
  const c={...card,windows:[{label:'Live',percent:123.4},{label:'Old',percent:90,resetsAt:1},{label:'Missing',percent:null}]};
  assert.match(allowanceMarkup(c),/123.4% used/);
  assert.doesNotMatch(allowanceMarkup(c),/>Old<|>Missing</);
  assert.match(allowanceMarkup(c),/width="100"/);
});
