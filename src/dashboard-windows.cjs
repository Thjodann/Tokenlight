const VIEWS = ['overview', 'account', 'api', 'insights'];

// Window identity, display state and IPC authority live in the main process.
class DashboardWindows {
  constructor() { this.entries = new Map(); }
  add(window, { kiosk = false, view = 'overview', month, followCurrent = true } = {}) {
    const entry = { window, kiosk, dashboard: kiosk, view: VIEWS.includes(view) ? view : 'overview', month, followCurrent };
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
  setView(entry, value) {
    if (entry.kiosk || entry.dashboard || !VIEWS.includes(value)) throw new Error('Choose an available view.');
    entry.view = value;
  }
  rollover(month) { for (const e of this.entries.values()) if (e.followCurrent) e.month = month; }
  months() { return [...new Set([...this.entries.values()].map(e => e.month))]; }
  snapshot(entry, snapshot) {
    const presentation = { dashboard: entry.dashboard, kiosk: entry.kiosk, view: entry.view };
    if (!entry.dashboard) return { ...snapshot, presentation };
    const { secretsPath, savedKeys, ...settings } = snapshot.settings;
    return { ...snapshot, settings, fileError: null, vaultError: null, claudeSignIn: null, presentation };
  }
  broadcast(snapshot) {
    for (const entry of this.entries.values()) if (!entry.window.isDestroyed()) entry.window.webContents.send('snapshot', this.snapshot(entry, snapshot(entry.month)));
  }
}
module.exports = { DashboardWindows, VIEWS };
