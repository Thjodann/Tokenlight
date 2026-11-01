const { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { MODES, normalizeColorMode, backgroundColor, applyColorMode } = require('./appearance.cjs');
const { LAYOUTS, MINIMUM, normalizeLayout, initialSize, LayoutController } = require('./layout.cjs');
const { cacheAllowed, reconcileCredentials } = require('./credential-cache.cjs');

if (process.env.TOKENLIGHT_PROFILE && path.isAbsolute(process.env.TOKENLIGHT_PROFILE)) app.setPath('userData', process.env.TOKENLIGHT_PROFILE);
const single = app.requestSingleInstanceLock();
if (!single) app.quit();
let window, model, providers, fixture, service, layoutController, insights;
const ownChildren = new Set();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
app.on('before-quit', () => { for (const child of ownChildren) child.kill('SIGTERM'); });
const safeError = e => e instanceof providers.ProviderError ? e.message : 'Something interrupted this reading. Try again.';

class Service {
  constructor() { this.demo = process.argv.includes('--demo') || process.env.TOKENLIGHT_DEMO === '1'; this.demoAt = Date.now(); this.month = model.currentMonth(); this.followCurrent = true; this.cache = {}; this.errors = {}; this.credentialScopes = {}; this.credentialEpochs = {}; this.busy = new Set(); this.inflight = new Map(); this.fileError = null; this.vault = {}; this.writeQueue = Promise.resolve(); }
  async init() {
    this.dir = app.getPath('userData'); await fs.mkdir(this.dir, { recursive: true });
    const candidate = path.join(os.homedir(), 'secrets.env');
    let defaultPath = null; try { await fs.access(candidate); defaultPath = candidate; } catch {}
    this.settings = { secretsPath: defaultPath, targets: {}, refreshMinutes: 5, keychainAllowed: {}, colorMode: 'auto', ...await this.read('settings.json', {}) };
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
  snapshot() {
    const cards = this.demo ? fixture.demoCards(this.month, this.demoAt).map(c => ({ ...c, monthlyTarget: this.settings.targets[c.id] || null })) : model.SOURCES.map(source => {
      const key = `${this.month}:${source.id}`, cached = this.cache[key], error = this.errors[key];
      const showCache = cached && cacheAllowed(source.id, cached, this.credentialScopes) && !['setup', 'auth', 'file'].includes(error?.code);
      return { ...source, ...(showCache ? cached : {}), status: this.busy.has(key) ? 'refreshing' : error ? showCache ? 'stale' : 'setup' : showCache ? 'ready' : 'unconnected', error: error?.message || null, errorCode: error?.code, retryAt: error?.retryAt,
        monthlyTarget: this.settings.targets[source.id] || null };
    });
    return { month: this.month, demo: this.demo, cards, version: app.getVersion(), updatedAt: Date.now(), fileError: this.fileError, vaultError: this.vaultError,
      appearance: { dark: nativeTheme.shouldUseDarkColors },
      settings: { secretsPath: this.settings.secretsPath, refreshMinutes: this.settings.refreshMinutes, colorMode: this.settings.colorMode, layoutMode: this.settings.layoutMode, accountProfiles: this.settings.accountProfiles || {}, targets: this.settings.targets, savedKeys: Object.keys(this.vault) } };
  }
  async setAccountProfile(id, value) {
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
    applyColorMode(mode, nativeTheme, window);
    for (const value of MODES) {
      const item = Menu.getApplicationMenu()?.getMenuItemById(`appearance-${value}`);
      if (item) item.checked = value === mode;
    }
    this.emit();
    return this.snapshot();
  }
  emit() { if (window && !window.isDestroyed()) window.webContents.send('snapshot', this.snapshot()); }
  async refresh(id = null, manual = false, allowKeychain = false) {
    if (this.demo) { this.emit(); return this.snapshot(); }
    const month = this.month, ids = id ? [id] : model.SOURCES.map(s => s.id);
    let credentials;
    try { credentials = await providers.loadCredentials(this.settings.secretsPath, this.vault); this.fileError = null; }
    catch (e) { this.fileError = safeError(e); credentials = { ...this.vault }; }
    const reconciliation = reconcileCredentials(this.cache, this.errors, this.credentialScopes, credentials);
    for (const changedId of reconciliation.changed) {
      this.credentialEpochs[changedId] = (this.credentialEpochs[changedId] || 0) + 1;
      for (const key of this.inflight.keys()) if (key.endsWith(':' + changedId)) { this.inflight.delete(key); this.busy.delete(key); }
    }
    if (reconciliation.removed) await this.persist('usage-cache.json', this.cache);
    this.emit();
    await Promise.allSettled(ids.map(async sourceId => {
      if (!model.SOURCES.some(s => s.id === sourceId)) return;
      const key = `${month}:${sourceId}`;
      if (this.inflight.has(key)) return this.inflight.get(key);
      if (!manual && this.errors[key]?.retryAt > Date.now()) return;
      if (!manual && this.cache[key] && Date.now() - this.cache[key].lastUpdatedAt < (sourceId === 'cursor' ? 900000 : this.settings.refreshMinutes * 60000)) return;
      const epoch = this.credentialEpochs[sourceId];
      const current = () => this.credentialEpochs[sourceId] === epoch;
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
          this.errors[key] = { message: safeError(e), code: e.code || 'unavailable', retryAt: e.retryAt || (['setup', 'auth', 'file'].includes(e.code) ? Date.now() + 300000 : null) };
        } finally { if (this.inflight.get(key) === task) { this.busy.delete(key); this.inflight.delete(key); } this.emit(); }
      })();
      this.inflight.set(key, task); return task;
    }));
    return this.snapshot();
  }
  async saveKey(id, key) {
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
  [model, providers, fixture, insights] = await Promise.all([import('./model.mjs'), import('./providers.mjs'), import('./fixtures.mjs'), import('./insights.mjs')]);
  service = new Service(); await service.init();
  applyColorMode(service.settings.colorMode, nativeTheme);
  const [width, height] = initialSize(process.env.TOKENLIGHT_WINDOW_SIZE, service.settings.layoutMode);
  window = new BrowserWindow({ title: 'Tokenlight', width, height, minWidth: MINIMUM.width, minHeight: MINIMUM.height, show: false, backgroundColor: backgroundColor(nativeTheme.shouldUseDarkColors), titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 10 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, backgroundThrottling: false } });
  layoutController = new LayoutController(window, service.settings.layoutMode);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Unknown caller.');
    try { return { ok: true, value: await fn(...args) }; }
    catch (e) { return { ok: false, error: e instanceof providers.ProviderError ? e.message : ['save-key', 'set-target', 'set-account-profile'].includes(channel) ? e.message : 'The action could not finish. Please try again.' }; }
  });
  handle('get-snapshot', () => service.snapshot());
  handle('set-appearance', mode => service.setColorMode(mode));
  handle('set-layout', mode => service.setLayoutMode(mode));
  handle('set-account-profile', (id, value) => service.setAccountProfile(id, value));
  nativeTheme.on('updated', () => { window.setBackgroundColor(backgroundColor(nativeTheme.shouldUseDarkColors)); service.emit(); });
  handle('refresh', id => service.refresh(id, true));
  handle('set-month', async month => { model.monthRange(month); if (month > model.currentMonth() || month < '2020-01') throw new providers.ProviderError(`Choose a month from January 2020 through ${new Date(model.currentMonth() + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}.`, 'validation'); service.month = month; service.followCurrent = month === model.currentMonth(); service.emit(); service.refresh(); return service.snapshot(); });
  handle('save-key', (id, key) => service.saveKey(id, key));
  handle('set-target', async (id, target) => { if (!model.SOURCES.some(s => s.id === id) || (target !== null && (!model.finite(target) || target <= 0 || target > Number.MAX_SAFE_INTEGER))) throw new Error('Enter a positive monthly token or credit target.'); service.settings.targets[id] = target; await service.persist('settings.json', service.settings); service.emit(); return service.snapshot(); });
  handle('choose-secrets', async () => {
    const result = await dialog.showOpenDialog(window, { title: 'Choose your secrets file', properties: ['openFile', 'showHiddenFiles'], defaultPath: path.join(os.homedir(), 'secrets.env') });
    if (!result.canceled && result.filePaths[0]) { service.settings.secretsPath = result.filePaths[0]; await service.persist('settings.json', service.settings); await service.refresh(null, true); }
    return service.snapshot();
  });
  handle('open-provider', async (id, purpose) => { const source = model.SOURCES.find(s => s.id === id); if (!source) return; if (purpose === 'pricing') { if (['openai', 'anthropic'].includes(id)) await shell.openExternal(id === 'openai' ? 'https://developers.openai.com/api/docs/pricing' : 'https://platform.claude.com/docs/en/about-claude/pricing'); return; } await shell.openExternal(purpose === 'credentials' && source.credentialUrl ? source.credentialUrl : source.dashboard); });
  handle('connect', id => service.refresh(id, true, true));
  handle('demo', async enabled => { service.demo = !!enabled; service.emit(); if (!enabled) service.refresh(null, true); return service.snapshot(); });
  handle('sign-in-claude', async () => {
    const paths = ['/opt/homebrew/bin/claude', path.join(os.homedir(), '.local/bin/claude')]; let binary;
    for (const p of paths) { try { await fs.access(p); binary = p; break; } catch {} }
    if (!binary) throw new providers.ProviderError('Install Claude Code, run claude auth login, then choose Connect.', 'setup');
    const env = { ...process.env }; delete env.ANTHROPIC_API_KEY;
    const child = spawn(binary, ['auth', 'login'], { env, stdio: ['ignore', 'pipe', 'ignore'] }); ownChildren.add(child);
    const timer = setTimeout(() => child.kill('SIGTERM'), 180000);
    child.stdout.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); ownChildren.delete(child); });
    child.on('exit', async code => { clearTimeout(timer); ownChildren.delete(child); if (code === 0) await service.refresh('claude', true, true); });
    return 'Finish sign-in in your browser, then choose Connect.';
  });
  handle('export', async () => {
    const r = await dialog.showSaveDialog(window, { title: 'Export usage snapshot', defaultPath: `Tokenlight-${service.month}.json`, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!r.canceled && r.filePath) { const snapshot = service.snapshot(), { cards, month, demo } = snapshot; await fs.writeFile(r.filePath, JSON.stringify({ month, demo, exportedAt: new Date().toISOString(), insights: insights.monthlyInsights(snapshot), sources: cards.map(({ scope, ...c }) => c) }, null, 2), { mode: 0o600 }); return 'Snapshot exported.'; }
    return null;
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tokenlight', submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Connections…', accelerator: 'CmdOrCtrl+,', click: () => window.webContents.send('show-connections') }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' }, { label: 'View', submenu: [{ label: 'Refresh usage', accelerator: 'CmdOrCtrl+R', click: () => service.refresh(null, true) }, { id: 'mini-layout', label: 'Mini dashboard', accelerator: 'CmdOrCtrl+Shift+M', type: 'checkbox', checked: service.settings.layoutMode === 'mini', click: item => service.setLayoutMode(item.checked ? 'mini' : 'dashboard') }, { label: 'Appearance', submenu: MODES.map(mode => ({ id: `appearance-${mode}`, label: mode === 'auto' ? 'Auto — follow system' : mode === 'dark' ? 'Dark' : 'Light', type: 'radio', checked: service.settings.colorMode === mode, click: () => service.setColorMode(mode) })) }, { role: 'togglefullscreen' }] }, { role: 'windowMenu' }
  ]));
  await window.loadFile(path.join(__dirname, 'index.html'));
  window.show(); service.refresh();
  const timer = setInterval(() => { if (service.followCurrent && service.month !== model.currentMonth()) { service.month = model.currentMonth(); service.emit(); } service.refresh(); }, 60000); timer.unref();
  if (process.env.TOKENLIGHT_SCREENSHOT) {
    setTimeout(async () => { const image = await window.webContents.capturePage(); await fs.writeFile(process.env.TOKENLIGHT_SCREENSHOT, image.toPNG()); if (process.env.TOKENLIGHT_QUIT_AFTER_CAPTURE) app.quit(); }, service.demo ? 1200 : 18000);
  }
});
app.on('window-all-closed', () => app.quit());
