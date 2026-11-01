import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const directory of ['src', 'scripts', 'test']) {
  for (const file of await readdir(directory)) if (/\.(cjs|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' });
}
const html = await readFile('src/index.html', 'utf8');
if (!html.includes("connect-src 'none'") || !html.includes("object-src 'none'")) throw new Error('Renderer policy is missing.');
// Inline style attributes are blocked by the renderer CSP, including generated
// markup. A usage bar must not silently fall back to a misleading full width.
const renderer = await readFile('src/renderer.mjs', 'utf8');
if (/\bstyle\s*=\s*["']/.test(renderer)) throw new Error('Renderer markup uses a CSP-blocked inline style.');
console.log('Syntax and renderer policy checks passed.');
