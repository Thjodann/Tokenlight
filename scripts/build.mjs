import { access, cp, mkdir, mkdtemp, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
const root = fileURLToPath(new URL('..', import.meta.url));
process.chdir(root);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
// Electron 42+ downloads its runtime on demand, not during npm ci.
// Use the pinned package's idempotent installer before manual app packaging.
execFileSync(process.execPath, [join(root, 'node_modules/electron/install.js')], { stdio: 'inherit', timeout: 180000 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const output = resolve(process.env.TOKENLIGHT_OUTPUT_DIR || `.codex/output/builds/${stamp}`);
const vendor = join(root, 'vendor'); await mkdir(vendor, { recursive: true });
try { await access(join(vendor, 'codex')); }
catch {
  const installed = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex';
  execFileSync('/usr/bin/ditto', ['--norsrc', '--noextattr', installed, join(vendor, 'codex')], { timeout: 60000 });
}
// The installed CLI signature refers to its original app's Info.plist. Re-sign
// only our relocated copy when that bundle-bound signature no longer verifies.
try { execFileSync('/usr/bin/codesign', ['--verify', '--strict', join(vendor, 'codex')], { stdio: 'ignore' }); }
catch { execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', join(vendor, 'codex')], { stdio: 'inherit' }); }
const codexVersion = execFileSync(join(vendor, 'codex'), ['--version'], { encoding: 'utf8' }).trim();
async function hash(file) { const digest = createHash('sha256'); for await (const c of createReadStream(file)) digest.update(c); return digest.digest('hex'); }
const manifest = {};
for (const dir of ['src', 'scripts', 'test', 'docs']) for (const file of (await readdir(dir)).sort()) if (/\.(mjs|cjs|html|css|md)$/.test(file)) manifest[`${dir}/${file}`] = await hash(`${dir}/${file}`);
for (const file of ['package.json', 'package-lock.json', 'README.md', 'THIRD-PARTY-NOTICES.md', 'vendor/codex', 'vendor/CODEX-LICENSE.txt']) manifest[file] = await hash(file);
const sourceId = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
const receipt = { app: pkg.productName, version: pkg.version, sourceId, builtAt: new Date().toISOString(), arch: 'arm64', platform: 'darwin', electron: pkg.devDependencies.electron, packaging: 'Electron documented app-bundle layout', codexVersion, files: manifest };
await writeFile(join(vendor, 'source-receipt.json'), JSON.stringify(receipt, null, 2));
execFileSync(process.execPath, [join(root, 'scripts/render-icon.cjs')], { stdio: 'inherit' });
await mkdir(output, { recursive: true });
// File Provider folders can recreate FinderInfo while codesign is reading a bundle.
// Sign in an ordinary temporary directory and publish a zip that preserves it.
const stage = await mkdtemp(join(tmpdir(), 'tokenlight-build-'));
const appPath = join(stage, 'Tokenlight.app');
const electronApp = join(root, 'node_modules/electron/dist/Electron.app');
execFileSync('/usr/bin/ditto', ['--norsrc', '--noextattr', electronApp, appPath], { stdio: 'inherit', timeout: 60000 });
const contents = join(appPath, 'Contents'), resources = join(contents, 'Resources');
async function updatePlist(file, changes, remove = []) {
  const data = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file], { encoding: 'utf8' }));
  Object.assign(data, changes); for (const key of remove) delete data[key];
  await writeFile(file, JSON.stringify(data));
  execFileSync('/usr/bin/plutil', ['-convert', 'xml1', file]);
}
await rename(join(contents, 'MacOS/Electron'), join(contents, 'MacOS/Tokenlight'));
await updatePlist(join(contents, 'Info.plist'), {
  CFBundleDisplayName: 'Tokenlight', CFBundleName: 'Tokenlight', CFBundleExecutable: 'Tokenlight',
  CFBundleIdentifier: 'com.jared.tokenlight', CFBundleShortVersionString: pkg.version, CFBundleVersion: pkg.version,
  CFBundleIconFile: 'Tokenlight.icns', LSApplicationCategoryType: 'public.app-category.productivity',
  NSHumanReadableCopyright: 'Personal build for Jared. Includes Electron and OpenAI Codex under their respective licenses.'
}, ['ElectronAsarIntegrity', 'NSCameraUsageDescription', 'NSMicrophoneUsageDescription', 'NSAudioCaptureUsageDescription', 'NSBluetoothAlwaysUsageDescription', 'NSBluetoothPeripheralUsageDescription']);
const frameworks = join(contents, 'Frameworks');
for (const entry of await readdir(frameworks, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith('Electron Helper') || !entry.name.endsWith('.app')) continue;
  const oldName = entry.name.slice(0, -4), newName = oldName.replace('Electron', 'Tokenlight'), oldDir = join(frameworks, entry.name);
  await rename(join(oldDir, 'Contents/MacOS', oldName), join(oldDir, 'Contents/MacOS', newName));
  await updatePlist(join(oldDir, 'Contents/Info.plist'), { CFBundleName: newName, CFBundleDisplayName: newName, CFBundleExecutable: newName, CFBundleIdentifier: 'com.jared.tokenlight.' + newName.toLowerCase().replace(/[^a-z]/g, '') });
  await rename(oldDir, join(frameworks, newName + '.app'));
}
await mkdir(join(resources, 'app'), { recursive: true });
await cp(join(root, 'src'), join(resources, 'app/src'), { recursive: true });
await writeFile(join(resources, 'app/package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: pkg.main, type: pkg.type }));
execFileSync('/usr/bin/ditto', ['--norsrc', '--noextattr', vendor, join(resources, 'vendor')], { stdio: 'inherit', timeout: 60000 });
await cp(join(root, '.codex/output/icon/Tokenlight.icns'), join(resources, 'Tokenlight.icns'));
await cp(join(root, 'THIRD-PARTY-NOTICES.md'), join(resources, 'THIRD-PARTY-NOTICES.md'));
// Remove inherited Finder metadata only from this new task-owned app bundle.
execFileSync('/usr/bin/xattr', ['-cr', appPath], { stdio: 'inherit', timeout: 60000 });
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
const artifactPath = join(output, 'Tokenlight-mac-arm64.zip');
try { await access(artifactPath); throw new Error('Refusing to replace an existing build archive. Choose a fresh output directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
execFileSync('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', appPath, artifactPath], { stdio: 'inherit', timeout: 180000 });
const packedReceipt = { ...receipt, appPath, artifactPath, artifactSha256: await hash(artifactPath), mainSourceSha256: await hash(join(appPath, 'Contents/Resources/app/src/main.cjs')), bundledCodexSha256: await hash(join(appPath, 'Contents/Resources/vendor/codex')) };
await writeFile(join(output, 'build-receipt.json'), JSON.stringify(packedReceipt, null, 2));
await writeFile('.codex/output/latest-build.json', JSON.stringify(packedReceipt, null, 2));
console.log(JSON.stringify({ appPath, artifactPath, sourceId, signing: 'ad hoc; local personal build', receipt: join(output, 'build-receipt.json') }, null, 2));
