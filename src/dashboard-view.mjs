import { activityReading, activityCaption, balanceMarkup, allowanceMarkup, allowanceSummary, activeAllowances } from './metric-view.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { monthlyInsights, sourceCost } from './insights.mjs';
import { esc, usd } from './insight-view.mjs';
import { activityPlot, insightGraphics } from './usage-visuals.mjs';
import { brandMark } from './brand.mjs';

export const dashboardNames = { overview: 'Overview', account: 'Accounts', api: 'API usage', insights: 'Insights' };
const status = c => c.status === 'stale' ? 'Stale reading' : c.status === 'refreshing' ? 'Refreshing' : ['setup', 'unconnected'].includes(c.status) ? 'Needs connection' : c.partial ? 'Partial history' : 'Connected';
const icons = {
  overview: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  account: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  api: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
  insights: '<path d="M4 20V10m8 10V4m8 16v-7"/>'
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
export function dashboardView(snapshot, requested = 'overview') {
  const view = Object.hasOwn(dashboardNames, requested) ? requested : 'overview';
  const cards = snapshot.cards.filter(c => view === 'overview' || view === 'insights' || c.kind === view);
  const i = monthlyInsights(snapshot), month = new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const nav = Object.entries(dashboardNames).map(([id, name]) => `<button type="button" data-dashboard-view="${id}" aria-label="${name}" aria-pressed="${id === view}" title="${name}"><svg viewBox="0 0 24 24" aria-hidden="true">${icons[id]}</svg><span>${name}</span></button>`).join('');
  const total = (label, value, note) => `<div class="monitor-total" title="${esc(note)}"><span>${label}</span><strong>${value}</strong><small>${esc(note)}</small></div>`;
  const summary = `<div class="monitor-totals">${total('Known cost', usd(i.total) + (i.completeSources < snapshot.cards.length ? ' <sup>*</sup>' : ''), `${i.completeSources}/${snapshot.cards.length} sources complete · before credits / tax`)}${total('Usage value', usd(i.estimatedValue) + (i.valuePartial ? ' <sup>~</sup>' : ''), 'Reported / estimated value · not an extra charge')}</div>`;
  const highlights = `<div class="monitor-highlights">${[
    ['Most used', i.mostUsed?.title || '—', 'Approximate activity ranking'],
    ['Favorite model', i.favorite?.model || '—', 'Most frequent in available records'],
    ['Longest-running', i.oldest ? `${i.oldest.title} · ${i.oldest.age.years.toFixed(1)} yr` : '—', 'Account age from entered start dates']
  ].map(([label, value, note]) => `<span title="${esc(note)}">${label}<strong>${esc(value)}</strong></span>`).join('')}</div>`;
  const panels = cards.map(c => {
    const cost = sourceCost(c, snapshot.settings, snapshot.month), pools = activeAllowances(c);
    const caption = activityCaption(c, snapshot.month), state = status(c);
    return `<article class="monitor-source" data-provider="${providerFor(c.id)}" data-state="${esc(c.status)}" data-limit-count="${pools.length + (c.paidUsage ? 1 : 0)}" aria-label="${esc(c.title)}: ${esc(activityReading(c))}; ${esc(caption)}; ${esc(state)}; ${esc(allowanceSummary(c))}"><div class="monitor-source-inner"><header class="monitor-source-heading"><span class="source-icon" aria-hidden="true">${providerLogo(c.id)}</span><h2>${esc(c.title)}</h2><span class="monitor-status" title="${esc(state)}" aria-label="${esc(state)}">${state === 'Connected' ? '●' : state === 'Partial history' ? '◐' : state === 'Refreshing' ? '↻' : '!'}</span></header><div class="monitor-reading"><strong>${esc(activityReading(c))}</strong><small>${esc(caption)}</small></div><div class="monitor-balance" aria-label="Balances · current">${balanceMarkup(c)}</div><section class="monitor-pools" aria-label="Allowances · current">${allowanceMarkup(c)}</section><figure class="monitor-trend" title="Daily reported activity · each source uses its own scale; gaps are unreported">${activityPlot(c, snapshot.month)}<figcaption>Daily activity <span>${c.lastUpdatedAt ? new Date(c.lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'No reading'}</span></figcaption></figure><div class="monitor-cost"><span title="Known plan fee plus metered cost; * incomplete">Cost <strong>${usd(cost.total)}${cost.partial ? ' *' : ''}</strong></span><span title="Reported / estimated usage value; not an extra charge">Value <strong>${usd(cost.value.total)}${cost.value.partial && cost.value.total !== null ? ' ~' : ''}</strong></span></div></div></article>`;
  }).join('');
  return `<section class="monitor-page" data-view="${view}" aria-label="${dashboardNames[view]} dashboard"><header class="monitor-header"><span class="monitor-brand" aria-hidden="true">${brandMark()}</span><nav class="monitor-nav" aria-label="Dashboard view">${nav}</nav><span class="monitor-period" title="${esc(snapshot.month)} · reporting month in UTC">${month}</span><span class="monitor-live">${snapshot.demo ? 'SAMPLE DATA' : snapshot.cards.some(c => c.status === 'refreshing') ? 'UPDATING' : 'LIVE'}</span></header>${summary}${view === 'insights' ? highlights + insightGraphics(snapshot) : `<div class="monitor-rack" data-count="${cards.length}">${panels}</div>`}<footer class="monitor-footer"><span>Activity · ${esc(snapshot.month)} / UTC</span><span>Limits & balances · now</span><span>* incomplete · ~ estimate · USD</span></footer></section>`;
}
