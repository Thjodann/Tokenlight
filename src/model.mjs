import { codexCredits, claudeCredits } from './account-credits.mjs';
export const SOURCES = [
  { id: 'codex', title: 'Codex', organization: 'OpenAI', kind: 'account', color: '#317860', initials: 'Cx', dashboard: 'https://chatgpt.com/codex/settings/usage', description: 'Your Codex account activity and current allowance.' },
  { id: 'claude', title: 'Claude Code', organization: 'Anthropic', kind: 'account', color: '#bc7052', initials: 'Cl', dashboard: 'https://claude.ai/settings/usage', description: 'Your Claude account allowance and local Code activity.' },
  { id: 'cursor', title: 'Cursor', organization: 'Cursor', kind: 'account', color: '#6c60a4', initials: 'Cu', dashboard: 'https://cursor.com/dashboard/usage', description: 'Account-wide usage reported by your Cursor dashboard.' },
  { id: 'openai', title: 'OpenAI API', organization: 'OpenAI', kind: 'api', color: '#317860', initials: 'Oa', dashboard: 'https://platform.openai.com/usage', credentialUrl: 'https://platform.openai.com/settings/organization/admin-keys', description: 'Organization usage, including calls made outside this app.' },
  { id: 'anthropic', title: 'Anthropic API', organization: 'Anthropic', kind: 'api', color: '#bc7052', initials: 'An', dashboard: 'https://platform.claude.com/usage', credentialUrl: 'https://platform.claude.com/settings/admin-keys', description: 'Organization usage, including calls made outside this app.' },
  { id: 'elevenlabs', title: 'ElevenLabs', organization: 'ElevenLabs', kind: 'api', color: '#476a9a', initials: '11', dashboard: 'https://elevenlabs.io/app/developers/analytics', credentialUrl: 'https://elevenlabs.io/app/settings/api-keys', description: 'Credit usage and your subscription’s current allowance.' },
  { id: 'ollama', title: 'Ollama Cloud', organization: 'Ollama', kind: 'api', color: '#687987', initials: 'Ol', dashboard: 'https://ollama.com/settings', credentialUrl: 'https://ollama.com/settings/keys', description: 'Cloud token usage and your included and purchased credit balances.' },
];
export const finite = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
export function monthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  const [y, m] = month.split('-').map(Number);
  if (y < 2020 || y > 2200) throw new Error('Choose a month from 2020 onward.');
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1), days: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}
export const currentMonth = () => new Date().toISOString().slice(0, 7);
export function resetCountdown(ms, now = Date.now()) {
  if (!Number.isFinite(ms)) return 'Reset not reported';
  const diff = ms - now; if (diff <= 0) return 'Reset passed · refresh';
  const totalMinutes = Math.ceil(diff / 60000), hours = Math.floor(totalMinutes / 60), minutes = totalMinutes % 60;
  return hours >= 48 ? `in ${Math.floor(hours / 24)} days` : hours >= 1 ? `in ${hours}h ${minutes}m` : `in ${totalMinutes} min`;
}
export function dailySeries(month, entries) {
  const map = new Map();
  for (const row of entries) if (typeof row.date === 'string' && row.date.slice(0, 7) === month && finite(row.value)) map.set(row.date.slice(0, 10), (map.get(row.date.slice(0, 10)) || 0) + row.value);
  return [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
}
export function aggregateCursor(events) {
  const unique = new Map(), anonymous = [];
  for (const e of events) {
    if (e.usageEventId) unique.set(e.usageEventId, e); else anonymous.push(e);
  }
  const rows = [...unique.values(), ...anonymous], daily = [], breakdown = { input: 0, output: 0, cache: 0 };
  let withTokens = 0;
  for (const e of rows) {
    const u = e.tokenUsage;
    if (!u || !finite(u.inputTokens) || !finite(u.outputTokens)) continue;
    if (['cacheWriteTokens', 'cacheReadTokens'].some(k => u[k] != null && !finite(u[k]))) throw new Error('Cursor returned an invalid token count.');
    const cache = (u.cacheWriteTokens ?? 0) + (u.cacheReadTokens ?? 0), input = u.inputTokens, output = u.outputTokens;
    const when = new Date(Number(e.timestamp));
    if (!Number.isFinite(+when)) throw new Error('Cursor returned an invalid event date.');
    withTokens++;
    breakdown.input += input; breakdown.output += output; breakdown.cache += cache;
    daily.push({ date: when.toISOString().slice(0, 10), value: input + output + cache });
  }
  return { daily, breakdown, withTokens, events: rows.length, partial: withTokens !== rows.length };
}
export function tokenRow(row, family) {
  if (family === 'openai') {
    if (!finite(row.input_tokens) || !finite(row.output_tokens)) throw new Error('OpenAI returned an invalid token count.');
    // Cached input is already included in OpenAI input_tokens.
    const cached = finite(row.input_cached_tokens) ? row.input_cached_tokens : 0;
    if (cached > row.input_tokens) throw new Error('OpenAI returned inconsistent cached input.');
    return { input: row.input_tokens - cached, output: row.output_tokens, cache: cached, total: row.input_tokens + row.output_tokens };
  }
  const input = row.uncached_input_tokens ?? row.input_tokens;
  const output = row.output_tokens;
  const cache = (row.cache_read_input_tokens ?? 0) + (row.cache_creation_input_tokens ?? ((row.cache_creation?.ephemeral_5m_input_tokens ?? 0) + (row.cache_creation?.ephemeral_1h_input_tokens ?? 0)));
  if (![input, output, cache].every(finite)) throw new Error('Anthropic returned an invalid token count.');
  return { input, output, cache, total: input + output + cache };
}
export function normalizeCodex(limits, usage, month) {
  const root = limits.rateLimitsByLimitId?.codex ?? limits.rateLimits;
  const windows = [];
  for (const [key, fallback] of [['primary', 'Current allowance'], ['secondary', 'Additional allowance']]) {
    const w = root?.[key];
    if (w && finite(w.usedPercent)) {
      const n = w.windowDurationMins;
      const label = n >= 10080 ? `${n / 10080} week` : n >= 1440 ? `${n / 1440} day` : n >= 60 ? `${n / 60} hour` : n > 0 ? `${n} minute` : fallback;
      windows.push({ label, percent: w.usedPercent, resetsAt: finite(w.resetsAt) ? w.resetsAt * 1000 : null });
    }
  }
  const buckets = usage?.dailyUsageBuckets;
  if (Array.isArray(buckets) && buckets.some(b => !/^\d{4}-\d{2}-\d{2}$/.test(b.startDate) || !finite(b.tokens))) throw new Error('Codex returned an invalid history bucket.');
  const firstDate = Array.isArray(buckets) && buckets.length ? buckets.map(b => b.startDate).sort()[0] : null;
  const hasHistory = Array.isArray(buckets) && (!buckets.length || buckets.some(b => b.startDate.slice(0, 7) === month));
  const daily = dailySeries(month, (usage?.dailyUsageBuckets ?? []).map(b => ({ date: b.startDate, value: b.tokens })));
  return { windows, daily, monthly: hasHistory ? daily.reduce((a, b) => a + b.value, 0) : null, unit: 'tokens', plan: root?.planType ?? null,
    ...codexCredits(limits, root),
    coverage: hasHistory ? 'Provider-reported Codex activity · UTC' : 'Selected month is outside the returned activity history.', historyAvailable: hasHistory, partial: !!firstDate && month === firstDate.slice(0, 7) && !firstDate.endsWith('-01') };
}
export function normalizeClaude(usage) {
  const credits = claudeCredits(usage);
  const windows = [];
  for (const [key, label] of [['five_hour', '5 hour'], ['seven_day', '7 day'], ['seven_day_opus', 'Opus · 7 day'], ['seven_day_sonnet', 'Sonnet · 7 day']]) {
    const w = usage?.[key];
    if (w && finite(w.utilization)) windows.push({ label, percent: w.utilization, resetsAt: Number.isFinite(Date.parse(w.resets_at)) ? Date.parse(w.resets_at) : null });
  }
  if (credits.fableWindow) windows.push(credits.fableWindow);
  return { ...credits, windows, daily: [], monthly: null, unit: 'tokens', coverage: 'Account allowance · rolling windows', partial: false };
}
export function normalizeCursor(summary, events, month) {
  const aggregate = aggregateCursor(events), p = summary.individualUsage?.plan;
  const windows = [];
  const resetsAt = Number.isFinite(Date.parse(summary.billingCycleEnd)) ? Date.parse(summary.billingCycleEnd) : null;
  if (p?.enabled) {
    // Cursor reports these pools independently. totalPercentUsed can hide an
    // exhausted third-party allowance; never derive either pool from it.
    for (const [field, label, pool] of [['autoPercentUsed', 'Grok / Composer', 'cursor'], ['apiPercentUsed', 'Third-party models', 'thirdParty']]) {
      if (finite(p[field])) windows.push({ label, pool, percent: p[field], resetsAt });
    }
    if (!windows.length && finite(p.totalPercentUsed)) windows.push({ label: 'Billing cycle', percent: p.totalPercentUsed, resetsAt });
  }
  const daily = dailySeries(month, aggregate.daily);
  return { windows, daily, monthly: aggregate.events === 0 || aggregate.withTokens > 0 ? daily.reduce((a, b) => a + b.value, 0) : null, unit: 'tokens',
    plan: summary.membershipType, breakdown: aggregate.breakdown, partial: aggregate.partial,
    allowanceNote: windows.some(w => w.pool) ? `Current billing-cycle allowances, separate from the selected calendar month's tokens.${windows.length === 1 ? ' Cursor did not report the other pool.' : ''}` : null,
    coverage: aggregate.partial ? `${aggregate.withTokens} of ${aggregate.events} events include tokens · UTC` : 'Account-wide reported events · UTC',
    billingStart: summary.billingCycleStart, billingEnd: summary.billingCycleEnd };
}
export function normalizeEleven(subscription, daily, month) {
  const windows = [];
  if (finite(subscription.character_count) && finite(subscription.character_limit) && subscription.character_limit > 0) windows.push({ label: 'Subscription allowance', percent: subscription.character_count / subscription.character_limit * 100,
    used: subscription.character_count, limit: subscription.character_limit, unit: 'credits', resetsAt: finite(subscription.next_character_count_reset_unix) ? subscription.next_character_count_reset_unix * 1000 : null });
  const series = daily == null ? [] : dailySeries(month, daily);
  return { windows, daily: series, monthly: daily == null ? null : series.reduce((a, b) => a + b.value, 0), unit: 'credits', plan: subscription.tier,
    creditBalances: windows.length ? [{ label: 'Subscription credits remaining', value: Math.max(0, subscription.character_limit - subscription.character_count), unit: 'credits', allowance: true, resetsAt: windows[0].resetsAt }] : [],
    coverage: daily == null ? 'Current subscription cycle · monthly history unavailable' : 'Provider-reported credit usage · UTC', partial: daily == null };
}
export function formatCount(n) {
  if (!finite(n)) return '—';
  if (n < 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: n >= 1000000 ? 2 : 1 }).format(n);
}
