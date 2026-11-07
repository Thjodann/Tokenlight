// Standard public USD prices per million text tokens, checked 2026-11-01.
// Provenance, exclusions and assumptions: docs/spending-and-insights.md.
export const PRICE_DATE = '2026-11-01';
const OPENAI='https://developers.openai.com/api/docs/pricing';
const ANTHROPIC='https://platform.claude.com/docs/en/about-claude/pricing';
export const PRICES = [
 ['gpt-6-astra',10,50,1],['gpt-6.1-sol',2,10,.1],['gpt-6.1-terra',1,5,.05],['gpt-6-luna',.1,.5,.01],['gpt-6-sol',2,10,.2],['gpt-5.6-sol',4,20,.4],['gpt-5.6-terra',2,12,.2],['gpt-5.6-luna',.2,1.2,.02],['gpt-5.4',2.5,15,.25],['gpt-5.4-mini',.75,4.5,.075],['gpt-5.4-nano',.2,1.25,.02],['gpt-5-mini',.25,2,.025],['gpt-4.1',2,8,.5],['gpt-4.1-mini',.4,1.6,.1],['gpt-4.1-nano',.1,.4,.025],['o3',2,8,.5],['gpt-5.3-codex',1.75,14,.175],['text-embedding-3-small',.02,0,0],['text-embedding-3-large',.13,0,0],['text-embedding-ada-002',.1,0,0]
].map(([model,input,output,read])=>({model,input,output,read,write:null,writeLong:null,source:OPENAI})).concat([
 ['claude-fable-5-1',10,50,.25,12.5,20],['claude-opus-5-5',4,20,.2,5,8],['claude-sonnet-5-5',2,10,.1,2.5,4],['claude-mythos-5-1',10,50,.25,12.5,20],['claude-fable-5',10,50,1,12.5,20],['claude-opus-5',5,25,.5,6.25,10],['claude-opus-4-8',5,25,.5,6.25,10],['claude-opus-4-7',5,25,.5,6.25,10],['claude-opus-4-6',5,25,.5,6.25,10],['claude-opus-4-5',5,25,.5,6.25,10],['claude-opus-4-1',15,75,1.5,18.75,30],['claude-sonnet-5',2,10,.2,2.5,4],['claude-sonnet-4-6',3,15,.3,3.75,6],['claude-sonnet-4-5',3,15,.3,3.75,6],['claude-haiku-4-5',1,5,.1,1.25,2],['claude-haiku-3-5',.8,4,.08,1,1.6]
].map(([model,input,output,read,write,writeLong])=>({model,input,output,read,write,writeLong,source:ANTHROPIC})));
export function priceFor(model) {
  let name=String(model).toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$|\-\d{8}$/,'');
  name=name.replace(/^claude-(\d+)\.(\d+)-(sonnet|opus|haiku)$/, 'claude-$3-$1-$2');
  return PRICES.find(p=>p.model===name)||null;
}
export function usageValue(card) {
  const rows=card.modelUsage||[]; let total=0, priced=0, tokens=0; const models=[];
  for(const row of rows) {
    if(Number.isFinite(row.tokens)) tokens+=row.tokens;
    const rate=priceFor(row.model);
    let value=Number.isFinite(row.valueUSD)&&row.valueUSD>=0?row.valueUSD:null, basis='Reported event value';
    const listValue = card.apiCost?.models?.find(m => m.model === row.model)?.listAmount;
    if (value === null && Number.isFinite(listValue) && listValue >= 0) { value = listValue; basis = 'Provider list-price report'; }
    if(value===null&&rate&&!row.unsupportedModality&&['input','output','cacheRead','cacheWrite','cacheWriteLong'].every(k=>Number.isFinite(row[k])&&row[k]>=0)&&(!row.cacheWrite||rate.write!=null)&&(!row.cacheWriteLong||rate.writeLong!=null)) {
      value=(row.input*rate.input+row.output*rate.output+row.cacheRead*rate.read+row.cacheWrite*(rate.write||0)+row.cacheWriteLong*(rate.writeLong||0))/1e6; basis='Standard text estimate';
    }
    if(value!==null){total+=value;priced++;}
    models.push({...row,estimatedUSD:value,priceBasis:value===null?'Unpriced model or modality':basis,priceSource:rate?.source||null});
  }
  const empty=card.monthly===0&&!card.partial&&!(card.apiCost?.total>0);
  return {total:priced?total:empty?0:null,models,priced,totalModels:rows.length,partial:!!card.activityScope?.partial||!!card.partial||priced<rows.length||(!rows.length&&!empty),tokens,asOf:PRICE_DATE};
}
