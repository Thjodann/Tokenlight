const path = require('node:path');
const fs = require('node:fs/promises');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
(async () => {
  const dir = path.join(root, '.codex/output/icon/Tokenlight.iconset');
  await fs.mkdir(dir, { recursive: true });
  const { brandIcon } = await import('../src/brand.mjs');
  const svg = brandIcon();
  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(dir, `icon_${size}x${size}.png`));
    await sharp(Buffer.from(svg)).resize(size * 2, size * 2).png().toFile(path.join(dir, `icon_${size}x${size}@2x.png`));
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', '-o', path.join(root, '.codex/output/icon/Tokenlight.icns'), dir]);
  console.log('Tokenlight icon rendered.');
})().catch(error => { process.stderr.write('Icon render failed: ' + error.stack + '\n'); process.exitCode = 1; });
