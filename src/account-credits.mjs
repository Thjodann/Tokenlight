// Optional financial readings must not turn an absent/invalid amount into zero.
export function creditNumber(value) {
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value)) return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
}
export function readMoney(value) {
  const amount = creditNumber(value?.amount_minor), exponent = value?.exponent;
  return amount != null && Number.isInteger(exponent) && exponent >= 0 && exponent <= 6 && /^[A-Z]{3}$/.test(value?.currency)
    ? { value: amount / 10 ** exponent, unit: value.currency } : null;
}
export function codexCredits(limits, root) {
  const credits = root?.credits ?? limits.rateLimits?.credits;
  const value = creditNumber(credits?.balance);
  const creditBalances = credits?.unlimited === true ? [{ label: 'Available credits', unlimited: true, unit: 'credits' }]
    : value != null ? [{ label: 'Available credits', value, unit: 'credits' }] : [];
  const resets = creditNumber(limits.rateLimitResetCredits?.availableCount);
  if (resets != null && Number.isInteger(resets)) creditBalances.push({ label: 'Allowance resets available', value: resets, unit: 'resets' });
  return { creditBalances, creditNote: value == null && !credits?.unlimited ? 'The account connection did not report a credit balance.' : 'Credit balances are current and separate from included usage. Reset passes are not spent by Tokenlight.' };
}
// Included Fable is a named weekly slice of the plan, not the old dollar meter.
function includedFableWindow(usage) {
  const limits = Array.isArray(usage?.limits) ? usage.limits : [];
  const index = limits.findIndex(limit => limit?.kind === 'weekly_scoped' && /^Fable\b/i.test(limit?.scope?.model?.display_name || '') && creditNumber(limit?.percent) != null);
  if (index < 0) return null;
  const limit = limits[index];
  const share = (Array.isArray(usage.weekly_scoped_shares) ? usage.weekly_scoped_shares : []).find(row => row?.limit_index === index);
  const allowancePercentOfWeekly = creditNumber(share?.allowance_percent_of_weekly);
  return { label: 'Fable · 7 day', pool: 'fable', percent: creditNumber(limit.percent), resetsAt: Number.isFinite(Date.parse(limit.resets_at)) ? Date.parse(limit.resets_at) : null, included: allowancePercentOfWeekly != null, allowancePercentOfWeekly };
}
export function claudeCredits(usage) {
  const creditBalances = [];
  // Confirmed against Jared's Claude Usage labels on 2026-10-31. This
  // private codename is accepted only with its full dollar-allowance shape.
  const fable = usage.seven_day_fable ?? usage.iguana_necktie;
  const fableLimit = creditNumber(fable?.limit_dollars), fableUsed = creditNumber(fable?.used_dollars), fableRemaining = creditNumber(fable?.remaining_dollars);
  const fableShape = fableLimit != null && fableUsed != null && fableRemaining != null && Number.isFinite(Date.parse(fable?.resets_at));
  if (fableShape) creditBalances.push({ label: 'Fable weekly meter · remaining', pool: 'fable', value: fableRemaining, unit: 'USD', allowance: true, resetsAt: Date.parse(fable.resets_at), used: fableUsed, limit: fableLimit });
  const spend = usage.spend, legacy = usage.extra_usage;
  let used = readMoney(spend?.used), limit = readMoney(spend?.limit), balance = readMoney(spend?.balance?.money ?? spend?.balance);
  const legacyMoney = value => readMoney({ amount_minor: value, exponent: legacy?.decimal_places, currency: legacy?.currency });
  if (!spend) { used = legacyMoney(legacy?.used_credits); limit = legacyMoney(legacy?.monthly_limit); }
  if (balance) creditBalances.push({ label: 'Paid credit balance', ...balance });
  const enabled = typeof spend?.enabled === 'boolean' ? spend.enabled : typeof legacy?.is_enabled === 'boolean' ? legacy.is_enabled : null;
  const sameMoney = used && limit && used.unit === limit.unit && limit.value > 0;
  const reportedCap = spend?.limit_reached ?? legacy?.spend_limit_reached;
  // Extra usage can be switched off while the provider still sets its reached
  // flag. Known spend under the limit means the cap was not used up.
  const capReached = typeof reportedCap === 'boolean' ? reportedCap && !(enabled === false && sameMoney && used.value < limit.value) : !!(sameMoney && used.value >= limit.value);
  const paidUsage = used || limit || enabled != null || capReached ? { enabled, capReached, used: used?.value ?? null, limit: limit && (!used || used.unit === limit.unit) ? limit.value : null, unit: used?.unit ?? limit?.unit ?? null, period: 'Current month' } : null;
  const fablePercent = creditNumber(fable?.utilization);
  const includedFable = includedFableWindow(usage);
  const dollarWindow = !includedFable && (usage.seven_day_fable || fableShape) && fablePercent != null ? { label: 'Fable · 7 day', pool: 'fable', percent: fablePercent, resetsAt: Number.isFinite(Date.parse(fable.resets_at)) ? Date.parse(fable.resets_at) : null } : null;
  return { creditBalances, paidUsage,
    fableWindow: includedFable || dollarWindow,
    creditNote: `${includedFable?.included ? 'The Fable weekly limit is included in the plan and is separate from extra usage. ' : ''}${fableShape ? 'Fable amounts are allowance value, not billed charges. The reported allowance is not a spendable cash balance or confirmation of model access. ' : ''}${!balance ? 'Paid credit balance is not reported by this connection. ' : ''}Paid usage and its monthly cap are separate from API billing. Balances and allowances are current, regardless of the selected activity month.` };
}

