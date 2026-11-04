// Local-only update feed for signed A-to-B review builds. Never a production feed.
// Usage: node scripts/verify-update.mjs APP_ZIP VERSION OUTPUT_DIR [PORT]
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const [file, version, destination, port = '4187'] = process.argv.slice(2);
if (!file || !/^\d+\.\d+\.\d+$/.test(version || '') || !destination) throw new Error('Provide signed app ZIP, target version and output directory.');
const zip = resolve(file), output = resolve(destination), size = (await stat(zip)).size;
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  await appendFile(join(output, 'feed-requests.jsonl'), JSON.stringify({ at: Date.now(), method: req.method, path: url.pathname }) + '\n');
  let mode = 'update'; try { mode = (await readFile(join(output, 'feed-mode.txt'), 'utf8')).trim(); } catch {}
  if (mode === 'offline') { res.writeHead(503); res.end(); return; }
  if (url.pathname.startsWith('/feed/')) {
    if (mode === 'none' || url.pathname === '/feed/' + version) { res.writeHead(204); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ url: `http://localhost:${port}/${mode === 'bad' ? 'bad' : 'app'}.zip`, name: version, notes: 'Signed local update verification', pub_date: new Date().toISOString() })); return;
  }
  const target = url.pathname === '/app.zip' ? zip : url.pathname === '/bad.zip' ? join(output, 'bad.zip') : null;
  if (!target) { res.writeHead(404); res.end(); return; }
  const length = target === zip ? size : (await stat(target)).size;
  res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': length });
  createReadStream(target).pipe(res);
});
server.listen(Number(port), '127.0.0.1', () => console.log(`Local update fixture listening on 127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
