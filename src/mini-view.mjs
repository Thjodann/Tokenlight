import { providerGroups, sourceLabel } from './provider-groups.mjs';
import { insightsPage } from './insight-view.mjs';
import { sourceCost } from './insights.mjs';
import { usd } from './insight-view.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { activityReading, activityCaption, balanceReading, allowanceSummary, allowanceMarkup, activeAllowances } from './metric-view.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MINI_QUERY = '(max-width: 359px), (max-width: 440px) and (max-height: 440px), (max-height: 320px)';
export const miniReading = activityReading;
export const miniCredit = balanceReading;
export function miniView(snapshot, view = 'overview') {
  if (view === 'insights') return `<section class="mini-panel mini-insights" aria-label="Mini insights">${insightsPage(snapshot)}</section>`;
  const cards = snapshot.cards.filter(c => view === 'overview' || c.kind === view);
  const month = new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const renderRow = c => {
    const credit = miniCredit(c), reading = miniReading(c), allowances = allowanceSummary(c), cost = sourceCost(c, snapshot.settings, snapshot.month);
    const status = c.status === 'stale' ? 'Last reading · stale' : c.status === 'setup' ? 'Needs setup' : c.status === 'unconnected' ? 'Not connected' : c.status === 'refreshing' ? 'Refreshing' : 'Connected';
    const freshness = c.lastUpdatedAt ? `Updated ${new Date(c.lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'No reading yet';
    return `<button class="mini-row source--${c.id}" data-limit-count="${activeAllowances(c).length + (c.paidUsage ? 1 : 0)}" data-provider="${providerFor(c.id)}" data-state="${c.status}" data-action="details" data-id="${c.id}" aria-label="Details for ${esc(c.title)}: ${esc(activityCaption(c, snapshot.month))}: ${esc(reading)}; ${esc(allowances)}; ${esc(credit.title)}; ${esc(status)}${c.partial ? '; partial history' : ''}" title="${esc(c.title + ' · ' + status + ' · ' + freshness + (c.error ? ' · ' + c.error : ''))}"><span class="mini-source"><span class="source-icon">${providerLogo(c.id)}</span><span>${esc(view === 'overview' ? sourceLabel(c) : c.title)}</span><i class="mini-status ${c.status === 'stale' || c.status === 'setup' ? 'attention' : ''}" aria-hidden="true"></i></span><span class="mini-reading" title="${esc(activityCaption(c, snapshot.month))}">${esc(reading)}<small>${esc(activityCaption(c, snapshot.month))}</small></span><span class="mini-credit" title="${esc(credit.title)}">${esc(credit.text)}<small>${esc(credit.label)}</small></span><span class="mini-allowances" aria-label="Allowances · current">${allowanceMarkup(c)}</span><span class="mini-cost"><span>Cost <strong>${usd(cost.total)}${cost.partial ? ' *' : ''}</strong></span><span>Value <strong>${usd(cost.value.total)}${cost.value.partial && cost.value.total !== null ? ' ~' : ''}</strong></span></span></button>`;
  };
  const groups = providerGroups(cards);
  const rows = view === 'overview' ? groups.map(g => `<section class="mini-provider" data-provider="${g.provider}" data-member-count="${g.cards.length}" data-limit-count="${g.cards.reduce((n,c) => n + activeAllowances(c).length + (c.paidUsage ? 1 : 0),0)}" aria-label="${esc(g.title)}"><header><span class="source-icon">${providerLogo(g.cards[0].id)}</span><strong>${esc(g.title)}</strong></header><div>${g.cards.map(renderRow).join('')}</div></section>`).join('') : cards.map(renderRow).join('');
  return `<section class="mini-panel" aria-label="Mini dashboard"><div class="mini-context"><span>${esc(month)} · UTC${snapshot.demo ? ' · SAMPLE DATA' : ''}</span><span>~ partial history</span></div><div class="mini-head" aria-hidden="true"><span>Source</span><span>Activity</span><span>Balances</span></div><div class="mini-list" data-count="${view === 'overview' ? groups.length : cards.length}">${rows}</div></section>`;
}
