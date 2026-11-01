import { insightsPage, financeDetails, cardCosts } from './insight-view.mjs';
import { wideView, WIDE_QUERY } from './wide-view.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { miniView, MINI_QUERY } from './mini-view.mjs';
import { creditSection } from './credit-view.mjs';
import { SOURCES, currentMonth, formatCount, finite, resetCountdown } from './model.mjs';
const compactQuery = window.matchMedia(MINI_QUERY);
const wideQuery = window.matchMedia(WIDE_QUERY);
const $ = s => document.querySelector(s);
const api = window.tokenlight;
let snapshot, view = 'overview', selected = null, detailDirty = false, toastTimer, currentMini = false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const monthName = value => new Date(value + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullCount = n => finite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'Not available';
function since(ms) { if (!ms) return 'Not connected'; const seconds = Math.max(0, (Date.now() - ms) / 1000); return seconds < 60 ? 'Just updated' : seconds < 3600 ? `${Math.floor(seconds / 60)} min ago` : seconds < 86400 ? `${Math.floor(seconds / 3600)} hr ago` : `${Math.floor(seconds / 86400)} days ago`; }
function reset(ms, long = false) {
  if (!Number.isFinite(ms)) return 'Reset not reported';
  if (long) return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  return resetCountdown(ms);
}
const hasReading = c => finite(c.monthly) || c.windows?.length > 0 || finite(c.lastUpdatedAt);
const activeWindow = c => c.windows?.find(w => !w.resetsAt || w.resetsAt > Date.now());
const poolPercent = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
function allowancePools(windows) {
  return `<div class="allowance-pools">${windows.map(w => `<div class="allowance-pool ${w.percent >= 95 ? 'high' : w.percent >= 80 ? 'warning' : ''}"><div class="pool-heading"><span>${esc(w.label)}</span><strong>${poolPercent(w.percent)}% used</strong></div><svg class="pool-track" viewBox="0 0 100 3" preserveAspectRatio="none" role="img" aria-label="${esc(w.label)}: ${poolPercent(w.percent)} percent used"><rect class="pool-background" width="100" height="3"/><rect class="pool-fill" width="${Math.min(100, Math.max(0, w.percent))}" height="3"/></svg><span class="pool-reset">${Number.isFinite(w.resetsAt) ? 'Resets ' + reset(w.resetsAt) : 'Reset not reported'}</span></div>`).join('')}</div>`;
}
function gauge(percent, label) {
  if (!finite(percent)) return '';
  const fill = Math.max(0, Math.min(percent, 100)) * 1.25664;
  return `<div class="gauge ${percent >= 95 ? 'high' : percent >= 80 ? 'warning' : ''}" role="img" aria-label="${esc(label)}: ${Math.round(percent)} percent used"><svg viewBox="0 0 48 48" aria-hidden="true"><circle class="gauge-track" cx="24" cy="24" r="20"/><circle class="gauge-progress" cx="24" cy="24" r="20" stroke-dasharray="${fill} 125.664"/></svg><span>${Math.round(percent)}%</span></div>`;
}
function chart(c) {
  if (!c.daily?.length) return `<div class="trend-empty">${c.historyNote ? 'Monthly history unavailable' : c.monthly === 0 ? 'No usage reported this month' : 'Daily history isn’t available for this source'}</div>`;
  const max = Math.max(1, ...c.daily.map(d => d.value)), days = new Date(Number(snapshot.month.slice(0, 4)), Number(snapshot.month.slice(5)), 0).getDate();
  const today = new Date().toISOString().slice(0, 10), segments = []; let previousDay;
  for (const d of [...c.daily].filter(d => d.date.startsWith(snapshot.month + '-') && d.date <= today && finite(d.value)).sort((a, b) => a.date.localeCompare(b.date))) {
    const day = Number(d.date.slice(8)); if (day !== previousDay + 1) segments.push([]);
    segments.at(-1).push([(day - 1) / (days - 1) * 240, 46 - d.value / max * 39]); previousDay = day;
  }
  const id = `area-${c.id}`, marks = segments.map(points => {
    const line = points.map(p => p.join(',')).join(' ');
    return points.length === 1 ? `<circle cx="${points[0][0]}" cy="${points[0][1]}" r="1.5" fill="currentColor"/>` : `<polygon points="${points[0][0]},50 ${line} ${points.at(-1)[0]},50" fill="url(#${id})"/><polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  return `<div class="trend"><svg viewBox="0 0 240 50" preserveAspectRatio="none" role="img" aria-label="Daily reported ${esc(c.unit || 'token')} usage for ${esc(monthName(snapshot.month))}; gaps mean no reported reading"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="currentColor" stop-opacity=".13"/><stop offset="100%" stop-color="currentColor" stop-opacity=".015"/></linearGradient></defs><path class="chart-grid" d="M0 47H240M0 23H240"/>${marks}</svg></div>`;
}
function card(c) {
  const pools = ['cursor', 'claude'].includes(c.id) ? (c.windows || []).filter(w => (c.id === 'claude' || w.pool) && finite(w.percent)) : [];
  const reading = hasReading(c), loading = c.status === 'refreshing', stale = c.status === 'stale', w = pools.length ? null : activeWindow(c);
  const windowPercent = w?.percent ?? (c.monthlyTarget && finite(c.monthly) ? c.monthly / c.monthlyTarget * 100 : null);
  const plan = c.plan ? String(c.plan).replace(/^promax$/i, 'Pro Max').replace(/^ultra$/i, 'Ultra').replace(/^max$/i, 'Max').replace(/^pro$/i, 'Pro') : null;
  const header = `<div class="card-top"><span class="source-icon" aria-hidden="true">${providerLogo(c.id)}</span><div><h3 class="source-name">${c.title}</h3><p class="source-meta">${c.organization} · ${c.kind === 'account' ? 'account' : 'API'}</p></div>${plan ? `<span class="plan-pill" title="${esc(plan)}">${esc(plan)}</span>` : ''}<button class="card-detail" aria-label="Details for ${c.title}" data-action="details" data-id="${c.id}">···</button></div>`;
  if (!reading) {
    const setup = c.status !== 'unconnected' && !loading;
    return `<article class="source-card source--${c.id} ${loading ? 'is-loading' : ''}" data-provider="${providerFor(c.id)}" aria-label="${c.title}">${header}<div class="setup-body">${loading ? '<span class="skeleton-value" aria-hidden="true"></span><p class="setup-title">Reading your usage…</p><p class="setup-description">Connecting directly to this source.</p>' : `<span class="setup-glyph" aria-hidden="true">⌁</span><p class="setup-title">${setup ? c.id === 'claude' ? 'Connect your Max account' : 'A little setup needed' : 'Ready when you are'}</p><p class="setup-description">${esc(c.error || c.description)}</p><button class="button" data-action="details" data-id="${c.id}">${c.id === 'claude' ? 'Connect account' : c.kind === 'api' ? 'Set up usage access' : 'Connect account'} <span aria-hidden="true">↗</span></button>`}</div><div class="card-footer"><span>${loading ? 'Checking connection' : 'No usage inferred'}</span><span>${c.kind === 'api' ? 'Reporting key' : 'Desktop account'}</span></div></article>`;
  }
  const monthly = finite(c.monthly), number = monthly ? formatCount(c.monthly) : finite(w?.percent) ? Math.round(w.percent) : '—';
  const unit = monthly ? c.unit : finite(w?.percent) ? '% used' : '';
  const label = monthly ? `${c.partial && c.id === 'claude' ? 'On this Mac' : snapshot.month === currentMonth() ? 'Month to date' : 'Monthly activity'} <strong>· ${esc(c.unit)}</strong>` : w ? `${esc(w.label)} allowance` : 'Monthly usage not reported';
  return `<article class="source-card source--${c.id} ${loading ? 'is-loading' : ''}" data-provider="${providerFor(c.id)}" aria-label="${c.title}">${header}<div class="metric-row"><div><div class="metric-value" title="${esc(fullCount(c.monthly))}">${number}${!monthly && unit ? `<small>${unit}</small>` : ''}</div><p class="metric-label">${label}</p></div>${pools.length ? '' : gauge(windowPercent, w?.label || 'Monthly target')}</div>${creditSection(c)}${cardCosts(c, snapshot)}${!c.creditBalances?.length && c.balanceSummary ? `<p class="balance-summary">${esc(c.balanceSummary)}</p>` : ""}${chart(c)}<div class="trend-label"><span>01 ${new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</span><span>${monthly ? 'DAILY ACTIVITY · UTC' : w ? 'REPORTED ALLOWANCE' : 'AWAITING MONTHLY REPORT'}</span></div>${pools.length ? allowancePools(pools) : w ? `<div class="window-row"><strong>${Math.round(w.percent)}% used</strong><span>· ${esc(w.label)}</span><span class="reset-label">${Number.isFinite(w.resetsAt) ? 'Resets ' + reset(w.resetsAt) : 'Reset not reported'}</span></div>` : c.monthlyTarget ? `<div class="window-row"><strong>${formatCount(c.monthlyTarget)} ${esc(c.unit)}</strong><span>monthly target</span></div>` : '<div class="window-row"><span>No monthly target set</span></div>'}<div class="card-footer"><span class="status-text"><i class="status-dot ${stale ? 'stale' : ''}"></i>${stale ? 'Last reading · offline or delayed' : loading ? 'Refreshing' : since(c.lastUpdatedAt)}</span>${c.partial ? '<span class="source-note">Partial history</span>' : `<span>${snapshot.demo ? 'Sample data' : 'Source connected'}</span>`}</div></article>`;
}
function render() {
  if (!snapshot) return;
  const currentWide = snapshot.settings.layoutMode !== 'mini' && wideQuery.matches;
  currentMini = snapshot.settings.layoutMode === 'mini' || (compactQuery.matches && !currentWide);
  document.body.dataset.wide = String(currentWide);
  document.body.dataset.mini = String(currentMini);
  $('#mini-month').textContent = new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  $('#layout-toggle').textContent = currentMini ? 'Full' : 'Mini';
  $('#layout-toggle').setAttribute('aria-label', currentMini ? 'Expand full dashboard' : 'Use mini dashboard');
  $('#layout-toggle').setAttribute('aria-pressed', String(currentMini));
  const active = document.activeElement, focusId = active?.id, focusAction = active?.dataset?.action, focusSource = active?.dataset?.id, wasMain = $('#main').contains(active);
  const selectedCards = snapshot.cards.filter(c => view === 'overview' || c.kind === view), connected = snapshot.cards.filter(hasReading).length;
  const needs = snapshot.cards.filter(c => ['setup', 'stale', 'unconnected'].includes(c.status)).length;
  const next = snapshot.cards.flatMap(c => c.windows || []).filter(w => w.resetsAt > Date.now()).sort((a, b) => a.resetsAt - b.resetsAt)[0];
  const busy = snapshot.cards.some(c => c.status === 'refreshing');
  $('#sync-status').textContent = snapshot.demo ? 'Sample data' : busy ? 'Updating sources' : 'Read-only monitoring';
  $('#sync-status').classList.toggle('syncing', busy);
  $('#refresh-button').disabled = busy;
  $('#version').textContent = snapshot.version;
  const names = { overview: ['Overview', 'Usage', 'Accounts and API activity'], account: ['Accounts', 'Accounts', 'Activity and current allowances'], api: ['API usage', 'API usage', 'Organization activity · calendar month'], insights: ['Insights', 'Spending & insights', 'Costs, model mileage and account history'] };
  $('#breadcrumb').textContent = names[view][0];
  const sections = view === 'insights' ? insightsPage(snapshot) : ['account', 'api'].filter(k => view === 'overview' || k === view).map(kind => `<section aria-label="${kind === 'account' ? 'AI accounts' : 'API usage'}"><div class="section-heading"><div class="section-label"><h2>${kind === 'account' ? 'AI accounts' : 'API usage'}</h2><span>${snapshot.cards.filter(c => c.kind === kind).length}</span></div><p>${kind === 'account' ? 'Account activity & current allowances' : 'Calendar month · UTC'}</p></div><div class="cards" data-kind="${kind}">${selectedCards.filter(c => c.kind === kind).map(card).join('')}</div></section>`).join('');
  const dashboard = `${snapshot.demo ? '<div class="demo-banner"><strong>Sample data</strong><span>These readings are examples. Live connections are paused.</span><button class="button" data-action="live">Use live data</button></div>' : ''}<div class="page-heading"><div><span class="eyebrow">MONTHLY ACTIVITY</span><h1>${names[view][1]}</h1><p class="page-description">${names[view][2]}</p></div><div class="period-picker" aria-label="Reporting month"><button class="icon-button" data-action="previous" aria-label="Previous month">‹</button><input type="month" id="month-control" value="${snapshot.month}" min="2020-01" max="${currentMonth()}" aria-label="Choose reporting month"><button class="icon-button" data-action="next" aria-label="Next month" ${snapshot.month === currentMonth() ? 'disabled' : ''}>›</button></div></div><div class="overview-stats"><div class="overview-stat"><span class="stat-symbol" aria-hidden="true">⌁</span><div><p class="stat-label">Connected sources</p><p class="stat-value">${connected}<span>of ${snapshot.cards.length} sources</span></p></div></div><div class="overview-stat"><span class="stat-symbol" aria-hidden="true">${needs ? '◌' : '✓'}</span><div><p class="stat-label">Needs attention</p><p class="stat-value">${busy && !connected ? 'Checking' : needs ? `${needs} source${needs === 1 ? '' : 's'}` : 'All connected'}</p></div></div><div class="overview-stat"><span class="stat-symbol" aria-hidden="true">◷</span><div><p class="stat-label">Next allowance reset</p><p class="stat-value">${next ? reset(next.resetsAt) : 'Not reported'}<span>${next ? new Date(next.resetsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</span></p></div></div></div>${snapshot.fileError ? `<div class="attention-banner"><span>${esc(snapshot.fileError)}</span><button data-action="connections">Choose file</button></div>` : ''}${sections}<footer class="page-footer"><p><span aria-hidden="true">◈</span>Data stays on your Mac. Each source keeps its own units and allowance window.</p><button data-action="export">Export snapshot ↗</button></footer>`;
  $('#main').innerHTML = `<div class="dashboard-content">${dashboard}</div><div class="wide-content">${wideView(snapshot,view)}</div>${miniView(snapshot)}`;
  for (const button of document.querySelectorAll('[data-view]')) { button.classList.toggle('active', button.dataset.view === view); button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'); }
  for (const monthControl of document.querySelectorAll('input[type="month"]')) monthControl.addEventListener('change', async e => {
    const month = e.target.value;
    const value = month ? await run(() => api.month(month)) : null;
    const control = e.target;
    if (!value?.cards && control) control.value = snapshot.month;
  });
  if ($('#connections-dialog').open) renderConnections();
  if ($('#details-dialog').open && !detailDirty && !$('#details-content').contains(document.activeElement)) renderDetails();
  if (wasMain && !document.querySelector('dialog[open]')) {
    const restore = focusId ? document.getElementById(focusId) : focusAction ? [...document.querySelectorAll(`[data-action="${focusAction}"]${focusSource ? `[data-id="${focusSource}"]` : ''}`)].find(el => el.getClientRects().length) : null;
    restore?.focus({ preventScroll: true });
  }
}
function renderConnections() {
  $('#secrets-path').textContent = snapshot.settings.secretsPath || 'No file selected';
  const warning = snapshot.fileError || snapshot.vaultError; $('#connection-warning').hidden = !warning; $('#connection-warning').textContent = warning || '';
  $('#demo-button').textContent = snapshot.demo ? 'Use live data' : 'Preview';
  $('#connection-list').innerHTML = snapshot.cards.map(c => `<div class="connection-row" data-provider="${providerFor(c.id)}"><span class="source-icon">${providerLogo(c.id)}</span><div class="connection-text"><strong>${c.title}</strong><p>${snapshot.demo ? 'Showing sample data' : c.error ? esc(c.error) : hasReading(c) ? `Connected · ${esc(c.sourceLabel)} · ${since(c.lastUpdatedAt)}` : 'Not connected yet'}</p></div><button class="button" data-action="details" data-id="${c.id}">${c.kind === 'api' ? 'Configure' : hasReading(c) ? 'Details' : 'Connect'}</button></div>`).join('');
}
function showConnections() { renderConnections(); $('#connections-dialog').showModal(); }
function showDetails(id) { selected = id; detailDirty = false; renderDetails(); $('#details-dialog').showModal(); }
function renderDetails() {
  const c = snapshot.cards.find(c => c.id === selected); if (!c) return;
  $('#details-dialog').dataset.provider = providerFor(c.id);
  $('#details-logo').innerHTML = providerLogo(c.id);
  $('#details-title').textContent = c.title; $('#details-provider').textContent = c.kind === 'account' ? `${c.organization} · AI account` : `${c.organization} · API connection`;
  const metric = finite(c.monthly) ? `<div class="detail-reading"><div class="detail-stat"><span>${esc(monthName(snapshot.month))} · ${c.id === 'claude' ? 'local logs' : 'UTC'}</span><strong>${fullCount(c.monthly)} <small>${esc(c.unit)}</small></strong></div><div class="detail-stat"><span>Last successful reading</span><strong>${since(c.lastUpdatedAt)}</strong></div></div>` : '';
  const windows = (c.windows || []).map(w => `<div class="detail-window"><span>${esc(w.label)} <strong>${w.pool ? poolPercent(w.percent) : Math.round(w.percent)}% used</strong></span><small>${reset(w.resetsAt, true)}</small></div>`).join('');
  const credentials = c.kind === 'api' ? `<div class="detail-section"><h3>${['elevenlabs', 'ollama'].includes(c.id) ? 'API key' : 'Usage-reporting key'}</h3><p>${c.id === 'ollama' ? 'Use your Ollama Cloud API key. Usage and balance are read without generating model requests.' : c.id === 'elevenlabs' ? 'Use a key with access to subscription and usage data.' : 'Organization usage reporting needs an admin credential. A normal key used for prompts may not have access.'}</p><form id="key-form"><label for="provider-key">${c.id === 'openai' ? 'OPENAI_ADMIN_KEY' : c.id === 'anthropic' ? 'ANTHROPIC_ADMIN_KEY' : c.id === 'ollama' ? 'OLLAMA_CLOUD_API_KEY' : 'ELEVENLABS_API_KEY'}</label><div class="input-row"><input id="provider-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste a new key" minlength="12" required ${snapshot.demo ? 'disabled' : ''}><button class="button button-primary" type="submit" ${snapshot.demo ? 'disabled' : ''}>Save securely</button></div></form><p class="input-help">Encrypted with macOS secure storage. Keys are never included in exports. Your existing secrets file is also supported.</p><button class="text-link" data-action="credentials" data-id="${c.id}">Open provider key settings ↗</button></div>` : `<div class="detail-section"><h3>Your desktop account</h3><p>${c.id === 'claude' ? 'Sign in to Claude Code with the subscription you want to monitor. Connect then reads its local session; macOS may ask you to allow Keychain access.' : c.id === 'cursor' ? 'Reads your current Cursor desktop session without changing it. If sign-in has expired, sign in again in Cursor and reconnect here.' : 'Reads your Codex account through the bundled helper. Sign in to Codex with ChatGPT if the connection needs setup.'}</p><div class="detail-actions">${c.id === 'claude' ? '<button class="button button-primary" data-action="signin" data-id="claude">Sign in to Claude Code</button>' : ''}<button class="button" data-action="connect" data-id="${c.id}">Connect${hasReading(c) ? ' again' : ''}</button></div></div>`;
  $('#details-content').innerHTML = `<p class="detail-description">${esc(c.description)}</p>${snapshot.demo ? '<div class="detail-notice">Sample data is active. Leave the preview to verify a live connection.</div>' : c.error ? `<div class="detail-notice error">${esc(c.error)}</div>` : ''}${metric}${windows}${creditSection(c, true)}${c.creditNote ? `<p class="detail-description">${esc(c.creditNote)}</p>` : ''}${c.costNote ? `<div class="detail-notice">${esc(c.costNote)}</div>` : ''}${c.allowanceNote ? `<p class="detail-description">${esc(c.allowanceNote)}</p>` : ''}${c.id === 'ollama' && (finite(c.rollingRequests) || finite(c.rollingUsageUsd)) ? `<p class="detail-description">Available rolling history: ${finite(c.rollingRequests) ? formatCount(c.rollingRequests) + ' requests' : 'request count unavailable'}${finite(c.rollingUsageUsd) ? ' · $' + c.rollingUsageUsd.toFixed(2) + ' usage value' : ''}</p>` : ''}${!c.creditBalances?.length && c.balanceSummary ? `<p class="detail-description">${esc(c.balanceSummary)}</p>` : ''}${c.breakdown ? `<div class="metric-list">Input <strong>${formatCount(c.breakdown.input)}</strong> Output <strong>${formatCount(c.breakdown.output)}</strong> Cache <strong>${formatCount(c.breakdown.cache)}</strong></div>` : ''}${c.coverage ? `<p class="detail-description">${esc(c.coverage)}</p>` : ''}${c.historyNote ? `<div class="detail-notice">${esc(c.historyNote)}</div>` : ''}${c.connectionNote ? `<p class="input-help">${esc(c.connectionNote)}</p>` : ''}${c.asOf ? `<p class="input-help">Provider data refreshed: ${esc(new Date(c.asOf).toLocaleString())}</p>` : ''}${financeDetails(c,snapshot)}${credentials}<div class="detail-section"><h3>Optional monthly target</h3><p>Your own reference point for ${c.id === 'claude' ? 'tokens recorded on this Mac' : c.id === 'elevenlabs' ? 'credits' : 'tokens'}. This does not change provider limits or stop usage.</p><form id="target-form"><label for="monthly-target">${c.id === 'elevenlabs' ? 'Credits' : 'Tokens'} per calendar month</label><div class="input-row"><input id="monthly-target" type="number" min="1" max="9007199254740991" step="1" placeholder="No target" value="${c.monthlyTarget || ''}"><button class="button" type="submit">Save target</button></div></form><p class="input-help">Clear the field to remove your target.</p></div><div class="detail-actions"><button class="button" data-action="dashboard" data-id="${c.id}">Open usage dashboard ↗</button><button class="button button-quiet" data-action="refresh-source" data-id="${c.id}">Refresh this source</button></div>`;
  for (const form of document.querySelectorAll('.local-profile-form')) form.addEventListener('submit', async e => {
    e.preventDefault();
    const drafts = [...document.querySelectorAll('.local-profile-form input')].filter(input => !form.contains(input) && input.value !== input.defaultValue).map(input => [input.id, input.value]);
    const input = form.querySelector('input'), value = input.value ? form.dataset.field === 'createdAt' ? input.value : Number(input.value) : null;
    detailDirty = false;
    const result = await run(() => api.accountProfile(c.id, { field: form.dataset.field, month: form.dataset.month, value }));
    if (!result) { detailDirty = true; return; }
    renderDetails();
    for (const [id,value] of drafts) if (document.getElementById(id)) document.getElementById(id).value = value;
    detailDirty = drafts.length > 0;
    document.querySelector(`.local-profile-form[data-field="${form.dataset.field}"] button`)?.focus();
    notify('Local account record saved.');
  });
  $('#key-form')?.addEventListener('submit', async e => {
    e.preventDefault(); const field = $('#provider-key'), value = field.value.trim(); field.value = ''; detailDirty = false;
    const button = e.submitter; button.disabled = true; button.textContent = 'Saving…';
    try { const s = await api.saveKey(c.id, value); update(s); renderDetails(); notify('Key saved with macOS secure storage.'); }
    catch (err) { button.disabled = false; button.textContent = 'Save securely'; notify(err.message, true); }
  });
  $('#target-form')?.addEventListener('submit', async e => { e.preventDefault(); const v = $('#monthly-target').value; detailDirty = false; const result = await run(() => api.target(c.id, v ? Number(v) : null)); if (!result) return; renderDetails(); $('#target-form button').focus(); notify(v ? 'Monthly target saved.' : 'Monthly target removed.'); });
  $('#details-content').addEventListener('input', () => { detailDirty = true; }, { once: true });
}
function update(value) { if (value?.cards) { snapshot = value; document.documentElement.dataset.theme = value.appearance?.dark ? 'dark' : 'light'; $('#appearance-mode').value = value.settings.colorMode || 'auto'; render(); } }
function notify(message, error = false) { const toast = $('#toast'), modal = [...document.querySelectorAll('dialog[open]')].at(-1); clearTimeout(toastTimer); (modal || document.body).append(toast); toast.classList.toggle('in-dialog', !!modal); toast.textContent = message; toast.hidden = false; toast.classList.toggle('error', error); toastTimer = setTimeout(() => { toast.hidden = true; }, error ? 6500 : 4000); }
async function run(fn) { try { const value = await fn(); if (value?.cards) update(value); else if (typeof value === 'string') notify(value); return value; } catch (e) { notify(e.message || 'The action could not finish.', true); return null; } }
async function action(name, id) {
  if (name === 'details') return showDetails(id);
  if (name === 'connections') return showConnections();
  if (name === 'dashboard' || name === 'credentials' || name === 'pricing') return run(() => api.openProvider(id, name));
  if (name === 'refresh-source') { detailDirty = false; await run(() => api.refresh(id)); renderDetails(); return; }
  if (name === 'connect') { if (snapshot.demo) return notify('Leave sample data to connect your account.'); detailDirty = false; notify('Checking the account connection…'); await run(() => api.connect(id)); renderDetails(); return; }
  if (name === 'signin') { if (snapshot.demo) return notify('Leave sample data to sign in.'); return run(() => api.signInClaude()); }
  if (name === 'export') return run(() => api.export());
  if (name === 'live') return run(() => api.demo(false));
  if (['previous', 'next'].includes(name)) { const d = new Date(snapshot.month + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + (name === 'previous' ? -1 : 1)); return run(() => api.month(d.toISOString().slice(0, 7))); }
}
document.addEventListener('click', e => { const close = e.target.closest('[data-close]'); if (close) return $('#' + close.dataset.close).close(); const button = e.target.closest('[data-action]'); if (button) action(button.dataset.action, button.dataset.id); const nav = e.target.closest('[data-view]'); if (nav) { view = nav.dataset.view; render(); } });
$('#layout-toggle').addEventListener('click', () => run(() => api.layout(currentMini ? 'dashboard' : 'mini')));
compactQuery.addEventListener('change', () => render());
wideQuery.addEventListener('change', () => render());
$('#connections-button').addEventListener('click', showConnections);
$('#appearance-mode').addEventListener('change', () => run(() => api.appearance($('#appearance-mode').value)));
$('#refresh-button').addEventListener('click', () => run(() => api.refresh()));
$('#choose-secrets').addEventListener('click', () => run(() => api.chooseSecrets()));
$('#demo-button').addEventListener('click', async () => { await run(() => api.demo(!snapshot.demo)); $('#connections-dialog').close(); });
for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
$('#details-dialog').addEventListener('close', () => { const host = $('#connections-dialog').open ? $('#connections-dialog') : $('#main'); [...host.querySelectorAll(`[data-action="details"][data-id="${selected}"]`)].find(el => el.getClientRects().length)?.focus({ preventScroll: true }); });
$('#connections-dialog').addEventListener('close', () => $('#connections-button').focus({ preventScroll: true }));
try { update(await api.snapshot()); api.onSnapshot(update); api.onConnections(showConnections); }
catch { $('#main').innerHTML = '<h1>Couldn’t start Tokenlight</h1><p class="page-description">Close and reopen the app to try again.</p>'; }
