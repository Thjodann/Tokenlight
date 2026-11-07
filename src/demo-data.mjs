import { demoCards } from './fixtures.mjs';
import { monthRange } from './model.mjs';

// Only synthetic fixtures enter this function. No account data is used as a seed.
function randomFor(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
const cents = value => Math.round(value * 100) / 100;

export function createDemoData(month, now, seed) {
  const random = randomFor(`${seed}:${month}`), { days } = monthRange(month);
  const current = new Date(now).toISOString().slice(0, 7);
  const dayCount = month === current ? new Date(now).getUTCDate() : days;
  const targets = {}, accountProfiles = {};
  const cards = demoCards(month, now).map((card, index) => {
    const factor = 0.4 + random() * 2.1;
    const daily = Array.from({ length: dayCount }, (_, day) => ({ date: `${month}-${String(day + 1).padStart(2, '0')}`, value: Math.round(card.daily[day % card.daily.length].value * factor * (0.35 + random() * 1.3)) }));
    const monthly = daily.reduce((sum, day) => sum + day.value, 0);
    const windows = card.windows.map(window => {
      const percent = cents(random() * 98), limit = window.limit;
      return { ...window, percent, resetsAt: now + Math.round((window.resetsAt - now) * (0.3 + random())), ...(Number.isFinite(limit) ? { used: cents(limit * percent / 100) } : {}) };
    });
    const creditBalances = card.creditBalances.map(balance => {
      if (Number.isFinite(balance.limit)) {
        const matching = windows.find(window => window.pool === 'fable' || window.unit === balance.unit);
        const used = cents(balance.limit * (matching?.percent ?? random() * 90) / 100);
        return { ...balance, used, value: cents(balance.limit - used) };
      }
      if (card.id === 'elevenlabs') {
        const allowance = windows[0];
        return { ...balance, value: Math.round(allowance.limit - allowance.used) };
      }
      return { ...balance, value: balance.unit === 'resets' ? 1 + Math.floor(random() * 3) : balance.unit === 'credits' ? Math.round(20000 + random() * 70000) : cents(random() * 150) };
    });
    const modelUsage = card.modelUsage.map(row => {
      const input = Math.round(monthly * 0.16), output = Math.round(monthly * 0.09), cacheWrite = row.cacheWrite ? Math.round(monthly * 0.03) : 0;
      return { ...row, input, output, cacheRead: monthly - input - output - cacheWrite, cacheWrite, cacheWriteLong: 0, tokens: monthly, calls: Math.round(30 + random() * 1800), valueUSD: card.id === 'cursor' ? cents(monthly / 1000000 * (0.8 + random() * 2)) : null };
    });
    const apiTotal = cents(2 + random() * 120);
    const apiCost = ['openai', 'anthropic'].includes(card.id) ? { total: apiTotal, models: modelUsage.map(row => ({ model: row.model, amount: apiTotal })), month, unit: 'USD', asOf: new Date(now).toISOString() } : null;
    const paidUsage = card.paidUsage ? { enabled: true, used: cents(random() * 15), limit: 20, unit: 'USD', capReached: false } : null;
    const fee = [20, 100, 200][Math.floor(random() * 3)];
    accountProfiles[card.id] = {
      createdAt: new Date(now - (0.3 + random() * 5.5) * 365.2425 * 86400000).toISOString().slice(0, 10),
      fees: { [month]: card.kind === 'api' ? index > 4 ? 20 : 0 : fee },
      metered: { [month]: apiCost?.total ?? paidUsage?.used ?? cents(random() * 35) }
    };
    targets[card.id] = Math.max(1, Math.round(monthly * (1.2 + random())));
    return { ...card, daily, monthly, windows, creditBalances, modelUsage, apiCost, paidUsage,
      requestCount: modelUsage.length ? modelUsage.reduce((sum, row) => sum + row.calls, 0) : null,
      monthlyTarget: targets[card.id], lastUpdatedAt: now, sourceLabel: 'Randomized sample data',
      scope: 'Synthetic sample data', coverage: 'Randomized sample data · no account data',
      balanceSummary: null,
      breakdown: card.unit === 'tokens' ? { input: Math.round(monthly * 0.2), output: Math.round(monthly * 0.1), cache: monthly - Math.round(monthly * 0.2) - Math.round(monthly * 0.1) } : null };
  });
  return { cards, targets, accountProfiles };
}

export function demoSettings(settings, data) {
  return { secretsPath: null, refreshMinutes: 5, showRemainingAllowance: settings.showRemainingAllowance === true, colorMode: settings.colorMode, layoutMode: settings.layoutMode,
    accountProfiles: data.accountProfiles, targets: data.targets, savedKeys: [], demoMode: true };
}
