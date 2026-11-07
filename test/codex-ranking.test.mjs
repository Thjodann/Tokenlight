import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyInsights } from '../src/insights.mjs';
const missing = {month:'2026-11',settings:{},cards:[{id:'codex',title:'Codex',monthly:10000000000},{id:'claude',title:'Claude Code',requestCount:366,modelUsage:[{model:'claude-opus-5-5',calls:366}]}]};
test('missing Codex counts cannot make Claude the global winner', () => {
 const i = monthlyInsights(missing);
 assert.equal(i.tokenActivity.sourceLeaders.length,0,'token units were not supplied');
 assert.equal(i.tokenActivity.modelLeaders.length,0,'no model tokens supplied');
 assert.equal(i.interactionActivity[0].unit,'local replies');
 assert.equal(i.favorites[0].model,'claude-opus-5-5','observed evidence remains available');
});

import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanCodexLocal,readCodexLocal } from '../src/codex-local.mjs';
import { readProvider } from '../src/providers.mjs';
import { normalizeCodex } from '../src/model.mjs';
import { insightsPage,financeDetails } from '../src/insight-view.mjs';
import { desktopView } from '../src/desktop-view.mjs';
import { dashboardView } from '../src/dashboard-view.mjs';
import { wideView } from '../src/wide-view.mjs';
import { miniView } from '../src/mini-view.mjs';
const tokens = (input,output=2,cached=1,reasoning=1) => ({input_tokens:input,cached_input_tokens:cached,output_tokens:output,reasoning_output_tokens:reasoning,total_tokens:input+output});
const meta = {type:'session_meta',payload:{id:'fixture-session',source:'cli',email:'PRIVATE_ACCOUNT',cwd:'PRIVATE_PATH'}};
const context = (model='gpt-6.1-sol',turn='one') => ({type:'turn_context',payload:{model,turn_id:turn,prompt:'PRIVATE_PROMPT'}});
const event = (total,last=total,date='2026-11-02T00:00:00Z') => ({type:'event_msg',timestamp:date,payload:{type:'token_count',info:{total_token_usage:total,last_token_usage:last},answer:'PRIVATE_ANSWER',tools:'PRIVATE_TOOLS',access_token:'PRIVATE_SECRET'}});
async function fixture(fn) {
 const root=await mkdtemp(join(tmpdir(),'tokenlight-codex-'));
 await mkdir(join(root,'sessions'));await mkdir(join(root,'archived_sessions'));
 const file=join(root,'sessions','rollout.jsonl');
 const save=async rows=>writeFile(file,rows.map(r=>typeof r==='string'?r:JSON.stringify(r)).join('\n')+'\n');
 try { await fn({root,file,save}); } finally {await rm(root,{recursive:true,force:true});}
}
test('local metadata dedupes cumulative snapshots, copied files and active turns, excludes zero/internal/unknown models',async()=>fixture(async({root,file,save})=>{
 const rows=[meta,context(),event(tokens(10)),event(tokens(10)),event(tokens(20,4,2,2),tokens(10)),context('gpt-6.1-terra','two'),event(tokens(30,6,3,3),tokens(10)),event(tokens(30,6,3,3),tokens(0,0,0,0)),context('codex-auto-review','internal'),event(tokens(40,8,4,4),tokens(10)),context('synthetic','fake'),event(tokens(50,10,5,5),tokens(10)),context('none','fake2'),event(tokens(60,12,6,6),tokens(10))];
 await save(rows);await writeFile(join(root,'archived_sessions','copy.jsonl'),await readFile(file));
 const before=await readFile(file,'utf8');const result=await scanCodexLocal('2026-11',root);
 assert.equal(result.requestCount,2);assert.equal(result.modelUsage.length,2);
 const sol=result.modelUsage.find(r=>r.model==='gpt-6.1-sol');assert.equal(sol.calls,1);assert.equal(sol.tokens,24);assert.equal(sol.input,18);assert.equal(sol.cacheRead,2);assert.equal(sol.output,4,'reasoning is a subset of output');
 assert.equal(result.modelUsage.find(r=>r.model==='gpt-6.1-terra').tokens,12);
 assert.equal(result.activityScope.partial,true);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|fixture-session|rollout|turn_id|payload/);
 assert.equal(await readFile(file,'utf8'),before,'logs remain unchanged');
}));
test('month boundaries use event dates and cumulative deltas; a model switch cannot inherit historical totals',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(100,20,10,10),undefined,'2026-10-31T23:59:59Z'),context('gpt-6.1-terra','nov'),event(tokens(110,22,11,11),tokens(10)),event(tokens(120,24,12,12),tokens(10),'2026-12-01T00:00:00Z')]);
 const result=await scanCodexLocal('2026-11',root);assert.equal(result.requestCount,1);assert.equal(result.modelUsage[0].model,'gpt-6.1-terra');assert.equal(result.modelUsage[0].tokens,12);
}));
test('first cumulative snapshot uses only its last delta; resets and repeated older events do not inflate usage',async()=>fixture(async({root,save})=>{
 const first=event(tokens(100,20,10,10),tokens(10));
 await save([meta,context(),first,event(tokens(110,22,11,11),tokens(10)),first,event(tokens(120,24,12,12),tokens(10)),context('gpt-6.1-terra','reset'),event(tokens(10),tokens(10))]);
 const result=await scanCodexLocal('2026-11',root);assert.equal(result.modelUsage.find(r=>r.model==='gpt-6.1-sol').tokens,36);assert.equal(result.modelUsage.find(r=>r.model==='gpt-6.1-terra').tokens,12);assert.equal(result.activityScope.gaps,true);
}));
test('empty, absent, malformed, missing-context, delta-only and zero usage stay honest',async()=>fixture(async({root,save})=>{
 assert.equal((await scanCodexLocal('2026-11',root)).requestCount,null);
 assert.equal((await scanCodexLocal('2026-11',join(root,'missing'))).requestCount,null);
 await save(['malformed',event(tokens(10)),context(),event(tokens(0,0,0,0)),event(null,tokens(10),'2026-11-03T00:00:00Z'),event(null,tokens(10),'2026-11-03T00:00:00Z'),event({...tokens(10),input_tokens:-1}),event(tokens(20),tokens(10),'bad-date')]);
 const r=await scanCodexLocal('2026-11',root);assert.equal(r.requestCount,1);assert.equal(r.modelUsage[0].tokens,12);assert.equal(r.activityScope.gaps,true);
}));
test('scan budgets bound bytes, entries, records and long transcript lines with explicit partial status',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(10)),{type:'message',text:'PRIVATE_LONG'.repeat(30000)},event(tokens(20,4,2,2),tokens(10))]);
 const limited=await scanCodexLocal('2026-11',root,{bytes:128});assert.equal(limited.activityScope.truncated,true);assert.ok(limited.activityScope.scannedBytes<=128);
 assert.equal((await scanCodexLocal('2026-11',root,{records:2})).activityScope.truncated,true);
 assert.equal((await scanCodexLocal('2026-11',root,{entries:0})).activityScope.truncated,true);
 const r=await scanCodexLocal('2026-11',root);assert.equal(r.activityScope.gaps,true);assert.equal(r.modelUsage[0].tokens,24);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_LONG/);
}));
test('cache shares scans and returns isolated sanitized results until its documented expiry',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(10))]);const first=await readCodexLocal('2026-11',root);first.modelUsage[0].calls=999;
 await save([meta,context('gpt-6.1-terra'),event(tokens(20))]);
 const second=await readCodexLocal('2026-11',root);assert.equal(second.modelUsage[0].calls,1);assert.equal(second.modelUsage[0].model,'gpt-6.1-sol');
}));
test('real Codex adapter chain preserves provider totals and allowances while adding scoped model evidence',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(10))]);
 const limits={rateLimits:{primary:{usedPercent:37,resetsAt:1900000000},credits:{balance:'12',hasCredits:true}}},usage={dailyUsageBuckets:[{startDate:'2026-11-02',tokens:10000000000}]};
 const methods=[];
 const result=await readProvider('codex','2026-11',{codexHome:root,withCodex:async(_,fn)=>fn(async method=>{methods.push(method);return method==='account/read'?{account:{type:'chatgpt',planType:'plus',email:'PRIVATE_ACCOUNT'}}:method==='account/rateLimits/read'?limits:usage;})});
 const provider=normalizeCodex(limits,usage,'2026-11');for(const key of ['monthly','daily','windows','creditBalances','partial']) assert.deepEqual(result[key],provider[key]);
 assert.equal(result.requestCount,1);assert.equal(result.modelUsage[0].tokens,12);assert.deepEqual(methods,['account/read','account/rateLimits/read','account/usage/read']);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
 const i=monthlyInsights({...missing,cards:[{id:'codex',title:'Codex',...result},missing.cards[1]]});assert.equal(i.tokenActivity.sourceLeaders[0].id,'codex');assert.equal(i.tokenActivity.incompleteAttribution,true);assert.equal(i.favorites.length,2);
}));
test('all insight surfaces expose missing and available local scopes without a global winner',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(10))]);const local=await scanCodexLocal('2026-11',root);
 for(const extra of [{},local]) {
  const s={...missing,cards:missing.cards.map(c=>({...c,kind:'account',daily:[],windows:[],status:'connected',...(c.id==='codex'?extra:{})}))};
  for(const html of [insightsPage(s),miniView(s,'insights'),wideView(s,'insights'),desktopView(s,'overview','',null),dashboardView(s,'insights')]) {assert.match(html,/Most recorded tokens/);assert.match(html,/Source interactions/);assert.doesNotMatch(html,/Not comparable/);assert.doesNotMatch(html,/approximate ranking|Most frequent in available records/);}
  if(extra.modelUsage) {assert.match(insightsPage(s),/local active turns/);assert.match(financeDetails(s.cards[0],s),/Local Codex active turns/);assert.match(financeDetails(s.cards[0],s),/partial coverage/);}
 }
}));
test('interaction evidence preserves ties, missing model counts and stale qualification',()=>{
 const cards=[{id:'openai',title:'OpenAI API',requestCount:5,modelUsage:[{model:'observed-model',calls:5}]},{id:'anthropic',title:'Anthropic API',requestCount:2,modelUsage:[{model:'another-model',calls:2}]}];
 let i=monthlyInsights({...missing,cards});assert.equal(i.interactionActivity[0].sourceLeaders[0].id,'openai');assert.equal(i.interactionActivity[0].modelLeaders[0].model,'observed-model');
 i=monthlyInsights({...missing,cards:[cards[0],{...cards[1],requestCount:5,modelUsage:[{model:'another-model',calls:5}]}]});assert.equal(i.interactionActivity[0].sourceLeaders.length,2);assert.equal(i.interactionActivity[0].modelLeaders.length,2);
 assert.equal(monthlyInsights({...missing,cards:[{...cards[0],modelUsage:[]}]}).interactionActivity[0].modelLeaders.length,0);
 assert.equal(monthlyInsights({...missing,cards:[{...cards[0],status:'stale'}]}).interactionActivity[0].sourceLeaders[0].stale,true);
});
test('unobserved cumulative jumps use only the known last generation and model switches keep distinct total turns',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(10)),context('gpt-6.1-terra'),event(tokens(100,20,10,10),tokens(10))]);
 const r=await scanCodexLocal('2026-11',root);assert.equal(r.requestCount,1);assert.equal(r.modelUsage.length,2);assert.ok(r.modelUsage.every(m=>m.calls===1&&m.tokens===12));assert.equal(r.activityScope.gaps,true);
}));
test('discovery prioritizes the requested month beyond the file cap, then recently active historical sessions',async()=>fixture(async({root})=>{
 const {utimes}=await import('node:fs/promises');
 for(let n=0;n<270;n++) {
  const file=join(root,'sessions',`rollout-2025-01-${String(n).padStart(3,'0')}.jsonl`);
  await writeFile(file,JSON.stringify(meta)+'\n');await utimes(file,new Date('2025-01-01'),new Date('2025-01-01'));
 }
 const current=join(root,'sessions','2026','11','06');await mkdir(current,{recursive:true});
 await writeFile(join(current,'requested.jsonl'),[meta,context(),event(tokens(10))].map(JSON.stringify).join('\n')+'\n');
 const continued=join(root,'sessions','rollout-2025-10-continued.jsonl');
 await writeFile(continued,[{...meta,payload:{id:'continued'}},context('gpt-6.1-terra'),event(tokens(10))].map(JSON.stringify).join('\n')+'\n');
 await utimes(continued,new Date('2026-11-06'),new Date('2026-11-06'));
 const result=await scanCodexLocal('2026-11',root,{files:2});
 assert.equal(result.requestCount,2);assert.equal(result.activityScope.scannedFiles,2);assert.equal(result.activityScope.discoveredFiles,272);assert.equal(result.activityScope.truncated,true);assert.equal(result.modelUsage.length,2);
 const standard=await scanCodexLocal('2026-11',root);assert.equal(standard.requestCount,2);assert.equal(standard.activityScope.scannedFiles,256);assert.equal(standard.activityScope.truncated,true);
 const discoveryLimited=await scanCodexLocal('2026-11',root,{entries:10});assert.ok(discoveryLimited.modelUsage.some(m=>m.model==='gpt-6.1-sol'));assert.equal(discoveryLimited.activityScope.truncated,true);
}));
test('bounded tails find current usage in a continued large historical session without inheriting prefix context',async()=>fixture(async({root,save})=>{
 await save([meta,context(),event(tokens(10),undefined,'2026-10-01T00:00:00Z'),{type:'message',text:'PRIVATE_OLD'.repeat(10000)},context('gpt-6.1-terra','continued'),event(tokens(100,20,10,10),tokens(10))]);
 const r=await scanCodexLocal('2026-11',root,{fileBytes:2000});assert.equal(r.requestCount,1);assert.equal(r.modelUsage[0].model,'gpt-6.1-terra');assert.equal(r.modelUsage[0].tokens,12);assert.equal(r.activityScope.truncated,true);assert.ok(r.activityScope.scannedBytes<=2000);
}));
test('cumulative resets can revisit older numerical snapshots in a different turn',async()=>fixture(async({root,save})=>{
 await save([meta,context('gpt-6.1-sol','first'),event(tokens(10)),event(tokens(20,4,2,2),tokens(10)),context('gpt-6.1-terra','reset'),event(tokens(10),tokens(10))]);
 const r=await scanCodexLocal('2026-11',root);assert.equal(r.requestCount,2);assert.equal(r.modelUsage.find(m=>m.model==='gpt-6.1-terra').tokens,12);assert.equal(r.activityScope.gaps,true);
}));
test('observed model units are explicit and charts normalize each unit separately without numeric ranks',()=>{
 const s={...missing,cards:[{id:'cursor',title:'Cursor',requestCount:100,modelUsage:[{model:'event-model',calls:100}]},{id:'claude',title:'Claude',requestCount:5,modelUsage:[{model:'reply-model',calls:5}]}]};
 const html=insightsPage(s);assert.doesNotMatch(html,/class="rank-number">\d/);assert.match(html,/each activity unit has its own scale/);assert.match(html,/reply-model · local replies/);assert.equal((html.match(/<rect width="100" height="3"/g)||[]).length,2,'different action units each get their own chart scale');
});
test('internal session origins and non-model contexts cannot produce preference evidence',async()=>fixture(async({root,save})=>{
 await save([{...meta,payload:{id:'internal',source:{subagent:'codex-auto-review'}}},context(),event(tokens(10))]);
 assert.equal((await scanCodexLocal('2026-11',root)).requestCount,null);
 await save([meta,context('test'),event(tokens(10)),context('gpt-future-observed','real'),event(tokens(20,4,2,2),tokens(10))]);
 const r=await scanCodexLocal('2026-11',root);assert.equal(r.modelUsage.length,1);assert.equal(r.modelUsage[0].model,'gpt-future-observed','observed models do not depend on the price catalog');
}));

test('desktop mileage has scoped units, no global ranks and bounded bars when later units have larger counts',()=>{
 const s={...missing,cards:[{id:'cursor',title:'Cursor',kind:'account',requestCount:2,modelUsage:[{model:'first-unit-model',calls:2}]},{id:'codex',title:'Codex',kind:'account',requestCount:900,modelUsage:[{model:'codex-observed-only',calls:900}]}]};
 const html=desktopView(s,'overview','',null);
 const list=html.slice(html.indexOf('<div class="desk-model-list">'));
 assert.doesNotMatch(list,/class="desk-rank">\d/);
 assert.match(list,/local active turns/);assert.match(list,/device only · partial/);assert.match(list,/events/);
 const widths=[...list.matchAll(/<rect width="([^"]+)"/g)].map(m=>Number(m[1]));
 assert.ok(widths.length>=4);assert.ok(widths.every(n=>Number.isFinite(n)&&n>=0&&n<=100),JSON.stringify(widths));
 assert.doesNotMatch(list,/Rankings are approximate/);
});
test('limited model lists include Codex despite many models in an earlier activity unit',()=>{
 const s={...missing,cards:[{id:'cursor',title:'Cursor',kind:'account',requestCount:1200,modelUsage:Array.from({length:15},(_,n)=>({model:`event-model-${n}`,calls:100-n}))},{id:'codex',title:'Codex',kind:'account',requestCount:1,modelUsage:[{model:'codex-observed-only',calls:1}]}]};
 for(const html of [insightsPage(s),miniView(s,'insights'),wideView(s,'insights'),desktopView(s,'overview','',null),dashboardView(s,'insights')]) assert.match(html,/codex-observed-only/);
});
