import test from 'node:test';
import assert from 'node:assert/strict';
import { providerGroups } from '../src/provider-groups.mjs';
import { dashboardView } from '../src/dashboard-view.mjs';
import { desktopView } from '../src/desktop-view.mjs';
import { miniView } from '../src/mini-view.mjs';
import { wideView } from '../src/wide-view.mjs';
import { demoCards } from '../src/fixtures.mjs';
const snapshot = () => ({ month:'2026-11',demo:true,settings:{accountProfiles:{},targets:{}},cards:demoCards('2026-11',Date.parse('2026-11-02T00:00:00Z')) });
test('provider grouping preserves exact original sources, scopes, order and missing values',()=>{
 const s=snapshot(), before=structuredClone(s); s.cards[0].monthly=null;
 const groups=providerGroups(s.cards);
 assert.deepEqual(groups.map(g=>g.provider),['openai','anthropic','cursor','elevenlabs','ollama']);
 assert.deepEqual(groups[0].cards.map(c=>c.id),['codex','openai']);
 assert.deepEqual(groups[1].cards.map(c=>c.id),['claude','anthropic']);
 assert.equal(groups[0].cards[0],s.cards[0]); assert.equal(groups[0].cards[0].monthly,null);
 assert.equal(groups.flatMap(g=>g.cards).length,7); assert.equal(s.cards[1].monthly,before.cards[1].monthly);
 assert.equal(providerGroups([{id:'unknown-a',title:'A'},{id:'unknown-b',title:'B'}]).length,2);
});
test('all Overview presentations retain seven separately scoped sources inside five providers',()=>{
 const s=snapshot(), before=JSON.stringify(s);
 for(const [html,groupClass] of [[dashboardView(s),'monitor-provider'],[desktopView(s,'overview',''),'desk-provider'],[miniView(s),'mini-provider'],[wideView(s,'overview'),'wide-provider']]){
  assert.equal((html.match(new RegExp('class="(?:monitor-source )?'+groupClass+'"','g'))||[]).length,5);
  for(const c of s.cards) assert.ok(html.includes(c.title));
 }
 assert.equal(JSON.stringify(s),before);
 const monitor=dashboardView(s); assert.equal((monitor.match(/class="monitor-stream"/g)||[]).length,7);
 for(const view of ['account','api']) assert.doesNotMatch(miniView(s,view),/class="mini-provider"/);
 assert.equal((dashboardView(s,'account').match(/class="monitor-stream"/g)||[]).length,3);
 assert.equal((dashboardView(s,'api').match(/class="monitor-stream"/g)||[]).length,4);
});
