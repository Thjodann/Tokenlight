import { insightsPage } from './insight-view.mjs';
import { finite, formatCount } from './model.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { creditAmount } from './credit-view.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MINI_QUERY = '(max-width: 359px), (max-width: 440px) and (max-height: 440px), (max-height: 320px)';
export function miniReading(card) {
  if (finite(card.monthly)) return `${card.partial ? '~' : ''}${formatCount(card.monthly)} ${card.unit === 'credits' ? 'cr' : 'tok'}`;
  const w = card.windows?.find(w => finite(w.percent) && (!w.resetsAt || w.resetsAt > Date.now()));
  return w ? `${Math.round(w.percent)}% used` : ['refreshing', 'setup', 'unconnected'].includes(card.status) ? card.status === 'refreshing' ? 'Reading…' : 'Connect' : '—';
}
export function miniCredit(card) {
  const b = card.creditBalances?.find(b => b.unit !== 'resets' && (b.unlimited || finite(b.value)));
  if (b) return { text: b.unlimited ? 'Unlimited' : b.unit === 'credits' ? `${formatCount(b.value)} cr` : `${b.label.startsWith('Fable') ? 'F ' : ''}${creditAmount(b.value, b.unit)}`, title: `${b.label}: ${b.unlimited ? 'Unlimited' : creditAmount(b.value, b.unit)}${b.allowance ? ' · allowance value, not a charge' : ''}` };
  if (finite(card.apiCost?.total)) return { text: `${creditAmount(card.apiCost.total, card.apiCost.unit)} cost`, title: `${creditAmount(card.apiCost.total, card.apiCost.unit)} reported API cost for the selected month, before credits` };
  return { text: '—', title: 'Credit balance not reported' };
}
export function miniView(snapshot, view = 'overview') {
  if (view === 'insights') return `<section class="mini-panel mini-insights" aria-label="Mini insights">${insightsPage(snapshot)}</section>`;
  const cards = snapshot.cards.filter(c => view === 'overview' || c.kind === view);
  const month = new Date(snapshot.month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return `<section class="mini-panel" aria-label="Mini dashboard"><div class="mini-context"><span>${esc(month)} · UTC${snapshot.demo ? ' · SAMPLE DATA' : ''}</span><span>~ partial history</span></div><div class="mini-head" aria-hidden="true"><span>Source</span><span>Usage</span><span>Credits / cost</span></div><div class="mini-list" data-count="${cards.length}">${cards.map(c => {
    const credit = miniCredit(c), reading = miniReading(c);
    const status = c.status === 'stale' ? 'Last reading · stale' : c.status === 'setup' ? 'Needs setup' : c.status === 'unconnected' ? 'Not connected' : c.status === 'refreshing' ? 'Refreshing' : 'Connected';
    const freshness = c.lastUpdatedAt ? `Updated ${new Date(c.lastUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'No reading yet';
    return `<button class="mini-row source--${c.id}" data-provider="${providerFor(c.id)}" data-state="${c.status}" data-action="details" data-id="${c.id}" aria-label="Details for ${esc(c.title)}: ${esc(reading)}; ${esc(credit.title)}; ${esc(status)}${c.partial ? '; partial history' : ''}" title="${esc(c.title + ' · ' + status + ' · ' + freshness + (c.error ? ' · ' + c.error : ''))}"><span class="mini-source"><span class="source-icon">${providerLogo(c.id)}</span><span>${esc(c.title)}</span><i class="mini-status ${c.status === 'stale' || c.status === 'setup' ? 'attention' : ''}" aria-hidden="true"></i></span><span class="mini-reading">${esc(reading)}</span><span class="mini-credit" title="${esc(credit.title)}">${esc(credit.text)}</span></button>`;
  }).join('')}</div></section>`;
}
