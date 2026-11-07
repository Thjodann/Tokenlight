import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { demoCards } from '../src/fixtures.mjs';
import { providerPanel, providerDetailItems } from '../src/provider-panel.mjs';
import { providerFor } from '../src/provider-branding.mjs';
const { DashboardWindows, SOURCE_PROVIDER, validProvider } = createRequire(import.meta.url)('../src/dashboard-windows.cjs');
const sample = () => ({ month: '2026-11', demo: true, settings: { showRemainingAllowance: false, accountProfiles: {}, secretsPath: '/private/fixture', savedKeys: ['invented'] }, cards: demoCards('2026-11'), appearance: { dark: true }, fileError: '/private/fixture' });
function windowEntry(windows, provider) { const w = new EventEmitter(); w.webContents = { mainFrame: {}, send() {} }; w.isDestroyed = () => false; return windows.add(w, { kiosk: true, view: 'providers', provider, month: '2026-11' }); }
test('provider validation matches existing branding and rejects inherited names and paths', () => {
  for (const [source, provider] of Object.entries(SOURCE_PROVIDER)) assert.equal(providerFor(source), provider);
  for (const id of ['constructor', '__proto__', '../openai', '', null, {}, ['cursor']]) assert.equal(validProvider(id), false);
});
test('each provider snapshot and rendered lane excludes every other provider and private configuration', () => {
  const windows = new DashboardWindows();
  for (const provider of new Set(Object.values(SOURCE_PROVIDER))) {
    const entry = windowEntry(windows, provider), raw = sample();
    raw.cards.forEach(c => { c.scope = 'private-account'; c.secretKey = 'invented-key'; c.error = '/private/fixture'; });
    const snapshot = windows.snapshot(entry, raw), markup = providerPanel(snapshot);
    for (const c of raw.cards) assert.equal(markup.includes(`data-source="${c.id}"`), SOURCE_PROVIDER[c.id] === provider);
    assert.doesNotMatch(JSON.stringify(snapshot), /private-account|invented-key|private\/fixture|savedKeys/);
    assert.equal(snapshot.cards.length, raw.cards.filter(c => SOURCE_PROVIDER[c.id] === provider).length);
  }
});
test('remaining labels, graphics and accessibility complement utilization while warnings use used values', () => {
  const s = sample(); s.cards = s.cards.filter(c => c.id === 'cursor'); s.cards[0].windows[0].percent = 96;
  let used = providerPanel(s, 'cursor');
  assert.match(used, /96% used/); assert.match(used, /data-percent="96"/); assert.match(used, /data-allowance-state="critical"/);
  s.settings.showRemainingAllowance = true;
  const remaining = providerPanel(s, 'cursor');
  assert.match(remaining, /4% remaining/); assert.match(remaining, /data-percent="4"/); assert.match(remaining, /data-allowance-state="critical"/);
  s.cards[0].windows[0].percent = 140;
  assert.match(providerPanel(s, 'cursor'), /0% remaining \(140% used\)/);
});
test('refresh keeps provider stable, replaces readings and does not sum account/API scopes', () => {
  const windows = new DashboardWindows(), entry = windowEntry(windows, 'anthropic'), raw = sample();
  const first = providerPanel(windows.snapshot(entry, raw));
  assert.equal((first.match(/class="provider-lane"/g) || []).length, 2);
  const units = raw.cards.filter(c=>SOURCE_PROVIDER[c.id]==='anthropic').map(c=>JSON.stringify(providerDetailItems(c,raw))).join(' ');
  assert.match(units,/local replies/); assert.match(units,/requests/);
  raw.cards.find(c => c.id === 'claude').monthly = 123456789;
  const next = providerPanel(windows.snapshot(entry, raw)); assert.notEqual(next, first); assert.equal(entry.provider, 'anthropic');
  raw.cards = raw.cards.filter(c => SOURCE_PROVIDER[c.id] !== 'anthropic');
  assert.match(providerPanel(windows.snapshot(entry, raw)), /No readings reported/); assert.equal(entry.provider, 'anthropic');
});
test('API without allowances and partial/missing/error readings stay unreported and escape identifiers', () => {
  const s = sample(), c = s.cards.find(c => c.id === 'anthropic'); s.cards = [c]; c.title = '<img onerror=bad>'; c.status = 'setup'; c.monthly = null; c.daily = []; c.apiCost = null; c.modelUsage = []; c.creditBalances = []; c.sourceLabel = '<script>bad</script>';
  const html = providerPanel(s, 'anthropic');
  assert.match(html, /Allowance not reported/); assert.match(html, /Model activity not reported/); assert.match(html, /Needs connection/); assert.match(html, /Activity[\s\S]*Not reported/);
  assert.doesNotMatch(html, /<script>|<img onerror|0 tok|data-percent=/);
  const detail = providerPanel(s, 'anthropic', 'micro', {detail:true,source:c.id,section:'scope'});
  assert.match(detail, /&lt;script&gt;/); assert.doesNotMatch(detail, /<script>/);
});

test('detail inventory retains every independent allowance, balance, model and long note', () => {
  const s=sample(),c=s.cards.find(c=>c.id==='claude');
  c.historyNote='Invented long note 🧭 '.repeat(150);
  c.windows=Array.from({length:17},(_,i)=>({label:`Invented pool ${i}`,percent:i+1,resetsAt:Date.now()+86400000}));
  c.creditBalances=Array.from({length:14},(_,i)=>({label:`Invented balance ${i}`,value:i+1,unit:'USD'}));
  c.modelUsage=Array.from({length:25},(_,i)=>({model:`invented-model-${i}`,calls:i+1,activityUnit:'local replies',total:100+i}));
  const items=providerDetailItems(c,s);
  assert.equal(items.allowances.length,34+(c.paidUsage?1:0));
  for(let i=0;i<17;i++)assert.ok(items.allowances.some(p=>p.text?.includes(`Invented pool ${i}`)));
  assert.equal(items.balances.length,14);
  assert.ok(items.scope.some(p=>p.text===c.historyNote));
  // Use the canonical insight inventory; display pagination must never top-N it.
  assert.equal(items.models.filter(p=>p.text).length,25);
  for(let i=0;i<25;i++)assert.ok(items.models.some(p=>p.text?.includes(`invented-model-${i} ·`)));
  const markup=providerPanel(s,'anthropic','micro',{detail:true,source:'claude',section:'models'});
  assert.doesNotMatch(markup,/data-source="anthropic"|data-source="cursor"/);
  assert.match(markup,/provider-reader-items/);assert.match(markup,/Previous detail page/);assert.match(markup,/Next detail page/);
});
