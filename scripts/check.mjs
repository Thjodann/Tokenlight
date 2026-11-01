import { readdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
for (const directory of ['src', 'scripts', 'test']) {
  for (const file of await readdir(directory)) if (/\.(cjs|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', `${directory}/${file}`], { stdio: 'inherit' });
}
const html = await readFile('src/index.html', 'utf8');
if (!html.includes("connect-src 'none'") || !html.includes("object-src 'none'")) throw new Error('Renderer policy is missing.');
console.log('Syntax and renderer policy checks passed.');
