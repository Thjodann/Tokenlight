import { finite, formatCount, resetCountdown } from './model.mjs';
import { creditAmount } from './credit-view.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const percentText = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);

// Presentation never substitutes a different metric for an absent provider reading.
export function activityReading(card) {
  return finite(card.monthly) ? `${card.partial ? '~' : ''}${formatCount(card.monthly)} ${card.unit === 'credits' ? 'cr' : 'tok'}` : 'Not reported';
}
export function activityCaption(card, month) {
  const period = new Date(month + '-01T12:00:00Z').toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${period} · ${card.unit === 'credits' ? 'credits' : 'tokens'}${card.id === 'claude' ? ' · this Mac' : ''}${card.partial && finite(card.monthly) ? ' · partial' : ''}`;
}
export function balanceReading(card) {
  const balances = (card.creditBalances || []).filter(b => b.unit !== 'resets' && (b.unlimited || finite(b.value)));
  const b = balances[0];
  const text = b ? b.unlimited ? 'Unlimited' : b.unit === 'credits' ? `${formatCount(b.value)} cr` : creditAmount(b.value, b.unit) : '—';
  const title = balances.map(b => `${b.label}: ${b.unlimited ? 'Unlimited' : creditAmount(b.value, b.unit)}${b.allowance ? ' · allowance value, not a charge' : ''}`).join('; ') || 'Current balance not reported';
  return { text, label: b?.label || 'Not reported', title, balances };
}
export function balanceMarkup(card) {
  const b = balanceReading(card);
  return b.balances.length ? b.balances.map((value, index) => `<span class="metric-balance${index ? ' metric-balance-extra' : ''}" title="${esc(value.label)}: ${esc(value.unlimited ? 'Unlimited' : creditAmount(value.value, value.unit))}${value.allowance ? ' · allowance value, not a charge' : ''}"><strong>${esc(value.unlimited ? 'Unlimited' : value.unit === 'credits' ? `${formatCount(value.value)} cr` : creditAmount(value.value, value.unit))}</strong><small>${esc(value.label)}</small></span>`).join('') : '<span class="metric-balance"><strong>—</strong><small>Not reported</small></span>';
}
export function activeAllowances(card, now = Date.now()) {
  return (card.windows || []).filter(w => finite(w.percent) && (!w.resetsAt || w.resetsAt > now));
}
export function allowanceLabel(w, card) {
  const label = String(w.label || 'Allowance').replace(/^5 hour$/i, '5-hour session').replace(/^(?:7 day|1 week)$/i, 'Weekly').replace(/7 day$/i, 'weekly').replace(/^Subscription allowance$/i, 'Subscription cycle');
  return card.id === 'cursor' && w.pool ? `${label} · cycle` : label;
}
export function paidLimitText(card) {
  const p = card.paidUsage;
  if (!p) return '';
  const amount = finite(p.used) && finite(p.limit) ? `${creditAmount(p.used, p.unit)} used of ${creditAmount(p.limit, p.unit)}` : 'Amount not reported';
  return `Paid usage · current month: ${amount}${p.capReached === true ? ' · Cap reached · paid usage unavailable' : p.enabled === false ? ' · Disabled' : ''}`;
}
export function allowanceSummary(card) {
  return [...activeAllowances(card).map(w => `${allowanceLabel(w, card)}: ${percentText(w.percent)}% used`), paidLimitText(card)].filter(Boolean).join('; ') || 'Current allowances not reported';
}
export function allowanceMarkup(card) {
  const windows = activeAllowances(card);
  const rows = windows.map(w => {
    const label = allowanceLabel(w, card), reset = w.resetsAt ? `Resets ${resetCountdown(w.resetsAt)}` : 'Reset not reported';
    return `<span class="metric-limit" title="${esc(label)} · ${esc(reset)}"><span class="metric-limit-label">${esc(label)}</span><strong>${percentText(w.percent)}% used</strong><svg class="metric-limit-track" viewBox="0 0 100 2" preserveAspectRatio="none" role="img" aria-label="${esc(label)}: ${percentText(w.percent)}% used"><rect width="100" height="2"/><rect class="metric-limit-fill" width="${Math.min(100, Math.max(0, w.percent))}" height="2"/></svg><small class="metric-reset">${esc(reset)}</small></span>`;
  });
  if (card.paidUsage) {
    const p = card.paidUsage;
    rows.push(`<span class="metric-paid-limit${p.capReached === true ? ' is-reached' : ''}" title="${esc(paidLimitText(card))}"><span>Paid · month</span><strong>${finite(p.used) ? esc(creditAmount(p.used, p.unit)) : '—'} / ${finite(p.limit) ? esc(creditAmount(p.limit, p.unit)) : '—'}</strong>${p.capReached === true ? '<small>Cap reached · paid usage unavailable</small>' : p.enabled === false ? '<small>Paid usage disabled</small>' : ''}</span>`);
  }
  return rows.join('') || '<span class="metric-unreported">Not reported</span>';
}
