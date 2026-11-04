import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import * as model from '../src/model.mjs';
import * as demoData from '../src/demo-data.mjs';
import * as insights from '../src/insights.mjs';
import cachePolicy from '../src/credential-cache.cjs';

const now = Date.parse('2026-11-02T12:00:00Z');
const mainUrl = new URL('../src/main.cjs', import.meta.url), main = await readFile(mainUrl, 'utf8'), require = createRequire(mainUrl);
function createService(providers = {}, saved = {}) {
  const module = { exports: {} }, writes = [];
  const electron = { app: { requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }), getVersion: () => 'test', getPath: () => '/fixture' }, nativeTheme: { shouldUseDarkColors: false }, Menu: {} };
  vm.runInNewContext(main + '\nmodule.exports = { Service, inject(value) { model = value.model; providers = value.providers; insights = value.insights; demoData = value.demoData; } };', {
    require: id => id === 'electron' ? electron : id === 'node:fs/promises' ? { mkdir: async () => {}, access: async () => { throw new Error('absent'); } } : require(id),
    module, process: { env: {}, argv: [] }, __dirname: fileURLToPath(new URL('../src/', import.meta.url))
  });
  module.exports.inject({ model: { ...model, currentMonth: () => '2026-11' }, providers, insights, demoData });
  const service = new module.exports.Service();
  service.settings = { secretsPath: '/private/fixture-secrets.env', targets: { openai: 999123456 }, refreshMinutes: 5, keychainAllowed: {}, colorMode: 'dark', layoutMode: 'dashboard', accountProfiles: { openai: { createdAt: '1901-03-11', fees: { '2026-11': 98765.43 }, metered: { '2026-11': 87654.32 } } }, ...saved };
  service.persist = async (name, value) => writes.push([name, JSON.parse(JSON.stringify(value))]);
  service.emit = () => {};
  return { service, writes };
}

test('demo readings randomize independently of real data and retain coherent native units', () => {
  const first = demoData.createDemoData('2026-11', now, 'seed-a'), repeated = demoData.createDemoData('2026-11', now, 'seed-a'), next = demoData.createDemoData('2026-11', now, 'seed-b');
  assert.deepEqual(first, repeated, 'repainting or another window must not change the dataset');
  assert.equal(first.cards.length, 7);
  for (const [index, card] of first.cards.entries()) {
    assert.notEqual(card.monthly, next.cards[index].monthly);
    assert.equal(card.daily.length, 2, 'current-month samples do not invent future activity');
    assert.equal(card.monthly, card.daily.reduce((sum, day) => sum + day.value, 0));
    assert.equal(card.unit, card.id === 'elevenlabs' ? 'credits' : 'tokens');
    for (const window of card.windows) assert.ok(window.percent >= 0 && window.percent <= 100);
    for (const balance of card.creditBalances) if (Number.isFinite(balance.limit)) assert.ok(Math.abs(balance.value + balance.used - balance.limit) < 0.011);
    for (const row of card.modelUsage) assert.equal(row.tokens, row.input + row.output + row.cacheRead + row.cacheWrite + row.cacheWriteLong);
  }
});

test('demo projection hides connection paths, real fees, targets, ages, errors and sign-in state', async () => {
  const { service, writes } = createService({ loadCredentials: async () => assert.fail('demo must not read credentials'), readProvider: async () => assert.fail('demo must not read providers') });
  const original = JSON.stringify(service.settings);
  service.vault = { openai: 'fixture-only-secret' }; service.fileError = 'private/path/error'; service.vaultError = 'private-vault-error'; service.claudeSignIn = { message: 'private-account-sign-in', pending: true };
  service.cache['2026-11:openai'] = { monthly: 123456789, scope: 'private-scope' };
  const snapshot = await service.setDemoMode(true);
  const serialized = JSON.stringify({ snapshot, insights: insights.monthlyInsights(snapshot, now) });
  for (const privateValue of ['/private/', 'fixture-only-secret', 'private/path', 'private-vault', 'private-account', '123456789', 'private-scope', '999123456', '98765.43', '87654.32', '1901-03-11']) assert.ok(!serialized.includes(privateValue), privateValue);
  assert.equal(snapshot.demo, true); assert.equal(snapshot.settings.secretsPath, null); assert.deepEqual(snapshot.settings.savedKeys, []);
  await service.refresh(null, true); await service.recheckClaude();
  assert.equal(writes.length, 1); assert.equal(writes[0][0], 'settings.json'); assert.equal(writes[0][1].demoMode, true);
  const preserved = JSON.parse(JSON.stringify(service.settings)); delete preserved.demoMode;
  assert.equal(JSON.stringify(preserved), original);
  assert.equal(service.cache['2026-11:openai'].monthly, 123456789);
  await assert.rejects(service.saveKey('openai', 'fixture-secret-1234'), /Turn off Demo/);
  await assert.rejects(service.setAccountProfile('openai', { field: 'fee', month: '2026-11', value: 10 }), /Turn off Demo/);
});

test('demo preference survives startup without any provider reads', async () => {
  const { service } = createService();
  service.read = async (name, fallback) => name === 'settings.json' ? { demoMode: true } : fallback;
  await service.init();
  assert.equal(service.demo, true); assert.equal(service.snapshot().demo, true);
});

test('entering demo during credential loading prevents the provider request and cache mutation', async () => {
  let release;
  const credentials = new Promise(resolve => { release = resolve; });
  const { service, writes } = createService({ loadCredentials: () => credentials, readProvider: async () => assert.fail('late credential read must not start a request') });
  const pending = service.refresh('openai', true);
  await service.setDemoMode(true); release({ openai: 'fixture-key' }); await pending;
  assert.equal(Object.keys(service.cache).length, 0); assert.equal(writes.filter(([name]) => name === 'usage-cache.json').length, 0);
});

test('entering demo discards late success and restores live data when disabled', async () => {
  let release, started, calls = 0;
  const begun = new Promise(resolve => { started = resolve; }), response = new Promise(resolve => { release = resolve; });
  const { service, writes } = createService({
    loadCredentials: async () => ({ openai: 'fixture-key' }),
    readProvider: async id => { if (id === 'openai' && ++calls === 1) { started(); return response; } return { monthly: 222, scope: cachePolicy.fingerprint('fixture-key') }; }
  });
  const pending = service.refresh('openai', true); await begun;
  await service.setDemoMode(true); release({ monthly: 111, scope: cachePolicy.fingerprint('fixture-key') }); await pending;
  assert.equal(service.cache['2026-11:openai'], undefined); assert.equal(service.inflight.size, 0); assert.equal(service.busy.size, 0);
  await service.setDemoMode(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(service.demo, false); assert.equal(service.settings.demoMode, false);
  assert.equal(service.snapshot('2026-11').cards.find(card => card.id === 'openai').monthly, 222);
  assert.equal(writes.filter(([name]) => name === 'settings.json').length, 2);
});

test('a failed disable persistence keeps sample data on and malformed toggles are rejected', async () => {
  const { service } = createService({ loadCredentials: async () => assert.fail('must stay in demo') });
  await service.setDemoMode(true);
  service.persist = async () => { throw new Error('fixture disk error'); };
  await assert.rejects(service.setDemoMode(false), /Demo mode is still on/);
  assert.equal(service.demo, true); assert.equal(service.settings.demoMode, true);
  await assert.rejects(service.setDemoMode('false'), /Choose whether/);
});

test('a demo export stays synthetic if live mode resumes while its save dialog is open', async () => {
  const { service } = createService({ loadCredentials: async () => ({}), readProvider: async () => ({ monthly: 999123456 }) });
  await service.setDemoMode(true);
  let save, release, chosenName;
  const written = [], dialog = new Promise(resolve => { release = resolve; });
  const start = main.indexOf("  handle('export', async (_entry) => {");
  const end = main.indexOf('\n  const showUpdates', start);
  assert.ok(start > 0 && end > start);
  vm.runInNewContext(main.slice(start, end), {
    handle: (_channel, handler) => { save = handler; }, service, insights, window: {},
    dialog: { showSaveDialog: async (_window, options) => { chosenName = options.defaultPath; return dialog; } },
    fs: { writeFile: async (file, content) => written.push({ file, data: JSON.parse(content) }) }
  });
  const exporting = save();
  await service.setDemoMode(false);
  release({ canceled: false, filePath: '/fixture/demo-export.json' });
  await exporting;
  assert.match(chosenName, /^Tokenlight-demo-/);
  assert.equal(written[0].data.demo, true);
  assert.equal(written[0].data.sources.length, 7);
  assert.ok(!JSON.stringify(written[0]).includes('999123456'));
});
