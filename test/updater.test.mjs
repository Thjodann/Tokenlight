import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { Updates, updateMenuItems } = require('../src/updater.cjs');
function setup(options = {}) {
  const native = new EventEmitter(); const calls = [], timeouts = [], intervals = [];
  native.setFeedURL = x => calls.push(['feed', x]);
  native.checkForUpdates = () => calls.push(['check']);
  native.quitAndInstall = () => calls.push(['install']);
  const timers = { setTimeout: (fn, delay) => { const t = { fn, delay }; timeouts.push(t); return t; }, setInterval: (fn, delay) => { const t = { fn, delay }; intervals.push(t); return t; }, clearTimeout: t => { t.cleared = true; }, clearInterval: t => { t.cleared = true; } };
  const updates = new Updates({ native, version: '0.6.8', enabled: true, timers, now: () => 123, ...options });
  return { updates, native, calls, timeouts, intervals };
}
test('feed is fixed to publisher, architecture and actual app version', () => {
  const { calls } = setup(); assert.deepEqual(calls, [['feed', { url: 'https://update.electronjs.org/Thjodann/Tokenlight/darwin-arm64/0.6.8' }]]);
});
test('unsigned and development builds never initialize or check the native updater', () => {
  const { updates, calls, timeouts } = setup({ enabled: false }); updates.start(); updates.check();
  assert.deepEqual(calls, []); assert.deepEqual(timeouts, []); assert.equal(updates.snapshot().status, 'unavailable');
});
test('background checks wait 30 seconds, repeat every six hours and stop cleanly', () => {
  const { updates, native, calls, timeouts, intervals } = setup(); updates.start(); updates.start();
  assert.equal(timeouts.length, 1); assert.equal(timeouts[0].delay, 30000); assert.equal(intervals[0].delay, 21600000);
  timeouts[0].fn(); assert.equal(calls.filter(x => x[0] === 'check').length, 1);
  native.emit('update-not-available'); assert.equal(updates.snapshot().checkedAt, 123);
  intervals[0].fn(); updates.stop(); assert.ok(intervals[0].cleared); assert.equal(native.listenerCount('error'), 0);
  updates.check(); assert.equal(calls.filter(x => x[0] === 'check').length, 2);
});
test('concurrent manual and periodic checks cause only one native download', () => {
  const { updates, native, calls } = setup(); updates.check(); updates.check(); native.emit('update-available'); updates.check();
  assert.equal(calls.filter(x => x[0] === 'check').length, 1); assert.equal(updates.snapshot().status, 'downloading');
});
test('download completion never restarts or closes any window', async () => {
  const { updates, native, calls } = setup(); updates.check(); native.emit('update-available'); native.emit('update-downloaded', {}, '<b>untrusted</b>', 'v0.6.9');
  updates.check(); assert.equal(updates.snapshot().status, 'ready'); assert.equal(updates.snapshot().version, '0.6.9');
  assert.equal(calls.filter(x => x[0] === 'install').length, 0);
  native.emit('error', new Error('late background error')); assert.equal(updates.snapshot().status, 'ready');
});
test('explicit restart waits for pending settings writes and is single-flight', async () => {
  let flush; const pending = new Promise(resolve => { flush = resolve; });
  const { updates, native, calls } = setup({ beforeRestart: () => pending });
  assert.equal(await updates.restart(), false); native.emit('update-downloaded', {}, '', '0.6.9');
  const first = updates.restart(); assert.equal(await updates.restart(), false); assert.equal(calls.filter(x => x[0] === 'install').length, 0);
  flush(); assert.equal(await first, true); assert.equal(calls.filter(x => x[0] === 'install').length, 1);
});
test('failed preparation retains downloaded update and allows a later restart', async () => {
  const { updates, native, calls } = setup({ beforeRestart: async () => { throw new Error('disk unavailable'); } });
  native.emit('update-downloaded', {}, '', '0.6.9'); assert.equal(await updates.restart(), false); assert.equal(updates.snapshot().status, 'ready');
  updates.beforeRestart = async () => {}; assert.equal(await updates.restart(), true); assert.equal(calls.filter(x => x[0] === 'install').length, 1);
});
test('disabled automatic downloads allow explicit checks and retain a pending update', () => {
  const { updates, native, calls, timeouts } = setup({ automatic: false }); updates.start(); timeouts[0].fn(); assert.equal(calls.length, 1);
  updates.check(); native.emit('update-downloaded', {}, '', '0.6.9'); updates.setAutomatic(false); updates.setAutomatic(true);
  assert.equal(updates.snapshot().status, 'ready'); assert.equal(calls.filter(x => x[0] === 'check').length, 1);
  assert.throws(() => updates.setAutomatic('true'));
});
test('native failures are sanitized and a later manual check can retry', () => {
  const { updates, native, calls } = setup(); updates.check(); native.emit('error', new Error('https://secret.example/token=PRIVATE'));
  assert.equal(updates.snapshot().status, 'error'); assert.ok(!JSON.stringify(updates.snapshot()).includes('PRIVATE'));
  updates.check(); native.emit('update-not-available'); assert.equal(updates.snapshot().status, 'idle'); assert.equal(calls.filter(x => x[0] === 'check').length, 2);
});
test('menu exposes readiness and restart only after download, with no automatic install', async () => {
  const { updates, native, calls } = setup(); let shown = 0, confirmed = 0;
  let items = updateMenuItems(updates, async () => shown++, async () => confirmed++); items[0].click(); assert.equal(shown, 1);
  native.emit('update-downloaded', {}, '', '0.6.9'); items = updateMenuItems(updates, async () => shown++, async () => confirmed++);
  assert.equal(items[1].label, 'Restart to Update'); items[1].click(); assert.equal(confirmed, 1); assert.equal(calls.filter(x => x[0] === 'install').length, 0);
});
test('release configuration and privileged actions stay outside the renderer', async () => {
  const [main, build, preload] = await Promise.all(['src/main.cjs','scripts/build.mjs','src/preload.cjs'].map(p => readFile(p,'utf8')));
  assert.ok(build.includes('tokenlightUpdates: release')); assert.ok(main.includes("require('../package.json').tokenlightUpdates === true"));
  assert.ok(!main.includes('TOKENLIGHT_UPDATE_URL')); assert.ok(main.includes("handle('restart-update'"));
  assert.ok(main.includes("buttons: ['Restart to Update', 'Later'], defaultId: 1, cancelId: 1"));
  assert.ok(!preload.includes('setFeedURL')); assert.ok(!preload.includes('quitAndInstall'));
});

async function serviceFixture() {
  const vm = await import('node:vm'); const { fileURLToPath } = await import('node:url');
  const mainUrl = new URL('../src/main.cjs', import.meta.url), localRequire = createRequire(mainUrl), module = { exports: {} }, toggles = [];
  const app = { requestSingleInstanceLock: () => true, on() {}, whenReady: () => ({ then() {} }), getVersion: () => '0.6.9' };
  vm.runInNewContext(await readFile(mainUrl, 'utf8') + '\nmodule.exports = { Service, inject() { model = { SOURCES: [], currentMonth: () => "2026-11" }; updates = { snapshot: () => ({}), setAutomatic: value => __toggles.push(value) }; } };', {
    require: id => id === 'electron' ? { app, nativeTheme: { shouldUseDarkColors: true }, Menu: {} } : localRequire(id), module, __toggles: toggles,
    process: { env: {}, argv: [] }, __dirname: fileURLToPath(new URL('../src/', import.meta.url))
  });
  module.exports.inject(); const service = new module.exports.Service(); service.emit = () => {};
  service.settings = { automaticUpdates: true, secretsPath: '/private/fixture.env', colorMode: 'dark', targets: { openai: 42 }, accountProfiles: { codex: { planFee: 20 } }, keychainAllowed: { claude: true } };
  return { service, toggles };
}
test('update preference writes serialize and preserve unrelated settings and connection configuration', async () => {
  const { service, toggles } = await serviceFixture(), before = JSON.parse(JSON.stringify(service.settings)), writes = [];
  service.persist = async (_name, settings) => { writes.push(JSON.parse(JSON.stringify(settings))); };
  await Promise.all([service.setAutomaticUpdates(false), service.setAutomaticUpdates(true)]);
  assert.deepEqual(writes.map(x => x.automaticUpdates), [false, true]); assert.deepEqual(toggles, [false, true]);
  assert.deepEqual(JSON.parse(JSON.stringify(service.settings)), before);
});
test('failed preference persistence leaves automatic updates and connection settings unchanged', async () => {
  const { service, toggles } = await serviceFixture(), before = JSON.stringify(service.settings);
  service.persist = async () => { throw new Error('disk full'); };
  await assert.rejects(service.setAutomaticUpdates(false), /disk full/);
  assert.equal(JSON.stringify(service.settings), before); assert.deepEqual(toggles, []);
  await assert.rejects(service.setAutomaticUpdates(1));
});
