import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentMonth,normalizeCursor } from '../src/model.mjs';
import { activityRow,aggregateActivity } from '../src/activity.mjs';
import { priceFor,usageValue } from '../src/pricing.mjs';
import { sourceCost,monthlyInsights,monthlyFee,accountAge,applyProfileChange,validateProfileChange } from '../src/insights.mjs';
import { openaiCosts } from '../src/openai-cost.mjs';
import { claudeLocal } from '../src/providers.mjs';
import { financeDetails,insightsPage } from '../src/insight-view.mjs';
import { wideView } from '../src/wide-view.mjs';
import { demoCards } from '../src/fixtures.mjs';
import layout from '../src/layout.cjs';
const month=currentMonth(), now=Date.now();
const account={id:'claude',title:'Claude Code',kind:'account',lastUpdatedAt:now};
const snapshot=(cards,accountProfiles={})=>({month,cards,settings:{accountProfiles},demo:false});

test('fee, extra spending and included allowance value never merge',()=>{
 const card={...account,monthly:0,creditBalances:[{label:'Fable allowance',value:242.83,unit:'USD',allowance:true}],paidUsage:{used:7,limit:100,unit:'USD'}};
 const settings={accountProfiles:{claude:{fees:{[month]:100}}}};
 assert.equal(sourceCost(card,settings,month).total,107);
 assert.equal(sourceCost(card,settings,month).value.total,0);
 settings.accountProfiles.claude.metered={[month]:0};
 assert.equal(sourceCost(card,settings,month).total,100,'local amount overrides provider amount rather than adding it');
 assert.equal(sourceCost({...card,lastUpdatedAt:Date.UTC(2020,0,1)}, {accountProfiles:{}},month).metered,null);
 assert.equal(sourceCost(card,settings,'2020-01').metered,null,'current paid usage cannot leak into historical cost');
});
test('unknown cost stays unknown; explicit zero is valid and subtotal coverage is visible',()=>{
 assert.equal(sourceCost(account,{},month).total,null);
 assert.equal(sourceCost({id:'openai'}, {},month).total,null,'implicit zero fixed fee is not a measured cost');
 const cards=[{...account,apiCost:{total:2,month,unit:'USD'}},{id:'cursor',title:'Cursor',kind:'account'}];
 const i=monthlyInsights(snapshot(cards,{claude:{fees:{[month]:100}}}));
 assert.equal(i.total,102);assert.equal(i.completeSources,1);assert.equal(i.rows[1].total,null);
 assert.equal(sourceCost({...account,apiCost:{total:10,month,unit:'EUR'}},{},month).metered,null);
});
test('fee schedules preserve past prices and clearing marks later months unknown',()=>{
 let s={};s.accountProfiles=applyProfileChange(s,'claude',{field:'fee',month:'2025-01',value:200});
 s.accountProfiles=applyProfileChange(s,'claude',{field:'fee',month:'2025-03',value:100});
 s.accountProfiles=applyProfileChange(s,'claude',{field:'fee',month:'2025-04',value:null});
 assert.equal(monthlyFee(s,'claude','2025-02'),200);assert.equal(monthlyFee(s,'claude','2025-03'),100);assert.equal(monthlyFee(s,'claude','2025-05'),null);
 s.accountProfiles=applyProfileChange(s,'claude',{field:'metered',month:'2025-03',value:0});assert.equal(s.accountProfiles.claude.metered['2025-04'],undefined);
});
test('local inputs validate date and currency precision, including explicit free plans',()=>{
 assert.doesNotThrow(()=>validateProfileChange({field:'fee',month,value:0}));
 for(const value of [-1,NaN,Infinity,'20',.001,1000001])assert.throws(()=>validateProfileChange({field:'fee',month,value}));
 assert.throws(()=>validateProfileChange({field:'createdAt',value:'2025-02-30'}));
 assert.throws(()=>validateProfileChange({field:'createdAt',value:'2999-01-01'}));
 assert.throws(()=>validateProfileChange({field:'fee',month:'1900-01',value:20}));
 assert.throws(()=>validateProfileChange({field:'unknown',value:1}));
 const age=accountAge('2020-01-01',Date.UTC(2025,0,1));assert.ok(age.years>4.99&&age.years<5.01);assert.equal(accountAge(null),null);
});
test('model values price cache reads/writes separately and unknown models stay unpriced',()=>{
 const row=activityRow({uncached_input_tokens:1e6,output_tokens:1e6,cache_read_input_tokens:1e6,cache_creation:{ephemeral_5m_input_tokens:1e6,ephemeral_1h_input_tokens:1e6}},'anthropic','claude-sonnet-5-5',5);
 assert.equal(row.tokens,5e6);assert.equal(usageValue({modelUsage:[row]}).total,18.6);
 assert.equal(priceFor('gpt-4.1-2025-04-14').model,'gpt-4.1');
 assert.equal(priceFor('claude-4.5-sonnet').model,'claude-sonnet-4-5');
 assert.equal(priceFor('claude-opus-5-5-max-fast'),null,'do not silently price special variants as standard');
 assert.equal(usageValue({modelUsage:[{...row,model:'unknown'}]}).total,null);
 assert.equal(usageValue({modelUsage:[{...row,model:'unknown',valueUSD:0}]}).total,0,'reported zero event value is valid');
 const audio=activityRow({input_tokens:100,output_tokens:10,input_audio_tokens:50},'openai','gpt-4.1',1);
 assert.equal(usageValue({modelUsage:[audio]}).total,null);
});
test('model aggregation preserves counts while an unknown token reading does not become zero',()=>{
 const one=activityRow({inputTokens:10,outputTokens:5,totalCents:1.5},'cursor','test',1);
 const rows=aggregateActivity([one,one,activityRow({},'cursor','no-tokens',1)]);
 assert.equal(rows.find(m=>m.model==='test').calls,2);assert.equal(rows.find(m=>m.model==='test').valueUSD,.03);
 assert.equal(rows.find(m=>m.model==='no-tokens').tokens,null);assert.equal(rows.find(m=>m.model==='no-tokens').calls,1);
});
test('ranking compares measured calls rather than incompatible units and keeps age opt-in',()=>{
 const row=activityRow({inputTokens:10,outputTokens:5,totalCents:1},'cursor','model-a',10);
 const i=monthlyInsights(snapshot([{...account,requestCount:4,monthly:1e9,modelUsage:[{...row,calls:4}]},{id:'cursor',title:'Cursor',requestCount:10,monthly:50,modelUsage:[row]},{id:'elevenlabs',title:'ElevenLabs',monthly:999999999,unit:'credits'}],{claude:{createdAt:'2020-01-01'}}));
 assert.equal(i.mostUsed.id,'cursor');assert.equal(i.favorite.model,'model-a');assert.equal(i.favorite.calls,14);assert.equal(i.callSources,2);assert.equal(i.oldest.id,'claude');
});
test('Cursor event deduplication and month bounds also apply to model metrics',()=>{
 const e={usageEventId:'one',timestamp:String(Date.UTC(2025,0,4)),model:'test',tokenUsage:{inputTokens:10,outputTokens:5,totalCents:2}};
 const v=normalizeCursor({},[e,e,{...e,usageEventId:'outside',timestamp:String(Date.UTC(2025,1,1))}],'2025-01');
 assert.equal(v.requestCount,1);assert.equal(v.modelUsage[0].calls,1);assert.equal(v.modelUsage[0].valueUSD,.02);assert.equal(v.monthly,15);
});
test('OpenAI cost pages keep fractional dollars, signed adjustments and fail closed on truncation',async()=>{
 let calls=0;const cost=await openaiCosts('2025-01',async()=>++calls===1?{data:[{results:[{amount:{value:.003,currency:'usd'}}]}],has_more:true,next_page:'two'}:{data:[{results:[{amount:{value:-.001,currency:'usd'}}]}],has_more:false},{});
 assert.equal(cost.total,.002);assert.equal(cost.month,'2025-01');
 assert.equal((await openaiCosts('2025-01',async()=>({data:[],has_more:false}),{})).total,0);
 await assert.rejects(openaiCosts('2025-01',async()=>({data:[],has_more:true}),{}));
 await assert.rejects(openaiCosts('2025-01',async()=>({data:[{results:[{amount:{value:1,currency:'eur'}}]}],has_more:false}),{}));
});
test('Claude log activity deduplicates streaming messages without reading unrelated text into output',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tokenlight-model-test-'));
 try {
  const row={type:'assistant',sessionId:'fixture',timestamp:'2025-01-02T12:00:00Z',message:{id:'message',model:'claude-sonnet-5-5',content:[{text:'private prompt must not persist'}],usage:{input_tokens:10,output_tokens:5,cache_read_input_tokens:100}}};
  await writeFile(join(dir,'session.jsonl'),[row,{...row,message:{...row.message,usage:{...row.message.usage,output_tokens:10}}},{...row,timestamp:'2024-12-31T12:00:00Z'}].map(r=>JSON.stringify(r)).join('\n'));
  const result=await claudeLocal('2025-01',dir);assert.equal(result.requestCount,1);assert.equal(result.monthly,120);assert.equal(result.modelUsage[0].calls,1);assert.doesNotMatch(JSON.stringify(result),/private prompt/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('wide dashboard retains all seven sources, separate Cursor pools and cost navigation',()=>{
 const s={...snapshot(demoCards(month)),demo:true};const html=wideView(s,'overview');
 assert.equal((html.match(/class="wide-instrument"/g)||[]).length,7);assert.match(html,/Third-party models/);assert.match(html,/Grok \/ Composer/);assert.match(html,/SAMPLE DATA/);assert.match(html,/data-view="insights"/);
 let size=[1280,300];const c=new layout.LayoutController({getSize:()=>size,setSize:(w,h)=>{size=[w,h];}});c.apply('mini');c.apply('dashboard');assert.deepEqual(size,[1280,300]);
});
test('finance and leaderboard markup escape untrusted model labels and label averaged prices',()=>{
 const card={...account,modelUsage:[activityRow({input_tokens:10,output_tokens:5},'anthropic','<img onerror=alert(1)>',1)]};
 const s=snapshot([card]);assert.doesNotMatch(financeDetails(card,s),/<img onerror/);assert.match(insightsPage(s),/&lt;img/);assert.match(financeDetails(card,s),/No age is inferred|no age is inferred/);
});

test('provider model list-price costs take precedence and a positive bill prevents an unsupported zero value',()=>{
 const row=activityRow({input_tokens:1000000,output_tokens:0},'anthropic','claude-sonnet-5-5',10);
 const c={modelUsage:[row],apiCost:{total:1,models:[{model:row.model,listAmount:4}]}};
 assert.equal(usageValue(c).total,4);assert.equal(usageValue(c).models[0].priceBasis,'Provider list-price report');
 assert.equal(usageValue({monthly:0,apiCost:{total:1}}).total,null);
});
