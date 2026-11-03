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
