const VIEWS = ['overview', 'account', 'api', 'insights', 'providers'];
const DASHBOARD_COLOR_MODES = ['inherit', 'light', 'dark'];

// Window identity, display state and IPC authority live in the main process.
const PROVIDERS = Object.freeze({ openai: 'OpenAI', anthropic: 'Anthropic', cursor: 'Cursor', elevenlabs: 'ElevenLabs', ollama: 'Ollama', devin: 'Devin' });
const SOURCE_PROVIDER = Object.freeze({ codex: 'openai', openai: 'openai', claude: 'anthropic', anthropic: 'anthropic', cursor: 'cursor', elevenlabs: 'elevenlabs', ollama: 'ollama', devin: 'devin' });
const validProvider = id => typeof id === 'string' && Object.hasOwn(PROVIDERS, id);
const interfaceColors = value => value && typeof value.surface === 'string' && typeof value.accent === 'string' ? { surface: value.surface, accent: value.accent } : null;
class DashboardWindows {
  constructor() { this.entries = new Map(); }
  add(window, { kiosk = false, id = null, view = 'overview', month, followCurrent = true, provider = 'openai', colorMode = 'inherit', colors = null } = {}) {
    const entry = { window, kiosk, dashboard: kiosk, view: VIEWS.includes(view) ? view : 'overview', month, followCurrent };
    if (kiosk) {
      if (!validProvider(provider)) throw new Error('Choose an available provider.');
      entry.id = id;
      entry.provider = provider;
      entry.colorMode = DASHBOARD_COLOR_MODES.includes(colorMode) ? colorMode : 'inherit';
      entry.interfaceColors = interfaceColors(colors);
    }
    if (!entry.dashboard && entry.view === 'providers') entry.view = 'overview';
    const contents = window.webContents;
    this.entries.set(contents, entry);
    window.once('closed', () => this.entries.delete(contents));
    return entry;
  }
  authorize(event, readOnly = false) {
    const entry = this.entries.get(event.sender);
    if (!entry || entry.window.isDestroyed() || !event.senderFrame || event.senderFrame !== event.sender.mainFrame) throw new Error('Unknown caller.');
    if (!readOnly && (entry.kiosk || entry.dashboard)) throw new Error('Dashboard windows are read-only.');
    return entry;
  }
  setProvider(entry, value) {
    if (!entry.dashboard || !validProvider(value)) throw new Error('Choose an available provider.');
    entry.provider = value;
  }
  setView(entry, value) {
    if (!VIEWS.includes(value) || (value === 'providers' && !entry.dashboard)) throw new Error('Choose an available view.');
    entry.view = value;
  }
  setColorMode(entry, value) {
    if (!entry.dashboard || !DASHBOARD_COLOR_MODES.includes(value)) throw new Error('Choose Follow main, Light, or Dark.');
    entry.colorMode = value;
  }
  setInterfaceColors(entry, value) {
    if (!entry.dashboard) throw new Error('Choose a dashboard window.');
    entry.interfaceColors = interfaceColors(value);
  }
  record(entry) {
    if (!entry?.dashboard || entry.window.isDestroyed()) return null;
    const [width, height] = entry.window.getSize();
    return { id: entry.id, provider: entry.provider, view: entry.view, month: entry.month, followCurrent: entry.followCurrent, colorMode: entry.colorMode, interfaceColors: entry.interfaceColors, width, height };
  }
  records() {
    return [...this.entries.values()].map(entry => this.record(entry)).filter(Boolean);
  }
  rollover(month) { for (const e of this.entries.values()) if (e.followCurrent) e.month = month; }
  months() { return [...new Set([...this.entries.values()].map(e => e.month))]; }
  snapshot(entry, snapshot) {
    const presentation = { dashboard: entry.dashboard, kiosk: entry.kiosk, view: entry.view, ...(entry.dashboard ? { id: entry.id, provider: entry.provider, providers: PROVIDERS, colorMode: entry.colorMode, interfaceColors: entry.interfaceColors, interfaceColorsCustom: !!entry.interfaceColors } : {}) };
    const inheritedDark = snapshot.appearance?.dark === true;
    const appearance = { ...snapshot.appearance, dark: entry.dashboard && entry.colorMode !== 'inherit' ? entry.colorMode === 'dark' : inheritedDark };
    if (entry.dashboard && entry.view === 'providers') {
      const fields = ['id', 'title', 'kind', 'status', 'monthly', 'unit', 'daily', 'windows', 'creditBalances', 'paidUsage', 'apiCost', 'modelUsage', 'requestCount', 'partial', 'lastUpdatedAt', 'coverage', 'sourceLabel', 'allowanceNote', 'creditNote', 'costNote', 'activityNote', 'historyNote', 'activityScope', 'breakdown', 'chartZone', 'plan'];
      const cards = snapshot.cards.filter(c => Object.hasOwn(SOURCE_PROVIDER, c.id) && SOURCE_PROVIDER[c.id] === entry.provider).map(c => Object.fromEntries(fields.filter(k => Object.hasOwn(c, k)).map(k => [k, c[k]])));
      return { version: snapshot.version, month: snapshot.month, demo: snapshot.demo, appearance, cards,
        settings: { showRemainingAllowance: snapshot.settings.showRemainingAllowance, interfaceColors: snapshot.settings.interfaceColors || null, accountProfiles: Object.fromEntries(cards.map(c => [c.id, snapshot.settings.accountProfiles?.[c.id] || {}])) },
        presentation: { ...presentation, provider: entry.provider, providers: PROVIDERS } };
    }
    if (!entry.dashboard) return { ...snapshot, presentation };
    const { secretsPath, savedKeys, ...settings } = snapshot.settings;
    return { ...snapshot, appearance, settings, fileError: null, vaultError: null, claudeSignIn: null, devinQuotaSignIn: null, presentation };
  }
  broadcast(snapshot) {
    for (const entry of this.entries.values()) if (!entry.window.isDestroyed()) entry.window.webContents.send('snapshot', this.snapshot(entry, snapshot(entry.month)));
  }
}
module.exports = { DashboardWindows, VIEWS, DASHBOARD_COLOR_MODES, PROVIDERS, SOURCE_PROVIDER, validProvider };
