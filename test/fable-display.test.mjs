import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeClaude } from '../src/model.mjs';
import { balanceReading, allowanceMarkup } from '../src/metric-view.mjs';
import { creditSection } from '../src/credit-view.mjs';
import { desktopView } from '../src/desktop-view.mjs';
import { dashboardView } from '../src/dashboard-view.mjs';
import { miniView } from '../src/mini-view.mjs';
import { wideView } from '../src/wide-view.mjs';
const money = amount_minor => ({amount_minor, exponent:2, currency:'USD'});
const card = () => ({id:'claude',title:'Claude Code',kind:'account',status:'ready',plan:'pro',unit:'tokens',daily:[],monthly:199710000,partial:true,
  ...normalizeClaude({seven_day_fable:{utilization:21.4369628,limit_dollars:250,used_dollars:53.592407,remaining_dollars:196.407593,resets_at:'2099-11-05T07:59:00Z'},spend:{enabled:false,used:money(2131),limit:money(2000)},extra_usage:{spend_limit_reached:true}})});
test('Fable weekly value cannot masquerade as spendable paid credits',()=>{
  const c=card(), b=balanceReading(c);
  assert.equal(b.text,'$196.41');
  assert.match(b.label,/weekly meter/i);
  assert.match(b.title,/not a paid credit balance/i);
  assert.equal(c.windows[0].percent,21.4369628);
  assert.equal(c.paidUsage.used,21.31);
  assert.equal(c.paidUsage.limit,20);
  assert.equal(c.creditBalances[0].value,196.407593);
});
test('weekly meter and monthly paid cap have distinct labels and Pro access guidance',()=>{
  const c=card(), html=allowanceMarkup(c), details=creditSection(c,true);
  assert.match(html,/Fable.*weekly/i);
  assert.match(html,/Paid spending.*month/);
  assert.match(html,/21.4% used/);
  assert.match(html,/\$21.31.*\$20.00/);
  assert.match(details,/Pro.*Fable uses paid credits/);
  assert.match(details,/Weekly allowance meter/);
  assert.match(details,/Paid spending/);
  assert.match(details,/Monthly spend cap reached/);
  assert.doesNotMatch(html,/Paid · month/);
});
test('every dashboard layout distinguishes the Fable meter and monthly paid spending without mutating data',()=>{
  const snapshot={month:'2026-11',settings:{},demo:true,cards:[card()]}, before=JSON.stringify(snapshot);
  for(const render of [s=>desktopView(s,'overview',''),s=>dashboardView(s),s=>miniView(s),s=>wideView(s,'overview')]){
    const html=render(snapshot);
    assert.match(html,/weekly meter/i);
    assert.match(html,/Paid spending.*month/);
    assert.match(html,/\$196.41/);
    assert.match(html,/\$21.31/);
    assert.match(html,/\$20.00/);
    assert.equal(JSON.stringify(snapshot),before);
  }
});

test('pop-outs communicate paid cap visually without explanatory paragraphs',()=>{
  const html=dashboardView({month:'2026-11',settings:{},cards:[card()],demo:true});
  assert.match(html,/monitor-spend is-reached/);
  assert.match(html,/monitor-spend-lock/);
  assert.match(html,/monitor-spend-track/);
  assert.match(html,/>Paid \/ mo</);
  assert.match(html,/>Fable · week</);
  assert.doesNotMatch(html,/class="fable-access-note"|class="metric-paid-limit|<p\b/);
});
