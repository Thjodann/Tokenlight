import { miniReading, miniCredit } from './mini-view.mjs';
import { activityCaption, balanceMarkup, allowanceMarkup, allowanceSummary, activeAllowances } from './metric-view.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { monthlyInsights, sourceCost } from './insights.mjs';
import { esc, usd } from './insight-view.mjs';
import { finite } from './model.mjs';
import { brandMark } from './brand.mjs';

export const dashboardNames = { overview: 'Overview', account: 'AI accounts', api: 'API usage', insights: 'Insights' };
const status = c => c.status === 'stale' ? 'Stale reading' : c.status === 'refreshing' ? 'Refreshing' : ['setup', 'unconnected'].includes(c.status) ? 'Needs connection' : c.partial ? 'Partial history' : 'Connected';
const percent = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);

export function dashboardLayout(width, height, count) {
  if (!count || width <= 0 || height <= 0) return { columns: 1, rows: 1 };
  if (width <= 700 && height / count >= 72) return { columns: 1, rows: count };
  let best;
  for (let columns = 1; columns <= Math.min(count, Math.max(1, Math.floor(width / 190))); columns++) {
    const rows = Math.ceil(count / columns), w = (width - (columns - 1) * 10) / columns, h = (height - (rows - 1) * 10) / rows;
    const score = Math.abs(Math.log(w / Math.max(1, h) / 1.7)) + (columns * rows - count) / count * 3;
    if (!best || score < best.score) best = { columns, rows, score };
  }
  return best;
}

function history(c, month) {
  const days = new Date(+month.slice(0, 4), +month.slice(5), 0).getDate();
  const points = (c.daily || []).filter(d => d.date?.startsWith(month + '-') && d.date <= new Date().toISOString().slice(0, 10) && finite(d.value));
  if (!points.length) return '<div class="display-history-empty">Daily history unreported</div>';
  const max = Math.max(1, ...points.map(d => d.value));
  return `<svg class="display-history" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="${esc(c.title)} daily reported usage; gaps mean no reading"><path d="M0 58H300M0 29H300"/>${points.map(d => `<rect x="${(Number(d.date.slice(8)) - 1) / days * 300}" y="${58 - d.value / max * 53}" width="${Math.max(1, 300 / days - 2)}" height="${Math.max(1, d.value / max * 53)}"/>`).join('')}</svg>`;
}

export function dashboardView(snapshot, view = 'overview') {
  const name = dashboardNames[view] || dashboardNames.overview;
  const cards = snapshot.cards.filter(c => view === 'overview' || view === 'insights' || c.kind === view);
  const i = monthlyInsights(snapshot), month = new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const metrics = [
    ['Known monthly cost', usd(i.total), `${i.completeSources}/${snapshot.cards.length} complete · before credits / tax`],
    ['Usage value', usd(i.estimatedValue), `${i.valueSources}/${snapshot.cards.length} sources · not an extra charge`],
    ['Most used', i.mostUsed?.title || 'Unreported', 'Approximate activity ranking'],
    ['Favorite model', i.favorite?.model || 'Unreported', 'Most frequent in available records'],
    ['Longest-running', i.oldest?.title || 'Unreported', i.oldest ? `${i.oldest.age.years.toFixed(1)} years · entered locally` : 'Account start dates not set']
  ].map(([label, value, note]) => `<div class="display-stat" title="${esc(label + ': ' + value + ' · ' + note)}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  const panels = cards.map(c => {
    const credit = miniCredit(c), cost = sourceCost(c, snapshot.settings, snapshot.month);
    const pools = activeAllowances(c);
    return `<article class="display-source" data-provider="${providerFor(c.id)}" data-state="${esc(c.status)}" data-limit-count="${pools.length + (c.paidUsage ? 1 : 0)}" aria-label="${esc(c.title)}: ${esc(miniReading(c))}; ${esc(activityCaption(c, snapshot.month))}; ${esc(status(c))}; ${esc(credit.title)}; ${esc(allowanceSummary(c))}"><div class="display-source-inner"><div class="display-source-heading"><span class="source-icon">${providerLogo(c.id)}</span><h2>${esc(c.title)}</h2><span class="display-kind">${c.kind === 'account' ? 'ACCOUNT' : 'API'}</span></div><strong class="display-reading">${esc(miniReading(c))}<small class="display-activity-caption">${esc(activityCaption(c, snapshot.month))}</small></strong><span class="display-reading-note">Activity · selected month</span><div class="display-credit" aria-label="Balances · current">${balanceMarkup(c)}</div><div class="display-pools" aria-label="Allowances · current">${allowanceMarkup(c)}</div><div class="display-trend">${history(c, snapshot.month)}</div><div class="display-cost"><span>Known cost <strong>${usd(cost.total)}${cost.partial ? ' *' : ''}</strong></span><span>Usage value <strong>${usd(cost.value.total)}${cost.value.partial && cost.value.total !== null ? ' ~' : ''}</strong></span></div><div class="display-source-status"><i></i><span>${esc(status(c))}</span><span>${c.lastUpdatedAt ? new Date(c.lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'No reading'}</span></div></div></article>`;
  }).join('');
  return `<section class="display-dashboard" data-view="${esc(view)}" aria-label="${name} dashboard"><header class="display-header"><span class="display-brand" aria-hidden="true">${brandMark()}</span><h1>${name}</h1><span class="display-period">${esc(month)} · UTC</span><span class="display-live">${snapshot.demo ? 'SAMPLE DATA' : snapshot.cards.some(c => c.status === 'refreshing') ? 'UPDATING' : 'LIVE'}</span></header><div class="display-metrics">${metrics}</div><div class="display-rack" data-count="${cards.length}">${panels}</div><footer class="display-footer"><span>${view === 'insights' ? 'Known charges and plan fees · usage value separate' : 'Activity follows selected month · allowances and balances are current'}</span><span>* Incomplete costs · ~ partial estimates · USD</span></footer></section>`;
}
