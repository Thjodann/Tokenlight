import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import cachePolicy from '../src/credential-cache.cjs';

// Exercise the actual service while leaving Electron's window/bootstrap dormant.
const mainUrl = new URL('../src/main.cjs', import.meta.url);
const main = await readFile(mainUrl, 'utf8');
const require = createRequire(mainUrl);
function createService(providers) {
  const module = { exports: {} };
  const electron = {
    app: { requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }), getVersion: () => 'test' },
    nativeTheme: { shouldUseDarkColors: false }, Menu: {}
  };
  vm.runInNewContext(main + '\nmodule.exports = { Service, inject(value) { model = value.model; providers = value.providers; } };', {
    require: id => id === 'electron' ? electron : require(id), module,
    process: { env: {}, argv: [] }, __dirname: fileURLToPath(new URL('../src/', import.meta.url))
  });
  module.exports.inject({ model: { currentMonth: () => '2026-10', SOURCES: [{ id: 'openai', kind: 'api' }] }, providers });
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
