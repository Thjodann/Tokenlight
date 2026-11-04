import { spawnSync } from 'node:child_process';
import { readdir, open } from 'node:fs/promises';
import { join, relative } from 'node:path';

export function runTool(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout || result.status}`);
  return { stdout: result.stdout || '', stderr: result.stderr || '' };
}

export function signingConfig(argv = [], env = process.env) {
  if (argv.some(arg => arg !== '--developer-id')) throw new Error('Unknown build option. Use --developer-id for a notarized release.');
  if (!argv.includes('--developer-id')) return { mode: 'ad-hoc' };
  const identity = env.TOKENLIGHT_SIGNING_IDENTITY?.trim(), teamId = env.TOKENLIGHT_TEAM_ID?.trim(), profile = env.TOKENLIGHT_NOTARY_PROFILE?.trim();
  if (!identity || !/^[A-Z0-9]{10}$/.test(teamId || '') || !/^[A-Za-z0-9._-]+$/.test(profile || '')) {
    throw new Error('Developer ID builds require TOKENLIGHT_SIGNING_IDENTITY, TOKENLIGHT_TEAM_ID and TOKENLIGHT_NOTARY_PROFILE. No ad hoc fallback.');
  }
  return { mode: 'developer-id', identity, teamId, profile };
}

export function selectIdentity(list, config) {
  const matches = [...list.matchAll(/\b([A-Fa-f0-9]{40})\s+"(Developer ID Application: [^"\n]+)"/g)]
    .map(([, hash, name]) => ({ hash: hash.toUpperCase(), name }))
    .filter(x => x.name.endsWith(`(${config.teamId})`) && (x.name === config.identity || x.hash === config.identity.toUpperCase()));
  if (matches.length !== 1) throw new Error('Expected exactly one valid Developer ID Application identity with a private key for the selected team.');
  return matches[0];
}

export function signingPreflight(config, run = runTool) {
  if (config.mode !== 'developer-id') return config;
  const identity = selectIdentity(run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']).stdout, config);
  run('/usr/bin/xcrun', ['--find', 'notarytool']);
  run('/usr/bin/xcrun', ['--find', 'stapler']);
  // Validates the named profile without reading or printing its secret.
  run('/usr/bin/xcrun', ['notarytool', 'history', '--keychain-profile', config.profile, '--output-format', 'json']);
  return { ...config, identity: identity.name, identityHash: identity.hash };
}

export function signOptions(appPath, config, electronVersion) {
  const codex = join(appPath, 'Contents/Resources/vendor/codex');
  return {
    app: appPath, platform: 'darwin', type: 'distribution', version: electronVersion,
    identity: config.identityHash, identityValidation: true, strictVerify: true,
    preAutoEntitlements: false, preEmbedProvisioningProfile: false, binaries: [codex],
    optionsForFile: file => ({
      hardenedRuntime: true, timestamp: 'http://timestamp.apple.com/ts01',
      // Only Electron uses JIT. No App Sandbox, debug, device, unsigned-memory
      // or library-validation exceptions are added to this direct-distribution app.
      entitlements: file === codex ? [] : ['com.apple.security.cs.allow-jit']
    })
  };
}

export function verifySignature(metadata, entitlements, teamId) {
  const timestamp = metadata.match(/^Timestamp=(.+)$/m)?.[1];
  if (!metadata.split(/\r?\n/).includes(`TeamIdentifier=${teamId}`) || !/^Authority=Developer ID Application:/m.test(metadata)
    || !timestamp || timestamp === 'none' || !/flags=.*\bruntime\b/.test(metadata)) throw new Error('Developer ID, team, secure timestamp or Hardened Runtime verification failed.');
  const keys = [...entitlements.matchAll(/<key>([^<]+)<\/key>/g)].map(x => x[1]);
  if (keys.some(key => key !== 'com.apple.security.cs.allow-jit')) throw new Error('Unexpected signing entitlement.');
  return { teamId, timestamp, entitlements: keys };
}

async function machOFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await machOFiles(path));
    else if (entry.isFile()) {
      const file = await open(path, 'r');
      try { const buffer = Buffer.alloc(4); const { bytesRead } = await file.read(buffer, 0, 4, 0);
        if (bytesRead === 4 && ['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(buffer.toString('hex'))) files.push(path);
      } finally { await file.close(); }
    }
  }
  return files;
}

export async function verifySignedApp(appPath, config, run = runTool) {
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath]);
  const evidence = [];
  for (const path of [appPath, ...await machOFiles(join(appPath, 'Contents'))]) {
    run('/usr/bin/codesign', ['--verify', '--strict', path]);
    const info = run('/usr/bin/codesign', ['--display', '--verbose=4', path]);
    const entitlements = run('/usr/bin/codesign', ['--display', '--entitlements', ':-', path]);
    evidence.push({ path: relative(appPath, path) || '.', ...verifySignature(info.stdout + info.stderr, entitlements.stdout, config.teamId) });
  }
  return evidence;
}
