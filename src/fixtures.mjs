import { SOURCES, monthRange } from './model.mjs';
export function demoCards(month, now = Date.now()) {
  const totals = [28432000, 7265400, 4639000, 12654000, 3897000, 174200, 6250000];
  const { days } = monthRange(month);
  return SOURCES.map((source, i) => {
    const daily = Array.from({ length: Math.min(days, 28) }, (_, d) => ({ date: `${month}-${String(d + 1).padStart(2, '0')}`, value: Math.round(totals[i] * (1 + Math.sin(d * 1.7 + i) * 0.65) / 28) }));
    const monthly = daily.reduce((a, b) => a + b.value, 0), input = Math.round(monthly * 0.2), output = Math.round(monthly * 0.1);
    return { ...source, status: 'ready', monthly, daily, unit: i === 5 ? 'credits' : 'tokens', lastUpdatedAt: now - 43000,
      plan: ['Pro Max', 'Max', 'Ultra', null, null, 'Pro', 'Cloud'][i], partial: i === 1, coverage: i === 1 ? 'Tokens from local Code logs only · UTC. Allowances are account-wide.' : 'Sample data · UTC', sourceLabel: 'Sample data',
      windows: i === 2 ? [{ label: 'Grok / Composer', pool: 'cursor', percent: 0.6, resetsAt: now + 604800000 }, { label: 'Third-party models', pool: 'thirdParty', percent: 100, resetsAt: now + 604800000 }] : i < 3 ? [{ label: ['5 hour', '5 hour', 'Billing cycle'][i], percent: [34, 67, 48][i], resetsAt: now + [7200000, 3600000, 604800000][i] }, ...(i === 1 ? [{ label: '7 day', percent: 42, resetsAt: now + 230400000 }, { label: 'Fable · 7 day', pool: 'fable', percent: 2.9, resetsAt: now + 345600000 }] : [])] : i === 5 ? [{ label: 'Subscription allowance', percent: 35, used: 174200, limit: 500000, unit: 'credits', resetsAt: now + 864000000 }] : i === 6 ? [{ label: 'Included credits', percent: 27.5, resetsAt: now + 1296000000, unit: 'USD', used: 27.5, limit: 100 }] : [],
      allowanceNote: source.id === 'cursor' ? "Current billing-cycle allowances, separate from the selected calendar month's tokens." : null,
      creditBalances: i === 0 ? [{ label: 'Available credits', value: 44366.09, unit: 'credits' }, { label: 'Allowance resets available', value: 1, unit: 'resets' }] : i === 1 ? [{ label: 'Fable allowance remaining', value: 242.83, unit: 'USD', allowance: true, used: 7.17, limit: 250, resetsAt: now + 345600000 }] : i === 5 ? [{ label: 'Subscription credits remaining', value: 325800, unit: 'credits', allowance: true, resetsAt: now + 864000000 }] : i === 6 ? [{ label: 'Included credits remaining', value: 72.5, unit: 'USD', allowance: true, resetsAt: now + 1296000000 }, { label: 'Purchased credit balance', value: 25, unit: 'USD' }] : [],
      apiCost: i === 4 ? { total: 18.35, models: [{ model: 'claude-fable-5-1', amount: 12.5 }, { model: 'claude-sonnet-5-5', amount: 5.85 }], month, unit: 'USD', asOf: new Date(now).toISOString() } : null,
      paidUsage: i === 1 ? { enabled: true, used: 0, limit: 20, unit: 'USD' } : null,
      creditNote: i === 1 ? 'Fable amounts are allowance value, not billed charges. Fable shares the account’s overall usage limits. Paid credit balance is not reported by this connection.' : null,
      balanceSummary: source.id === 'ollama' ? '$72.50 included remaining · $25.00 purchased' : null,
      breakdown: i !== 5 ? { input, output, cache: monthly - input - output } : null };
  });
}
