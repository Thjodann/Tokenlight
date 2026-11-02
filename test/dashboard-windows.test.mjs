import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { DashboardWindows } = createRequire(import.meta.url)('../src/dashboard-windows.cjs');
function browser() {
  const w = new EventEmitter(); w.destroyed = false; w.sent = [];
  w.webContents = { mainFrame: {}, send: (...args) => w.sent.push(args) };
  w.isDestroyed = () => w.destroyed;
  w.close = () => { w.destroyed = true; w.emit('closed'); };
  return w;
}
const event = w => ({ sender: w.webContents, senderFrame: w.webContents.mainFrame });
test('only registered top-level frames can read; kiosk frames cannot mutate', () => {
  const windows = new DashboardWindows(), main = browser(), kiosk = browser();
  windows.add(main, { month: '2026-11' }); windows.add(kiosk, { kiosk: true, month: '2026-11' });
  assert.equal(windows.authorize(event(main)).window, main);
  assert.equal(windows.authorize(event(kiosk), true).window, kiosk);
  assert.throws(() => windows.authorize(event(kiosk)), /read-only/);
  assert.throws(() => windows.authorize(event(browser()), true), /Unknown caller/);
  assert.throws(() => windows.authorize({ ...event(main), senderFrame: {} }, true), /Unknown caller/);
  assert.throws(() => windows.authorize({ ...event(main), senderFrame: null }, true), /Unknown caller/);
});
test('view copies, historical months and manual window closure remain independent', () => {
  const windows = new DashboardWindows(), main = browser(), kiosk = browser();
  const root = windows.add(main, { month: '2026-10', view: 'account', followCurrent: false });
  const display = windows.add(kiosk, { ...root, kiosk: true });
  windows.setView(root, 'api'); root.month = '2026-11'; root.followCurrent = true;
  assert.equal(display.view, 'account'); assert.equal(display.month, '2026-10');
  assert.throws(() => windows.setView(display, 'overview'));
  assert.throws(() => windows.setView(root, 'invalid'));
  windows.rollover('2026-12'); assert.equal(root.month, '2026-12'); assert.equal(display.month, '2026-10');
  assert.deepEqual(windows.months(), ['2026-12', '2026-10']);
  main.close(); assert.equal(windows.entries.size, 1); assert.equal(kiosk.destroyed, false);
  assert.throws(() => windows.authorize(event(main), true));
  kiosk.close(); assert.equal(windows.entries.size, 0);
});
test('broadcast selects each period and redacts connection configuration from displays', () => {
  const windows = new DashboardWindows(), main = browser(), one = browser(), two = browser();
  windows.add(main, { month: '2026-11' }); windows.add(one, { kiosk: true, month: '2026-10', view: 'api' }); windows.add(two, { kiosk: true, month: '2026-11' });
  windows.broadcast(month => ({ month, cards: [{ monthly: month === '2026-10' ? 111 : 222 }], appearance: { dark: true }, settings: { secretsPath: 'private-path', savedKeys: ['openai'], targets: { openai: 42 }, accountProfiles: {} }, fileError: 'private-path', vaultError: 'locked', claudeSignIn: { pending: true } }));
  const root = main.sent[0][1], historical = one.sent[0][1], current = two.sent[0][1];
  assert.equal(root.presentation.dashboard, false); assert.equal(root.settings.secretsPath, 'private-path');
  assert.equal(historical.cards[0].monthly, 111); assert.equal(current.cards[0].monthly, 222);
  assert.equal(historical.presentation.view, 'api'); assert.equal(historical.presentation.kiosk, true);
  assert.equal(historical.settings.secretsPath, undefined); assert.equal(historical.settings.savedKeys, undefined);
  assert.equal(historical.fileError, null); assert.equal(historical.claudeSignIn, null);
  assert.equal(historical.settings.targets.openai, 42); assert.equal(historical.appearance.dark, true);
});

// Bootstrap the real Electron entry with native surfaces replaced by inert doubles.
// This exercises handler wiring and lifecycle, not only the registry in isolation.
test('main bootstrap keeps kiosk IPC read-only and display windows alive after main closes', async () => {
  const { readFile } = await import('node:fs/promises');
  const vm = await import('node:vm');
  const model = await import('../src/model.mjs'), demoData = await import('../src/demo-data.mjs'), insights = await import('../src/insights.mjs');
  const require = createRequire(new URL('../src/main.cjs', import.meta.url));
  const app = new EventEmitter(), windows = [], handlers = new Map(); let focused, menu, boot, timer;
  Object.assign(app, { requestSingleInstanceLock: () => true, getVersion: () => 'test', getPath: () => '/fixture', setAccessibilitySupportEnabled() {}, quit() { this.didQuit = true; }, whenReady: () => ({ then(fn) { boot = fn(); } }) });
  class Window extends EventEmitter {
    constructor(options) { super(); this.options = options; this.destroyed = false; this.sent = []; this.webContents = new EventEmitter(); Object.assign(this.webContents, { mainFrame: {}, session: { setPermissionRequestHandler() {} }, setWindowOpenHandler() {}, send: (...args) => this.sent.push(args) }); windows.push(this); }
    static getFocusedWindow() { return focused; }
    isDestroyed() { return this.destroyed; }
    getSize() { return [this.options.width, this.options.height]; }
    setBackgroundColor() {}
    async loadFile() {}
    show() { focused = this; this.emit('focus'); }
    close() { this.destroyed = true; if (focused === this) focused = undefined; this.emit('closed'); if (windows.every(w => w.destroyed)) app.emit('window-all-closed'); }
  }
  const items = template => template.flatMap(i => [i, ...items(i.submenu || [])]);
  const electron = { app, BrowserWindow: Window, ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, Menu: { buildFromTemplate: template => ({ template, getMenuItemById: id => items(template).find(i => i.id === id) }), setApplicationMenu: value => { menu = value; }, getApplicationMenu: () => menu }, nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: true }), powerMonitor: new EventEmitter(), safeStorage: {}, dialog: {}, shell: {} };
  const fakeFS = { mkdir: async () => {}, access: async () => { throw new Error('Absent'); }, readFile: async () => { throw new Error('Absent'); } };
  class ProviderError extends Error {}
  let source = await readFile(new URL('../src/main.cjs', import.meta.url), 'utf8');
  source = source.replace("Promise.all([import('./model.mjs'), import('./providers.mjs'), import('./insights.mjs'), import('./demo-data.mjs')])", 'Promise.resolve(__modules)');
  vm.runInNewContext(source, { require: id => id === 'electron' ? electron : id === 'node:fs/promises' ? fakeFS : require(id), __modules: [model, { ProviderError }, insights, demoData], process: { env: {}, argv: ['--demo'] }, __dirname: '/fixture/src', setInterval: fn => { timer = fn; return { unref() {} }; } });
  await boot;
  const main = windows[0], call = (w, channel, ...args) => handlers.get(channel)(event(w), ...args);
  assert.equal((await call(main, 'get-snapshot')).value.presentation.dashboard, false);
  assert.equal(handlers.has('dashboard-mode'), false, 'main has no mode-conversion command');
  assert.equal((await call(main, 'set-window-view', 'api')).ok, true);
  assert.equal((await call(main, 'set-month', '2026-10')).ok, true);
  assert.equal((await call(main, 'new-dashboard-window')).ok, true);
  const kiosk = windows[1], display = (await call(kiosk, 'get-snapshot')).value;
  assert.equal(display.presentation.view, 'api'); assert.equal(display.month, '2026-10'); assert.equal(display.presentation.dashboard, true);
  for (const channel of ['set-appearance', 'set-layout', 'set-account-profile', 'refresh', 'set-month', 'save-key', 'set-target', 'choose-secrets', 'open-provider', 'connect', 'demo', 'sign-in-claude', 'export', 'set-window-view', 'new-dashboard-window']) {
    assert.equal((await call(kiosk, channel)).ok, false, `${channel} must reject a kiosk caller before doing work`);
  }
  assert.equal((await handlers.get('get-snapshot')({ sender: main.webContents, senderFrame: {} })).ok, false);
  main.close(); assert.equal(kiosk.isDestroyed(), false); assert.equal(app.didQuit, undefined);
  timer(); assert.equal(kiosk.sent.at(-1)[1].month, '2026-10');
  app.emit('second-instance'); await new Promise(resolve => setImmediate(resolve));
  const reopened = windows.at(-1); assert.notEqual(reopened, kiosk);
  assert.equal((await call(reopened, 'get-snapshot')).value.presentation.dashboard, false);
  assert.equal(kiosk.isDestroyed(), false); reopened.close();
  kiosk.close(); assert.equal(app.didQuit, true);
});
