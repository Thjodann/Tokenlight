const { EventEmitter } = require('node:events');
const RELEASES = 'https://github.com/Thjodann/Tokenlight/releases';
const INTERVAL = 6 * 60 * 60 * 1000;

// Feed selection stays in the main process. No renderer, settings file or
// environment variable can redirect a production update to another publisher.
class Updates extends EventEmitter {
  constructor({ native, version, enabled, automatic = true, timers = globalThis, now = Date.now, beforeRestart = async () => {} }) {
    super(); this.native = native; this.timers = timers; this.now = now; this.beforeRestart = beforeRestart;
    this.state = { status: enabled ? 'idle' : 'unavailable', currentVersion: version, version: null, automatic, checkedAt: null,
      message: enabled ? 'Updates download in the background. Restart when you’re ready.' : 'Updates are available in the signed release build.' };
    this.listeners = [];
    if (!enabled) return;
    native.setFeedURL({ url: `https://update.electronjs.org/Thjodann/Tokenlight/darwin-arm64/${encodeURIComponent(version)}` });
    const on = (name, fn) => { native.on(name, fn); this.listeners.push([name, fn]); };
    on('checking-for-update', () => this.set({ status: 'checking', message: 'Checking for updates…' }));
    on('update-available', () => this.set({ status: 'downloading', message: 'Downloading in the background…' }));
    on('update-not-available', () => this.set({ status: 'idle', checkedAt: now(), message: 'Tokenlight is up to date.' }));
    on('update-downloaded', (_event, _notes, name) => {
      const match = /^v?(\d+\.\d+\.\d+)$/.exec(String(name || ''));
      this.set({ status: 'ready', version: match?.[1] || null, checkedAt: now(), message: 'Ready. Installs next time you open Tokenlight, or restart now.' });
    });
    // Never send native error details (URLs, headers, server text) to a renderer.
    on('error', () => { if (this.state.status !== 'ready') this.set({ status: 'error', message: 'Couldn’t complete the update. Your current app is unchanged. Try again later.' }); });
  }
  snapshot() { return { ...this.state }; }
  set(value) { this.state = { ...this.state, ...value }; this.emit('change', this.snapshot()); }
  start() {
    if (this.state.status === 'unavailable' || this.interval) return;
    this.startup = this.timers.setTimeout(() => { this.startup = null; this.check(false); }, 30000); this.startup.unref?.();
    this.interval = this.timers.setInterval(() => this.check(false), INTERVAL); this.interval.unref?.();
  }
  check(manual = true) {
    if (this.stopped || (!manual && !this.state.automatic) || ['unavailable', 'checking', 'downloading', 'ready', 'restarting'].includes(this.state.status)) return this.snapshot();
    this.set({ status: 'checking', message: 'Checking for updates…' });
    try { this.native.checkForUpdates(); }
    catch { this.set({ status: 'error', message: 'Couldn’t check for updates. Try again later.' }); }
    return this.snapshot();
  }
  setAutomatic(value) {
    if (typeof value !== 'boolean') throw new Error('Choose whether automatic updates are on or off.');
    this.set({ automatic: value });
    if (value) this.check(false);
  }
  async restart() {
    if (this.state.status !== 'ready' || this.restarting) return false;
    this.restarting = true;
    try {
      await this.beforeRestart();
      this.set({ status: 'restarting', message: 'Restarting to update…' });
      this.native.quitAndInstall(); return true;
    } catch {
      this.restarting = false;
      this.set({ status: 'ready', message: 'Couldn’t restart. Quit and reopen Tokenlight to finish the update.' }); return false;
    }
  }
  stop() {
    this.stopped = true;
    if (this.startup) this.timers.clearTimeout(this.startup);
    if (this.interval) this.timers.clearInterval(this.interval);
    for (const [name, fn] of this.listeners) this.native.removeListener(name, fn);
  }
}
function updateMenuItems(updates, showUpdates, restart) {
  const s = updates.snapshot(), ready = s.status === 'ready';
  return [
    { label: ready ? 'Update Ready…' : ['checking', 'downloading'].includes(s.status) ? 'Updating…' : 'Check for Updates…', click: () => { updates.check(); void showUpdates(); } },
    ...(ready ? [{ label: 'Restart to Update', click: () => { void restart(); } }] : [])
  ];
}
module.exports = { Updates, updateMenuItems, RELEASES };
