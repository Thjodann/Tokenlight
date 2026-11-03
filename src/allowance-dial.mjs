import { activeAllowances, allowanceLabel, percentText } from './metric-view.mjs';
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
export function allowanceAmount(pool) {
  if (!finite(pool.used) || !finite(pool.limit) || !pool.unit) return null;
  if (pool.unit === 'USD') return `${creditAmount(pool.used, pool.unit)} / ${creditAmount(pool.limit, pool.unit)}`;
  return `${formatCount(pool.used)} / ${formatCount(pool.limit)} ${pool.unit}`;
}
export function allowanceDial(pools) {
  const rings = pools.map((pool, index) => {
    const radius = 88 - index * (pools.length <= 3 ? 18 : 55 / Math.max(1, pools.length - 1));
    return `<g class="allotment-ring" data-ring="${index}" data-percent="${pool.percent}"><title>${esc(pool.label)}: ${percentText(pool.percent)}% used</title>${dialSegments(pool.percent, radius).map(s => `<path class="allotment-track" d="${s.track}"/>${s.fill ? `<path class="allotment-fill" d="${s.fill}"/>` : ''}`).join('')}</g>`;
  }).join('');
  const primary = pools[0];
  const label = primary ? primary.label.replace('5-hour session', '5-hour').replace(' · cycle', '').replace('Subscription cycle', 'This cycle') : 'Allowance';
  return `<figure class="allotment-dial" aria-label="${esc(pools.map(p => p.label + ': ' + percentText(p.percent) + '% used').join('; ') || 'Current allowance not reported')}"><svg viewBox="0 0 200 200" aria-hidden="true">${rings || dialSegments(0).map(s => `<path class="allotment-track is-unreported" d="${s.track}"/>`).join('')}</svg><figcaption><strong>${primary ? percentText(primary.percent) + '<small>%</small>' : '—'}</strong><span>${primary ? 'used' : 'Not reported'}</span></figcaption><span class="allotment-dial-caption">${esc(label)}</span></figure>`;
}
export function allowanceLegend(pools) {
  if (!pools.length) return '<div class="allotment-unreported"><span>Allowance not reported</span><small>No fixed token budget supplied</small></div>';
  return `<div class="allotment-legend">${pools.map((pool, index) => {
    const amount = allowanceAmount(pool), reset = pool.resetsAt ? 'Resets ' + resetCountdown(pool.resetsAt) : 'Reset not reported';
    return `<div class="allotment-limit" data-ring="${index}" title="${esc(pool.card.title)} · ${esc(pool.label)} · ${percentText(pool.percent)}% used${amount ? ' · ' + esc(amount) : ''} · ${esc(reset)}"><i aria-hidden="true"></i><span>${esc(pool.label)}<small>${esc(amount ? amount + ' · ' + reset : reset)}</small></span><strong>${percentText(pool.percent)}<small>% used</small></strong></div>`;
  }).join('')}</div>`;
}
