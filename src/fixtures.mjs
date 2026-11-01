import { SOURCES, monthRange } from './model.mjs';
export function demoCards(month, now = Date.now()) {
  const totals = [28432000, 7265400, 4639000, 12654000, 3897000, 174200];
  const { days } = monthRange(month);
  return SOURCES.map((source, i) => {
    const daily = Array.from({ length: Math.min(days, 28) }, (_, d) => ({ date: `${month}-${String(d + 1).padStart(2, '0')}`, value: Math.round(totals[i] * (1 + Math.sin(d * 1.7 + i) * 0.65) / 28) }));
    const monthly = daily.reduce((a, b) => a + b.value, 0), input = Math.round(monthly * 0.2), output = Math.round(monthly * 0.1);
    return { ...source, status: 'ready', monthly, daily, unit: i === 5 ? 'credits' : 'tokens', lastUpdatedAt: now - 43000,
      plan: ['Pro Max', 'Max', 'Ultra', null, null, 'Pro'][i], partial: i === 1, coverage: i === 1 ? 'Tokens from local Code logs only · UTC. Allowances are account-wide.' : 'Sample data · UTC', sourceLabel: 'Sample data',
      windows: i < 3 ? [{ label: ['5 hour', '5 hour', 'Billing cycle'][i], percent: [34, 67, 48][i], resetsAt: now + [7200000, 3600000, 604800000][i] }, ...(i === 1 ? [{ label: '7 day', percent: 42, resetsAt: now + 230400000 }] : [])] : i === 5 ? [{ label: 'Subscription allowance', percent: 35, used: 174200, limit: 500000, unit: 'credits', resetsAt: now + 864000000 }] : [],
      breakdown: i !== 5 ? { input, output, cache: monthly - input - output } : null };
  });
}
