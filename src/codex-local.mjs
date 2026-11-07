// Read-only, bounded metadata sampling. No transcript or account data leaves this module.
import { opendir, open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { monthRange } from './model.mjs';
import { aggregateActivity, activityRow } from './activity.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const valid = n => Number.isSafeInteger(n) && n >= 0;
const fields = ['input_tokens','cached_input_tokens','output_tokens','reasoning_output_tokens','total_tokens'];
function usage(value) {
  if (!value || !fields.every(k => valid(value[k]))) return null;
  if (value.cached_input_tokens > value.input_tokens || value.reasoning_output_tokens > value.output_tokens || value.total_tokens !== value.input_tokens + value.output_tokens) return null;
  return Object.fromEntries(fields.map(k => [k,value[k]]));
}
const usableModel = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._:/-]{0,199}$/i.test(value) && !/auto-review|synthetic|unattributed|unknown|^default$|^none$|^mock$|^test$|^placeholder$/i.test(value);

export async function scanCodexLocal(month, root, options = {}) {
  const { start, end } = monthRange(month);
  const limits = { bytes:16*1024*1024, fileBytes:4*1024*1024, entries:4000, files:256, records:20000, ...options };
  const files = [], visited = new Set(), events = new Set(), turns = new Set(), activeTurns = new Set(), rows = [];
  let entries = 0, bytes = 0, records = 0, truncated = false, gaps = false, scannedFiles = 0;
  async function walk(dir, depth = 0) {
    if (visited.has(dir)) return;
    visited.add(dir);
    if (depth > 5) { truncated = true; return; }
    let directory;
    try {
      directory = await opendir(dir);
      for await (const entry of directory) {
        if (++entries > limits.entries) { truncated = true; break; }
        const path = join(dir,entry.name);
        if (entry.isDirectory()) await walk(path,depth+1);
        else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          try { const info = await stat(path); files.push({path,mtime:info.mtimeMs,selected:path.includes('/'+month.replace('-','/')+'/') || entry.name.includes(month)}); }
          catch { gaps=true; }
        }
        if (entries > limits.entries) break;
      }
    } catch (error) { if (error.code !== 'ENOENT') gaps = true; }
  }
  // Standard dated stores get the selected month first, before historical trees
  // can consume the discovery budget. Then consider recently modified old sessions.
  for (const store of ['sessions','archived_sessions']) await walk(join(root,store,...month.split('-')));
  for (const store of ['sessions','archived_sessions']) if (entries <= limits.entries) await walk(join(root,store));
  files.sort((a,b)=>Number(b.selected)-Number(a.selected)||b.mtime-a.mtime||a.path.localeCompare(b.path));
  if (files.length>limits.files) truncated=true;
  const selectedFiles=files.slice(0,limits.files);
  for (const [fileIndex,{path}] of selectedFiles.entries()) {
    if (bytes >= limits.bytes || records >= limits.records) { truncated = true; break; }
    let file, context = null, previous = null, session = hash(path), internal = false, pending = '', discard = false;
    const snapshots = new Set();
    function line(text) {
      if (++records > limits.records) { truncated = true; return; }
      let row; try { row = JSON.parse(text); } catch { gaps = true; return; }
      const p = row.payload;
      if (!p || typeof p !== 'object') return;
      if (row.type === 'session_meta') {
        if (typeof p.id === 'string') session = hash(p.id);
        internal ||= /auto-review/i.test(JSON.stringify(p.source || '') + String(p.originator || ''));
        return;
      }
      if (row.type === 'turn_context') {
        context = usableModel(p.model) && typeof p.turn_id === 'string' && p.turn_id.length <= 200 ? {model:p.model,turn:hash(p.turn_id)} : null;
        return;
      }
      if (row.type !== 'event_msg' || p.type !== 'token_count') return;
      const total = usage(p.info?.total_token_usage), last = usage(p.info?.last_token_usage);
      let delta = last;
      if (total) {
        const fingerprint = JSON.stringify([context,total]);
        if (snapshots.has(fingerprint)) return;
        snapshots.add(fingerprint);
      }
      if (total) {
        if (previous) {
          if (fields.every(k => total[k] === previous[k])) return;
          if (fields.every(k => total[k] >= previous[k])) delta = usage(Object.fromEntries(fields.map(k => [k,total[k]-previous[k]])));
          else { gaps = true; delta = last; }
        } else if (!last || total.total_tokens !== last.total_tokens) gaps = true;
        previous = total;
        // A jump can span unobserved model contexts. Attribute only the known last
        // generation when it differs from the cumulative delta, never the gap.
        if (!delta || !last || fields.some(k=>delta[k]!==last[k])) {
          gaps = true; delta = last;
        }
      } else gaps = true;
      if (!delta) { gaps = true; return; }
      if (!delta.total_tokens) return;
      const time = Date.parse(row.timestamp);
      if (!Number.isFinite(time)) { gaps = true; return; }
      if (internal || time < start || time >= end) return;
      if (!context) { gaps = true; return; }
      // Cumulative snapshots dedupe repeated events and copied/resumed session files.
      const key = hash(session + JSON.stringify([context.turn,context.model,total || [row.timestamp,last]]));
      if (events.has(key)) return;
      events.add(key);
      const turn = session + context.turn + context.model;
      const calls = turns.has(turn) ? 0 : 1; turns.add(turn); activeTurns.add(session+context.turn);
      rows.push(activityRow({input_tokens:delta.input_tokens,input_cached_tokens:delta.cached_input_tokens,output_tokens:delta.output_tokens},'openai',context.model,calls));
    }
    try {
      file = await open(path,'r');
      const size = (await file.stat()).size, cap = Math.min(size,limits.fileBytes,Math.max(1,Math.floor((limits.bytes-bytes)/(selectedFiles.length-fileIndex))));
      scannedFiles++;
      if (cap < size) truncated = true;
      const prefix = cap < size ? Math.floor(cap/2) : cap;
      const ranges = cap < size ? [[0,prefix],[size-(cap-prefix),size]] : [[0,size]];
      for (const [from,to] of ranges) {
        let position = from;
        if (from>0) { context=null; previous=null; pending=''; discard=true; gaps=true; }
        while (position < to && records < limits.records) {
          const buffer = Buffer.alloc(Math.min(65536,to-position));
          const {bytesRead} = await file.read(buffer,0,buffer.length,position);
          if (!bytesRead) break;
          position += bytesRead; bytes += bytesRead;
          // JSON metadata is ASCII; a split UTF-8 transcript is discarded with its line.
          const parts = buffer.subarray(0,bytesRead).toString('utf8').split('\n');
          for (let n=0;n<parts.length;n++) {
            if (!discard) pending += parts[n];
            if (pending.length > 262144) { pending=''; discard=true; gaps=true; }
            if (n < parts.length-1) { if (!discard && pending.trim()) line(pending); pending=''; discard=false; }
            if (records >= limits.records) { truncated=true; break; }
          }
        }
        if (pending || discard) gaps=true;
      }
      // Ignore an unterminated last line: it may be an in-progress append.
      if (pending || discard) gaps = true;
    } catch { gaps=true; }
    finally { await file?.close(); }
  }
  return { modelUsage:aggregateActivity(rows), requestCount:activeTurns.size || null,
    activityScope:{kind:'local',partial:true,truncated,gaps,discoveredFiles:files.length,scannedFiles,scannedBytes:bytes},
    activityNote:`Local Codex active turns · UTC · partial coverage; excludes other devices and cloud sessions.${truncated?' Scan limit reached.':''}${gaps?' Metadata gaps encountered.':''}${!activeTurns.size?' No attributable usage found.':''} Model counts are active turns per model; a switched turn can appear under more than one model. Cached for up to 5 minutes. Provider token totals and allowances are separate.` };
}
// Cache only sanitized aggregates, at most four root/month combinations; share concurrent scans.
const cache = new Map();
export async function readCodexLocal(month, root = process.env.CODEX_HOME || join(homedir(),'.codex')) {
  const key = hash(root + month), now = Date.now();
  let entry = cache.get(key);
  if (!entry || now-entry.at >= 300000) {
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    entry = {at:now,result:scanCodexLocal(month,root)}; cache.set(key,entry);
  }
  try { return structuredClone(await entry.result); }
  catch { cache.delete(key); return {modelUsage:[],requestCount:null,activityScope:{kind:'local',partial:true,gaps:true},activityNote:'Local Codex metadata unavailable · partial coverage. Provider totals are separate.'}; }
}
