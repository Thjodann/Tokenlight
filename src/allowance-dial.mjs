import { activeAllowances, allowanceLabel, percentText, allowanceState, allowancePercent, allowanceReading } from './metric-view.mjs';
import { finite, formatCount, resetCountdown } from './model.mjs';
import { creditAmount } from './credit-view.mjs';
import { esc } from './insight-view.mjs';

// Segments describe the same percentage as the provider. Only the painted arc
// is bounded; over-limit readings retain their original number in the legend.
export function dialSegments(percent, radius = 88, count = 12) {
  if (!finite(percent) || !finite(radius) || radius <= 0 || !Number.isInteger(count) || count < 1) return [];
  const step = 300 / count, gap = Math.min(step * .55, 9 * 180 / (Math.PI * radius) + 2);
  const point = degrees => { const a = degrees * Math.PI / 180; return [100 + radius * Math.cos(a), 100 + radius * Math.sin(a)].map(v => Number(v.toFixed(4))); };
  const arc = (start, end) => `M${point(start).join(' ')} A${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end).join(' ')}`;
  return Array.from({ length: count }, (_, index) => {
    const start = 120 + index * step + gap / 2, end = 120 + (index + 1) * step - gap / 2;
    const fraction = Math.max(0, Math.min(1, Math.max(0, Math.min(100, percent)) / 100 * count - index));
    return { track: arc(start, end), fill: fraction > 0 ? arc(start, start + (end - start) * fraction) : null, fraction };
  });
}
export function allowancePools(cards) {
  return cards.flatMap(card => activeAllowances(card).map(window => ({ ...window, card, label: allowanceLabel(window, card) })));
}
const reached = pool => pool.percent >= 100;
const limitName = pool => String(pool.label).replace(/\s+(?:allowance|session|· cycle)$/i, '');
const back = pool => { const text = pool.resetsAt ? resetCountdown(pool.resetsAt) : 'Reset not reported'; return text.startsWith('in ') ? 'Back ' + text : text; };
// The allowance that decides whether this source can be used right now: the
// one with the least left among those that gate all of a source's use. A pool
// tied to one model lane (`pool`, e.g. Fable or Cursor's lanes) gates only that
// lane, so it never binds the rest. Among exhausted ties, the later reset wins,
// because that is when use actually returns.
export function bindingPool(pools) {
  pools = pools.filter(p => finite(p.percent));
  const lead = pools.find(p => !p.pool);
  if (!lead) return pools[0] || null;
  return pools.filter(p => !p.pool && p.card === lead.card).reduce((best, p) =>
    p.percent > best.percent || (p.percent === best.percent && reached(p) && (p.resetsAt ?? -Infinity) > (best.resetsAt ?? -Infinity)) ? p : best);
}
// Binding pool first; the rest keep the provider's order.
export function bindingOrder(pools) {
  const binding = bindingPool(pools);
  return binding ? [binding, ...pools.filter(p => p !== binding)] : pools;
}
// A gating pool is unusable while another gate on the same source is exhausted.
export function blockedBy(pool, binding) {
  return binding && pool !== binding && reached(binding) && !pool.pool && !binding.pool && pool.card === binding.card ? binding : null;
}
export const limitReachedText = pool => `${limitName(pool)} limit reached`;
export function allowanceAmount(pool) {
  if (!finite(pool.used) || !finite(pool.limit) || !pool.unit) return null;
  if (pool.unit === 'USD') return `${creditAmount(pool.used, pool.unit)} / ${creditAmount(pool.limit, pool.unit)}`;
  return `${formatCount(pool.used)} / ${formatCount(pool.limit)} ${pool.unit}`;
}
export function allowanceDial(pools, remaining = false) {
  pools = bindingOrder(pools.filter(pool => finite(pool.percent)));
  const rings = pools.map((pool, index) => {
    const radius = 88 - index * (pools.length <= 3 ? 18 : 55 / Math.max(1, pools.length - 1));
    return `<g class="allotment-ring" data-allowance-state="${allowanceState(pool.percent)}" data-ring="${index}" data-percent="${allowancePercent(pool.percent, remaining)}" stroke-width="${index === 0 ? 10.5 : index === pools.length - 1 ? 3 : 9}"><title>${esc(pool.label)}: ${allowanceReading(pool.percent, remaining)}</title>${dialSegments(allowancePercent(pool.percent, remaining), radius, index === 0 ? 12 : 1).map(s => `<path class="allotment-track" d="${s.track}"/>${s.fill ? `<path class="allotment-fill" d="${s.fill}"/>` : ''}`).join('')}</g>`;
  }).join('');
  const primary = pools[0], stopped = primary && !primary.pool && reached(primary);
  const status = stopped ? `<span class="allotment-dial-status">${esc(limitReachedText(primary))}</span><small class="allotment-dial-reset">${esc(back(primary))}</small>` : `<span>${primary ? remaining ? 'remaining' : 'used' : 'Not reported'}</span>`;
  const label = primary ? primary.label.replace('5-hour session', '5-hour').replace(' · cycle', '').replace('Subscription cycle', 'This cycle') : 'Allowance';
  return `<figure class="allotment-dial"${stopped ? ' data-limit-reached="true"' : ''} aria-label="${stopped ? esc(limitReachedText(primary) + ' · ' + back(primary) + '; ') : ''}${esc(pools.map(p => p.label + ': ' + allowanceReading(p.percent, remaining)).join('; ') || 'Current allowance not reported')}"><svg viewBox="0 0 200 200" aria-hidden="true">${rings || dialSegments(0).map(s => `<path class="allotment-track is-unreported" d="${s.track}"/>`).join('')}</svg><figcaption><strong>${primary ? percentText(allowancePercent(primary.percent, remaining)) + '<small>%</small>' : '—'}</strong>${status}</figcaption><span class="allotment-dial-caption">${esc(label)}</span></figure>`;
}
export function allowanceLegend(pools, remaining = false) {
  pools = pools.filter(pool => finite(pool.percent));
  if (!pools.length) return '<div class="allotment-unreported"><span>Allowance not reported</span><small>No fixed token budget supplied</small></div>';
  // Rows keep the provider's order; each row's marker matches its ring.
  const rings = bindingOrder(pools), binding = rings[0];
  const gates = pools.filter(p => !p.pool && !binding.pool && p.card === binding.card).length;
  return `<div class="allotment-legend">${pools.map(pool => {
    const index = rings.indexOf(pool), amount = allowanceAmount(pool), blocker = blockedBy(pool, binding);
    const reset = blocker ? `Unavailable until the ${limitName(blocker).toLowerCase()} reset` : (pool.resetsAt ? 'Resets ' + resetCountdown(pool.resetsAt) : 'Reset not reported');
    const marks = (pool === binding && gates > 1 ? ' data-binding="true"' : '') + (pool === binding && reached(pool) && !pool.pool ? ' data-limit-reached="true"' : '') + (blocker ? ' data-blocked="true"' : '');
    return `<div class="allotment-limit" data-allowance-state="${allowanceState(pool.percent)}" data-ring="${index}"${marks} title="${esc(pool.card.title)} · ${esc(pool.label)} · ${allowanceReading(pool.percent, remaining)}${amount ? ' · ' + esc(amount) : ''} · ${esc(reset)}"><i aria-hidden="true"></i><span>${esc(pool.label)}<small>${esc((remaining && pool.percent > 100 ? percentText(pool.percent) + '% used · ' : '') + (amount ? amount + (remaining ? ' used' : '') + ' · ' + reset : reset))}</small></span><strong>${percentText(allowancePercent(pool.percent, remaining))}<small>% ${remaining ? 'remaining' : 'used'}</small></strong></div>`;
  }).join('')}</div>`;
}
