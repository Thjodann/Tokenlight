import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm, writeFile, access, mkdir } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the real renderer and cascade, with an invented snapshot and bridge only.
const checks = async () => {
  const results = [];
  const check = async (name, fn) => { try { await fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, error: e.stack }); } };
  const equal = (a, b, label = '') => { if (a !== b) throw Error(`${label}: ${a} != ${b}`); };
  const root = document.documentElement;
  const sample = { version: '0.6.13', demo: true, month: '2026-11', appearance: { dark: false }, settings: { accountProfiles: {}, showRemainingAllowance: false, interfaceColors: null }, presentation: { dashboard: true, view: 'providers', provider: 'cursor', interfaceColors: null, interfaceColorsCustom: false }, cards: [{ id: 'cursor', title: 'Sample Cursor', kind: 'account', status: 'ready', unit: 'requests', monthly: 120, daily: [{ date: '2026-11-01', value: 20 }, { date: '2026-11-02', value: 40 }], windows: [{ label: 'Primary', percent: 30 }, { label: 'Secondary', percent: 85 }] }] };
  let receive, resolveApply, applied;
  window.tokenlight = { snapshot: async () => structuredClone(sample), onSnapshot: fn => { receive = fn; }, onConnections() {}, onUpdates() {}, dashboardInterfaceColors: colors => { applied = colors; return new Promise(resolve => { resolveApply = resolve; }); } };
  await import('/src/renderer.mjs');
  const send = value => receive(structuredClone(value));
  const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
  const rgb = color => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data].slice(0, 3); };
  const luminance = color => rgb(color).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
  const resolved = token => { const el = document.createElement('i'); el.style.color = `var(${token})`; document.body.append(el); const color = css(el, 'color'); el.remove(); return color; };
  await check('primary-normal Cursor graph ignores secondary warning and critical rings', () => {
    for (const percent of [85, 96]) {
      sample.cards[0].windows[1].percent = percent; send(sample);
      const graph = document.querySelector('.provider-lane .line-stroke');
      equal(rgb(css(graph, 'stroke')).join(), rgb(css(document.querySelector('.provider-monitor'), '--source-accent')).join(), `secondary ${percent}`);
    }
    for (const percent of [85, 96]) {
      sample.cards[0].windows[0].percent = percent; send(sample);
      equal(rgb(css(document.querySelector('.line-stroke'), 'stroke')).join(), rgb(resolved(percent === 85 ? '--warning' : '--danger')).join(), 'primary severity');
    }
    sample.cards[0].windows[0].percent = 30;
  });
  await check('all six provider palettes survive custom chrome in both themes', () => {
    sample.cards[0].windows[0].percent = 30;
    for (const dark of [false, true]) {
      sample.appearance.dark = dark; sample.presentation.interfaceColorsCustom = false; send(sample);
      const monitor = document.querySelector('.provider-monitor');
      const identities = {};
      for (const provider of ['openai','anthropic','cursor','elevenlabs','ollama','devin']) { monitor.dataset.provider = provider; identities[provider] = css(monitor, '--source-accent'); }
      sample.presentation.interfaceColorsCustom = true; sample.presentation.interfaceColors = { surface: '#ff0055', accent: '#00ff00' }; send(sample);
      const customMonitor = document.querySelector('.provider-monitor');
      for (const [provider, color] of Object.entries(identities)) {
        customMonitor.dataset.provider = provider;
        equal(css(customMonitor, '--source-accent'), color, provider);
        equal(rgb(css(customMonitor.querySelector('.line-stroke'), 'stroke')).join(), rgb(color).join(), provider + ' graph');
      }
    }
  });
  await check('custom light and dark tokens retain native luminance and readable accent contrast', () => {
    for (const dark of [false, true]) {
      sample.appearance.dark = dark; sample.presentation.interfaceColorsCustom = false; send(sample);
      const native = Object.fromEntries(['--bg', '--panel', '--raised', '--line', '--line-strong', '--track', '--accent'].map(t => [t, luminance(resolved(t))]));
      for (const surface of ['#000000', '#ffffff', '#ff0055', '#0033ff', '#00ff00']) {
        sample.presentation.interfaceColors = { surface, accent: '#ff0055' }; sample.presentation.interfaceColorsCustom = true; send(sample);
        for (const token of Object.keys(native)) {
          const actual = luminance(resolved(token));
          if (Math.abs(actual - native[token]) > .012) throw Error(`${dark ? 'dark' : 'light'} ${surface} ${token}: ${actual} vs native ${native[token]}`);
        }
        const a = luminance(resolved('--accent')), p = luminance(resolved('--panel'));
        if ((Math.max(a,p)+.05)/(Math.min(a,p)+.05) < 4.5) throw Error('accent contrast below 4.5');
      }
    }
  });
  await check('local dashboard edits survive stale renders before acknowledgement and sync chips', async () => {
    sample.presentation.interfaceColors = null; sample.presentation.interfaceColorsCustom = false; send(sample);
    const edited = { surface: '#aa55cc', accent: '#ff6699' };
    const assertSynced = colors => {
      for (const key of ['surface', 'accent']) {
        equal(document.querySelector(`[data-dashboard-color="${key}"]`).value, colors[key], key + ' input');
        for (const selector of ['.monitor-color-chip', '.monitor-dual-color']) equal(css(document.querySelector(selector), `--picker-${key}`), colors[key], selector);
        equal(root.style.getPropertyValue(`--interface-${key}`), colors[key], key + ' root');
      }
    };
    document.querySelector('.monitor-colors').open = true;
    for (const [key, value] of Object.entries(edited)) { const el = document.querySelector(`[data-dashboard-color="${key}"]`); el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }
    send(sample); assertSynced(edited);
    equal(document.querySelector('.monitor-colors').open, true, 'popover remains open');
    document.querySelector('[data-dashboard-colors-apply]').click();
    equal(JSON.stringify(applied), JSON.stringify(edited), 'Apply sends local draft');
    sample.appearance.dark = false; send(sample); assertSynced(edited);
    sample.presentation.interfaceColors = edited; sample.presentation.interfaceColorsCustom = true;
    resolveApply(structuredClone(sample)); await new Promise(r => setTimeout(r, 0)); assertSynced(edited);
    document.querySelector('[data-dashboard-colors-apply]').click();
    const newer = { surface: '#55aacc', accent: '#cc6699' };
    for (const [key,value] of Object.entries(newer)) { const el = document.querySelector(`[data-dashboard-color="${key}"]`); el.value = value; el.dispatchEvent(new Event('input', { bubbles:true })); }
    resolveApply(structuredClone(sample)); await new Promise(r => setTimeout(r,0)); assertSynced(newer);
    document.querySelector('[data-dashboard-colors-apply]').click();
    sample.presentation.interfaceColors = newer;
    resolveApply(structuredClone(sample)); await new Promise(r => setTimeout(r,0)); assertSynced(newer);
    // Two saves may acknowledge out of order; the older response cannot win.
    document.querySelector('[data-dashboard-colors-apply]').click();
    const olderResolve = resolveApply;
    document.querySelector('[data-dashboard-colors-apply]').click();
    resolveApply(structuredClone(sample)); await new Promise(r => setTimeout(r,0));
    const outdated = structuredClone(sample); outdated.presentation.interfaceColors = edited;
    olderResolve(outdated); await new Promise(r => setTimeout(r,0)); assertSynced(newer);
    // Reopen from persisted snapshot, then reset to inherited app colors.
    send(sample); assertSynced(newer);
    document.querySelector('[data-dashboard-colors-reset]').click();
    equal(applied, null, 'reset request');
    const reset = structuredClone(sample); reset.presentation.interfaceColors = null; reset.presentation.interfaceColorsCustom = false;
    send(sample); // an unrelated, stale render while reset is in flight
    equal(document.querySelector('[data-dashboard-color="surface"]').value, '#edf1f3', 'reset preview');
    resolveApply(reset); await new Promise(r => setTimeout(r, 0));
    equal(root.dataset.interfaceColors, undefined, 'reset root');
    send(reset); equal(document.querySelector('[data-dashboard-color="accent"]').value, '#237762', 'reopen reset');
    reset.settings.interfaceColors = { surface:'#aabbcc', accent:'#446688' };
    send(reset); assertSynced(reset.settings.interfaceColors);
    equal(document.querySelector('[data-dashboard-colors-reset]').disabled, true, 'inherited app colors need no reset');
  });
  window.colorQA = { sample, send };
  const report = document.createElement('pre'); report.id = 'results'; report.hidden = true; document.body.append(report);
  document.querySelector('#results').textContent = JSON.stringify(results);
};

test('sample-data browser color regressions', async t => {
  const chromium = process.env.TOKENLIGHT_TEST_CHROMIUM || '/usr/lib/chromium/chromium';
  try { await access(chromium); } catch { t.skip('Chromium unavailable'); return; }
  const html = (await readFile(new URL('../src/index.html', import.meta.url), 'utf8')).replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '').replace('<head>', '<head><base href="/src/">').replace('<script type="module" src="renderer.mjs"></script>', `<script type="module">(${checks.toString()})().catch(e => { document.body.innerHTML = '<pre id="results">' + JSON.stringify([{name:'harness',ok:false,error:String(e.stack)}]) + '</pre>'; });</script>`);
  const server = createServer(async (req, res) => {
    try { if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
      if (!/^\/src\/[\w.-]+$/.test(req.url)) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(await readFile(new URL('..' + req.url, import.meta.url)));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const profile = await mkdtemp(join(tmpdir(), 'tokenlight-color-test-'));
  try {
    const child = spawn(chromium, ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions', '--no-first-run', '--no-proxy-server', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { env: { ...process.env, XDG_CONFIG_HOME: profile, XDG_CACHE_HOME: profile } });
    let stderr = '';
    child.stderr.on('data', b => { stderr += b; });
    const delay = () => new Promise(r => setTimeout(r, 100));
    const deadline = Date.now() + 20000;
    let ws, stdout;
    try {
      while (!stderr.includes('DevTools listening on ') && Date.now() < deadline) await delay();
      const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
      assert.ok(endpoint, 'Chromium debugging endpoint started');
      const targets = await (await fetch(endpoint.replace('ws:', 'http:').replace(/\/devtools\/browser\/.*/, '/json/list'))).json();
      ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
      await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
      let id = 0; const pending = new Map();
      ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id) { pending.get(m.id)?.(m); pending.delete(m.id); } };
      const call = (method, params = {}) => new Promise((resolve, reject) => {
        const request = ++id;
        const timer = setTimeout(() => { pending.delete(request); reject(new Error('Chromium command timed out: ' + method)); }, 5000);
        pending.set(request, message => { clearTimeout(timer); message.error ? reject(new Error(message.error.message)) : resolve(message); });
        ws.send(JSON.stringify({ id: request, method, params }));
      });
      await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
      while (Date.now() < deadline) {
        const response = await call('Runtime.evaluate', { expression: 'document.querySelector("#results")?.outerHTML', returnByValue: true });
        stdout = response.result?.result?.value;
        if (stdout) break;
        await delay();
      }
      if (process.env.TOKENLIGHT_COLOR_EVIDENCE) {
        const directory = process.env.TOKENLIGHT_COLOR_EVIDENCE;
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'results.html'), stdout || '');
        await call('Emulation.setDeviceMetricsOverride', { width: 720, height: 640, deviceScaleFactor: 1, mobile: false });
        for (const dark of [false, true]) {
          await call('Runtime.evaluate', { expression: `(() => { const {sample,send} = window.colorQA; sample.appearance.dark = ${dark}; sample.presentation.interfaceColorsCustom = true; sample.presentation.interfaceColors = {surface:'#aa55cc',accent:'#ff6699'}; send(sample); document.querySelector('.monitor-colors').open = true; })()` });
          await delay();
          const shot = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile(join(directory, dark ? 'custom-dark.png' : 'custom-light.png'), Buffer.from(shot.result.data, 'base64'));
        }
      }
    } finally {
      ws?.close();
      if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
        const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        child.kill('SIGTERM');
      });
    }
    const raw = (stdout || '').match(/<pre id="results"[^>]*>([\s\S]*?)<\/pre>/)?.[1];
    assert.ok(raw, 'browser harness completed');
    for (const result of JSON.parse(raw.replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&'))) await t.test(result.name, () => assert.ok(result.ok, result.error));
  } finally { server.closeAllConnections(); server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
