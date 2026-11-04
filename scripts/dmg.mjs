import { access, mkdir, readFile, writeFile, statfs, rm, rmdir, symlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runTool, signingConfig, signingPreflight, verifySignedApp } from './signing.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
export const INSTALLER_INPUTS = ['scripts/dmg-layout.applescript', 'docs/installer-art/art-receipt.json', 'docs/installer-art/tokenlight-dmg-accents-v3.png', 'docs/installer-art/prompt.md'];
const MiB = 1024 * 1024;
export function dmgOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (['--receipt', '--output'].includes(flag)) {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      options[flag.slice(2)] = resolve(argv[++i]);
    } else if (flag === '--preview') options.preview = true;
    else if (flag === '--developer-id') options.release = true;
    else throw new Error(`Unknown DMG option: ${flag}`);
  }
  if (!options.output || Boolean(options.preview) === Boolean(options.release)) throw new Error('Use --output <fresh directory> and exactly one of --preview or --developer-id.');
  options.receipt ||= join(root, '.codex/output/latest-build.json');
  return options;
}
export function imageCapacity(appBytes) {
  const imageMiB = Math.ceil(appBytes / MiB * 1.15) + 64;
  return { imageMiB, requiredFreeBytes: imageMiB * MiB * 2 + 512 * MiB };
}
export function validateDmgInput(receipt, plist, art, preview) {
  if (!/^\d+\.\d+\.\d+$/.test(receipt.version || '') || plist.CFBundleIdentifier !== 'com.jared.tokenlight'
      || plist.CFBundleShortVersionString !== receipt.version || basename(receipt.appPath || '') !== 'Tokenlight.app'
      || receipt.signing?.mode !== 'developer-id' || !receipt.signing.notarization?.stapled || !receipt.signing.teamId) throw new Error('DMG input must be a verified, stapled Developer ID Tokenlight build with matching version.');
  if (!preview && art.humanApproval !== 'approved') throw new Error('Installer artwork awaits human approval. Use --preview for a local review image.');
}
async function hash(file) {
  const digest = createHash('sha256'); for await (const chunk of createReadStream(file)) digest.update(chunk); return digest.digest('hex');
}
export async function notarizeDiskImage(path, output, config, run = runTool, save = writeFile) {
  const receiptFile = join(output, 'dmg-notarization.json');
  const submit = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'submit', path, '--keychain-profile', config.profile, '--output-format', 'json', '--no-progress'], { timeout: 300000 }).stdout);
  if (!/^[a-f0-9-]{36}$/i.test(submit.id || '')) throw new Error('No notarization ID returned. Inspect Apple status before retrying.');
  const receipt = { id: submit.id, status: submit.status, stapled: false };
  const persist = () => save(receiptFile, JSON.stringify(receipt, null, 2));
  await persist();
  try {
    receipt.status = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'wait', receipt.id, '--keychain-profile', config.profile, '--output-format', 'json', '--timeout', '20m', '--no-progress'], { timeout: 1220000 }).stdout).status;
  } catch {
    try { receipt.status = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'info', receipt.id, '--keychain-profile', config.profile, '--output-format', 'json']).stdout).status; } catch { /* Retain the known ID. */ }
  }
  await persist();
  if (receipt.status !== 'Accepted') throw new Error(`DMG notarization ${receipt.status}. Resume submission ${receipt.id}; do not upload again.`);
  await save(join(output, 'dmg-notarization-log.json'), run('/usr/bin/xcrun', ['notarytool', 'log', receipt.id, '--keychain-profile', config.profile]).stdout);
  run('/usr/bin/xcrun', ['stapler', 'staple', path]);
  run('/usr/bin/xcrun', ['stapler', 'validate', path]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', path]);
  receipt.stapled = true; receipt.gatekeeper = 'accepted'; await persist(); return receipt;
}
export async function buildDmg(options) {
  if (process.platform !== 'darwin') throw new Error('DMG packaging requires macOS and a logged-in Finder session.');
  const input = JSON.parse(await readFile(options.receipt, 'utf8'));
  const artDir = join(root, 'docs/installer-art'), art = JSON.parse(await readFile(join(artDir, 'art-receipt.json'), 'utf8'));
  const plist = JSON.parse(runTool('/usr/bin/plutil', ['-convert', 'json', '-o', '-', join(input.appPath, 'Contents/Info.plist')]).stdout);
  validateDmgInput(input, plist, art, options.preview);
  const artPath = join(artDir, art.source);
  if (await hash(artPath) !== art.sha256) throw new Error('Installer artwork differs from its review receipt.');
  // Refuse reused output before touching Keychain, mounting or uploading anything.
  try { await access(options.output); throw new Error('Use a fresh DMG output directory; inspect any earlier submission before retrying.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const appBytes = Number(runTool('/usr/bin/du', ['-sk', input.appPath]).stdout.split(/\s+/)[0]) * 1024;
  const capacity = imageCapacity(appBytes), disk = await statfs(resolve(options.output, '..'));
  if (disk.bavail * disk.bsize < capacity.requiredFreeBytes) throw new Error(`Insufficient disk space: need ${(capacity.requiredFreeBytes / 1024 ** 3).toFixed(2)} GiB free for staging plus reserve.`);
  const config = options.release ? signingPreflight(signingConfig(['--developer-id'])) : null;
  if (config && config.teamId !== input.signing.teamId) throw new Error('DMG and app signing teams must match.');
  await verifySignedApp(input.appPath, { teamId: input.signing.teamId });
  runTool('/usr/bin/xcrun', ['stapler', 'validate', input.appPath]);
  await mkdir(options.output);
  const mount = join(options.output, 'mount'), raw = join(options.output, 'layout-rw.dmg');
  const artifact = join(options.output, `Tokenlight-${input.version}-mac-arm64${options.preview ? '-preview' : ''}.dmg`);
  await mkdir(mount);
  let mounted = false;
  try {
    runTool('/usr/bin/hdiutil', ['create', '-size', `${capacity.imageMiB}m`, '-fs', 'HFS+', '-volname', `Tokenlight ${input.version}`, '-type', 'UDIF', '-nospotlight', raw], { timeout: 180000 });
    runTool('/usr/bin/hdiutil', ['attach', raw, '-nobrowse', '-noautoopen', '-mountpoint', mount], { timeout: 60000 }); mounted = true;
    runTool('/usr/bin/ditto', ['--norsrc', input.appPath, join(mount, 'Tokenlight.app')], { timeout: 180000 });
    await symlink('/Applications', join(mount, 'Applications'));
    await mkdir(join(mount, '.background'));
    // Finder reads TIFF representations at their logical DPI, preserving Retina pixels.
    const low = join(options.output, 'accents-1x.tiff'), high = join(options.output, 'accents-2x.tiff');
    for (const [scale, path] of [[1, low], [2, high]]) {
      runTool('/usr/bin/sips', ['-s', 'format', 'tiff', '--resampleHeightWidth', String(art.layout.height * scale), String(art.layout.width * scale), '-s', 'dpiWidth', String(72 * scale), '-s', 'dpiHeight', String(72 * scale), artPath, '--out', path]);
    }
    runTool('/usr/bin/tiffutil', ['-cathidpicheck', low, high, '-out', join(mount, '.background/accents.tiff')]);
    await rm(low); await rm(high);
    await verifySignedApp(join(mount, 'Tokenlight.app'), { teamId: input.signing.teamId });
    runTool('/usr/bin/xcrun', ['stapler', 'validate', join(mount, 'Tokenlight.app')]);
    const helper = 'Contents/Resources/vendor/codex';
    if (await hash(join(mount, 'Tokenlight.app', helper)) !== input.bundledCodexSha256) throw new Error('Bundled helper changed during DMG copy.');
    runTool('/usr/bin/osascript', [join(root, 'scripts/dmg-layout.applescript'), mount], { timeout: 45000 });
    await access(join(mount, '.DS_Store'));
    runTool('/usr/bin/hdiutil', ['detach', mount], { timeout: 60000 }); mounted = false;
    runTool('/usr/bin/hdiutil', ['convert', raw, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-o', artifact], { timeout: 180000 });
    runTool('/usr/bin/hdiutil', ['verify', artifact], { timeout: 60000 });
    let signing = { mode: 'unsigned-container', app: 'Developer ID signed and stapled', preview: true };
    if (config) {
      runTool('/usr/bin/codesign', ['--sign', config.identityHash, '--timestamp', '--identifier', 'com.jared.tokenlight.dmg', artifact], { timeout: 60000 });
      runTool('/usr/bin/codesign', ['--verify', '--strict', artifact]);
      const notarization = await notarizeDiskImage(artifact, options.output, config);
      signing = { mode: 'developer-id', teamId: config.teamId, notarization };
    }
    const receipt = { version: input.version, sourceId: input.sourceId, inputReceipt: options.receipt, appPath: input.appPath, appInputZipSha256: input.artifactSha256, artifactPath: artifact, artifactSha256: await hash(artifact), signing, artwork: art, layout: art.layout, releaseEligible: Boolean(config) && art.humanApproval === 'approved', updaterZipChanged: false };
    await writeFile(join(options.output, 'dmg-receipt.json'), JSON.stringify(receipt, null, 2));
    await rm(raw); await rmdir(mount);
    return receipt;
  } finally {
    if (mounted) runTool('/usr/bin/hdiutil', ['detach', mount], { timeout: 60000 });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await buildDmg(dmgOptions(process.argv.slice(2))), null, 2));
}
