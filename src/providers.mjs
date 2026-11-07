import { readCodexLocal } from './codex-local.mjs';
import { readClaudeProfile } from './claude-profile.mjs';
import { maintainClaudeSession } from './claude-maintenance.mjs';
import { loadClaudeSession, readClaudeUsage } from './claude-session.mjs';
import { cursorStoragePassword } from './cursor-storage.mjs';
import { activityRow, aggregateActivity } from './activity.mjs';
import { openaiCosts } from './openai-cost.mjs';
import { normalizeOllama } from './ollama.mjs';
import { anthropicCosts } from './anthropic-cost.mjs';
import { spawn, execFile } from 'node:child_process';
import { promisify, parseEnv } from 'node:util';
import { readFile, readdir, stat, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { monthRange, dailySeries, finite, tokenRow, normalizeCodex, normalizeClaude, normalizeCursor, normalizeEleven } from './model.mjs';

const exec = promisify(execFile);
export class ProviderError extends Error {
  constructor(message, code = 'unavailable', retryAt = null) { super(message); this.code = code; this.retryAt = retryAt; }
}
const identity = value => createHash('sha256').update(value).digest('hex').slice(0, 20);
export const KEY_NAMES = {
  ollama: ['OLLAMA_CLOUD_API_KEY', 'OLLAMA_API_KEY'],
  openai: ['OPENAI_ADMIN_KEY', 'OPENAI_ADMIN_API_KEY', 'OPEN_AI_ADMIN_KEY', 'OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_ADMIN_KEY', 'ANTHROPIC_ADMIN_API_KEY', 'ANTHROPIC_API_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY', 'ELEVEN_LABS_API_KEY', 'ELEVEN_API_KEY', 'ELEVENLABS_KEY']
};
export async function loadCredentials(path, vault = {}) {
  let values = {};
  if (path) {
    try { values = parseEnv(await readFile(path, 'utf8')); }
    catch { throw new ProviderError('The selected secrets file could not be read. Choose it again in Connections.', 'file'); }
  }
  const result = {};
  for (const [id, names] of Object.entries(KEY_NAMES)) result[id] = vault[id] || names.map(n => values[n] || process.env[n]).find(Boolean) || null;
  return result;
}
export async function fetchJSON(url, headers = {}, body) {
  let res;
  try { res = await fetch(url, { headers, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(20000) }); }
  catch { throw new ProviderError('Couldn’t reach the provider. Check your connection and try again.', 'network'); }
  if (!res.ok) {
    if (res.status === 429) {
      const h = res.headers.get('retry-after'), seconds = Number(h);
      const retryAt = Number.isFinite(seconds) && seconds > 0 ? Date.now() + seconds * 1000 : Number.isFinite(Date.parse(h)) ? Date.parse(h) : Date.now() + 300000;
      throw new ProviderError('The provider asked us to wait before refreshing. Your last reading is kept.', 'rate_limit', retryAt);
    }
    if ([401, 403].includes(res.status)) throw new ProviderError('This connection needs sign-in or permission to read usage.', 'auth');
    throw new ProviderError(`The provider couldn’t return usage (HTTP ${res.status}). Try again later.`, 'provider');
  }
  const declared = Number(res.headers.get('content-length'));
  if (declared > 16000000) throw new ProviderError('The provider response was too large to read safely.', 'format');
  const reader = res.body.getReader(), chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16000000) { await reader.cancel(); throw new ProviderError('The provider response was too large.', 'format'); } chunks.push(Buffer.from(value)); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ProviderError('The provider returned an unreadable response. Your last reading is kept.', 'format'); }
}
export async function findCodex(resourcePath) {
  const paths = [resourcePath && join(resourcePath, 'vendor/codex'), '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex', '/opt/homebrew/bin/codex', join(homedir(), '.local/bin/codex')].filter(Boolean);
  for (const path of paths) { try { await access(path); return path; } catch {} }
  throw new ProviderError('Codex support is missing from this build. Rebuild with the included Codex helper.', 'setup');
}
export async function withCodex(resourcePath, fn) {
  const binary = await findCodex(resourcePath);
  const environment = { ...process.env }; delete environment.OPENAI_API_KEY;
  const child = spawn(binary, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'], env: environment });
  const pending = new Map(); let id = 0, buffer = '';
  const fail = () => { for (const p of pending.values()) p.reject(new ProviderError('Codex could not start. Open Codex and check your sign-in.', 'setup')); pending.clear(); };
  child.on('error', fail); child.on('exit', fail);
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    if (buffer.length > 16000000) { child.kill(); return; }
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try { const msg = JSON.parse(line); if (pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); p.resolve(msg); } } catch {}
    }
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const req = ++id, timer = setTimeout(() => { pending.delete(req); reject(new ProviderError('Codex took too long to respond. Try refreshing again.', 'network')); }, 20000);
    pending.set(req, { resolve: msg => { clearTimeout(timer); msg.error ? reject(new ProviderError('Codex could not return this reading. Check your account sign-in.', 'auth')) : resolve(msg.result); }, reject: err => { clearTimeout(timer); reject(err); } });
    child.stdin.write(JSON.stringify({ id: req, method, params }) + '\n');
  });
  try { await rpc('initialize', { clientInfo: { name: 'tokenlight', title: 'Tokenlight', version: '0.1.0' } }); child.stdin.write('{"method":"initialized"}\n'); return await fn(rpc); }
  finally { child.stdin.end(); child.kill('SIGTERM'); }
}
async function codex(month, ctx) {
  return (ctx.withCodex || withCodex)(ctx.resourcePath, async rpc => {
    const account = await rpc('account/read', { refreshToken: false });
    if (account.account?.type !== 'chatgpt') throw new ProviderError('Sign in to Codex with your ChatGPT account, then reconnect here.', 'setup');
    const limits = await rpc('account/rateLimits/read');
    let usage = null; try { usage = await rpc('account/usage/read'); } catch {}
    return { ...normalizeCodex(limits, usage, month), ...await readCodexLocal(month, ctx.codexHome), plan: account.account.planType, scope: identity(limits.accountId || account.account.email || 'codex'), sourceLabel: 'Codex account connection' };
  });
}
async function cursorSession(allowKeychain) {
  const db = join(homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
  let token;
  try { const r = await exec('/usr/bin/sqlite3', ['-readonly', db, "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken' LIMIT 1;"], { timeout: 5000, maxBuffer: 100000 }); token = r.stdout.trim(); }
  catch { throw new ProviderError('Open Cursor and sign in, then choose Connect here.', 'setup'); }
  if (token.startsWith('cursor-safe-storage:v1:')) {
    if (!allowKeychain) throw new ProviderError('Choose Connect to allow access to your encrypted Cursor session.', 'setup');
    try {
      const key = pbkdf2Sync(await cursorStoragePassword(exec), 'saltysalt', 1003, 16, 'sha1');
      const encrypted = Buffer.from(token.slice('cursor-safe-storage:v1:'.length), 'base64');
      if (encrypted.subarray(0, 3).toString() !== 'v10') throw new Error();
      const cipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 32));
      token = Buffer.concat([cipher.update(encrypted.subarray(3)), cipher.final()]).toString('utf8');
    } catch { throw new ProviderError('Cursor session access was not available. Open Cursor and try Connect again.', 'setup'); }
  }
  let claims;
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); } catch { throw new ProviderError('Cursor’s session format changed. Sign in again in Cursor, then reconnect.', 'setup'); }
  if (!claims.sub || !finite(claims.exp) || claims.exp * 1000 < Date.now() + 60000) throw new ProviderError('Your Cursor session has expired. Sign in again in Cursor, then reconnect.', 'setup');
  return { cookie: 'WorkosCursorSessionToken=' + encodeURIComponent(claims.sub.split('|').at(-1) + '::' + token), scope: identity(claims.sub) };
}
async function cursor(month, ctx) {
  const session = await cursorSession(ctx.allowKeychain), headers = { Cookie: session.cookie, Origin: 'https://cursor.com', 'Content-Type': 'application/json' };
  const summary = await fetchJSON('https://cursor.com/api/usage-summary', headers);
  if (!summary.individualUsage || !summary.billingCycleEnd) throw new ProviderError('Cursor returned an unfamiliar account summary. Your last reading is kept.', 'format');
  const { start, end } = monthRange(month), events = []; let expected = null;
  for (let page = 1; page <= 50; page++) {
    const data = await fetchJSON('https://cursor.com/api/dashboard/get-filtered-usage-events', headers, { startDate: start, endDate: Math.min(end, Date.now()), page, pageSize: 1000 });
    const rows = data.usageEventsDisplay ?? data.usageEvents ?? (Object.keys(data).length === 0 || data.totalUsageEventsCount === 0 ? [] : null);
    if (!Array.isArray(rows)) throw new ProviderError('Cursor returned an unfamiliar history format.', 'format');
    if (finite(data.totalUsageEventsCount)) expected = data.totalUsageEventsCount;
    events.push(...rows);
    if (!rows.length || (expected != null && events.length >= expected) || (expected == null && rows.length < 1000)) break;
    if (page === 50) throw new ProviderError('Cursor history exceeded the safe page limit. A partial total was not published.', 'coverage');
  }
  if (expected != null && events.length < expected) throw new ProviderError('Cursor returned incomplete history. Your previous reading is kept.', 'coverage');
  return { ...normalizeCursor(summary, events, month), scope: session.scope, sourceLabel: 'Cursor desktop account · dashboard data', connectionNote: 'Uses your local Cursor session. This personal dashboard interface can change independently of the public API.' };
}
export async function claudeLocal(month, root = join(homedir(), '.claude/projects')) {
  const { start, end } = monthRange(month), files = [], records = new Map(); let bytes = 0, partial = false;
  async function walk(dir, depth = 0) {
    if (depth > 6) { partial = true; return; }
    let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= 2000) { partial = true; return; }
      const path = join(dir, e.name);
      if (e.isDirectory()) await walk(path, depth + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) { const s = await stat(path); if (s.mtimeMs >= start) files.push({ path, size: s.size }); }
    }
  }
  await walk(root);
  for (const f of files) {
    if (bytes + f.size > 128000000) { partial = true; continue; } bytes += f.size;
    const stream = createReadStream(f.path, { encoding: 'utf8' }), lines = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line.length > 2000000) { partial = true; continue; }
        if (!line.includes('"usage"')) continue;
        let row; try { row = JSON.parse(line); } catch { continue; }
        if (row.type !== 'assistant' || !row.message?.usage) continue;
        const when = Date.parse(row.timestamp); if (!(when >= start && when < end)) continue;
        let tokens; try { tokens = tokenRow(row.message.usage, 'anthropic'); } catch { partial = true; continue; }
        const key = row.message.id ? `${row.requestId ?? row.request_id ?? row.sessionId ?? f.path}:${row.message.id}` : `${f.path}:${records.size}`;
        records.set(key, { date: new Date(when).toISOString().slice(0, 10), value: tokens.total, activity: activityRow(row.message.usage, 'anthropic', row.message.model, 1) });
      }
    } catch { partial = true; } finally { lines.close(); stream.destroy(); }
  }
  const daily = dailySeries(month, [...records.values()]);
  return { daily, monthly: records.size ? daily.reduce((a, b) => a + b.value, 0) : null, partial, scannedFiles: files.length, modelUsage: aggregateActivity([...records.values()].map(r => r.activity)), requestCount: records.size || null };
}
async function claude(month, ctx) {
  const load = excludedToken => loadClaudeSession({ ErrorType: ProviderError,
    readKeychain: ctx.allowKeychain ? async () => {
      const { stdout } = await exec('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 15000, maxBuffer: 100000 });
      return JSON.parse(stdout).claudeAiOauth;
    } : null,
    readFallback: async () => JSON.parse(await readFile(join(homedir(), '.claude/.credentials.json'), 'utf8')).claudeAiOauth
  }, excludedToken);
  const { record, usage } = await readClaudeUsage({ load, ErrorType: ProviderError,
    renew: ctx.allowKeychain ? async () => {
      if (ctx.claudeLoginPending) throw new ProviderError('Finish the open Claude sign-in; Tokenlight will reconnect automatically.', 'session_refresh', Date.now() + 60000);
      const result = await maintainClaudeSession({ load, cwd: ctx.statePath, ownChildren: ctx.ownChildren });
      if (result.unavailable) throw new ProviderError('Install Claude Code to renew this session automatically, then choose Connect.', 'setup');
      if (!result.renewed) throw new ProviderError('Claude’s session renewal is temporarily unavailable. Tokenlight will retry automatically; open Claude Code if this continues.', 'session_refresh', result.retryAt);
    } : undefined,
    request: token => fetchJSON('https://api.anthropic.com/api/oauth/usage', { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }) });
  const account = await readClaudeProfile(record, token => fetchJSON('https://api.anthropic.com/api/oauth/profile', { Authorization: `Bearer ${token}`, 'anthropic-beta': 'oauth-2025-04-20' }));
  const result = normalizeClaude(usage), local = await claudeLocal(month);
  if (!result.windows.length && !result.creditBalances.length && !result.paidUsage) throw new ProviderError('Claude returned no allowance or credit measurement. Check your plan in its usage dashboard.', 'coverage');
  return { ...result, ...local, ...account, partial: true, sessionExpiresAt: Number(record.expiresAt) || null, scope: identity(record.accessToken), sourceLabel: 'Claude Code account connection', coverage: 'Tokens from local Code logs only · UTC. Allowances are account-wide.', connectionNote: 'The personal account interface may change. Local token history excludes other devices and remote sessions.' };
}
async function apiUsage(id, month, ctx) {
  const key = ctx.credentials[id];
  if (!key) throw new ProviderError(`Add ${id === 'openai' ? 'OPENAI_ADMIN_KEY' : 'ANTHROPIC_ADMIN_KEY'} in your secrets file or save a reporting key here.`, 'setup');
  const { start, end } = monthRange(month), daily = [], activity = [], breakdown = { input: 0, output: 0, cache: 0 }; let asOf = null;
  const endpoints = id === 'openai' ? ['completions', 'embeddings'] : ['analytics'];
  for (const endpoint of endpoints) {
    let page = null;
    for (let iteration = 0; iteration < 100; iteration++) {
      const url = id === 'openai' ? new URL(`https://api.openai.com/v1/organization/usage/${endpoint}`) : new URL('https://api.anthropic.com/v1/organizations/analytics/usage');
      if (id === 'openai') { url.searchParams.set('start_time', Math.floor(start / 1000)); url.searchParams.set('end_time', Math.floor(Math.min(end, Date.now()) / 1000)); url.searchParams.set('bucket_width', '1d'); url.searchParams.set('limit', '31'); }
      else { url.searchParams.set('starting_at', new Date(start).toISOString()); url.searchParams.set('ending_at', new Date(end).toISOString()); url.searchParams.set('time_bucket_width', '1d'); url.searchParams.set('order_by', 'time'); url.searchParams.set('order', 'asc'); url.searchParams.set('limit', '1000'); }
      url.searchParams.set('group_by[]', 'model');
      if (page) url.searchParams.set('page', page);
      const headers = id === 'openai' ? { Authorization: `Bearer ${key}` } : { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'analytics-usage-cost-2026-08-24' };
      let data;
      try { data = await fetchJSON(url, headers); } catch (e) { if (e.code === 'auth') throw new ProviderError(`A reporting credential is needed. Add ${id === 'openai' ? 'OPENAI_ADMIN_KEY' : 'ANTHROPIC_ADMIN_KEY'}; ordinary inference keys may not have usage access.`, 'setup'); throw e; }
      if (!Array.isArray(data.data)) throw new ProviderError('The provider returned an unfamiliar usage format.', 'format');
      if (data.data_refreshed_at) asOf = data.data_refreshed_at;
      for (const bucket of data.data) {
        const date = id === 'openai' ? new Date(bucket.start_time * 1000).toISOString().slice(0, 10) : bucket.starting_at?.slice(0, 10);
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ProviderError('The provider returned an invalid usage date.', 'format');
        if (!date.startsWith(month + '-')) continue;
        const rows = id === 'openai' ? bucket.results : [bucket.usage];
        if (!Array.isArray(rows)) throw new ProviderError('The provider returned incomplete usage buckets.', 'format');
        for (const row of rows) {
          if (!row) throw new ProviderError('A usage row was missing.', 'format');
          const normalized = endpoint === 'embeddings' ? tokenRow({ ...row, output_tokens: 0 }, 'openai') : tokenRow(row, id);
          activity.push(activityRow(endpoint === 'embeddings' ? { ...row, output_tokens: 0 } : row, id, id === 'openai' ? row.model : bucket.group?.model, id === 'openai' ? row.num_model_requests : row.requests));
          daily.push({ date, value: normalized.total }); for (const k of Object.keys(breakdown)) breakdown[k] += normalized[k];
        }
      }
      if (!data.has_more) break;
      if (!data.next_page || data.next_page === page || iteration === 99) throw new ProviderError('Usage pagination was incomplete. A partial total was not published.', 'coverage');
      page = data.next_page;
    }
  }
  const series = dailySeries(month, daily), total = series.reduce((a, b) => a + b.value, 0);
  let apiCost = null, costNote = null;
  {
    try { apiCost = id === 'openai' ? await openaiCosts(month, fetchJSON, { Authorization: `Bearer ${key}` }) : await anthropicCosts(month, fetchJSON, { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'analytics-usage-cost-2026-08-24' }); }
    catch { costNote = 'Model spending could not be read. Token usage is still available; no cost is inferred.'; }
  }
  return { daily: series, monthly: id === 'anthropic' && !asOf && !series.length ? null : total, unit: 'tokens', breakdown, windows: [], scope: identity(key), sourceLabel: 'Organization usage API', asOf,
    modelUsage: aggregateActivity(activity), requestCount: activity.every(r => finite(r.calls)) && (activity.length || id === 'openai' || asOf) ? activity.reduce((n,r) => n+r.calls, 0) : null,
    apiCost, costNote, creditNote: 'This reporting connection does not expose a prepaid credit balance.' + (id === 'anthropic' ? ' API costs are after discounts and before credits; they are separate from Claude subscription credit spending.' : ''),
    partial: id === 'anthropic' && !asOf, coverage: id === 'openai' ? 'Completions & embeddings · organization · UTC' : 'Organization token usage · UTC. Provider reporting may be delayed.' };
}
async function elevenlabs(month, ctx) {
  const key = ctx.credentials.elevenlabs;
  if (!key) throw new ProviderError('Add ELEVENLABS_API_KEY in your secrets file or save a key here.', 'setup');
  const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };
  const sub = await fetchJSON('https://api.elevenlabs.io/v1/user/subscription', headers), { start, end } = monthRange(month);
  let daily = null, historyNote = null;
  try {
    const data = await fetchJSON('https://api.elevenlabs.io/v1/workspace/analytics/query/usage-by-product-over-time', headers,
      { start_time: start, end_time: Math.min(end, Date.now()), interval_seconds: 86400, time_zone: 'UTC' });
    if (!Array.isArray(data.columns) || !Array.isArray(data.rows)) throw new Error('shape');
    const time = data.columns.findIndex(c => /^(time|timestamp|bucket_start|start_time|date)$/.test(c));
    const value = data.columns.findIndex((c, i) => data.column_units?.[i] === 'credits' || /^(usage|total_usage|credits|credit_usage|total_credits|character_count|total_credit_usage)$/.test(c));
    if (time < 0 || value < 0) throw new Error('columns');
    daily = data.rows.map(row => { const raw = row[time], d = typeof raw === 'number' ? new Date(raw) : new Date(raw); if (!Number.isFinite(+d) || !finite(row[value])) throw new Error('value'); return { date: d.toISOString().slice(0, 10), value: row[value] }; });
  } catch { historyNote = 'The monthly history endpoint did not supply a usable reading. The allowance below is live.'; }
  return { ...normalizeEleven(sub, daily, month), scope: identity(key), sourceLabel: 'ElevenLabs usage API', historyNote };
}
export async function readProvider(id, month, ctx) {
  if (id === 'ollama') {
    const key = ctx.credentials.ollama;
    if (!key) throw new ProviderError('Add OLLAMA_CLOUD_API_KEY or save an Ollama API key here.', 'setup');
    const headers = { Authorization: `Bearer ${key}` };
    const [usage, balance] = await Promise.all([fetchJSON('https://ollama.com/api/usage?range=30d&group_by=model', headers), fetchJSON('https://ollama.com/api/balance', headers)]);
    try { return { ...normalizeOllama(usage, balance, month, ctx.previousReading), scope: identity(key), sourceLabel: 'Ollama Cloud usage and balance API' }; }
    catch { throw new ProviderError('Ollama returned an unfamiliar usage or balance format. Your last reading is kept.', 'format'); }
  }
  if (id === 'codex') return codex(month, ctx);
  if (id === 'cursor') return cursor(month, ctx);
  if (id === 'claude') return claude(month, ctx);
  if (id === 'elevenlabs') return elevenlabs(month, ctx);
  if (['openai', 'anthropic'].includes(id)) return apiUsage(id, month, ctx);
  throw new ProviderError('Unknown usage source.', 'setup');
}
