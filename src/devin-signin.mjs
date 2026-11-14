// Opens Devin’s own usage page and keeps only the website login needed for quota rings.
const DEVIN_APP_HOST = 'app.devin.ai';
const USAGE_URL = `https://${DEVIN_APP_HOST}/settings/usage`;
const PARTITION = 'persist:tokenlight-devin-quota';
const POLL_INTERVAL_MS = 1000;
const MIN_TOKEN_LENGTH = 12;
const MAX_TOKEN_LENGTH = 10000;
const MAX_STORAGE_VALUE = 20000;
const MAX_STORAGE_KEYS = 20;
const MAX_WALK_DEPTH = 4;
const SIGN_IN_WINDOW = { width: 440, height: 760, minWidth: 380, minHeight: 560 };
const OPEN_MESSAGE = 'Sign in to Devin in the window that just opened. It closes itself when the rings can update.';
const ALREADY_OPEN = 'The Devin sign-in window is already open.';
const CLOSED_EARLY = 'The Devin window was closed before the rings could update.';
const OPEN_FAILED = 'Devin’s sign-in page could not be opened.';
const SAVE_FAILED = 'Devin sign-in could not be saved.';

export const STORAGE_SCRIPT = `(() => {
  const keep = (key) => key === 'auth1_session' || key.includes('auth0') || key.toLowerCase().includes('accesstoken') || key.toLowerCase().includes('access_token');
  const picked = {};
  for (const store of [localStorage, sessionStorage]) {
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (!key || !keep(key) || Object.hasOwn(picked, key)) continue;
      const value = store.getItem(key);
      if (typeof value === 'string' && value.length > 0 && value.length <= ${MAX_STORAGE_VALUE}) picked[key] = value;
    }
  }
  return picked;
})()`;

let openWindow = null;

/** A normal Devin website login, never an API key. */
export function sessionTokenFromStorage(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const found = [];
  for (const [key, value] of Object.entries(record).slice(0, MAX_STORAGE_KEYS)) {
    if (typeof value !== 'string' || value.length > MAX_STORAGE_VALUE) continue;
    if (key === 'auth1_session' || key.includes('auth0') || /access[_-]?token/i.test(key)) walk(value, found, 0);
  }
  return found.find(token => token.startsWith('auth1_')) || found[0] || null;
}

/** The Authorization value Devin’s usage page sends to itself. */
export function sessionTokenFromAuthorization(headers) {
  if (!headers || typeof headers !== 'object') return null;
  const raw = headers.Authorization || headers.authorization;
  return typeof raw === 'string' ? acceptToken(stripBearer(raw)) : null;
}

/** True for the usage-page origin where the login may be read. */
export function isDevinAppUrl(value) {
  const url = httpsUrl(value);
  return !!url && url.hostname === DEVIN_APP_HOST;
}

/** True for a sign-in navigation that stays on encrypted web pages. */
export function isAllowedSignInUrl(value) {
  return !!httpsUrl(value);
}

/**
 * Opens Devin’s usage page in an isolated window and saves the website login.
 * The returned text is safe to show; the login itself never leaves this process.
 */
export function openDevinQuotaWindow({ BrowserWindow, session, parent, saveSession, onState, schedule = setInterval, cancelSchedule = clearInterval }) {
  if (openWindow && !openWindow.isDestroyed()) {
    openWindow.focus();
    return ALREADY_OPEN;
  }
  const partitionSession = session.fromPartition(PARTITION);
  const webPreferences = isolatedPreferences(PARTITION);
  const win = new BrowserWindow({
    width: SIGN_IN_WINDOW.width,
    height: SIGN_IN_WINDOW.height,
    minWidth: SIGN_IN_WINDOW.minWidth,
    minHeight: SIGN_IN_WINDOW.minHeight,
    title: 'Sign in to Devin',
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    show: true,
    autoHideMenuBar: true,
    backgroundColor: '#1c1c1e',
    webPreferences,
  });
  openWindow = win;
  win.once('closed', () => { if (openWindow === win) openWindow = null; });
  partitionSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const block = (_event, url) => { if (!isAllowedSignInUrl(url)) _event.preventDefault(); };
  win.webContents.on('will-navigate', block);
  win.webContents.on('will-redirect', block);
  win.webContents.setWindowOpenHandler(({ url }) => isAllowedSignInUrl(url)
    ? { action: 'allow', overrideBrowserWindowOptions: { parent: win, width: SIGN_IN_WINDOW.width, height: SIGN_IN_WINDOW.height, autoHideMenuBar: true, webPreferences } }
    : { action: 'deny' });
  const abandon = watchSignIn(win, partitionSession, { saveSession, onState, schedule, cancelSchedule });
  void win.loadURL(USAGE_URL).catch(() => abandon(OPEN_FAILED));
  onState({ pending: true, message: OPEN_MESSAGE });
  return OPEN_MESSAGE;
}

function watchSignIn(win, partitionSession, { saveSession, onState, schedule, cancelSchedule }) {
  let done = false;
  let saving = false;
  const timer = schedule(poll, POLL_INTERVAL_MS);
  timer.unref?.();
  const cleanup = () => {
    cancelSchedule(timer);
    try { partitionSession.webRequest.onBeforeRequest(null); } catch { /* The listener is already gone. */ }
    try { partitionSession.webRequest.onBeforeSendHeaders(null); } catch { /* The listener is already gone. */ }
  };
  const abandon = message => {
    if (done) return;
    done = true;
    cleanup();
    onState({ pending: false, error: true, message });
    if (!win.isDestroyed()) win.close();
  };
  const finish = async token => {
    if (done || saving || !token) return;
    saving = true;
    try {
      await saveSession(token);
      done = true;
      cleanup();
      onState(null);
      if (!win.isDestroyed()) win.close();
    } catch (error) {
      saving = false;
      onState({ pending: true, error: true, message: publicSaveError(error, token) });
    }
  };
  partitionSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    callback(isAllowedSignInUrl(details.url) ? {} : { cancel: true });
  });
  partitionSession.webRequest.onBeforeSendHeaders({ urls: [`https://${DEVIN_APP_HOST}/*`] }, (details, callback) => {
    const headers = details.requestHeaders || {};
    callback({ requestHeaders: headers });
    if (isDevinAppUrl(details.url)) void finish(sessionTokenFromAuthorization(headers));
  });
  win.once('closed', () => {
    cleanup();
    if (done || saving) return;
    done = true;
    onState({ pending: false, error: true, message: CLOSED_EARLY });
  });
  return abandon;

  async function poll() {
    if (done || saving || win.isDestroyed() || !isDevinAppUrl(win.webContents.getURL())) return;
    try { await finish(sessionTokenFromStorage(await win.webContents.executeJavaScript(STORAGE_SCRIPT, true))); }
    catch { /* The page is navigating. The next check tries again. */ }
  }
}

function isolatedPreferences(partition) {
  return { partition, contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false };
}

function httpsUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

function walk(value, found, depth) {
  if (depth > MAX_WALK_DEPTH) return;
  if (typeof value === 'string') {
    const token = acceptToken(stripBearer(value));
    if (token) found.push(token);
    if (value.startsWith('{') || value.startsWith('[')) {
      try { walk(JSON.parse(value), found, depth + 1); } catch { /* A storage value can be ordinary text. */ }
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const nested of Object.values(value)) walk(nested, found, depth + 1);
}

function stripBearer(value) {
  return value.trim().replace(/^Bearer\s+/i, '');
}

function acceptToken(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH || /\s/.test(token)) return null;
  if (token.startsWith('cog_') || token.startsWith('apk_')) return null;
  if (/^auth1_[A-Za-z0-9._~+/-]+=*$/.test(token)) return token;
  const parts = token.split('.');
  if (parts.length === 3 && parts.every(part => part.length > 0 && /^[A-Za-z0-9_-]+$/.test(part))) return token;
  return null;
}

function publicSaveError(error, token) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (!message || message.length > 180 || message.includes(token)) return SAVE_FAILED;
  return message;
}
