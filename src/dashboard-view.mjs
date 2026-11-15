import {activityOverview} from './activity-summary.mjs';
import { creditAmount, fableAccessText } from './credit-view.mjs';
import { activityReading, activityCaption, balanceReading, allowanceSummary, activeAllowances, allowanceLabel, percentText, allowanceState, allowanceReading, allowancePercent, allowanceFill, paidLimitText } from './metric-view.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { monthlyInsights, sourceCost } from './insights.mjs';
import { esc, usd } from './insight-view.mjs';
import { activityLine, dashboardInsights } from './usage-visuals.mjs';
import { brandMark } from './brand.mjs';
import { providerGroups, sourceLabel, cardsForView } from './provider-groups.mjs';

import { providerPanel } from './provider-panel.mjs';
import { providerLayout } from './provider-layout.mjs';

export const dashboardNames = { overview: 'Overview', account: 'Accounts', api: 'API usage', insights: 'Insights', providers: 'Providers' };
const status = c => c.status === 'stale' ? 'Stale reading' : c.status === 'refreshing' ? 'Refreshing' : ['setup', 'unconnected'].includes(c.status) ? 'Needs connection' : c.partial ? 'Partial history' : 'Connected';
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  api: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  providers: '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 3"/>',
  insights: '<path d="M4 20V10m8 10V4m8 16v-7"/>'
};
const appearanceIcons = {
  inherit: '<circle cx="12" cy="12" r="8"/><path class="appearance-auto-fill" d="M12 4a8 8 0 0 0 0 16Z"/>',
  light: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  dark: '<path d="M19 15.3A8 8 0 0 1 8.7 5 8 8 0 1 0 19 15.3Z"/>'
};
const dashboardAppearance = mode => `<div class="monitor-appearance" role="group" aria-label="Window appearance">${[['inherit', 'Follow main'], ['light', 'Light'], ['dark', 'Dark']].map(([id, label]) => `<button type="button" data-dashboard-theme="${id}" aria-pressed="${id === mode}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${appearanceIcons[id]}</svg></button>`).join('')}</div>`;
const dashboardColors = snapshot => {
  const fallback = snapshot.appearance?.dark ? { surface: '#101417', accent: '#8bd6be' } : { surface: '#edf1f3', accent: '#237762' };
  return snapshot.presentation?.interfaceColors || snapshot.settings?.interfaceColors || fallback;
};
const dashboardColorControl = snapshot => {
  const colors = dashboardColors(snapshot), custom = snapshot.presentation?.interfaceColorsCustom === true;
  const title = custom ? 'Window colors — custom' : 'Window colors — using app colors';
  return `<details class="monitor-colors"><summary aria-label="${title}" title="${title}"><span class="monitor-color-chip" style="--picker-surface:${esc(colors.surface)};--picker-accent:${esc(colors.accent)}"><i></i><i></i></span></summary><div class="monitor-color-popover"><strong>This window</strong><span>Surface and accent</span><div class="dual-color-control monitor-dual-color" style="--picker-surface:${esc(colors.surface)};--picker-accent:${esc(colors.accent)}"><label class="color-stop color-stop-surface" title="Window surface"><input type="color" value="${esc(colors.surface)}" data-dashboard-color="surface" aria-label="Window surface color"></label><span class="color-rail" aria-hidden="true"></span><label class="color-stop color-stop-accent" title="Window accent"><input type="color" value="${esc(colors.accent)}" data-dashboard-color="accent" aria-label="Window accent color"></label></div><div class="monitor-color-actions"><button type="button" data-dashboard-colors-reset ${custom ? '' : 'disabled'}>Use app colors</button><button type="button" data-dashboard-colors-apply>Apply</button></div></div></details>`;
};
export function dashboardLayout(width, height, count) {
  if (!count || width <= 0 || height <= 0) return { columns: 1, rows: 1 };
  if (width <= 700 && height / count >= 72) return { columns: 1, rows: count };
  if (width <= 450 && height / count < 24) return { columns: Math.min(2, count), rows: Math.ceil(count / 2) };
  let best;
  for (let columns = 1; columns <= Math.min(count, Math.max(1, Math.floor(width / 190))); columns++) {
    const rows = Math.ceil(count / columns), w = (width - (columns - 1) * 8) / columns, h = (height - (rows - 1) * 8) / rows;
    const score = Math.abs(Math.log(w / Math.max(1, h) / 1.9)) + (columns * rows - count) / count * 6;
    if (!best || score < best.score) best = { columns, rows, score };
  }
  return best;
}
function dashboardPaid(card) {
  const p = card.paidUsage;
  if (!p) return '';
  const value = n => Number.isFinite(n) ? creditAmount(n, p.unit) : '—';
  const percent = Number.isFinite(p.used) && Number.isFinite(p.limit) && p.limit > 0 ? Math.min(100, Math.max(0, p.used / p.limit * 100)) : null;
  const label = paidLimitText(card) + (fableAccessText(card) ? '; ' + fableAccessText(card) : '');
  return `<div class="monitor-spend${p.capReached ? ' is-reached' : ''}" title="${esc(label)}" aria-label="${esc(label)}"><span>Paid / mo</span><b>${esc(value(p.used))} / ${esc(value(p.limit))}</b>${p.capReached || p.enabled === false ? '<svg class="monitor-spend-lock" viewBox="0 0 16 16" role="img" aria-label="Paid usage unavailable"><rect x="3" y="7" width="10" height="7" rx="1"/><path d="M5 7V4a3 3 0 0 1 6 0v3"/></svg>' : ''}${percent == null ? '' : `<svg class="monitor-spend-track" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true"><path d="M0 .5H100"/><path class="monitor-spend-fill" d="M0 .5H${percent}"/></svg>`}</div>`;
}
export function dashboardView(snapshot, requested = 'overview', viewport = { width: 440, height: 680 }) {
  const view = Object.hasOwn(dashboardNames, requested) ? requested : 'overview';
  const cards = cardsForView(snapshot, view);
  const i = monthlyInsights(snapshot), month = new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const nav = Object.entries(dashboardNames).map(([id, name]) => `<button type="button" data-dashboard-view="${id}" aria-label="${name}" aria-pressed="${id === view}" title="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg><span>${name}</span></button>`).join('');
  const appearance = dashboardAppearance(snapshot.presentation?.colorMode || 'inherit');
  const colors = dashboardColorControl(snapshot);
  if (view === 'providers') {
    const regime = providerLayout(viewport.width, viewport.height);
    const provider = snapshot.presentation?.provider || 'openai';
    const choices = snapshot.presentation?.providers || { openai: 'OpenAI', anthropic: 'Anthropic', cursor: 'Cursor', elevenlabs: 'ElevenLabs', ollama: 'Ollama' };
    const inlineToolbar = regime === 'micro' || regime === 'strip';
    const picker = `<div class="provider-selector"><span class="provider-picker-mark" aria-hidden="true">${providerLogo(snapshot.cards[0]?.id || provider)}</span><label for="provider-selector">Provider</label><select id="provider-selector">${Object.entries(choices).map(([id, title]) => `<option value="${esc(id)}" ${id === provider ? 'selected' : ''}>${esc(title)}</option>`).join('')}</select></div>`;
    return `<section class="monitor-page" data-view="providers" data-provider-regime="${regime}" aria-label="Providers dashboard"><header class="monitor-header"><span class="monitor-brand" aria-hidden="true">${brandMark()}</span><nav class="monitor-nav" aria-label="Dashboard view">${nav}</nav>${inlineToolbar ? picker : ''}${colors}${appearance}<span class="monitor-period" title="${esc(snapshot.month)} · reporting month in UTC">${month}</span><span class="monitor-live">${snapshot.demo ? 'SAMPLE DATA' : snapshot.cards.some(c => c.status === 'refreshing') ? 'UPDATING' : 'LIVE'}</span></header><div class="provider-scroll"><div class="provider-tab">${inlineToolbar ? '' : picker}${providerPanel(snapshot, provider, regime, viewport.providerState, viewport)}</div></div></section>`;
  }
  const total = (label, value, note) => `<div class="monitor-total" title="${esc(note)}"><span>${label}</span><strong>${value}</strong><small>${esc(note)}</small></div>`;
  const summary = `<div class="monitor-totals">${total('Known cost', usd(i.total) + (i.completeSources < snapshot.cards.length ? ' <sup>*</sup>' : ''), `${i.completeSources}/${snapshot.cards.length} sources complete · before credits / tax`)}${total('Usage value', usd(i.estimatedValue) + (i.valuePartial ? ' <sup>~</sup>' : ''), 'Reported / estimated value · not an extra charge')}</div>`;
  const highlights = `<div class="monitor-highlights">${activityOverview(i)}</div>`;
  const shortLabel = label => String(label).replace(/5[- ]hour(?: session)?/i, '5h').replace(/(?:1 week|7 day|weekly)/i, '7d').replace(/Fable.*$/i, 'Fable 7d').replace(/Grok \/ Composer.*$/i, 'Grok/Comp').replace(/Third-party models.*$/i, '3rd-party').replace(/Subscription.*$/i, 'Cycle').replace(/Included credits/i, 'Included');
  const groups = view === 'overview' ? providerGroups(cards) : cards.map(c => ({ provider: providerFor(c.id), title: c.title, cards: [c] }));
  const panels = groups.map(group => {
    const pools = group.cards.flatMap(c => activeAllowances(c).map(w => ({ ...w, source: c, labelText: (group.cards.length > 1 ? sourceLabel(c) + ' · ' : '') + allowanceLabel(w, c) })));
    const descriptions = group.cards.map(c => { const cost = sourceCost(c, snapshot.settings, snapshot.month); return `${c.title}: ${activityReading(c)}; ${activityCaption(c, snapshot.month)}; ${status(c)}; ${allowanceSummary(c, snapshot.settings?.showRemainingAllowance)}; ${balanceReading(c).title}; known cost ${usd(cost.total)}; usage value ${usd(cost.value.total)}`; });
    const rings = pools.map((w, index) => `<g class="dial-ring ring-${index % 4}" data-allowance-state="${allowanceState(w.percent)}" role="img" aria-label="${esc(w.labelText)}: ${allowanceReading(w.percent, snapshot.settings?.showRemainingAllowance)}"><title>${esc(w.labelText)}: ${allowanceReading(w.percent, snapshot.settings?.showRemainingAllowance)}${w.resetsAt ? ' · resets ' + esc(new Date(w.resetsAt).toLocaleString()) : ''}</title><circle class="dial-track" cx="50" cy="50" r="${44 - index * (32 / Math.max(3, pools.length))}"/><circle class="dial-fill" cx="50" cy="50" r="${44 - index * (32 / Math.max(3, pools.length))}" pathLength="100" visibility="${allowanceFill(w.percent, snapshot.settings?.showRemainingAllowance) === 0 ? 'hidden' : 'visible'}" stroke-dasharray="${allowanceFill(w.percent, snapshot.settings?.showRemainingAllowance)} 100"/></g>`).join('');
    const legend = pools.map((w, index) => `<span class="ring-${index % 4}" data-allowance-state="${allowanceState(w.percent)}" title="${esc(w.labelText)}: ${allowanceReading(w.percent, snapshot.settings?.showRemainingAllowance)}"><i></i><small>${esc(shortLabel(allowanceLabel(w, w.source)))}</small><b>${percentText(allowancePercent(w.percent, snapshot.settings?.showRemainingAllowance))}%${snapshot.settings?.showRemainingAllowance && w.percent > 100 ? '<small> · ' + percentText(w.percent) + '% used</small>' : ''}</b></span>`).join('');
    const streams = group.cards.map(c => {
      const balance = balanceReading(c), state = status(c);
      return `<div class="monitor-stream" data-source="${esc(c.id)}" data-state="${esc(c.status)}" title="${esc(descriptions[group.cards.indexOf(c)])}"><div class="monitor-stream-heading"><span>${group.cards.length > 1 ? esc(sourceLabel(c)) : ''}</span><i class="monitor-status" title="${esc(state)}" aria-label="${esc(state)}">${c.partial ? '◐' : ['stale', 'setup', 'unconnected'].includes(c.status) ? '!' : '●'}</i></div><div class="monitor-reading"><strong>${esc(activityReading(c))}</strong></div><div class="monitor-balance" title="${esc(balance.title)}">${balance.text === '—' ? '' : `<b>${esc(balance.text)}</b><small>${esc(balance.label.replace(/^Fable.*$/i, 'Fable · week').replace(/(?:Available credits|Subscription credits remaining)/i, 'credits').replace(/Included credits remaining/i, 'included'))}</small>`}</div>${dashboardPaid(c)}<figure class="monitor-trend" aria-label="Daily activity · each source uses its own scale; gaps are unreported">${activityLine(c, snapshot.month)}</figure></div>`;
    }).join('');
    return `<article class="monitor-source monitor-provider" data-provider="${group.provider}" data-source-count="${group.cards.length}" data-limit-count="${pools.length}" aria-label="${esc(descriptions.join(' | '))}"><div class="monitor-provider-inner"><h2>${esc(group.title)}</h2><div class="monitor-dial" title="${esc(pools.map(w => w.labelText + ': ' + allowanceReading(w.percent, snapshot.settings?.showRemainingAllowance)).join('; ') || 'Allowances not reported')}"><svg viewBox="0 0 100 100" aria-hidden="true">${rings || '<circle class="dial-unreported" cx="50" cy="50" r="44"/>'}</svg><span class="dial-logo">${providerLogo(group.cards[0].id)}</span></div><div class="monitor-streams">${streams}</div><small class="monitor-allowance-mode">${snapshot.settings?.showRemainingAllowance ? 'Remaining' : 'Used'}</small><div class="monitor-ring-legend" aria-label="Allowances · current · percent ${snapshot.settings?.showRemainingAllowance ? 'remaining' : 'used'}">${legend}</div></div></article>`;
  }).join('');
  return `<section class="monitor-page" data-view="${view}" aria-label="${dashboardNames[view]} dashboard"><header class="monitor-header"><span class="monitor-brand" aria-hidden="true">${brandMark()}</span><nav class="monitor-nav" aria-label="Dashboard view">${nav}</nav>${colors}${appearance}<span class="monitor-period" title="${esc(snapshot.month)} · reporting month in UTC">${month}</span><span class="monitor-live">${snapshot.demo ? 'SAMPLE DATA' : snapshot.cards.some(c => c.status === 'refreshing') ? 'UPDATING' : 'LIVE'}</span></header>${view === 'insights' ? highlights + dashboardInsights(snapshot) : summary}${view === 'insights' ? '' : `<div class="monitor-rack" data-count="${groups.length}">${panels}</div>`}<footer class="monitor-footer"><span title="Activity · ${esc(snapshot.month)} / UTC; allowances and balances are current">Monthly activity · limits now</span><span>* partial · ~ estimate · USD</span></footer></section>`;
}
