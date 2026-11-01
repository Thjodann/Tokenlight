const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const dir = path.join(root, '.codex/output/icon/Tokenlight.iconset');
  await fs.mkdir(dir, { recursive: true });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#294c3c"/><stop offset="1" stop-color="#192e26"/></linearGradient></defs><rect x="44" y="44" width="936" height="936" rx="218" fill="url(#bg)"/><rect x="121" y="121" width="782" height="782" rx="156" fill="none" stroke="#6a9272" stroke-opacity=".28" stroke-width="3"/><path d="M405 273h130v141h147v105H535v179c0 56 28 82 77 82 25 0 49-5 73-17v103c-37 18-79 27-126 27-102 0-154-59-154-173V519H314V414h91Z" fill="#c4dd87" transform="translate(-10 -40)"/><circle cx="711" cy="304" r="47" fill="#c4dd87"/></svg>';
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(dir, `icon_${size}x${size}.png`));
    await sharp(Buffer.from(svg)).resize(size * 2, size * 2).png().toFile(path.join(dir, `icon_${size}x${size}@2x.png`));
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', '-o', path.join(root, '.codex/output/icon/Tokenlight.icns'), dir]);
  console.log('Tokenlight icon rendered.');
})().catch(error => { process.stderr.write('Icon render failed: ' + error.stack + '\n'); process.exitCode = 1; });
