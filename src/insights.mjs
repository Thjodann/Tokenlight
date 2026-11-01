import { finite, currentMonth } from './model.mjs';
import { usageValue } from './pricing.mjs';
export const activityUnit = id => id === 'cursor' ? 'events' : id === 'claude' ? 'local replies' : ['openai','anthropic'].includes(id) ? 'requests' : 'records';
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
  return {id:card.id,title:card.title,fee,metered,basis,total:(fee!==null&&!implicitFee)||metered!==null?(fee??0)+(metered??0):null,partial:fee===null||metered===null,stale:card.status==='stale',value:usageValue(card),calls:finite(card.requestCount)?card.requestCount:null,activityUnit:activityUnit(card.id),age:accountAge(profile.createdAt,now)};
}
export function monthlyInsights(snapshot,now=Date.now()) {
  const rows=snapshot.cards.map(c=>sourceCost(c,snapshot.settings,snapshot.month,now));
  const sum=values=>values.length?values.reduce((a,b)=>a+b,0):null;
  const byCalls=rows.filter(r=>r.calls>0).sort((a,b)=>b.calls-a.calls||a.id.localeCompare(b.id));
  const modelCounts=new Map();
  for(const row of rows) for(const m of row.value.models) if(m.model!=='Unattributed'&&finite(m.calls)&&m.calls>0) {
    const key=m.model,prev=modelCounts.get(key)||{model:key,calls:0,providers:new Set()};prev.calls+=m.calls;prev.providers.add(row.title);modelCounts.set(key,prev);
  }
  const favorites=[...modelCounts.values()].sort((a,b)=>b.calls-a.calls||a.model.localeCompare(b.model)).map(m=>({...m,providers:[...m.providers]}));
  const oldest=rows.filter(r=>r.age).sort((a,b)=>b.age.years-a.age.years)[0]||null;
  return {month:snapshot.month,unit:'USD',rows,total:sum(rows.map(r=>r.total).filter(Number.isFinite)),completeSources:rows.filter(r=>!r.partial).length,estimatedValue:sum(rows.map(r=>r.value.total).filter(Number.isFinite)),valueSources:rows.filter(r=>r.value.total!==null).length,valuePartial:rows.some(r=>r.value.partial),mostUsed:byCalls[0]||null,callSources:rows.filter(r=>r.calls!==null).length,favorite:favorites[0]||null,favorites,oldest};
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
