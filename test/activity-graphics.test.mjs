import test from 'node:test';
import assert from 'node:assert/strict';
import {insightsPage} from '../src/insight-view.mjs';
import {desktopView} from '../src/desktop-view.mjs';
import {dashboardView} from '../src/dashboard-view.mjs';
import {miniView} from '../src/mini-view.mjs';
const snapshot={month:'2026-11',settings:{},cards:[{id:'codex',title:'Codex',kind:'account',unit:'tokens',monthly:9000,requestCount:3,modelUsage:[{model:'model-alpha',tokens:1200,calls:3}],activityScope:{partial:true},windows:[]},{id:'claude',title:'Claude',kind:'account',unit:'tokens',monthly:2000,requestCount:40,modelUsage:[{model:'model-beta',tokens:1500,calls:30}],partial:true,windows:[]}]};
test('shared surfaces use graphic token lanes, a unit-specific frequency matrix and native disclosure',()=>{
 for(const html of [insightsPage(snapshot),desktopView(snapshot,'overview','',null),dashboardView(snapshot,'insights'),miniView(snapshot,'insights')]){
  assert.match(html,/class="activity-overview"/);assert.match(html,/<details class="activity-scope"/);assert.match(html,/<summary[^>]*aria-label="Activity scope and coverage"/);
  assert.match(html,/aria-label="Most recorded tokens"/);assert.match(html,/aria-label="Model tokens/);assert.match(html,/Source interactions/);assert.match(html,/Model interactions/);
  assert.match(html,/Local turns/);assert.match(html,/Local replies/);assert.match(html,/Partial/);
  assert.doesNotMatch(html,/class="insight-metric"><span>Source interactions/);
 }
});
test('graphic widths stay bounded, escaped and distinguish zero, missing, stale and ties',()=>{
 const s=structuredClone(snapshot);s.cards[0].status='stale';s.cards[0].monthly=0;s.cards[0].modelUsage=[{model:'<unsafe>',tokens:0,calls:0}];s.cards[1].monthly=0;s.cards[1].modelUsage=[{model:'other',tokens:0,calls:0}];
 const html=insightsPage(s);assert.match(html,/Stale/);assert.match(html,/tied/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/<unsafe>/);
 for(const m of html.matchAll(/class="activity-bar-fill" width="([^"]+)"/g))assert.ok(Number(m[1])>=0&&Number(m[1])<=100);
 const unknown=insightsPage({...s,cards:[]});assert.match(unknown,/Not reported/);assert.match(unknown,/activity-empty/);
});
test('long invented identifiers retain full evidence while every action unit has an independent row',()=>{
 const long='model-with-long-identifier-for-layout-check-12345';assert.ok(long.length>=40&&long.length<=50);
 const cards=['codex','claude','cursor','openai'].map((id,n)=>({id,title:id,unit:'tokens',monthly:100+n,requestCount:3+n,modelUsage:[{model:long+n,tokens:100+n,calls:3+n}]}));
 const html=insightsPage({...snapshot,cards});for(const unit of ['local active turns','local replies','events','requests'])assert.ok(html.includes(unit));
 assert.ok(html.includes(long));assert.match(html,/Full model identifiers/);assert.match(html,/Partial \(not a percentage\)/);
 assert.equal((html.match(/class="activity-frequency-row"/g)||[]).length,4);
 const dashboard=dashboardView({...snapshot,cards},'insights');assert.match(dashboard,/class="model-lollipop-name"/);for(const unit of ['local active turns','local replies','events','requests'])assert.ok(dashboard.includes('<small>'+unit+'</small>'));
});
