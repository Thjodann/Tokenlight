import { desktopView } from './desktop-view.mjs';
import { miniReading, miniCredit } from './mini-view.mjs';
import { providerFor, providerLogo } from './provider-branding.mjs';
import { monthlyInsights, sourceCost } from './insights.mjs';
import { esc, usd, insightsPage } from './insight-view.mjs';
import { currentMonth } from './model.mjs';
import { activityCaption, allowanceMarkup, allowanceSummary, balanceMarkup } from './metric-view.mjs';
export const WIDE_QUERY = '(min-width: 1000px) and (min-height: 280px) and (min-aspect-ratio: 12/5)';
// Choose readable tiles or rows from the actual space left after the app controls.
export function instrumentLayout(width, height, count, panorama = false) {
  if (!count || width <= 0 || height <= 0) return null;
  const gap = 6;
  const choose = (minWidth, minHeight, density) => {
    const choices = [];
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns), w = (width - gap * (columns - 1)) / columns, h = (height - gap * (rows - 1)) / rows;
      if (w < minWidth || h < minHeight) continue;
      const score = Math.abs(Math.log(w / h / 1.4)) + (columns * rows - count) / count * .6;
      choices.push({ columns, rows, density, score });
    }
    return choices.sort((a,b) => a.score - b.score)[0];
  };
  if (panorama && width / count >= 132 && height >= 190) return { columns: count, rows: 1, density: 'full' };
  const full = choose(160, 190, 'full');
  if (full) return full;
  if ((height - gap * (count - 1)) / count >= 62) return { columns: 1, rows: count, density: 'rows' };
  return choose(132, 160, 'compact') || { columns: 1, rows: count, density: 'micro' };
}
export function wideView(snapshot,view,options = {}) {
  const month=new Date(snapshot.month+'-01T12:00:00Z').toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'}),insights=monthlyInsights(snapshot);
  const cards=snapshot.cards.filter(c=>view==='overview'||view==='insights'||c.kind===view);
  const context=`<div class="wide-context"><div class="wide-period"><button class="icon-button" data-action="previous" aria-label="Previous month">‹</button><input type="month" id="wide-month-control" value="${snapshot.month}" min="2020-01" max="${currentMonth()}" aria-label="Choose reporting month"><button class="icon-button" data-action="next" aria-label="Next month" ${snapshot.month===currentMonth()?'disabled':''}>›</button><span>UTC${snapshot.demo?' · SAMPLE DATA':''}</span></div><button class="wide-totals" data-view="insights" title="${insights.completeSources}/7 sources complete; known cost is before credits and tax. Usage value may overlap own-key traffic.">Known cost <strong>${usd(insights.total)}${insights.completeSources<7?' *':''}</strong><span>Usage value <strong>${usd(insights.estimatedValue)}</strong></span></button></div>`;
  if(view==='insights')return `<section class="wide-panel" aria-label="Wide insights">${context}<div class="wide-insights-scroll">${insightsPage(snapshot)}</div></section>`;
  if(options.desktop)return desktopView(snapshot,view,context,options.selectedId);
  return `<section class="wide-panel" aria-label="Wide dashboard"><div class="sr-only">${esc(month)} · source activity and current allowances</div>${context}<div class="instrument-rack" data-count="${cards.length}">${cards.map(c=>{
    const cost=sourceCost(c,snapshot.settings,snapshot.month),credit=miniCredit(c);
    return `<button class="wide-instrument" data-state="${c.status}" data-provider="${providerFor(c.id)}" data-action="details" data-id="${c.id}" aria-label="Details for ${esc(c.title)}: ${esc(miniReading(c))}; ${esc(credit.title)}; ${esc(allowanceSummary(c))}; ${c.status==='stale'?'stale reading':c.status==='setup'||c.status==='unconnected'?'needs setup':'connected'}${c.partial?'; partial history':''}"><span class="instrument-heading"><span class="source-icon">${providerLogo(c.id)}</span><span><strong>${esc(c.title)}</strong><small>${c.kind==='account'?'ACCOUNT':'API'}</small></span></span><strong class="instrument-reading">${esc(miniReading(c))}<small class="instrument-activity-caption">${esc(activityCaption(c,snapshot.month))}</small></strong><span class="instrument-credit" aria-label="Balances · current">${balanceMarkup(c)}</span><span class="instrument-pools" aria-label="Allowances · current">${allowanceMarkup(c)}</span><span class="instrument-cost"><span>Known cost <strong>${usd(cost.total)}${cost.partial?' *':''}</strong></span><span>Usage value <strong>${usd(cost.value.total)}${cost.value.partial && cost.value.total!==null?' ~':''}</strong></span></span><span class="instrument-state">${c.status==='stale'?'Last reading · stale':c.status==='refreshing'?'Refreshing':c.status==='setup'||c.status==='unconnected'?'Connect this source':c.partial?'Partial history':'Source connected'}</span></button>`;
  }).join('')}</div><div class="wide-extra">${insightsPage(snapshot)}</div></section>`;
}
