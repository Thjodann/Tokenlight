import { finite, monthRange, dailySeries } from './model.mjs';

const money = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
export function normalizeOllama(usage, balance, month, previous = {}) {
  const { start, end } = monthRange(month);
  const from = Date.parse(usage.from), until = Date.parse(usage.until);
  if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from || !Array.isArray(usage.buckets) || !usage.totals || !balance.included || !balance.purchased) throw new Error('Invalid report');
  const days = new Map((previous.daily || []).filter(r => r.date.slice(0, 7) === month && finite(r.value)).map(r => [r.date, r]));
  let missingTokens = false;
  for (const row of usage.buckets) {
    const date = Date.parse(row.from);
    if (!Number.isFinite(date)) throw new Error('Invalid bucket date');
    if (date < start || date >= end) continue;
    if (row.input_tokens == null || row.output_tokens == null) { missingTokens = true; continue; }
    if (!finite(row.input_tokens) || !finite(row.output_tokens) || (row.cached_input_tokens != null && (!finite(row.cached_input_tokens) || row.cached_input_tokens > row.input_tokens))) throw new Error('Invalid tokens');
    // Cached input is already included in input_tokens.
    const key = new Date(date).toISOString().slice(0, 10);
    days.set(key, { date: key, value: row.input_tokens + row.output_tokens });
  }
  const daily = dailySeries(month, [...days.values()]);
  const historyFrom = Math.min(from, Number.isFinite(previous.historyFrom) ? previous.historyFrom : from);
  const windows = [], included = balance.included, purchased = balance.purchased;
  const parts = [];
  if (included.balance_usd != null || included.allowance_usd != null) {
    if (!finite(included.balance_usd) || !finite(included.allowance_usd) || !Number.isFinite(Date.parse(included.period?.until))) throw new Error('Invalid balance');
    parts.push(`${money(included.balance_usd)} included remaining`);
    if (included.allowance_usd > 0) windows.push({ label: 'Included credits', percent: Math.max(0, (1 - included.balance_usd / included.allowance_usd) * 100), used: Math.max(0, included.allowance_usd - included.balance_usd), limit: included.allowance_usd, unit: 'USD', resetsAt: Date.parse(included.period.until) });
  }
  for (const [id, label] of [['session', 'Session'], ['weekly', 'Weekly']]) {
    const w = included[id]; if (!w) continue;
    if (!finite(w.remaining_percent) || w.remaining_percent > 100 || !Number.isFinite(Date.parse(w.resets_at))) throw new Error('Invalid limit');
    windows.push({ label, percent: 100 - w.remaining_percent, resetsAt: Date.parse(w.resets_at) });
  }
  if (!finite(purchased.balance_usd)) throw new Error('Invalid purchased credits');
  parts.push(`${money(purchased.balance_usd)} purchased`);
  const partial = missingTokens || historyFrom > start || until < Math.min(end, new Date().setUTCHours(0, 0, 0, 0));
  return { monthly: daily.length ? daily.reduce((sum, r) => sum + r.value, 0) : null, daily, unit: 'tokens', windows, historyFrom, partial,
    balanceSummary: parts.join(' · '),
    coverage: 'Cloud usage · selected calendar month · UTC. Included credits follow the provider billing period.',
    historyNote: missingTokens ? 'Legacy activity may report requests without token counts. No missing tokens are inferred.' : partial ? 'Only the available 30-day API history and previously retained days are included; this month may be incomplete.' : 'Selected-month totals use daily cloud usage buckets. New usage may be delayed.',
    connectionNote: `Usage history: ${usage.from} to ${usage.until}. Balance and allowance windows are current, regardless of the selected month.`,
    rollingRequests: finite(usage.totals.request_count) ? usage.totals.request_count : null,
    rollingUsageUsd: finite(usage.totals.usage_usd) ? usage.totals.usage_usd : null };
}
