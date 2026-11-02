import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as insightModel from '../src/insights.mjs';
import cachePolicy from '../src/credential-cache.cjs';

// Exercise the actual service while leaving Electron's window/bootstrap dormant.
const mainUrl = new URL('../src/main.cjs', import.meta.url);
const main = await readFile(mainUrl, 'utf8');
const require = createRequire(mainUrl);
function createService(providers, sourceId = 'openai') {
  const module = { exports: {} };
  const electron = {
    app: { requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }), getVersion: () => 'test' },
    nativeTheme: { shouldUseDarkColors: false }, Menu: {}
  };
  vm.runInNewContext(main + '\nmodule.exports = { Service, inject(value) { model = value.model; providers = value.providers; insights = value.insights; } };', {
    require: id => id === 'electron' ? electron : require(id), module,
    process: { env: {}, argv: [] }, __dirname: fileURLToPath(new URL('../src/', import.meta.url))
  });
  module.exports.inject({ model: { currentMonth: () => '2026-10', SOURCES: [{ id: sourceId, kind: sourceId === 'claude' ? 'account' : 'api' }] }, providers, insights: insightModel });
  const service = new module.exports.Service();
  service.settings = { secretsPath: null, targets: {}, refreshMinutes: 5, keychainAllowed: {} };
  service.persist = async () => {};
  return service;
}

test('a fresh validated API cache is emitted on startup without another provider request', async () => {
  const service = createService({ loadCredentials: async () => ({ openai: 'fixture-key' }), readProvider: async () => assert.fail('fresh cache should be reused') });
  service.cache['2026-10:openai'] = { monthly: 123, scope: cachePolicy.fingerprint('fixture-key'), lastUpdatedAt: Date.now() };
  const emitted = [];
  service.emit = () => emitted.push(service.snapshot());
  assert.equal(service.snapshot().cards[0].monthly, undefined);
  await service.refresh('openai');
  assert.ok(emitted.some(snapshot => snapshot.cards[0].monthly === 123), 'the renderer must receive the validated cache');
});

test('a superseded in-flight response cannot replace the new credential reading', async () => {
  let credential = 'fixture-old', releaseOld, started;
  const oldStarted = new Promise(resolve => { started = resolve; });
  const oldResponse = new Promise(resolve => { releaseOld = resolve; });
  const service = createService({
    loadCredentials: async () => ({ openai: credential }),
    readProvider: async (_id, _month, options) => {
      if (options.credentials.openai === 'fixture-old') { started(); return oldResponse; }
      return { monthly: 222, scope: cachePolicy.fingerprint('fixture-new') };
    }
  });
  service.emit = () => {};
  const first = service.refresh('openai', true);
  await oldStarted;
  credential = 'fixture-new';
  await service.refresh('openai', true);
  releaseOld({ monthly: 111, scope: cachePolicy.fingerprint('fixture-old') });
  await first;
  assert.equal(service.snapshot().cards[0].monthly, 222);
  assert.equal(service.inflight.size, 0);
  assert.equal(service.busy.size, 0);
});


test('network failure keeps the last valid total with a stale state', async () => {
  class ProviderError extends Error { constructor() { super('Network unavailable'); this.code = 'network'; } }
  const service = createService({ ProviderError, loadCredentials: async () => ({ openai: 'fixture-key' }), readProvider: async () => { throw new ProviderError(); } });
  service.cache['2026-10:openai'] = { monthly: 123, scope: cachePolicy.fingerprint('fixture-key'), lastUpdatedAt: Date.now() - 600000 };
  service.emit = () => {};
  await service.refresh('openai', true);
  assert.equal(service.snapshot().cards[0].monthly, 123);
  assert.equal(service.snapshot().cards[0].status, 'stale');
});

test('layout preference persists without changing the reporting month or targets', async () => {
  const service = createService({}); const writes = [];
  service.settings.targets = { openai: 12345 }; service.emit = () => {};
  service.persist = async (file, value) => writes.push([file, value.layoutMode]);
  await service.setLayoutMode('mini');
  assert.equal(service.snapshot().settings.layoutMode, 'mini');
  assert.equal(service.snapshot().month, '2026-10');
  assert.equal(service.settings.targets.openai, 12345);
  assert.deepEqual(writes, [['settings.json', 'mini']]);
  await assert.rejects(service.setLayoutMode('bad'));
  assert.equal(service.settings.layoutMode, 'mini'); assert.equal(writes.length, 1);
  await service.setLayoutMode('dashboard'); assert.equal(service.snapshot().settings.layoutMode, 'dashboard');
});

test('local financial records persist without touching credentials, period or targets',async()=>{
 const s=createService({});s.emit=()=>{};s.settings.targets={openai:999};s.vault={openai:'fixture-only'};
 await s.setAccountProfile('openai',{field:'fee',month:'2026-10',value:20});
 assert.equal(s.settings.accountProfiles.openai.fees['2026-10'],20);assert.equal(s.vault.openai,'fixture-only');assert.equal(s.month,'2026-10');assert.equal(s.settings.targets.openai,999);
 await assert.rejects(s.setAccountProfile('unknown',{field:'fee',month:'2026-10',value:0}));
 const saved=s.settings;s.persist=async()=>{throw new Error('fixture write failure')};
 await assert.rejects(s.setAccountProfile('openai',{field:'metered',month:'2026-10',value:1}));assert.equal(s.settings,saved);
});

test('overlapping fee and charge saves retain both fields and concurrent appearance edits',async()=>{
 const s=createService({});s.emit=()=>{};let release;const gate=new Promise(r=>{release=r;});let writes=0;
 s.persist=async()=>{if(++writes===1)await gate;};
 const first=s.setAccountProfile('openai',{field:'fee',month:'2026-10',value:20});
 await Promise.resolve();
 const second=s.setAccountProfile('openai',{field:'metered',month:'2026-10',value:30});
 s.settings.colorMode='light';release();await Promise.all([first,second]);
 assert.equal(s.settings.accountProfiles.openai.fees['2026-10'],20);assert.equal(s.settings.accountProfiles.openai.metered['2026-10'],30);assert.equal(s.settings.colorMode,'light');
});


test('returning to Tokenlight bypasses Claude auth backoff and fresh-cache reuse after renewal', async () => {
  let calls = 0;
  const service = createService({ loadCredentials: async () => ({}), readProvider: async () => { calls++; return { monthly: 42 }; } }, 'claude');
  service.settings.keychainAllowed.claude = true;
  service.cache['2026-10:claude'] = { monthly: 10, lastUpdatedAt: Date.now() };
  service.errors['2026-10:claude'] = { code: 'setup', message: 'expired', retryAt: Date.now() + 300000 };
  await service.recheckClaude();
  assert.equal(service.snapshot().cards[0].status, 'ready');
  assert.equal(service.snapshot().cards[0].monthly, 42);
  await service.recheckClaude(); assert.equal(calls, 1, 'focus changes cannot flood Claude');
});

test('automatic Claude checks preserve Keychain consent and provider rate limits', async () => {
  const service = createService({ loadCredentials: async () => ({}), readProvider: async () => assert.fail('must not read') }, 'claude');
  await service.recheckClaude();
  service.settings.keychainAllowed.claude = true;
  service.errors['2026-10:claude'] = { code: 'rate_limit', retryAt: Date.now() + 300000 };
  await service.recheckClaude();
});

test('an expired Claude token makes a recently cached reading due for a new check', async () => {
  let calls = 0;
  const service = createService({ loadCredentials: async () => ({}), readProvider: async () => { calls++; return { monthly: 43, sessionExpiresAt: Date.now() + 3600000 }; } }, 'claude');
  service.settings.keychainAllowed.claude = true;
  service.cache['2026-10:claude'] = { monthly: 10, lastUpdatedAt: Date.now(), sessionExpiresAt: Date.now() - 1000 };
  await service.refresh('claude'); assert.equal(calls, 1); assert.equal(service.snapshot().cards[0].monthly, 43);
});

test('independent dashboard periods share in-flight reads without moving the main month', async () => {
  const calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = createService({ loadCredentials: async () => ({ openai: 'fixture-key' }), readProvider: async (_id, month) => { calls.push(month); await gate; return { monthly: month === '2026-09' ? 111 : 222, scope: cachePolicy.fingerprint('fixture-key') }; } });
  service.emit = () => {};
  const reads = [service.refresh(null, true, false, '2026-09'), service.refresh(null, true, false, '2026-09'), service.refresh(null, true, false, '2026-10')];
  await new Promise(resolve => setImmediate(resolve)); release(); await Promise.all(reads);
  assert.deepEqual(calls.sort(), ['2026-09', '2026-10']);
  assert.equal(service.month, '2026-10');
  assert.equal(service.snapshot('2026-09').cards[0].monthly, 111);
  assert.equal(service.snapshot().cards[0].monthly, 222);
});
