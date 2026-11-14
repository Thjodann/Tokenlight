import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isAllowedSignInUrl, isDevinAppUrl, openDevinQuotaWindow, sessionTokenFromAuthorization, sessionTokenFromStorage, STORAGE_SCRIPT } from '../src/devin-signin.mjs';

const TOKEN = 'auth1_exampleSessionValue123';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signaturevalue';

describe('Devin quota sign-in', { concurrency: false }, () => {
test('the website login is recognized and an API key is not', () => {
  assert.equal(sessionTokenFromStorage({ auth1_session: `Bearer ${TOKEN}` }), TOKEN);
  assert.equal(sessionTokenFromStorage({ '@@auth0spajs@@::client': JSON.stringify({ body: { access_token: JWT } }) }), JWT);
  assert.equal(sessionTokenFromStorage({ auth1_session: TOKEN, access_token: JWT }), TOKEN);
  assert.equal(sessionTokenFromStorage({ auth1_session: 'cog_official_api_key_value' }), null);
  assert.equal(sessionTokenFromStorage({ auth1_session: 'apk_user_legacy_key_value' }), null);
  assert.equal(sessionTokenFromAuthorization({ Authorization: `Bearer ${TOKEN}` }), TOKEN);
  assert.equal(sessionTokenFromAuthorization({ authorization: 'Bearer short' }), null);
});

test('only the encrypted Devin usage page can supply the login', () => {
  assert.equal(isDevinAppUrl('https://app.devin.ai/settings/usage'), true);
  assert.equal(isDevinAppUrl('https://user:pass@app.devin.ai/settings/usage'), false);
  assert.equal(isDevinAppUrl('http://app.devin.ai/settings/usage'), false);
  assert.equal(isDevinAppUrl('https://evil.example/settings/usage'), false);
  assert.equal(isAllowedSignInUrl('https://accounts.google.com/o/oauth2'), true);
  assert.equal(isAllowedSignInUrl('http://app.devin.ai'), false);
  assert.equal(isAllowedSignInUrl('file:///tmp/page.html'), false);
  assert.equal(STORAGE_SCRIPT.includes('cookie'), false);
  assert.equal(STORAGE_SCRIPT.includes('document'), false);
});

test('the sign-in window saves the usage-page login and never shows it', async () => {
  const harness = createHarness();
  const saved = [];
  const states = [];
  const message = openDevinQuotaWindow({ ...harness.deps, saveSession: async token => { saved.push(token); }, onState: state => states.push(state) });
  assert.equal(message.includes(TOKEN), false);
  assert.equal(harness.windows[0].options.webPreferences.nodeIntegration, false);
  assert.equal(harness.windows[0].options.webPreferences.sandbox, true);
  assert.equal(harness.windows[0].options.webPreferences.preload, undefined);
  assert.equal(harness.permission(null, 'notifications', allowed => { harness.allowed = allowed; }), undefined);
  assert.equal(harness.allowed, false);
  harness.windows[0].webContents.storage = { auth1_session: TOKEN };
  await harness.poll();
  assert.deepEqual(saved, [TOKEN]);
  assert.equal(states.at(-1), null);
  assert.equal(JSON.stringify(states).includes(TOKEN), false);
  assert.equal(harness.windows[0].isDestroyed(), true);
  assert.equal(harness.session.requests, null);
});

test('a usage-page request can supply the login, and other sites cannot', async () => {
  const harness = createHarness();
  const saved = [];
  openDevinQuotaWindow({ ...harness.deps, saveSession: async token => { saved.push(token); }, onState() {} });
  harness.session.requests.listener({ url: 'http://app.devin.ai/settings/usage' }, result => { harness.cancelled = result.cancel; });
  assert.equal(harness.cancelled, true);
  const event = { preventDefault() { event.blocked = true; } };
  harness.windows[0].webContents.emit('will-navigate', event, 'http://app.devin.ai');
  assert.equal(event.blocked, true);
  assert.equal(harness.windows[0].webContents.openHandler({ url: 'javascript:alert(1)' }).action, 'deny');
  const popup = harness.windows[0].webContents.openHandler({ url: 'https://accounts.google.com/signin' });
  assert.equal(popup.action, 'allow');
  assert.equal(popup.overrideBrowserWindowOptions.webPreferences.nodeIntegration, false);
  const headers = { Authorization: `Bearer ${TOKEN}`, Cookie: 'private=value' };
  harness.session.headers.listener({ url: 'https://evil.example/api', requestHeaders: headers }, () => {});
  assert.deepEqual(saved, []);
  let continued = false;
  harness.session.headers.listener({ url: 'https://app.devin.ai/api/billing/quota/usage', requestHeaders: headers }, details => { continued = details.requestHeaders === headers; });
  await flush();
  assert.equal(continued, true);
  assert.deepEqual(saved, [TOKEN]);
  assert.equal(harness.windows[0].isDestroyed(), true);
});

test('closing the window early saves nothing, and a second click focuses it', () => {
  const harness = createHarness();
  const saved = [];
  const states = [];
  openDevinQuotaWindow({ ...harness.deps, saveSession: async token => { saved.push(token); }, onState: state => states.push(state) });
  harness.windows[0].close();
  assert.deepEqual(saved, []);
  assert.equal(states.at(-1).error, true);
  assert.match(states.at(-1).message, /closed/);
  const again = openDevinQuotaWindow({ ...harness.deps, saveSession: async () => {}, onState() {} });
  assert.match(again, /window that just opened/);
  const focused = openDevinQuotaWindow({ ...harness.deps, saveSession: async () => {}, onState() {} });
  assert.match(focused, /already open/);
  assert.equal(harness.windows.at(-1).focused, true);
  harness.windows.at(-1).close();
});

test('a save failure stays on screen without repeating the login', async () => {
  const harness = createHarness();
  const states = [];
  openDevinQuotaWindow({ ...harness.deps, saveSession: async () => { throw new Error(`bad ${TOKEN}`); }, onState: state => states.push(state) });
  harness.windows[0].webContents.storage = { auth1_session: TOKEN };
  await harness.poll();
  assert.equal(states.at(-1).error, true);
  assert.equal(states.at(-1).message.includes(TOKEN), false);
  assert.equal(harness.windows[0].isDestroyed(), false);
  harness.windows[0].close();
});

function createHarness() {
  const windows = [];
  const session = {
    requests: null,
    headers: null,
    setPermissionRequestHandler(fn) { session.permission = fn; },
    webRequest: {
      onBeforeRequest(filter, listener) { session.requests = listener ? { filter, listener } : null; },
      onBeforeSendHeaders(filter, listener) { session.headers = listener ? { filter, listener } : null; },
    },
  };
  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.focused = false;
      this.closedListeners = [];
      this.webContents = createContents();
      windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    focus() { this.focused = true; }
    once(name, fn) { if (name === 'closed') this.closedListeners.push(fn); }
    close() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const fn of this.closedListeners) fn();
    }
    async loadURL(url) { this.webContents.url = url; }
  }
  let poll = async () => {};
  return {
    windows, session, permission: (...args) => session.permission(...args),
    deps: {
      BrowserWindow, session: { fromPartition: () => session }, parent: { isDestroyed: () => false },
      schedule: fn => { poll = fn; return { unref() {} }; }, cancelSchedule() {},
    },
    poll: () => poll(),
  };
}

function createContents() {
  const listeners = {};
  return {
    url: '',
    storage: {},
    on(name, fn) { (listeners[name] ||= []).push(fn); },
    emit(name, ...args) { for (const fn of listeners[name] || []) fn(...args); },
    setWindowOpenHandler(fn) { this.openHandler = fn; },
    getURL() { return this.url; },
    executeJavaScript(script) { this.script = script; return Promise.resolve(this.storage); },
  };
}

function flush() { return new Promise(resolve => setImmediate(resolve)); }
});
