const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function creditAmount(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'Not reported';
  if (/^[A-Z]{3}$/.test(unit)) return new Intl.NumberFormat('en-US', { style: 'currency', currency: unit }).format(value);
  return `${value.toLocaleString('en-US', { maximumFractionDigits: unit === 'resets' ? 0 : 2 })} ${unit === 'resets' ? value === 1 ? 'reset' : 'resets' : 'credits'}`;
}
export function creditSection(card, details = false) {
  const rows = (card.creditBalances || []).map(b => `<div class="credit-line"><span>${esc(b.label)}</span><strong>${b.unlimited ? 'Unlimited' : esc(creditAmount(b.value, b.unit))}</strong></div>${details && b.allowance ? `<p class="credit-context">${typeof b.used === 'number' && typeof b.limit === 'number' ? `${esc(creditAmount(b.used, b.unit))} used of ${esc(creditAmount(b.limit, b.unit))}. ` : ''}${Number.isFinite(b.resetsAt) ? `Resets ${esc(new Date(b.resetsAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))}.` : 'Reset not reported.'}</p>` : ''}`);
  const p = card.paidUsage;
  if (p) {
    rows.push(`<div class="credit-line"><span>Paid usage · current month</span><strong>${esc(creditAmount(p.used, p.unit))}</strong></div><div class="credit-line"><span>Monthly spend cap</span><strong>${esc(creditAmount(p.limit, p.unit))}</strong></div>${p.enabled === false ? '<p class="credit-context">Paid usage is disabled</p>' : ''}`);
    if (!(card.creditBalances || []).some(b => b.label === 'Paid credit balance')) rows.push('<p class="credit-context">Paid credit balance not reported</p>');
  }
  const cost = card.apiCost;
  if (cost && typeof cost.total === 'number') {
    const fable = cost.models.filter(r => /^claude-fable(?:-|$)/i.test(r.model)).reduce((n, r) => n + r.amount, 0);
    rows.push(`<div class="credit-line"><span>API cost before credits</span><strong>${esc(creditAmount(cost.total, cost.unit))}</strong></div><div class="credit-line"><span>Fable API cost</span><strong>${esc(creditAmount(fable, cost.unit))}</strong></div><p class="credit-context">${esc(cost.month)} · reported cost, before credits</p>`);
    if (details) for (const row of cost.models) rows.push(`<div class="credit-line"><span>${esc(row.model)}</span><strong>${esc(creditAmount(row.amount, cost.unit))}</strong></div>`);
  }
  return rows.length ? `<section class="credit-readings" aria-label="Credits and paid usage">${rows.join('')}</section>` : '';
}
