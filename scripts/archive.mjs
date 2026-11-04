import { readFile, readdir, mkdir, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { INSTALLER_INPUTS } from './dmg.mjs';
const root = resolve('.'), receipt = JSON.parse(await readFile('.codex/output/latest-build.json', 'utf8'));
async function hash(file) { const h = createHash('sha256'); for await (const c of createReadStream(file)) h.update(c); return h.digest('hex'); }
for (const [file, expected] of Object.entries(receipt.files)) if (await hash(file) !== expected) throw new Error(`Source changed after the last build: ${file}. Run npm run build first.`);
for (const dir of ['src', 'scripts', 'test', 'docs']) for (const name of await readdir(dir)) if (/\.(mjs|cjs|html|css|md)$/.test(name) && !receipt.files[`${dir}/${name}`]) throw new Error(`New source after the last build: ${dir}/${name}. Run npm run build first.`);
for (const file of INSTALLER_INPUTS) if (!receipt.files[file]) throw new Error(`New installer input after the last build: ${file}. Run npm run build first.`);
const stamp = new Date().toISOString().replace(/[:.]/g, '-'), stage = join(root, '.codex/output/archives', stamp, 'Tokenlight-Rebuild');
await mkdir(stage, { recursive: true });
for (const name of ['src', 'scripts', 'test', 'vendor', 'docs', 'package.json', 'package-lock.json', 'README.md', 'THIRD-PARTY-NOTICES.md']) execFileSync('/usr/bin/ditto', ['--norsrc', '--noextattr', join(root, name), join(stage, name)], { timeout: 60000 });
const output = resolve(process.env.TOKENLIGHT_DELIVERY_DIR || '../../outputs'); await mkdir(output, { recursive: true });
const zip = join(output, `Tokenlight-Rebuild-${receipt.version}-${stamp}.zip`);
try { await access(zip); throw new Error('Refusing to replace an existing archive.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', stage, zip], { timeout: 180000 });
console.log(JSON.stringify({ archive: zip, sourceId: receipt.sourceId, sourceStage: stage }, null, 2));
