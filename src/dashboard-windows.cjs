const VIEWS = ['overview', 'account', 'api', 'insights', 'providers'];

// Window identity, display state and IPC authority live in the main process.
const PROVIDERS = Object.freeze({ openai: 'OpenAI', anthropic: 'Anthropic', cursor: 'Cursor', elevenlabs: 'ElevenLabs', ollama: 'Ollama' });
const SOURCE_PROVIDER = Object.freeze({ codex: 'openai', openai: 'openai', claude: 'anthropic', anthropic: 'anthropic', cursor: 'cursor', elevenlabs: 'elevenlabs', ollama: 'ollama' });
const validProvider = id => typeof id === 'string' && Object.hasOwn(PROVIDERS, id);
class DashboardWindows {
  constructor() { this.entries = new Map(); }
  add(window, { kiosk = false, view = 'overview', month, followCurrent = true, provider = 'openai' } = {}) {
    const entry = { window, kiosk, dashboard: kiosk, view: VIEWS.includes(view) ? view : 'overview', month, followCurrent };
    if (kiosk) { if (!validProvider(provider)) throw new Error('Choose an available provider.'); entry.provider = provider; }
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
  rollover(month) { for (const e of this.entries.values()) if (e.followCurrent) e.month = month; }
  months() { return [...new Set([...this.entries.values()].map(e => e.month))]; }
  snapshot(entry, snapshot) {
    const presentation = { dashboard: entry.dashboard, kiosk: entry.kiosk, view: entry.view, ...(entry.dashboard ? { provider: entry.provider, providers: PROVIDERS } : {}) };
    if (entry.dashboard && entry.view === 'providers') {
      const fields = ['id', 'title', 'kind', 'status', 'monthly', 'unit', 'daily', 'windows', 'creditBalances', 'paidUsage', 'apiCost', 'modelUsage', 'requestCount', 'partial', 'lastUpdatedAt', 'coverage', 'sourceLabel', 'allowanceNote', 'creditNote', 'costNote', 'activityNote', 'historyNote', 'activityScope', 'breakdown'];
      const cards = snapshot.cards.filter(c => Object.hasOwn(SOURCE_PROVIDER, c.id) && SOURCE_PROVIDER[c.id] === entry.provider).map(c => Object.fromEntries(fields.filter(k => Object.hasOwn(c, k)).map(k => [k, c[k]])));
      return { version: snapshot.version, month: snapshot.month, demo: snapshot.demo, appearance: snapshot.appearance, cards,
        settings: { showRemainingAllowance: snapshot.settings.showRemainingAllowance, accountProfiles: Object.fromEntries(cards.map(c => [c.id, snapshot.settings.accountProfiles?.[c.id] || {}])) },
        presentation: { ...presentation, provider: entry.provider, providers: PROVIDERS } };
    }
    if (!entry.dashboard) return { ...snapshot, presentation };
    const { secretsPath, savedKeys, ...settings } = snapshot.settings;
    return { ...snapshot, settings, fileError: null, vaultError: null, claudeSignIn: null, presentation };
  }
  broadcast(snapshot) {
    for (const entry of this.entries.values()) if (!entry.window.isDestroyed()) entry.window.webContents.send('snapshot', this.snapshot(entry, snapshot(entry.month)));
  }
}
module.exports = { DashboardWindows, VIEWS, PROVIDERS, SOURCE_PROVIDER, validProvider };
