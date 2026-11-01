import { spawn, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';

// Read-only probes. Never save raw responses, account identifiers or credentials.
const out = { observedAt: new Date().toISOString(), sources: {} };
const pick = (...names) => names.map(n => process.env[n]).find(Boolean);
async function request(url, headers, body) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000), ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  if (!res.ok) return { status: res.status };
  return { status: res.status, data: await res.json() };
}
function shape(value, depth = 0) {
  if (depth > 3) return typeof value;
  if (Array.isArray(value)) return { length: value.length, item: value.length ? shape(value[0], depth + 1) : null };
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, depth + 1)]));
  return typeof value;
}
async function probe(name, fn) {
  try { out.sources[name] = await fn(); }
  catch (e) { out.sources[name] = { errorType: e.name, message: 'Connection probe failed; no credentials or response bodies logged.' }; }
}
await probe('codex', async () => {
  const child = spawn('codex', ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'] });
  let line = '', id = 0;
  const pending = new Map();
  child.stdout.on('data', chunk => {
    line += chunk.toString();
    let p;
    while ((p = line.indexOf('\n')) >= 0) {
      const row = line.slice(0, p); line = line.slice(p + 1);
      try { const msg = JSON.parse(row); const cb = pending.get(msg.id); if (cb) { pending.delete(msg.id); cb(msg); } } catch {}
    }
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const req = ++id;
    const timeout = setTimeout(() => { pending.delete(req); reject(new Error('RPC timeout')); }, 20000);
    pending.set(req, msg => { clearTimeout(timeout); resolve(msg); });
    child.stdin.write(JSON.stringify({ id: req, method, params }) + '\n');
  });
  try {
    await rpc('initialize', { clientInfo: { name: 'tokenlight_connection_proof', version: '0.1.0' } });
    child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
    const account = await rpc('account/read', { refreshToken: false });
    const limits = await rpc('account/rateLimits/read');
    const usage = await rpc('account/usage/read');
    return { accountType: account.result?.account?.type, planType: account.result?.account?.planType,
      limitsAvailable: !!limits.result, limitsShape: shape(limits.result), limitsError: limits.error?.code,
      usageAvailable: !!usage.result, usageShape: shape(usage.result), usageError: usage.error?.code,
      dailyBucketCount: usage.result?.dailyUsageBuckets?.length ?? null };
  } finally { child.kill('SIGTERM'); }
});
await probe('cursor', async () => {
  const db = join(homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  const token = execFileSync('/usr/bin/sqlite3', ['-readonly', db, "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken' LIMIT 1;"], { encoding: 'utf8', timeout: 5000 }).trim();
  if (token.startsWith('cursor-safe-storage:')) return { encryptedSession: true, requiresExplicitKeychainAccess: true };
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  if (!claims.sub || claims.exp * 1000 <= Date.now() + 60000) return { sessionExpired: true };
  const subject = claims.sub.split('|').at(-1);
  const cookie = 'WorkosCursorSessionToken=' + encodeURIComponent(subject + '::' + token);
  const r = await request('https://cursor.com/api/usage-summary', { Cookie: cookie, Origin: 'https://cursor.com' });
  const month = new Date(); month.setUTCDate(1); month.setUTCHours(0, 0, 0, 0);
  const events = await request('https://cursor.com/api/dashboard/get-filtered-usage-events', { Cookie: cookie, Origin: 'https://cursor.com', 'Content-Type': 'application/json' }, { startDate: +month, endDate: Date.now(), page: 1, pageSize: 1000 });
  return { status: r.status, shape: shape(r.data), membershipType: r.data?.membershipType,
    hasIndividualUsage: !!r.data?.individualUsage, hasBillingCycle: !!(r.data?.billingCycleStart || r.data?.billingCycleEnd), eventsStatus: events.status, eventsShape: shape(events.data) };
});
await probe('claudeAccount', async () => {
  const secret = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { encoding: 'utf8', timeout: 12000, stdio: ['ignore', 'pipe', 'ignore'] });
  const record = JSON.parse(secret).claudeAiOauth;
  if (!record?.accessToken) return { credentialAvailable: false };
  if (record.expiresAt && record.expiresAt <= Date.now()) return { credentialAvailable: true, expired: true };
  const r = await request('https://api.anthropic.com/api/oauth/usage', { Authorization: `Bearer ${record.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20' });
  return { credentialAvailable: true, status: r.status, subscriptionType: record.subscriptionType, shape: shape(r.data) };
});
const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
await probe('openaiApi', async () => {
  const key = pick('OPENAI_ADMIN_KEY', 'OPENAI_ADMIN_API_KEY', 'OPENAI_API_KEY');
  if (!key) return { credentialAvailable: false };
  const r = await request(`https://api.openai.com/v1/organization/usage/completions?start_time=${Math.floor(+start / 1000)}&bucket_width=1d&limit=1`, { Authorization: `Bearer ${key}` });
  return { credentialAvailable: true, adminCredentialConfigured: !!pick('OPENAI_ADMIN_KEY', 'OPENAI_ADMIN_API_KEY'), status: r.status, shape: shape(r.data) };
});
await probe('anthropicApi', async () => {
  const key = pick('ANTHROPIC_ADMIN_KEY', 'ANTHROPIC_ADMIN_API_KEY', 'ANTHROPIC_API_KEY');
  if (!key) return { credentialAvailable: false };
  const r = await request(`https://api.anthropic.com/v1/organizations/analytics/usage?starting_at=${encodeURIComponent(start.toISOString())}&bucket_width=1d&limit=1`, { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'analytics-usage-cost-2026-08-24' });
  return { credentialAvailable: true, adminCredentialConfigured: !!pick('ANTHROPIC_ADMIN_KEY', 'ANTHROPIC_ADMIN_API_KEY'), status: r.status, shape: shape(r.data) };
});
await probe('elevenlabs', async () => {
  const key = pick('ELEVENLABS_API_KEY', 'ELEVEN_LABS_API_KEY', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY');
  if (!key) return { credentialAvailable: false };
  const r = await request('https://api.elevenlabs.io/v1/user/subscription', { 'xi-api-key': key });
  return { credentialAvailable: true, status: r.status, shape: shape(r.data), tier: r.data?.tier, hasAllowance: typeof r.data?.character_limit === 'number', hasResetTime: typeof r.data?.next_character_count_reset_unix === 'number' };
});
await mkdir('.codex/output/connection-proof', { recursive: true });
await writeFile('.codex/output/connection-proof/probe.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
