import test from 'node:test';
import assert from 'node:assert/strict';
import * as insights from '../src/insights.mjs';
const {monthlyInsights}=insights;
const activityMetrics=(...args)=>insights.activityMetrics(...args);
import {insightsPage} from '../src/insight-view.mjs';
import {desktopView} from '../src/desktop-view.mjs';
import {dashboardView} from '../src/dashboard-view.mjs';
import {miniView} from '../src/mini-view.mjs';
import {wideView} from '../src/wide-view.mjs';
import {mkdtemp,mkdir,writeFile,truncate,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {scanCodexLocal} from '../src/codex-local.mjs';
const model=(model,tokens,calls)=>({model,tokens,calls});
const card=(id,monthly,requestCount,modelUsage=[],extra={})=>({id,title:id,kind:'account',unit:'tokens',monthly,requestCount,modelUsage,status:'ready',...extra});
const snapshot=cards=>({month:'2026-11',settings:{},cards});
const invented=()=>snapshot([
 card('codex',9000000,3,[model('model-alpha',1200,3)],{activityScope:{kind:'local',partial:true}}),
 card('claude',200000,40,[model('model-beta',150000,30)],{partial:true}),
 card('cursor',400000,12,[model('model-gamma',300000,8),model('model-delta',null,4)]),
 card('openai',10000,5,[model('model-epsilon',10000,5)]),card('anthropic',0,0),
 card('elevenlabs',800,null,[],{unit:'credits'}),card('ollama',null,null,[],{rollingRequests:99})]);
test('invented mixed scopes produce separate useful token and interaction evidence',()=>{
 const i=monthlyInsights(invented());assert.equal(i.tokenActivity.sourceLeaders[0].id,'codex');assert.equal(i.tokenActivity.modelLeaders[0].model,'model-gamma');assert.equal(i.tokenActivity.modelLeaders[0].tokens,300000);assert.equal(i.tokenActivity.incompleteAttribution,true);
 assert.deepEqual(i.interactionActivity.map(g=>g.unit).sort(),['events','local active turns','local replies','requests'].sort());
 assert.equal(i.interactionActivity.find(g=>g.unit==='local replies').sourceLeaders[0].calls,40);
 assert.equal(i.interactionActivity.find(g=>g.unit==='local replies').modelLeaders[0].calls,30);
 assert.equal(i.tokenActivity.sources.some(r=>r.id==='elevenlabs'||r.id==='ollama'),false);
 assert.equal(activityMetrics(i).length,4);
});
test('model tokens require neither calls, known pricing nor equality with provider totals',()=>{
 const i=monthlyInsights(snapshot([card('codex',100000,null,[model('future-observed',400,null),model('codex-auto-review',999999,100),model('synthetic',999999,100)])]));
 assert.equal(i.tokenActivity.modelLeaders[0].model,'future-observed');assert.equal(i.tokenActivity.models.length,1);assert.equal(i.tokenActivity.incompleteAttribution,true);
 assert.equal(i.interactionActivity.length,0);
});
test('ties, zero, unknown and stale readings stay distinguishable without erasing observations',()=>{
 let i=monthlyInsights(snapshot([card('openai',20,2,[model('a',20,2)]),card('cursor',20,3,[model('b',20,3)],{status:'stale'})]));
 assert.equal(i.tokenActivity.sourceLeaders.length,2);assert.equal(i.tokenActivity.modelLeaders.length,2);assert.equal(i.tokenActivity.stale,true);
 i=monthlyInsights(snapshot([card('openai',0,0,[model('zero',0,0)])]));assert.equal(i.tokenActivity.sourceLeaders[0].tokens,0);assert.equal(i.tokenActivity.modelLeaders[0].tokens,0);assert.match(activityMetrics(i)[0].value,/0/);
 i=monthlyInsights(snapshot([card('openai',null,null)]));assert.equal(i.tokenActivity.sourceLeaders.length,0);assert.match(activityMetrics(i)[0].value,/Not reported/);
});
test('all renderer seams label source/model tokens and source/model interactions separately',()=>{
 const s=invented();for(const html of [insightsPage(s),miniView(s,'insights'),wideView(s,'insights'),desktopView(s,'overview','',null),dashboardView(s,'insights')]) {
  for(const label of ['Most recorded tokens','Model tokens','Source interactions','Model interactions'])assert.ok(html.includes(label),label);
  assert.doesNotMatch(html,/Not comparable|Favorite model/);assert.match(html,/model-gamma/);assert.match(html,/local active turns/);
 }
});
test('five large synthetic files share the byte budget instead of starving the fifth',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tokenlight-fair-scan-'));await mkdir(join(root,'sessions'));
 try{for(let n=0;n<5;n++){
 const file=join(root,'sessions',`rollout-2026-11-${n}.jsonl`);
 const usage={input_tokens:10,cached_input_tokens:0,output_tokens:2,reasoning_output_tokens:0,total_tokens:12};
 await writeFile(file,[{type:'session_meta',payload:{id:`invented-${n}`}},{type:'turn_context',payload:{model:`model-${n}`,turn_id:'turn'}},{type:'event_msg',timestamp:'2026-11-02T00:00:00Z',payload:{type:'token_count',info:{total_token_usage:usage,last_token_usage:usage}}}].map(JSON.stringify).join('\n')+'\n');
 await truncate(file,8*1024*1024);await utimes(file,new Date(1900000000000-n*1000),new Date(1900000000000-n*1000));
 }const r=await scanCodexLocal('2026-11',root);assert.equal(r.activityScope.scannedFiles,5);assert.equal(r.modelUsage.length,5);assert.ok(r.activityScope.scannedBytes<=16*1024*1024);assert.equal(r.activityScope.truncated,true);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('interaction ties and zero retain units, while model counts survive absent source counts',()=>{
 let i=monthlyInsights(snapshot([card('openai',0,0,[model('zero-a',0,0)]),card('anthropic',0,0,[model('zero-b',0,0)])]));
 const group=i.interactionActivity[0];assert.equal(group.unit,'requests');assert.equal(group.sourceLeaders.length,2);assert.equal(group.modelLeaders.length,2);assert.equal(group.sourceLeaders[0].calls,0);assert.ok(i.favorites.every(m=>m.calls===0));assert.equal(i.favorites.length,2);
 i=monthlyInsights(snapshot([card('codex',1000,null,[model('recorded-model',50,2)])]));assert.equal(i.interactionActivity[0].sourceLeaders.length,0);assert.equal(i.interactionActivity[0].modelLeaders[0].calls,2);assert.equal(i.tokenActivity.modelLeaders[0].tokens,50);
});
test('token and interaction leaders can differ without allocating an unattributed remainder',()=>{
 const s=snapshot([card('openai',1000,2,[model('token-model',800,1),model('frequent-model',200,1)]),card('cursor',50,9,[model('frequent-model',50,9)])]);
 const i=monthlyInsights(s);assert.equal(i.tokenActivity.sourceLeaders[0].id,'openai');assert.equal(i.tokenActivity.modelLeaders[0].model,'token-model');assert.equal(i.tokenActivity.modelLeaders[0].tokens,800);assert.equal(i.interactionActivity.find(g=>g.unit==='events').modelLeaders[0].model,'frequent-model');
});
test('compact values keep coverage visible and bound long tie labels without dropping tied evidence',()=>{
 const i=monthlyInsights(invented());assert.match(activityMetrics(i)[1].value,/partial attribution/);assert.match(activityMetrics(i)[2].value,/partial/);
 const ties=monthlyInsights(snapshot([card('openai',0,0,Array.from({length:5},(_,n)=>model(`zero-${n}`,0,0)))]));assert.equal(ties.tokenActivity.modelLeaders.length,5);assert.match(activityMetrics(ties)[1].value,/3 tied/);
});
