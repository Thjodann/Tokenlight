import {formatCount} from './model.mjs';
import {activityMetrics} from './insights.mjs';
import {providerFor,providerLogo} from './provider-branding.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nameMarkup=value=>{const name=String(value??'');return name.length>28?`<span class="activity-shortname"><span>${esc(name.slice(0,15))}</span><span>…${esc(name.slice(-8))}</span></span>`:esc(name);};
const tie=rows=>rows.length>1?`<span class="activity-tie" aria-label="${rows.length} tied">=${rows.length}</span>`:'';
const stale=r=>r.stale?'<span class="activity-state" role="img" aria-label="Stale reading" title="Stale reading">◷</span>':'';
function bar(value,max,label){
 const width=max>0?Math.max(0,Math.min(100,value/max*100)):0;
 return `<svg class="activity-bar" viewBox="0 0 100 3" preserveAspectRatio="none" role="img" aria-label="${esc(label)}"><path class="activity-bar-track" d="M0 1.5H100"/><rect class="activity-bar-fill" width="${width}" height="3"/></svg>`;
}
function tokenLane(rows,label,source){
 const sorted=[...rows].sort((a,b)=>b.tokens-a.tokens),max=sorted[0]?.tokens??0;
 const tied=sorted.filter(r=>r.tokens===max);
 return `<section class="activity-lane" aria-label="${esc(label)}"><h3>${source?'Sources':'Models <small>identified</small>'}</h3>${sorted.length?sorted.slice(0,2).map((r,n)=>{
  const name=source?r.title:r.model,reading=formatCount(r.tokens),hint=`${name}: ${r.tokens} tokens${r.partial?'; partial':''}${r.stale?'; stale':''}`;
  return `<div class="activity-token-row" ${source?`data-provider="${providerFor(r.id)}"`:''} title="${esc(hint)}"><span class="activity-name">${source?`<span class="activity-logo">${providerLogo(r.id)}</span>`:''}<span class="activity-label">${nameMarkup(name)}</span>${n===0?tie(tied):''}${stale(r)}</span><b>${reading}</b>${bar(r.tokens,max,hint)}</div>`;
 }).join(''):'<span class="activity-empty" aria-label="Not reported">—</span>'}</section>`;
}
const unitName=unit=>({'local active turns':'Local turns','local replies':'Local replies','events':'Events','requests':'Requests'}[unit]||unit);
function frequencyCell(rows,max,source){
 if(!rows.length)return '<span role="cell" class="activity-frequency-cell activity-empty" aria-label="Not reported">—</span>';
 const r=rows[0],name=source?r.title:r.model,hint=`${name}: ${r.calls}${rows.length>1?`; ${rows.length} tied`:''}${r.stale?'; stale':''}`;
 return `<span role="cell" class="activity-frequency-cell" title="${esc(hint)}" ${source?`data-provider="${providerFor(r.id)}"`:''}><span class="activity-name"><span class="activity-label">${nameMarkup(name)}</span>${tie(rows)}${stale(r)}</span><b>${formatCount(r.calls)}</b>${bar(r.calls,max,hint)}</span>`;
}
// Presentation only: numerical ranking and coverage remain owned by monthlyInsights.
export function activityOverview(i){
 const t=i.tokenActivity,partial=t.partial||t.incompleteAttribution||i.interactionGaps||i.interactionActivity.some(g=>g.partial),hasStale=t.stale||i.interactionActivity.some(g=>g.stale);
 const frequency=i.interactionActivity.map(g=>{
  const max=Math.max(0,...g.sources.map(r=>r.calls),...g.models.map(r=>r.calls));
  return `<div class="activity-frequency-row" role="row" aria-label="${esc(g.unit)}; independent scale${g.partial?'; partial records':''}"><span class="activity-unit" role="rowheader">${esc(unitName(g.unit))}${g.partial?'<span aria-label="Partial records"> ◐</span>':''}</span>${frequencyCell(g.sourceLeaders,max,true)}${frequencyCell(g.modelLeaders,max,false)}</div>`;
 }).join('');
 const notes=activityMetrics(i);
 return `<section class="activity-overview" aria-label="Recorded activity"><div class="activity-token-panel"><header><h2>Tokens</h2><small>UTC month</small></header><div class="activity-token-lanes">${tokenLane(t.sources,'Most recorded tokens',true)}${tokenLane(t.models,'Model tokens · identified',false)}</div></div><div class="activity-frequency-panel"><header><h2>Interactions</h2><small>per unit</small></header><div class="activity-frequency" role="table" aria-label="Recorded interaction leaders"><div class="activity-frequency-head" role="row"><span>Unit</span><span role="columnheader" aria-label="Source interactions">Source</span><span role="columnheader" aria-label="Model interactions">Model</span></div>${frequency||'<span class="activity-empty" aria-label="Not reported">—</span>'}</div></div><details class="activity-scope"><summary aria-label="Activity scope and coverage">${!t.sources.length&&!t.models.length&&!i.interactionActivity.length?'— Not reported':partial?'◐ Partial':'○ Reported'}${hasStale?' · ◷ Stale':''}<span>Details</span></summary><div class="activity-scope-body" tabindex="0" role="region" aria-label="Activity details"><h3>Scope &amp; coverage</h3><p>Bars use separate scales for source tokens, identified model tokens, and each interaction unit. Turns, replies, events and requests are never combined.</p><p>◐ Partial (not a percentage) · ◷ Stale · = Tied · 0 Measured zero · — Not reported</p>${notes.map(m=>`<p><strong>${esc(m.label)}</strong><br>${esc(m.value)}<br>${esc(m.note)}</p>`).join('')}<p><strong>Full model identifiers</strong><br>${t.models.slice(0,2).map(r=>esc(r.model)+': '+formatCount(r.tokens)+' tokens').join('<br>')||'Not reported'}</p><p>Known cost is before credits / tax. Usage value is not an extra charge.</p><p>Local records exclude other devices. Unidentified account tokens are not assigned to a model. Source scopes can overlap.</p></div></details></section>`;
}
