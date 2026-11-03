import { finite, formatCount } from './model.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = value => finite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : '—';
import { monthlyInsights } from './insights.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';

// Only observed days: no future points, invented zeroes, or cross-unit totals.
export function reportedDays(card, month, today = new Date().toISOString().slice(0, 10)) {
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  return (card.daily || []).filter(d => d.date?.startsWith(month + '-') && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && Number(d.date.slice(8)) >= 1 && Number(d.date.slice(8)) <= days && d.date <= today && finite(d.value) && d.value >= 0).sort((a, b) => a.date.localeCompare(b.date));
}
export function activityPlot(card, month) {
  const points = reportedDays(card, month), days = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const max = Math.max(1, ...points.map(d => d.value));
  const label = `${card.title} daily ${card.unit || 'tokens'} · ${month} · ${points.length ? 'each source uses its own scale; gaps are unreported' : 'history not reported'}`;
  return `<svg class="usage-plot${points.length ? '' : ' is-empty'}" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><path class="usage-grid" d="M0 58H300M0 29H300"/>${points.length ? points.map(d => {
    const x = (Number(d.date.slice(8)) - .5) / days * 300, h = d.value / max * 52;
    return `<rect class="usage-bar" x="${x - Math.max(1, 300 / days - 3) / 2}" y="${58 - Math.max(1, h)}" width="${Math.max(1, 300 / days - 3)}" height="${Math.max(1, h)}"><title>${esc(d.date)}: ${formatCount(d.value)} ${esc(card.unit || 'tokens')}</title></rect>`;
  }).join('') : '<path class="usage-missing" d="M0 43H300"/>'}</svg>`;
}
function bars(rows, field, label, money) {
  const known = rows.filter(r => finite(field(r))), max = Math.max(0, ...known.map(field)) || 1;
  return `<section class="visual-chart" aria-label="${esc(label)}"><header><h2>${esc(label)}</h2><span>${money ? 'USD' : 'records'}</span></header><div class="visual-bars">${rows.length ? rows.map(r => {
    const value = field(r), reading = money ? usd(value) : finite(value) ? formatCount(value) : '—';
    return `<div class="visual-bar-row" data-provider="${providerFor(r.id)}" title="${esc(r.title)}: ${esc(reading)}${r.partial ? ' · partial' : ''}"><span class="visual-bar-name">${money ? `<span class="visual-provider">${providerLogo(r.id)}</span>` : ''}${esc(r.title)}</span><strong>${reading}${money && r.partial ? ' *' : ''}</strong><svg viewBox="0 0 100 3" preserveAspectRatio="none" role="img" aria-label="${esc(r.title)}: ${esc(reading)}"><path d="M0 1.5H100" class="visual-track"/>${finite(value) ? `<rect width="${Math.max(0, value) / max * 100}" height="3"/>` : '<path d="M0 1.5H100" class="visual-unknown"/>'}</svg></div>`;
  }).join('') : '<div class="visual-no-data"><svg viewBox="0 0 100 24" aria-hidden="true"><path d="M0 22H100M0 10H100"/></svg><span>No records</span></div>'}</div></section>`;
}
export function insightGraphics(snapshot) {
  const i = monthlyInsights(snapshot);
  const models = i.favorites.slice(0, 5).map(m => ({ id: '', title: m.model, calls: m.calls }));
  return `<div class="insight-graphics">${bars(i.rows, r => r.total, 'Known cost', true)}${bars(i.rows.map(r => ({ ...r, partial: r.value.partial })), r => r.value.total, 'Usage value', true)}${bars(models, r => r.calls, 'Model activity', false)}<p class="visual-caveat">USD · * incomplete · usage value is not an extra charge · activity rankings approximate</p></div>`;
}

// Sparklines connect consecutive observed days only. A gap never becomes a zero.
export function activityLine(card, month) {
  const points = reportedDays(card, month), max = Math.max(1, ...points.map(d => d.value));
  const first = Number(points[0]?.date.slice(8) || 1), last = Number(points.at(-1)?.date.slice(8) || first);
  const xy = d => [points.length === 1 ? 150 : 4 + (Number(d.date.slice(8)) - first) / Math.max(1, last - first) * 292, 36 - d.value / max * 32];
  const label = `${card.title} daily ${card.unit || 'tokens'} · ${month} · ${points.length ? 'observed days only; each source uses its own scale; gaps are unreported' : 'history not reported'}`;
  let previous;
  const path = points.map(d => { const [x, y] = xy(d), day = Number(d.date.slice(8)), command = previous === day - 1 ? 'L' : 'M'; previous = day; return `${command}${x},${y}`; }).join(' ');
  return `<svg class="activity-line${points.length ? '' : ' is-empty'}" viewBox="0 0 300 40" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><path class="line-baseline" d="M0 37H300"/>${points.length ? `<path class="line-stroke" d="${path}"/>${points.map(d => { const [cx, cy] = xy(d); return `<circle cx="${cx}" cy="${cy}" r="1.8"><title>${esc(d.date)}: ${formatCount(d.value)} ${esc(card.unit || 'tokens')}</title></circle>`; }).join('')}` : '<path class="line-gap" d="M0 20H300"/>'}</svg>`;
}
function distribution(rows, field, label, total, partial) {
  const known = rows.filter(r => finite(field(r)) && field(r) >= 0), sum = known.reduce((n, r) => n + field(r), 0);
  let offset = 0;
  const arcs = known.filter(r => field(r) > 0).map(r => {
    const length = field(r) / sum * 100, start = offset; offset += length;
    return `<circle class="orbit-segment" data-provider="${providerFor(r.id)}" cx="50" cy="50" r="42" pathLength="100" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${-start}"><title>${esc(r.title)}: ${usd(field(r))}</title></circle>`;
  }).join('');
  return `<section class="orbit-figure" aria-label="${esc(label)}"><div class="orbit-wheel"><svg viewBox="0 0 100 100" role="img" aria-label="${esc(label)}: ${usd(total)}${partial ? ' · partial coverage' : ''}"><circle class="orbit-track${known.length ? '' : ' orbit-missing'}" cx="50" cy="50" r="42"/>${arcs}</svg><div class="orbit-center"><span>${esc(label)}</span><strong>${usd(total)}${partial ? '<sup>*</sup>' : ''}</strong><small>USD</small></div></div><div class="orbit-legend">${rows.map(r => `<span data-provider="${providerFor(r.id)}" title="${esc(r.title)}: ${usd(field(r))}"><i></i><small>${esc(r.title)}</small><b>${usd(field(r))}</b></span>`).join('')}</div></section>`;
}
export function dashboardInsights(snapshot) {
  const i = monthlyInsights(snapshot), models = i.favorites.slice(0, 4), max = Math.max(1, ...models.map(m => m.calls));
  return `<div class="monitor-orbits">${distribution(i.rows, r => r.total, 'Known cost', i.total, i.completeSources < snapshot.cards.length)}${distribution(i.rows, r => r.value.total, 'Usage value', i.estimatedValue, i.valuePartial)}<section class="orbit-models" aria-label="Model activity"><header>Model activity <small>records</small></header>${models.length ? models.map((m, index) => `<div class="model-lollipop" title="${esc(m.model)}: ${formatCount(m.calls)} records"><span>${esc(m.model)}</span><b>${formatCount(m.calls)}</b><svg viewBox="0 0 100 6" preserveAspectRatio="none" role="img" aria-label="${esc(m.model)}: ${formatCount(m.calls)} records"><path class="line-baseline" d="M0 3H100"/><path class="line-stroke" d="M0 3H${m.calls / max * 98}"/><circle cx="${m.calls / max * 98}" cy="3" r="2"/></svg></div>`).join('') : '<span class="orbit-no-data">No records</span>'}</section></div><p class="orbit-note">* partial · usage value is not an extra charge · activity rankings approximate</p>`;
}
