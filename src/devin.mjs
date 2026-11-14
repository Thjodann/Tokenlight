import { createHash } from 'node:crypto';
import { dailySeries, finite, monthRange } from './model.mjs';
import { ProviderError, fetchJSON } from './providers.mjs';

const API = 'https://api.devin.ai';
const QUOTA_URL = 'https://app.devin.ai/api/billing/quota/usage';
const SUBSCRIPTION_URL = 'https://app.devin.ai/api/billing/subscription';
/** Devin bills calendar days from midnight Pacific Standard Time, fixed at UTC−8. */
const PACIFIC_STANDARD_OFFSET_SECONDS = 8 * 60 * 60;
const SESSION_PAGE_SIZE = 100;
const MAX_SESSION_PAGES = 40;
const OVERAGE_BASIS = 'Teams on-demand overage';

const scopeFor = key => createHash('sha256').update(key).digest('hex').slice(0, 20);
const orgIdOk = id => typeof id === 'string' && /^org-[A-Za-z0-9_-]{4,80}$/.test(id);

/** Calendar day for a Unix timestamp using Devin’s fixed Pacific day boundary. */
export function pacificDayFromUnix(seconds) {
  if (!Number.isInteger(seconds)) throw new Error('Invalid report');
  return new Date((seconds - PACIFIC_STANDARD_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10);
}

/** Inclusive start and exclusive end of a calendar month, as Unix seconds at midnight PST. */
export function pacificMonthBounds(month) {
  const { start, end } = monthRange(month);
  return {
    after: Math.floor(start / 1000) + PACIFIC_STANDARD_OFFSET_SECONDS,
    before: Math.floor(end / 1000) + PACIFIC_STANDARD_OFFSET_SECONDS,
  };
}

function resetAt(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Enterprise daily consumption. Dates stay on the Pacific day Devin already chose. */
export function normalizeEnterprise(report, month) {
  if (!report || !Array.isArray(report.consumption_by_date) || !finite(report.total_acus)) throw new Error('Invalid report');
  const entries = [];
  for (const row of report.consumption_by_date) {
    if (!row || !Number.isInteger(row.date) || !finite(row.acus) || !row.acus_by_product || typeof row.acus_by_product !== 'object') throw new Error('Invalid report');
    const date = pacificDayFromUnix(row.date);
    if (date.slice(0, 7) !== month) continue;
    entries.push({ date, value: row.acus });
  }
  const daily = dailySeries(month, entries);
  return { daily, monthly: daily.reduce((sum, row) => sum + row.value, 0), unit: 'acus', requestCount: null, coverageMode: 'enterprise', apiCost: null };
}

/** One ACU total per session, including child sessions. Missing ACU fails the whole reading. */
export function normalizeSessions(items, month) {
  if (!Array.isArray(items)) throw new Error('Invalid report');
  const entries = [];
  let overage = null;
  let count = 0;
  for (const row of items) {
    if (!row || typeof row.session_id !== 'string' || !Number.isInteger(row.created_at) || !Object.hasOwn(row, 'acus_consumed') || !finite(row.acus_consumed)) throw new Error('Invalid report');
    const date = pacificDayFromUnix(row.created_at);
    if (date.slice(0, 7) !== month) continue;
    count += 1;
    entries.push({ date, value: row.acus_consumed });
    if (Object.hasOwn(row, 'on_demand_usage') && row.on_demand_usage != null) {
      if (!finite(row.on_demand_usage)) throw new Error('Invalid report');
      overage = (overage ?? 0) + row.on_demand_usage;
    }
  }
  const daily = dailySeries(month, entries);
  return {
    daily, monthly: daily.reduce((sum, row) => sum + row.value, 0), unit: 'acus', requestCount: count, coverageMode: 'sessions',
    apiCost: overage == null ? null : { total: overage, unit: 'USD', month, models: [], basis: OVERAGE_BASIS },
  };
}

/** Personal quota page. `percent_used` is how much of that allowance is already used. */
export function normalizeQuota(page) {
  if (!page || typeof page !== 'object') throw new Error('Invalid quota');
  const hideDaily = page.hide_daily_quota === true;
  const windows = [];
  const take = (block, label) => {
    if (!block) return;
    if (!finite(block.percent_used) || block.percent_used > 100) throw new Error('Invalid quota');
    const resetsAt = resetAt(block.resets_at);
    if (block.resets_at != null && resetsAt == null) throw new Error('Invalid quota');
    windows.push({ label, percent: block.percent_used, resetsAt });
  };
  if (!hideDaily) take(page.daily, 'Daily allowance');
  take(page.weekly, 'Weekly allowance');
  // Devin’s usage page also reports the two percentages as flat fields.
  const flat = (percent, reset, label) => {
    if (percent == null) return;
    take({ percent_used: percent, resets_at: reset }, label);
  };
  if (!windows.length) {
    if (!hideDaily) flat(page.daily_percentage, page.daily_reset_at, 'Daily allowance');
    flat(page.weekly_percentage, page.weekly_reset_at, 'Weekly allowance');
  }
  if (!windows.length) throw new Error('Invalid quota');
  const creditBalances = [];
  let balance = null;
  if (typeof page.overage_balance === 'number' && Number.isFinite(page.overage_balance)) balance = page.overage_balance;
  else if (typeof page.overage_balance_cents === 'number' && Number.isFinite(page.overage_balance_cents)) balance = page.overage_balance_cents / 100;
  else if (page.overage_balance != null || page.overage_balance_cents != null) throw new Error('Invalid quota');
  if (balance != null) creditBalances.push({ label: 'On-demand balance', value: balance, unit: 'USD' });
  return { windows, creditBalances, plan: typeof page.plan_name === 'string' && page.plan_name ? page.plan_name : null };
}

function bearer(key) { return { Authorization: `Bearer ${key}`, Accept: 'application/json' }; }

/** A current Devin usage key starts with cog_. Older apk_ keys cannot read this API. */
function requireCurrentKey(key) {
  if (key.startsWith('cog_')) return;
  throw new ProviderError(key.startsWith('apk_')
    ? 'This is an older Devin key. Usage needs a personal access token or service key that starts with cog_, from Settings → Devin API.'
    : 'Devin usage needs a personal access token or service key that starts with cog_.', 'setup');
}

function uniqueOrgs(ids) {
  const chosen = [];
  for (const id of ids) if (orgIdOk(id) && !chosen.includes(id)) chosen.push(id);
  return chosen;
}

/** Personal tokens must use the session organization, never an enterprise’s internal organization. */
function orgsFromSelf(self) {
  const personal = self?.principal_type === 'pat_user' || self?.principal_type === 'windsurf_session';
  const order = personal
    ? [self.devin_sessions_org_id, self.primary_billing_org_id, self.org_id]
    : [self?.org_id, self?.devin_sessions_org_id, self?.primary_billing_org_id];
  return uniqueOrgs(order);
}

async function resolveOrganization(request, headers, preferred) {
  if (preferred) {
    if (!orgIdOk(preferred)) throw new ProviderError('DEVIN_ORG_ID needs to look like an organization id from Devin settings.', 'setup');
    return { ids: [preferred], name: preferred };
  }
  let self;
  try { self = await request(`${API}/v3/self`, headers); }
  catch (error) {
    if (error.status === 401 || error.status === 403) throw new ProviderError('Devin refused this key. Create a personal access token or service key that starts with cog_ in Settings → Devin API, then paste that.', 'auth');
    throw error;
  }
  const named = self?.service_user_name || self?.user_name || null;
  const direct = orgsFromSelf(self);
  if (direct.length) return { ids: direct, name: named || direct[0] };
  let list;
  try { list = await request(`${API}/v3/enterprise/organizations?first=200`, headers); }
  catch (error) {
    if (error.status === 401 || error.status === 403) throw new ProviderError('Devin did not name an organization for this key. Add DEVIN_ORG_ID to your secrets file.', 'setup');
    throw error;
  }
  const items = Array.isArray(list?.items) ? list.items.filter(item => orgIdOk(item?.org_id)) : [];
  if (items.length === 1) return { ids: [items[0].org_id], name: named || itemName(items[0]) };
  throw new ProviderError(items.length > 1 ? 'This key can see more than one Devin organization. Add DEVIN_ORG_ID to your secrets file.' : 'Devin did not name an organization for this key. Add DEVIN_ORG_ID to your secrets file.', 'setup');
}

function itemName(item) { return typeof item.name === 'string' && item.name ? item.name : item.org_id; }

async function readEnterprise(request, headers, month) {
  const bounds = pacificMonthBounds(month);
  const url = new URL(`${API}/v3/enterprise/consumption/daily`);
  url.searchParams.set('time_after', String(bounds.after));
  url.searchParams.set('time_before', String(bounds.before));
  try { return { report: await request(url, headers), forbidden: false }; }
  catch (error) {
    // A personal or Teams key is refused here. That is the switch to the session list, not a bad key.
    if (error.status === 401 || error.status === 403) return { report: null, forbidden: true };
    throw error;
  }
}

async function readSessions(request, headers, orgId, month) {
  const bounds = pacificMonthBounds(month);
  const items = [];
  let cursor = null;
  for (let page = 0; page < MAX_SESSION_PAGES; page++) {
    const url = new URL(`${API}/v3/organizations/${encodeURIComponent(orgId)}/sessions`);
    url.searchParams.set('created_after', String(bounds.after - 1));
    url.searchParams.set('created_before', String(bounds.before));
    url.searchParams.set('first', String(SESSION_PAGE_SIZE));
    if (cursor) url.searchParams.set('after', cursor);
    const data = await request(url, headers);
    if (!data || !Array.isArray(data.items) || typeof data.has_next_page !== 'boolean') throw new ProviderError('Devin returned an unfamiliar session list. Your last reading is kept.', 'format');
    items.push(...data.items);
    if (!data.has_next_page) return items;
    if (typeof data.end_cursor !== 'string' || !data.end_cursor || data.end_cursor === cursor) throw new ProviderError('Devin session pages were incomplete. A partial total was not published.', 'coverage');
    cursor = data.end_cursor;
  }
  throw new ProviderError('Devin session pages were incomplete. A partial total was not published.', 'coverage');
}

function quotaAddresses(orgId) {
  const addresses = [];
  // Devin’s own usage page asks for the organization address. The shorter address is the fallback.
  if (orgIdOk(orgId)) addresses.push(`https://app.devin.ai/api/${encodeURIComponent(orgId)}/billing/quota/usage`);
  addresses.push(QUOTA_URL);
  return addresses;
}

async function readQuota(request, key, session, orgId) {
  const tokens = session && session !== key ? [key, session] : [key];
  for (const token of tokens) {
    for (const address of quotaAddresses(orgId)) {
      try { return { page: await request(address, { ...bearer(token), 'x-cog-org-id': orgId }), token }; }
      catch { /* A missing or refused page can still succeed on the next address or with the website login. */ }
    }
  }
  return { page: null, token: null, note: session ? 'Included quota remaining was not returned. The usage number is unchanged.' : 'Included quota remaining was not returned. No allowance was inferred.' };
}

async function readPlanName(request, token, orgId, quotaPlan) {
  if (quotaPlan) return quotaPlan;
  if (!token) return null;
  try {
    const body = await request(SUBSCRIPTION_URL, { ...bearer(token), 'x-cog-org-id': orgId });
    const slug = body?.slug || body?.plan?.slug || body?.plan_name;
    return typeof slug === 'string' && slug ? slug : null;
  } catch { return null; }
}

function familiar(report, month, mode) {
  try { return mode === 'enterprise' ? normalizeEnterprise(report, month) : normalizeSessions(report, month); }
  catch { throw new ProviderError('Devin returned an unfamiliar usage format. Your last reading is kept.', 'format'); }
}

/**
 * Read one Devin organization. Enterprise daily history wins when it is allowed.
 * A refused quota page leaves the allowance blank and still returns ACU activity.
 */
async function readSessionActivity(request, headers, org, month) {
  let refused = false;
  for (const id of org.ids) {
    try { return { activity: familiar(await readSessions(request, headers, id, month), month, 'sessions'), orgId: id }; }
    catch (error) {
      if (error.status === 401 || error.status === 403) { refused = true; continue; }
      throw error;
    }
  }
  if (refused) throw new ProviderError('Devin accepted the key, but it will not list sessions for this organization. An admin can allow session viewing, or set DEVIN_ORG_ID in the secrets file to the organization at the top of Settings → Devin API.', 'setup');
  throw new ProviderError('Devin did not name an organization for this key. Add DEVIN_ORG_ID to your secrets file.', 'setup');
}

export async function readDevin(month, ctx, request = fetchJSON) {
  const key = ctx.credentials?.devin;
  if (!key) throw new ProviderError('Add DEVIN_API_KEY in your secrets file or save a Devin key here.', 'setup');
  requireCurrentKey(key);
  const headers = bearer(key);
  const org = await resolveOrganization(request, headers, ctx.credentials.devinOrg);
  const enterprise = await readEnterprise(request, headers, month);
  const sessionRead = enterprise.forbidden ? await readSessionActivity(request, headers, org, month) : null;
  const activity = sessionRead ? sessionRead.activity : familiar(enterprise.report, month, 'enterprise');
  const orgId = sessionRead ? sessionRead.orgId : org.ids[0];
  const quotaRead = await readQuota(request, key, ctx.credentials.devinQuota, orgId);
  let quota = null;
  let quotaNote = quotaRead.note || null;
  if (quotaRead.page) {
    try { quota = normalizeQuota(quotaRead.page); }
    catch { quotaNote = 'Devin returned an unfamiliar quota page. Allowance was left blank.'; }
  }
  const plan = await readPlanName(request, quotaRead.token, orgId, quota?.plan);
  const orgName = org.name && org.name !== orgId ? org.name : orgId;
  const sessionNote = activity.coverageMode === 'sessions' ? ' A session that runs past midnight stays on the Pacific day it started.' : '';
  return {
    ...activity,
    windows: quota?.windows || [],
    creditBalances: quota?.creditBalances || [],
    plan: plan || null,
    paidUsage: null,
    modelUsage: [],
    organization: orgName,
    orgId,
    scope: scopeFor(key),
    chartZone: 'PT',
    sourceLabel: activity.coverageMode === 'enterprise' ? 'Devin enterprise consumption API' : 'Devin session API',
    coverage: `${activity.coverageMode === 'enterprise' ? 'Enterprise daily ACU' : 'Session ACU on each session’s start day'} · Pacific billing days (UTC−8) · ${orgName}`,
    allowanceNote: quota ? 'Quota remaining is current and separate from the selected month’s ACU.' : quotaNote,
    historyNote: activity.coverageMode === 'sessions' ? 'A session that runs past midnight stays on the Pacific day it started.' : null,
    connectionNote: `Organization ${orgName}.${sessionNote}`,
  };
}
