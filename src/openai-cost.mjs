import { monthRange } from './model.mjs';
export async function openaiCosts(month, request, headers) {
  const { start, end } = monthRange(month); let page = null, total = 0;
  for (let i = 0; i < 100; i++) {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    for (const [key,value] of Object.entries({start_time: Math.floor(start/1000),end_time:Math.floor(Math.min(end,Date.now())/1000),bucket_width:'1d',limit:31})) url.searchParams.set(key,value);
    if(page) url.searchParams.set('page',page);
    const data=await request(url,headers);
    if(!Array.isArray(data.data) || typeof data.has_more !== 'boolean') throw new Error('Invalid costs response');
    for(const bucket of data.data) {
      if(!Array.isArray(bucket.results)) throw new Error('Missing cost bucket');
      for(const row of bucket.results) {
        if(row.amount?.currency?.toUpperCase()!=='USD'||typeof row.amount.value!=='number'||!Number.isFinite(row.amount.value)) throw new Error('Invalid cost amount');
        total+=row.amount.value;
      }
    }
    if(!Number.isFinite(total)||Math.abs(total)>Number.MAX_SAFE_INTEGER) throw new Error('Invalid cost total');
    if(!data.has_more) return {total,unit:'USD',month,models:[],asOf:null,basis:'Provider-reported cost, before account credits; reporting may lag'};
    if(!data.next_page||data.next_page===page||i===99) throw new Error('Incomplete cost pagination');
    page=data.next_page;
  }
}
