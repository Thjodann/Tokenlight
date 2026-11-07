import { finite, currentMonth, formatCount } from './model.mjs';
import { usageValue } from './pricing.mjs';
export const activityUnit = id => id === 'codex' ? 'local active turns' : id === 'cursor' ? 'events' : id === 'claude' ? 'local replies' : ['openai','anthropic'].includes(id) ? 'requests' : 'records';
export const accountProfile = (settings,id) => settings?.accountProfiles?.[id] || {};
export function monthlyFee(settings,id,month) {
  const fees=accountProfile(settings,id).fees||{}, active=Object.keys(fees).filter(k=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k)&&k<=month).sort().at(-1);
  return active&&finite(fees[active])?fees[active]:null;
}
export function accountAge(date,now=Date.now()) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==date||time>now) return null;
  return {date,years:(now-time)/(365.2425*86400000)};
}
export function sourceCost(card,settings,month,now=Date.now()) {
  const profile=accountProfile(settings,card.id), manual=profile.metered?.[month];
  const implicitFee=['openai','anthropic'].includes(card.id)&&!Object.keys(profile.fees||{}).some(k=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k)&&k<=month);
  const fee=monthlyFee(settings,card.id,month) ?? (implicitFee?0:null);
  let metered=null,basis='Not reported';
  if(finite(manual)){metered=manual;basis='Entered locally';}
  else if(card.apiCost?.month===month&&card.apiCost.unit==='USD'&&Number.isFinite(card.apiCost.total)){metered=card.apiCost.total;basis='Provider report · before credits';}
  else if(month===currentMonth()&&new Date(card.lastUpdatedAt||0).toISOString().slice(0,7)===month&&card.paidUsage?.unit==='USD'&&finite(card.paidUsage.used)){metered=card.paidUsage.used;basis='Provider-reported extra usage';}
  return {id:card.id,title:card.title,fee,metered,basis,total:(fee!==null&&!implicitFee)||metered!==null?(fee??0)+(metered??0):null,partial:fee===null||metered===null,stale:card.status==='stale',value:usageValue(card),calls:finite(card.requestCount)?card.requestCount:null,activityUnit:activityUnit(card.id),activityNote:card.activityNote || (card.id==='claude'?'Local Claude replies · partial coverage; excludes other devices.':card.id==='codex'?'Local Codex model activity unavailable · partial coverage. Provider totals are separate.':null),activityPartial:!!card.activityScope?.partial || card.partial || ['codex','claude'].includes(card.id),age:accountAge(profile.createdAt,now)};
}
// Keep compact lists representative of the different measured action units.
// Round-robin the existing within-unit order rather than exhausting one unit.
export function limitedModelActivity(models, limit) {
  const groups = new Map();
  for (const model of models) {
    if (!groups.has(model.activityUnit)) groups.set(model.activityUnit, []);
    groups.get(model.activityUnit).push(model);
  }
  const selected = [];
  for (let offset = 0; selected.length < limit; offset++) {
    let added = false;
    for (const group of groups.values()) if (group[offset] && selected.length < limit) {
      selected.push(group[offset]); added = true;
    }
    if (!added) break;
  }
  return selected;
}
const identifiedModel = m => typeof m.model === 'string' && m.model.trim() && !/^(Unattributed|unknown|none|default|mock|test|placeholder)$/i.test(m.model) && !/auto-review|synthetic/i.test(m.model);
const leaders = (rows, field) => {
  const known = rows.filter(r=>finite(r[field]));
  const max = known.length ? Math.max(...known.map(r=>r[field])) : null;
  return max===null ? [] : known.filter(r=>r[field]===max);
};
// Evidence is metric-specific: missing interactions cannot erase known tokens.
function recordedActivity(cards) {
  const tokenCards=cards.filter(c=>c.unit==='tokens');
  const sources=tokenCards.filter(c=>finite(c.monthly)).map(c=>({id:c.id,title:c.title,tokens:c.monthly,partial:!!c.partial,stale:c.status==='stale'}));
  const tokens=new Map(), units=new Map();
  let incompleteAttribution=tokenCards.some(c=>!finite(c.monthly)), interactionGaps=false;
  for(const c of cards) {
    const local=['codex','claude'].includes(c.id), partial=!!c.partial||!!c.activityScope?.partial||local, stale=c.status==='stale';
    const rows=(c.modelUsage||[]).filter(identifiedModel);
    if(c.unit==='tokens') {
      const measured=rows.filter(m=>finite(m.tokens));
      incompleteAttribution ||= partial||measured.length!==rows.length||!finite(c.monthly)||measured.reduce((n,m)=>n+m.tokens,0)!==c.monthly;
      for(const m of measured) {
        const previous=tokens.get(m.model)||{model:m.model,tokens:0,providers:[],partial:false,stale:false};
        previous.tokens+=m.tokens; previous.partial ||= partial||rows.some(r=>!finite(r.tokens)); previous.stale ||= stale;
        if(!previous.providers.includes(c.title))previous.providers.push(c.title);
        tokens.set(m.model,previous);
      }
    }
    if(['elevenlabs','ollama'].includes(c.id))continue;
    const unit=activityUnit(c.id);
    if(!units.has(unit))units.set(unit,{unit,sources:[],models:new Map(),partial:false,stale:false});
    const group=units.get(unit);
    group.partial ||= partial||!finite(c.requestCount); group.stale ||= stale;
    interactionGaps ||= !finite(c.requestCount);
    if(finite(c.requestCount))group.sources.push({id:c.id,title:c.title,calls:c.requestCount,partial,stale});
    for(const m of rows)if(finite(m.calls)) {
      const previous=group.models.get(m.model)||{model:m.model,calls:0,providers:[],partial:false,stale:false};
      previous.calls+=m.calls;previous.partial ||= partial;previous.stale ||= stale;
      if(!previous.providers.includes(c.title))previous.providers.push(c.title);
      group.models.set(m.model,previous);
    }
    if(!rows.length&&c.requestCount>0||rows.some(m=>!finite(m.calls))||rows.reduce((n,m)=>n+(finite(m.calls)?m.calls:0),0)!==c.requestCount)group.partial=true;
  }
  const models=[...tokens.values()].sort((a,b)=>b.tokens-a.tokens||a.model.localeCompare(b.model));
  const interactionActivity=[...units.values()].map(g=>({...g,models:[...g.models.values()],sourceLeaders:leaders(g.sources,'calls'),modelLeaders:leaders([...g.models.values()],'calls')})).filter(g=>g.sources.length||g.models.length).sort((a,b)=>a.unit.localeCompare(b.unit));
  return {tokenActivity:{sources,models,sourceLeaders:leaders(sources,'tokens'),modelLeaders:leaders(models,'tokens'),incompleteAttribution,partial:tokenCards.some(c=>!finite(c.monthly)||c.partial),stale:sources.some(c=>c.stale)||models.some(m=>m.stale),reportedSources:sources.length,totalSources:tokenCards.length},interactionActivity,interactionGaps};
}
export function activityMetrics(i) {
  const t=i.tokenActivity;
  const names=(rows,name)=>rows.slice(0,2).map(r=>r[name]).join(' = ')+(rows.length>2?` + ${rows.length-2} tied`:'');
  const tokenText=(rows,name)=>rows.length ? names(rows,name)+` · ${formatCount(rows[0].tokens)} tok`+(rows.some(r=>r.stale)?' · stale':'') : 'Not reported';
  const interactions=field=>i.interactionActivity.flatMap(g=>g[field].length?[names(g[field],field==='sourceLeaders'?'title':'model')+` · ${formatCount(g[field][0].calls)} ${g.unit}`+(g.partial?' · partial':'')+(g.stale?' · stale':'')]:[]).join('; ')||'Not reported';
  return [
    {label:'Most recorded tokens',value:tokenText(t.sourceLeaders,'title')+(t.sourceLeaders.length&&t.partial?' · partial coverage':''),note:`${t.reportedSources}/${t.totalSources} calendar-month token sources · reported scopes${t.partial?' · partial / missing coverage':''}${t.stale?' · includes stale readings':''}; scopes may overlap`},
    {label:'Model tokens · identified',value:tokenText(t.modelLeaders,'model')+(t.modelLeaders.length&&t.incompleteAttribution?' · partial attribution':''),note:`Identified tokens only${t.incompleteAttribution?' · incomplete attribution':''}; local samples exclude other devices; no unknown tokens assigned`},
    {label:'Source interactions',value:interactions('sourceLeaders'),note:'Leaders within each action unit; local counts are device-only / partial; missing or stale coverage qualifies these records'},
    {label:'Model interactions · recorded',value:interactions('modelLeaders'),note:'Leaders within each action unit'+(i.interactionActivity.some(g=>g.partial)?' · partial model records':'')+'; model turns can overlap after switching; not a global favorite'}
  ];
}
export function monthlyInsights(snapshot,now=Date.now()) {
  const rows=snapshot.cards.map(c=>sourceCost(c,snapshot.settings,snapshot.month,now));
  const sum=values=>values.length?values.reduce((a,b)=>a+b,0):null;
  const eligible = rows.filter(r=>!['elevenlabs','ollama'].includes(r.id));
  const modelCounts=new Map();
  for(const row of eligible) for(const m of row.value.models) if(identifiedModel(m)&&finite(m.calls)) {
    const key=JSON.stringify([m.model,row.activityUnit]),prev=modelCounts.get(key)||{model:m.model,calls:0,activityUnit:row.activityUnit,providers:new Set()};prev.calls+=m.calls;prev.providers.add(row.title);modelCounts.set(key,prev);
  }
  const favorites=[...modelCounts.values()].sort((a,b)=>a.activityUnit.localeCompare(b.activityUnit)||b.calls-a.calls||a.model.localeCompare(b.model)).map(m=>({...m,providers:[...m.providers]}));
  const oldest=rows.filter(r=>r.age).sort((a,b)=>b.age.years-a.age.years)[0]||null;
  return {...recordedActivity(snapshot.cards),month:snapshot.month,unit:'USD',rows,total:sum(rows.map(r=>r.total).filter(Number.isFinite)),completeSources:rows.filter(r=>!r.partial).length,estimatedValue:sum(rows.map(r=>r.value.total).filter(Number.isFinite)),valueSources:rows.filter(r=>r.value.total!==null).length,valuePartial:rows.some(r=>r.value.partial),callSources:rows.filter(r=>r.calls!==null).length,favorites,oldest};
}
export function validateProfileChange(value,now=Date.now()) {
  if(!value||typeof value!=='object'||!['fee','metered','createdAt'].includes(value.field)) throw new Error('Choose a valid local account setting.');
  if(value.field==='createdAt') {
    if(value.value!==null&&!accountAge(value.value,now))throw new Error('Choose a valid account start date, no later than today.');
  } else {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)||value.month<'2020-01'||value.month>currentMonth())throw new Error('Choose a valid reporting month.');
    if(value.value!==null&&(!finite(value.value)||value.value>1000000||Math.abs(value.value*100-Math.round(value.value*100))>.00001))throw new Error('Enter a USD amount from 0 to 1,000,000 with up to two decimal places.');
  }
  return value;
}
export function applyProfileChange(settings,id,value) {
  validateProfileChange(value);
  const next={...settings.accountProfiles}, profile={...(next[id]||{})};
  if(value.field==='createdAt')profile.createdAt=value.value;
  else {const key=value.field==='fee'?'fees':'metered';profile[key]={...(profile[key]||{}),[value.month]:value.value};}
  next[id]=profile;return next;
}
