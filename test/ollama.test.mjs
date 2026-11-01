import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOllama } from '../src/ollama.mjs';
import { readProvider, loadCredentials } from '../src/providers.mjs';
import { demoCards } from '../src/fixtures.mjs';
const usage = { from: '2026-10-01T00:00:00Z', until: '2026-11-01T00:00:00Z', totals: { request_count: 5 }, buckets: [{ from: '2026-10-01T00:00:00Z', input_tokens: 100, cached_input_tokens: 80, output_tokens: 20 }] };
const balance = { included: { balance_usd: 75, allowance_usd: 100, period: { until: '2026-11-15T00:00:00Z' } }, purchased: { balance_usd: 25 } };
test('Ollama separates token totals, credits, and provider billing reset', () => {
 const r = normalizeOllama(usage, balance, '2026-10'); assert.equal(r.monthly, 120); assert.equal(r.windows[0].percent, 25); assert.match(r.balanceSummary, /75.00.*25.00/); assert.equal(r.windows[0].resetsAt, Date.parse(balance.included.period.until));
});
test('Ollama rolling history retains earlier observed days without double counting', () => {
 const r=normalizeOllama({...usage,from:'2026-10-02T00:00:00Z'},balance,'2026-10',{historyFrom:Date.parse(usage.from),daily:[{date:'2026-10-01',value:500},{date:'2026-10-02',value:30}]}); assert.equal(r.monthly,150);
 assert.equal(normalizeOllama(usage,balance,'2026-09').monthly,null);
});
test('Ollama legacy counts never become zero tokens and remaining percentage is inverted', () => {
 const r=normalizeOllama({...usage,buckets:[{from:usage.from,request_count:5}]},{included:{weekly:{remaining_percent:75,resets_at:'2026-11-15T00:00:00Z'}},purchased:{balance_usd:0}},'2026-10');assert.equal(r.monthly,null);assert.equal(r.windows[0].percent,25);assert.equal(r.partial,true);
 assert.throws(()=>normalizeOllama(usage,{...balance,purchased:{balance_usd:'unknown'}},'2026-10'));
});
test('Ollama reads only the usage and balance endpoints with a bearer key', async () => {
 const original=globalThis.fetch;const requests=[];
 globalThis.fetch=async(url,options)=>{requests.push([String(url),options]);return new Response(JSON.stringify(String(url).includes('/balance')?balance:usage));};
 try{const r=await readProvider('ollama','2026-10',{credentials:{ollama:'fixture-key'}});assert.equal(r.monthly,120);assert.equal(requests.length,2);assert.ok(requests.every(([url,o])=>url.startsWith('https://ollama.com/api/')&&o.headers.Authorization==='Bearer fixture-key'&&!o.method));}finally{globalThis.fetch=original;}
});
test('all seven demo sources have finite metrics',()=>{const cards=demoCards('2026-10');assert.equal(cards.length,7);assert.ok(cards.every(c=>Number.isFinite(c.monthly)));});

test('Ollama cached readings are isolated when its key rotates', async()=>{
 const {default:policy}=await import('../src/credential-cache.cjs');const cache={'2026-10:ollama':{scope:policy.fingerprint('old-key'),monthly:10}};const scopes={};policy.reconcileCredentials(cache,{},scopes,{ollama:'new-key'});assert.equal(cache['2026-10:ollama'],undefined);assert.equal(policy.cacheAllowed('ollama',{scope:policy.fingerprint('old-key')},scopes),false);
});
