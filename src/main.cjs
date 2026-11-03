const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Tray, nativeImage, safeStorage, nativeTheme, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { MODES, normalizeColorMode, backgroundColor, applyColorMode } = require('./appearance.cjs');
const { LAYOUTS, MINIMUM, normalizeLayout, initialSize, LayoutController } = require('./layout.cjs');
const { cacheAllowed, reconcileCredentials } = require('./credential-cache.cjs');
const { DashboardWindows } = require('./dashboard-windows.cjs');
const dashboards = new DashboardWindows();
const { createClaudeLogin } = require('./claude-login.cjs');
const { mainDashboardOpener, createStatusBar } = require('./status-bar.cjs');

if (process.env.TOKENLIGHT_PROFILE && path.isAbsolute(process.env.TOKENLIGHT_PROFILE)) app.setPath('userData', process.env.TOKENLIGHT_PROFILE);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let window, model, providers, service, layoutController, insights, demoData, statusBar;
const ownChildren = new Set();
app.on('second-instance', () => { if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } else if (service) app.emit('activate'); });
app.on('before-quit', () => { for (const child of ownChildren) child.kill('SIGTERM'); });
const safeError = e => e instanceof providers.ProviderError ? e.message : 'Something interrupted this reading. Try again.';

class Service {
  constructor() { this.demo = process.argv.includes('--demo') || process.env.TOKENLIGHT_DEMO === '1'; this.demoAt = Date.now(); this.demoSeed = randomUUID(); this.modeEpoch = 0; this.month = model.currentMonth(); this.followCurrent = true; this.cache = {}; this.errors = {}; this.credentialScopes = {}; this.credentialEpochs = {}; this.busy = new Set(); this.inflight = new Map(); this.claudeReconnects = new Map(); this.fileError = null; this.vault = {}; this.writeQueue = Promise.resolve(); }
  async init() {
    this.dir = app.getPath('userData'); await fs.mkdir(this.dir, { recursive: true });
    const candidate = path.join(os.homedir(), 'secrets.env');
    let defaultPath = null; try { await fs.access(candidate); defaultPath = candidate; } catch {}
    this.settings = { secretsPath: defaultPath, targets: {}, refreshMinutes: 5, keychainAllowed: {}, colorMode: 'auto', ...await this.read('settings.json', {}) };
    this.demo ||= this.settings.demoMode === true;
    this.settings.colorMode = normalizeColorMode(this.settings.colorMode);
    this.settings.layoutMode = normalizeLayout(this.settings.layoutMode);
    this.cache = await this.read('usage-cache.json', {});
    const encrypted = await this.read('credentials.json', null);
    if (encrypted) {
      try { const { result } = await safeStorage.decryptStringAsync(Buffer.from(encrypted.payload, 'base64')); this.vault = JSON.parse(result); }
      catch { this.vaultError = 'Saved keys are locked. Unlock your macOS Keychain or save the keys again.'; }
    }
  }
  async read(name, fallback) { try { return JSON.parse(await fs.readFile(path.join(this.dir, name), 'utf8')); } catch { return fallback; } }
  async persist(name, data) {
    this.writeQueue = this.writeQueue.catch(() => {}).then(async () => { const file = path.join(this.dir, name); await fs.writeFile(file + '.tmp', JSON.stringify(data), { mode: 0o600 }); await fs.rename(file + '.tmp', file); });
    return this.writeQueue;
  }
  snapshot(month = this.month) {
    const sample = this.demo ? demoData.createDemoData(month, this.demoAt, this.demoSeed) : null;
    const cards = sample ? sample.cards : model.SOURCES.map(source => {
      const key = `${month}:${source.id}`, cached = this.cache[key], error = this.errors[key];
      const showCache = cached && cacheAllowed(source.id, cached, this.credentialScopes) && !['setup', 'auth', 'file'].includes(error?.code);
      return { ...source, ...(showCache ? cached : {}), status: this.busy.has(key) ? 'refreshing' : error ? showCache ? 'stale' : 'setup' : showCache ? 'ready' : 'unconnected', error: error?.message || null, errorCode: error?.code, retryAt: error?.retryAt,
        monthlyTarget: this.settings.targets[source.id] || null };
    });
    return { month, demo: this.demo, cards, version: app.getVersion(), updatedAt: Date.now(), fileError: this.demo ? null : this.fileError, vaultError: this.demo ? null : this.vaultError,
      claudeSignIn: this.demo ? null : this.claudeSignIn || null, appearance: { dark: nativeTheme.shouldUseDarkColors },
      settings: sample ? demoData.demoSettings(this.settings, sample) : { secretsPath: this.settings.secretsPath, refreshMinutes: this.settings.refreshMinutes, colorMode: this.settings.colorMode, layoutMode: this.settings.layoutMode, accountProfiles: this.settings.accountProfiles || {}, targets: this.settings.targets, savedKeys: Object.keys(this.vault) } };
  }
  async setAccountProfile(id, value) {
    this.requireLive();
    if (!model.SOURCES.some(s => s.id === id)) throw new Error('Unknown source.');
    this.profileWrites = (this.profileWrites || Promise.resolve()).catch(() => {}).then(async () => {
      const previous = this.settings.accountProfiles;
      const next = insights.applyProfileChange(this.settings, id, value);
      // Keep the shared settings object so appearance and layout edits also survive.
      this.settings.accountProfiles = next;
      try { await this.persist('settings.json', this.settings); }
      catch (error) { if (previous === undefined) delete this.settings.accountProfiles; else this.settings.accountProfiles = previous; this.emit(); throw error; }
      this.emit(); return this.snapshot();
    });
    return this.profileWrites;
  }
  requireLive() { if (this.demo) throw new Error('Turn off Demo mode before changing a live connection or account setting.'); }
  randomizeDemo() { this.demoAt = Date.now(); this.demoSeed = randomUUID(); }
  async setDemoMode(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Choose whether Demo mode is on or off.');
    this.demoWrites = (this.demoWrites || Promise.resolve()).catch(() => {}).then(async () => {
      const previous = this.demo;
      if (enabled) { this.demo = true; this.randomizeDemo(); this.modeEpoch++; this.inflight.clear(); this.busy.clear(); this.emit(); }
      this.settings.demoMode = enabled;
      try { await this.persist('settings.json', this.settings); }
      catch (error) {
        if (!enabled) this.settings.demoMode = previous;
        this.emit();
        throw new Error(enabled ? 'Demo mode is active for this session, but could not be saved for next launch.' : 'Demo mode is still on because the change could not be saved.');
      }
      if (!enabled) { this.demo = false; this.modeEpoch++; this.inflight.clear(); this.busy.clear(); }
      this.emit();
      if (!enabled) void this.refresh(null, true).catch(() => {});
      return this.snapshot();
    });
    return this.demoWrites;
  }
  async setLayoutMode(mode) {
    if (!LAYOUTS.includes(mode)) throw new Error('Choose Dashboard or Mini.');
    this.settings.layoutMode = mode;
    await this.persist('settings.json', this.settings);
    layoutController?.apply(mode);
    const item = Menu.getApplicationMenu?.()?.getMenuItemById('mini-layout');
    if (item) item.checked = mode === 'mini';
    this.emit(); return this.snapshot();
  }
  async setColorMode(mode) {
    if (!MODES.includes(mode)) throw new Error('Choose Auto, Dark, or Light.');
    this.settings.colorMode = mode;
    await this.persist('settings.json', this.settings);
    applyColorMode(mode, nativeTheme);
    for (const e of dashboards.entries.values()) e.window.setBackgroundColor(backgroundColor(nativeTheme.shouldUseDarkColors));
    for (const value of MODES) {
      const item = Menu.getApplicationMenu()?.getMenuItemById(`appearance-${value}`);
      if (item) item.checked = value === mode;
    }
    this.emit();
    return this.snapshot();
  }
  emit() { dashboards.broadcast(month => this.snapshot(month)); }
  async refresh(id = null, manual = false, allowKeychain = false, month = this.month, afterInflight = false) {
    if (this.demo) { if (manual) this.randomizeDemo(); this.emit(); return this.snapshot(month); }
    const modeEpoch = this.modeEpoch, live = () => !this.demo && this.modeEpoch === modeEpoch;
    const ids = id ? [id] : model.SOURCES.map(s => s.id);
    if (allowKeychain && id === 'claude' && !this.settings.keychainAllowed.claude) {
      this.settings.keychainAllowed.claude = true;
      await this.persist('settings.json', this.settings);
      if (!live()) return this.snapshot(month);
    }
    let credentials;
    try { credentials = await providers.loadCredentials(this.settings.secretsPath, this.vault); if (!live()) return this.snapshot(month); this.fileError = null; }
    catch (e) { if (!live()) return this.snapshot(month); this.fileError = safeError(e); credentials = { ...this.vault }; }
    const reconciliation = reconcileCredentials(this.cache, this.errors, this.credentialScopes, credentials);
    for (const changedId of reconciliation.changed) {
      this.credentialEpochs[changedId] = (this.credentialEpochs[changedId] || 0) + 1;
      for (const key of this.inflight.keys()) if (key.endsWith(':' + changedId)) { this.inflight.delete(key); this.busy.delete(key); }
    }
    if (reconciliation.removed) await this.persist('usage-cache.json', this.cache);
    this.emit();
    await Promise.allSettled(ids.map(async sourceId => {
      if (!live() || !model.SOURCES.some(s => s.id === sourceId)) return;
      const key = `${month}:${sourceId}`;
      if (this.inflight.has(key)) {
        const previous = this.inflight.get(key);
        if (sourceId !== 'claude' || !manual || afterInflight) return previous;
        if (this.claudeReconnects.has(key)) return this.claudeReconnects.get(key);
        // A Connect click must survive an older read that was already failing.
        const retry = (async () => {
          await previous;
          if (!live() || !this.errors[key]) return;
          if (this.errors[key].code === 'rate_limit' && this.errors[key].retryAt > Date.now()) return;
          await this.refresh(sourceId, true, allowKeychain, month, true);
        })();
        this.claudeReconnects.set(key, retry);
        try { return await retry; } finally { if (this.claudeReconnects.get(key) === retry) this.claudeReconnects.delete(key); }
      }
      if (!manual && this.errors[key]?.retryAt > Date.now()) return;
      const recoveringClaude = sourceId === 'claude' && ['setup', 'auth'].includes(this.errors[key]?.code);
      if (!manual && !recoveringClaude && !(sourceId === 'claude' && this.cache[key]?.sessionExpiresAt && this.cache[key].sessionExpiresAt <= Date.now()) && this.cache[key] && Date.now() - this.cache[key].lastUpdatedAt < (sourceId === 'cursor' ? 900000 : this.settings.refreshMinutes * 60000)) return;
      const epoch = this.credentialEpochs[sourceId];
      const current = () => live() && this.credentialEpochs[sourceId] === epoch;
      const task = (async () => {
        this.busy.add(key); this.emit();
        try {
          const result = await providers.readProvider(sourceId, month, { credentials, previousReading: this.cache[key], resourcePath: app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), allowKeychain: allowKeychain || !!this.settings.keychainAllowed[sourceId] });
          if (!current()) return;
          this.cache[key] = { ...result, lastUpdatedAt: Date.now() }; delete this.errors[key];
          if (allowKeychain) { this.settings.keychainAllowed[sourceId] = true; await this.persist('settings.json', this.settings); }
          await this.persist('usage-cache.json', this.cache);
        } catch (e) {
          if (!current()) return;
          this.errors[key] = { message: safeError(e), code: e.code || 'unavailable', retryAt: e.retryAt || (['setup', 'auth', 'file'].includes(e.code) ? Date.now() + (sourceId === 'claude' ? 60000 : 300000) : null) };
        } finally { if (this.inflight.get(key) === task) { this.busy.delete(key); this.inflight.delete(key); } this.emit(); }
      })();
      this.inflight.set(key, task); return task;
    }));
    return this.snapshot();
  }
  async recheckClaude() {
    if (this.demo || !this.settings.keychainAllowed.claude || this.claudeSignIn?.pending) return;
    const error = this.errors[`${this.month}:claude`];
    if (error?.code === 'rate_limit' && error.retryAt > Date.now()) return;
    if (this.lastClaudeRecheck && Date.now() - this.lastClaudeRecheck < 60000) return;
    this.lastClaudeRecheck = Date.now();
    return this.refresh('claude', true);
  }
  async saveKey(id, key) {
    this.requireLive();
    if (!['openai', 'anthropic', 'elevenlabs', 'ollama'].includes(id)) throw new Error('Unknown provider.');
    if (typeof key !== 'string' || key.length < 12 || key.length > 10000 || /\s/.test(key)) throw new Error('Enter a valid API key without spaces.');
    if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('macOS secure storage is unavailable. Your key was not saved.');
    const next = { ...this.vault, [id]: key };
    const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(next));
    await this.persist('credentials.json', { payload: encrypted.toString('base64') });
    this.vault = next; this.vaultError = null;
    await this.refresh(id, true); return this.snapshot();
  }
}

app.whenReady().then(async () => {
  app.setAccessibilitySupportEnabled(true);
  [model, providers, insights, demoData] = await Promise.all([import('./model.mjs'), import('./providers.mjs'), import('./insights.mjs'), import('./demo-data.mjs')]);
  service = new Service(); await service.init();
  applyColorMode(service.settings.colorMode, nativeTheme);
  const focused = () => dashboards.entries.get(BrowserWindow.getFocusedWindow()?.webContents);
  const updateMenu = () => {
    const entry = focused(), menu = Menu.getApplicationMenu();
    for (const id of ['connections', 'refresh-usage', 'mini-layout', 'appearance-menu']) {
      const item = menu?.getMenuItemById(id); if (item) item.enabled = !!entry && !entry.dashboard;
    }
  };
  const createWindow = async (source = null) => {
    const kiosk = !!source;
    const [width, height] = source ? source.window.getSize() : initialSize(process.env.TOKENLIGHT_WINDOW_SIZE, service.settings.layoutMode);
    const browser = new BrowserWindow({ title: kiosk ? 'Tokenlight — Dashboard' : 'Tokenlight', width, height, minWidth: MINIMUM.width, minHeight: MINIMUM.height, show: false, backgroundColor: backgroundColor(nativeTheme.shouldUseDarkColors), titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 10 },
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, backgroundThrottling: false } });
    const entry = dashboards.add(browser, { kiosk, view: source?.view, month: source?.month || service.month, followCurrent: source ? source.followCurrent : service.followCurrent });
    if (!kiosk) { window = browser; layoutController = new LayoutController(browser, service.settings.layoutMode); }
    browser.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    browser.webContents.on('will-navigate', event => event.preventDefault());
    browser.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    browser.on('focus', () => { updateMenu(); void service.recheckClaude().catch(() => {}); });
    browser.once('closed', () => { if (!kiosk) { window = null; layoutController = null; } updateMenu(); });
    try { await browser.loadFile(path.join(__dirname, 'index.html')); if (!browser.isDestroyed()) browser.show(); }
    catch (error) { if (!browser.isDestroyed()) browser.close(); throw error; }
    return entry;
  };
  const handle = (channel, fn, readOnly = false) => ipcMain.handle(channel, async (event, ...args) => {
    try {
      const entry = dashboards.authorize(event, readOnly);
      const value = channel === 'get-snapshot' ? service.snapshot(entry.month) : await fn(entry, ...args);
      return { ok: true, value: value?.cards ? dashboards.snapshot(entry, value) : value };
    } catch (e) { return { ok: false, error: e instanceof providers.ProviderError || ['save-key', 'set-target', 'set-account-profile', 'get-snapshot', 'demo'].includes(channel) ? e.message : 'The action could not finish. Please try again.' }; }
  });
  handle('get-snapshot', null, true);
  handle('set-window-view', (entry, view) => { dashboards.setView(entry, view); });
  handle('new-dashboard-window', async entry => { await createWindow(entry); return null; });
  handle('set-appearance', (_entry, mode) => service.setColorMode(mode));
  handle('set-layout', (_entry, mode) => service.setLayoutMode(mode));
  handle('set-account-profile', (_entry, id, value) => service.setAccountProfile(id, value));
  nativeTheme.on('updated', () => { for (const e of dashboards.entries.values()) e.window.setBackgroundColor(backgroundColor(nativeTheme.shouldUseDarkColors)); service.emit(); });
  handle('refresh', (_entry, id) => service.refresh(id, true));
  handle('set-month', async (_entry, month) => { model.monthRange(month); if (month > model.currentMonth() || month < '2020-01') throw new providers.ProviderError(`Choose a month from January 2020 through ${new Date(model.currentMonth() + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}.`, 'validation'); service.month = month; service.followCurrent = month === model.currentMonth(); _entry.month = month; _entry.followCurrent = service.followCurrent; service.emit(); service.refresh(); return service.snapshot(); });
  handle('save-key', (_entry, id, key) => service.saveKey(id, key));
  handle('set-target', async (_entry, id, target) => { service.requireLive(); if (!model.SOURCES.some(s => s.id === id) || (target !== null && (!model.finite(target) || target <= 0 || target > Number.MAX_SAFE_INTEGER))) throw new Error('Enter a positive monthly token or credit target.'); service.settings.targets[id] = target; await service.persist('settings.json', service.settings); service.emit(); return service.snapshot(); });
  handle('choose-secrets', async (_entry) => {
    service.requireLive();
    const result = await dialog.showOpenDialog(window, { title: 'Choose your secrets file', properties: ['openFile', 'showHiddenFiles'], defaultPath: path.join(os.homedir(), 'secrets.env') });
    if (!result.canceled && result.filePaths[0]) { service.settings.secretsPath = result.filePaths[0]; await service.persist('settings.json', service.settings); await service.refresh(null, true); }
    return service.snapshot();
  });
  handle('open-provider', async (_entry, id, purpose) => { const source = model.SOURCES.find(s => s.id === id); if (!source) return; if (purpose === 'pricing') { if (['openai', 'anthropic'].includes(id)) await shell.openExternal(id === 'openai' ? 'https://developers.openai.com/api/docs/pricing' : 'https://platform.claude.com/docs/en/about-claude/pricing'); return; } await shell.openExternal(purpose === 'credentials' && source.credentialUrl ? source.credentialUrl : source.dashboard); });
  handle('connect', (_entry, id) => service.refresh(id, true, true));
  handle('demo', (_entry, enabled) => service.setDemoMode(enabled));
  const claudeLogin = createClaudeLogin({ spawn, ownChildren, environment: process.env, cwd: service.dir,
    onState: state => { service.claudeSignIn = state; service.emit(); },
    onSuccess: async () => { await service.inflight.get(`${service.month}:claude`); await service.refresh('claude', true, true); if (service.errors[`${service.month}:claude`]) throw new Error('Usage unavailable'); } });
  handle('sign-in-claude', async (_entry) => {
    if (service.demo) return 'Leave sample data to sign in.';
    const paths = ['/opt/homebrew/bin/claude', path.join(os.homedir(), '.local/bin/claude')]; let binary;
    for (const p of paths) { try { await fs.access(p); binary = p; break; } catch {} }
    if (!binary) throw new providers.ProviderError('Install Claude Code, run claude auth login, then choose Connect.', 'setup');
    return claudeLogin.start(binary);
  });
  powerMonitor.on('resume', () => { void service.recheckClaude().catch(() => {}); });
  handle('export', async (_entry) => {
    const snapshot = service.snapshot();
    const r = await dialog.showSaveDialog(window, { title: 'Export usage snapshot', defaultPath: `Tokenlight-${snapshot.demo ? 'demo-' : ''}${snapshot.month}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!r.canceled && r.filePath) { const { cards, month, demo } = snapshot; await fs.writeFile(r.filePath, JSON.stringify({ month, demo, exportedAt: new Date().toISOString(), insights: insights.monthlyInsights(snapshot), sources: cards.map(({ scope, ...c }) => c) }, null, 2), { mode: 0o600 }); return 'Snapshot exported.'; }
    return null;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tokenlight', submenu: [{ role: 'about' }, { type: 'separator' }, { id: 'connections', label: 'Connections…', accelerator: 'CmdOrCtrl+,', click: () => { const e = focused(); if (e && !e.dashboard) e.window.webContents.send('show-connections'); } }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [{ label: 'New Dashboard Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => { const e = focused(); if (e) void createWindow(e).catch(() => {}); } }, { role: 'close' }] },
    { role: 'editMenu' }, { label: 'View', submenu: [
      { id: 'refresh-usage', label: 'Refresh usage', accelerator: 'CmdOrCtrl+R', click: () => { const e = focused(); if (e && !e.dashboard) void service.refresh(null, true); } },
      { id: 'mini-layout', label: 'Mini dashboard', accelerator: 'CmdOrCtrl+Shift+M', type: 'checkbox', checked: service.settings.layoutMode === 'mini', click: item => { const e = focused(); if (e && !e.dashboard) void service.setLayoutMode(item.checked ? 'mini' : 'dashboard'); } },
      { id: 'appearance-menu', label: 'Appearance', submenu: MODES.map(mode => ({ id: `appearance-${mode}`, label: mode === 'auto' ? 'Auto — follow system' : mode === 'dark' ? 'Dark' : 'Light', type: 'radio', checked: service.settings.colorMode === mode, click: () => { const e = focused(); if (e && !e.dashboard) void service.setColorMode(mode); } })) }, { role: 'togglefullscreen' }] }, { role: 'windowMenu' }
  ]));
  const openDashboard = mainDashboardOpener({ getWindow: () => window, createWindow: () => createWindow() });
  await openDashboard();
  statusBar = createStatusBar({ app, Tray, Menu, nativeImage, openDashboard });
  updateMenu(); service.emit(); service.refresh();
  app.on('activate', () => { void openDashboard().catch(() => {}); });
  const timer = setInterval(() => {
    const month = model.currentMonth();
    if (service.followCurrent) service.month = month;
    dashboards.rollover(month); service.emit();
    for (const period of new Set([service.month, ...dashboards.months()])) void service.refresh(null, false, false, period);
  }, 60000); timer.unref();
  if (process.env.TOKENLIGHT_SCREENSHOT) {
    setTimeout(async () => { const image = await window.webContents.capturePage(); await fs.writeFile(process.env.TOKENLIGHT_SCREENSHOT, image.toPNG()); if (process.env.TOKENLIGHT_QUIT_AFTER_CAPTURE) app.quit(); }, service.demo ? 1200 : 18000);
  }
});
app.on('window-all-closed', () => { if (!statusBar) app.quit(); });
