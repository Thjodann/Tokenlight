import { monthRange } from './model.mjs';

const micros = amount => {
  if (typeof amount !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(amount)) throw new Error('Invalid cost amount');
  const [whole, fraction = ''] = amount.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
};
const dollars = amount => {
  const value = Number(amount) / 100000000;
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER) throw new Error('Cost exceeds supported range');
  return value;
};

// Analytics amounts are decimal strings in cents, after discounts but before
// credits. A complete empty response needs a reporting watermark to mean zero.
export async function anthropicCosts(month, request, headers) {
  const { start, end } = monthRange(month), models = new Map();
  let page = null, asOf = null;
  for (let iteration = 0; iteration < 100; iteration++) {
    const url = new URL('https://api.anthropic.com/v1/organizations/analytics/cost');
    for (const [k, v] of Object.entries({ starting_at: new Date(start).toISOString(), ending_at: new Date(end).toISOString(), 'group_by[]': 'model', order_by: 'time', order: 'asc', limit: '1000' })) url.searchParams.set(k, v);
    if (page) url.searchParams.set('page', page);
    const data = await request(url, headers);
    if (!Array.isArray(data.data)) throw new Error('Invalid cost rows');
    if (data.data_refreshed_at) {
      if (!Number.isFinite(Date.parse(data.data_refreshed_at))) throw new Error('Invalid watermark');
      asOf = data.data_refreshed_at;
    }
    for (const row of data.data) {
      if (row.cost?.currency !== 'USD') throw new Error('Invalid cost currency');
      const amount = micros(row.cost.amount);
      const model = row.group?.model ?? 'Unattributed';
      if (typeof model !== 'string' || model.length > 200) throw new Error('Invalid model');
      models.set(model, (models.get(model) || 0n) + amount);
    }
    if (!data.has_more) return { total: !models.size && !asOf ? null : dollars([...models.values()].reduce((a, b) => a + b, 0n)), models: [...models].map(([model, amount]) => ({ model, amount: dollars(amount) })), asOf, month, unit: 'USD' };
    if (!data.next_page || data.next_page === page || iteration === 99) throw new Error('Incomplete cost pagination');
    page = data.next_page;
  }
}
