const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function creditAmount(value, unit) {
  if (typeof value !== 'number' || !Number.isFinite(value) || (value < 0 && !/^[A-Z]{3}$/.test(unit))) return 'Not reported';
  if (/^[A-Z]{3}$/.test(unit)) return new Intl.NumberFormat('en-US', { style: 'currency', currency: unit }).format(value);
  return `${value.toLocaleString('en-US', { maximumFractionDigits: unit === 'resets' ? 0 : 2 })} ${unit === 'resets' ? value === 1 ? 'reset' : 'resets' : 'credits'}`;
}
export const isFableAllowance = b => b.allowance === true && (b.pool === 'fable' || /^Fable\b/i.test(b.label || ''));
export const creditLabel = b => isFableAllowance(b) ? 'Fable weekly meter · remaining' : b.label;
export const allowanceContext = b => isFableAllowance(b) ? 'Reported weekly allowance value, not a charge; not a paid credit balance or confirmation of model access' : 'allowance value, not a charge';
export function fableAccessText(card) {
  if (card.id !== 'claude' || !(card.windows || []).some(w => w.pool === 'fable') && !(card.creditBalances || []).some(isFableAllowance)) return '';
  return /^pro$/i.test(card.plan || '') ? 'Pro · Fable uses paid credits; weekly meter does not grant access.' : 'Fable weekly meter is separate from paid spending; model access depends on your plan.';
}
export function claudeConnectionSection(card) {
  if (card.id !== 'claude' || !card.accountConnection) return '';
  const a = card.accountConnection;
  return `<section class="claude-connection" aria-label="Connected Claude account"><h3>Connected Claude account</h3><dl><dt>Plan</dt><dd>${esc(a.plan || 'Not reported')} <small>· ${a.planSource === 'profile' ? 'verified with Claude' : 'credential metadata'}</small></dd><dt>Organization</dt><dd>${esc(a.organizationName || 'Name not reported')}</dd><dt>Organization ID</dt><dd>${esc(a.organizationId)}</dd></dl></section>`;
}
export function creditSection(card, details = false) {
  const reading = b => `<div class="credit-line"><span>${esc(creditLabel(b))}</span><strong>${b.unlimited ? 'Unlimited' : esc(creditAmount(b.value, b.unit))}</strong></div>${details && b.allowance ? `<p class="credit-context">${typeof b.used === 'number' && typeof b.limit === 'number' ? `${esc(creditAmount(b.used, b.unit))} used of ${esc(creditAmount(b.limit, b.unit))}. ` : ''}${Number.isFinite(b.resetsAt) ? `Resets ${esc(new Date(b.resetsAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }))}.` : 'Reset not reported.'}</p>` : ''}`;
  const fable = (card.creditBalances || []).filter(isFableAllowance);
  const other = (card.creditBalances || []).filter(b => !isFableAllowance(b));
  const rows = [];
  if (fable.length) rows.push('<h4 class="credit-group-heading">Weekly allowance meter</h4>', ...fable.map(reading), '<p class="credit-context">Reported allowance value, not a paid credit balance or confirmation of Fable access.</p>');
  if (other.length) rows.push(...other.map(reading));
  const access = fableAccessText(card);
  if (access) rows.push(`<p class="credit-context fable-access-note">${esc(access)}</p>`);
  const p = card.paidUsage;
  if (p) {
    rows.push(`<h4 class="credit-group-heading">Paid spending</h4><div class="credit-line"><span>Paid spending · current month</span><strong>${esc(creditAmount(p.used, p.unit))}</strong></div><div class="credit-line"><span>Monthly spend cap</span><strong>${esc(creditAmount(p.limit, p.unit))}</strong></div>${p.capReached === true ? '<p class="credit-context" role="status"><strong>Monthly spend cap reached</strong> · paid usage is unavailable. The weekly allowance meter does not increase this monthly spending cap.</p>' : p.enabled === false ? '<p class="credit-context">Paid usage is disabled</p>' : ''}`);
    if (!(card.creditBalances || []).some(b => b.label === 'Paid credit balance')) rows.push('<p class="credit-context">Paid credit balance not reported</p>');
  }
  const cost = card.apiCost;
  if (cost && typeof cost.total === 'number') {
    const fable = cost.models.filter(r => /^claude-fable(?:-|$)/i.test(r.model)).reduce((n, r) => n + r.amount, 0);
    rows.push(`<div class="credit-line"><span>API cost before credits</span><strong>${esc(creditAmount(cost.total, cost.unit))}</strong></div>${card.id === 'anthropic' ? `<div class="credit-line"><span>Fable API cost</span><strong>${esc(creditAmount(fable, cost.unit))}</strong></div>` : ''}<p class="credit-context">${esc(cost.month)} · reported cost, before credits</p>`);
    if (details) for (const row of cost.models) rows.push(`<div class="credit-line"><span>${esc(row.model)}</span><strong>${esc(creditAmount(row.amount, cost.unit))}</strong></div>`);
  }
  return rows.length ? `<section class="credit-readings" aria-label="Credits and paid usage">${rows.join('')}</section>` : '';
}
