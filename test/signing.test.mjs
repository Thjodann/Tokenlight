import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { signingConfig, selectIdentity, signingPreflight, signOptions, verifySignature } from '../scripts/signing.mjs';
import { notarizeApp } from '../scripts/notarize.mjs';
const team = 'ABCDEFGHIJ', hash = 'A'.repeat(40), name = `Developer ID Application: Example (${team})`;
const env = { TOKENLIGHT_SIGNING_IDENTITY: hash, TOKENLIGHT_TEAM_ID: team, TOKENLIGHT_NOTARY_PROFILE: 'tokenlight-notary' };
const config = signingConfig(['--developer-id'], env);
const identities = `  1) ${hash} "${name}"\n`;

test('local build is explicit ad hoc; release mode rejects incomplete or mistyped configuration', () => {
  assert.deepEqual(signingConfig([], {}), { mode: 'ad-hoc' });
  assert.throws(() => signingConfig(['--developer-id'], {}), /No ad hoc fallback/);
  assert.throws(() => signingConfig(['--developer-idd'], env), /Unknown/);
  for (const key of Object.keys(env)) assert.throws(() => signingConfig(['--developer-id'], { ...env, [key]: '' }));
});
test('distribution identity selection requires exact identity, intended team and usable Developer ID private key', () => {
  assert.equal(selectIdentity(identities, config).hash, hash);
  assert.equal(selectIdentity(identities, { ...config, identity: name }).name, name);
  assert.throws(() => selectIdentity(identities.replace('Developer ID Application', 'Apple Development'), config));
  assert.throws(() => selectIdentity(identities, { ...config, teamId: 'ZYXWVUTSRQ' }));
  assert.throws(() => selectIdentity(identities + identities, config));
  assert.throws(() => selectIdentity('', config));
});
test('preflight stops on unavailable credentials without any signing command', () => {
  const calls = [];
  assert.throws(() => signingPreflight(config, (tool, args) => {
    calls.push(args);
    if (args[0] === 'history' || args.includes('history')) throw new Error('Missing Keychain profile');
    return { stdout: args[0] === 'find-identity' ? identities : '' };
  }), /Missing Keychain/);
  assert.equal(calls.some(args => args.includes('--sign')), false);
});
test('pinned signing package exposes the asynchronous API used by release builder', async () => {
  const library = await import('@electron/osx-sign');
  assert.equal(typeof library.sign, 'function');
});
test('nested signing includes Codex without broad exceptions or sandbox entitlements', () => {
  const app = '/tmp/test/Tokenlight.app', options = signOptions(app, { ...config, identityHash: hash }, '45.2.1');
  assert.equal(options.platform, 'darwin'); assert.equal(options.identityValidation, true);
  assert.equal(options.preAutoEntitlements, false); assert.equal(options.preEmbedProvisioningProfile, false);
  assert.deepEqual(options.optionsForFile(options.binaries[0]).entitlements, []);
  for (const file of [app, app + '/Contents/Frameworks/Tokenlight Helper (Renderer).app']) {
    const perFile = options.optionsForFile(file);
    assert.equal(perFile.hardenedRuntime, true); assert.ok(perFile.timestamp);
    assert.deepEqual(perFile.entitlements, ['com.apple.security.cs.allow-jit']);
  }
});
test('signature acceptance requires Developer ID, team, runtime and timestamp; rejects unexpected entitlements', () => {
  const text = `Authority=${name}\nTeamIdentifier=${team}\nTimestamp=Nov 3, 2026\nCodeDirectory flags=0x10000(runtime)\n`;
  assert.equal(verifySignature(text, '<dict/>', team).teamId, team);
  for (const field of [`Authority=${name}`, `TeamIdentifier=${team}`, 'Timestamp=Nov 3, 2026', '(runtime)']) assert.throws(() => verifySignature(text.replace(field, ''), '<dict/>', team));
  assert.throws(() => verifySignature(text, '<key>com.apple.security.get-task-allow</key><true/>', team));
  assert.throws(() => verifySignature(text.replace(`TeamIdentifier=${team}`, `TeamIdentifier=${team}X`), '<dict/>', team));
  assert.throws(() => verifySignature(text.replace('Timestamp=Nov 3, 2026', 'Timestamp=none'), '<dict/>', team));
});
test('release command fails before changing generated inputs when configuration is missing', () => {
  const result = spawnSync(process.execPath, ['scripts/build.mjs', '--developer-id'], { encoding: 'utf8', env: { ...process.env, TOKENLIGHT_SIGNING_IDENTITY: '', TOKENLIGHT_TEAM_ID: '', TOKENLIGHT_NOTARY_PROFILE: '' } });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /No ad hoc fallback/);
});

async function fixture(t, status = 'Accepted', waitError = false, infoStatus) {
  const output = await mkdtemp(join(tmpdir(), 'tokenlight-notary-test-'));t.after(() => rm(output, { recursive: true, force: true }));
  const calls = [], id = '11111111-1111-1111-1111-111111111111';
  const run = (tool, args) => {
    calls.push(args);
    if (tool.endsWith('ditto')) writeFileSync(args.at(-1), 'test archive');
    if (args.includes('submit')) return { stdout: JSON.stringify({ id, status: 'In Progress' }) };
    if (args.includes('wait')) { if (waitError) throw new Error('timeout'); return { stdout: JSON.stringify({ id, status }) }; }
    if (args.includes('info')) { if (!infoStatus) throw new Error('status unavailable'); return { stdout: JSON.stringify({ id, status: infoStatus }) }; }
    if (args.includes('log')) return { stdout: JSON.stringify({ status }) };
    return { stdout: '', stderr: '' };
  };
  return { output, calls, id, run };
}
test('notarization acceptance staples and assesses before final success', async t => {
  const f = await fixture(t);const receipt = await notarizeApp('/tmp/Test.app', f.output, config, f.run);
  assert.equal(receipt.stapled, true);assert.equal(receipt.gatekeeper, 'accepted');
  assert.ok(f.calls.findIndex(x => x.includes('staple')) > f.calls.findIndex(x => x.includes('wait')));
  await assert.rejects(access(join(f.output, 'notary-submission.zip')));
});
test('notarization rejection retains evidence and never staples', async t => {
  const f = await fixture(t, 'Invalid');await assert.rejects(notarizeApp('/tmp/Test.app', f.output, config, f.run), /Invalid/);
  assert.equal(f.calls.some(x => x.includes('staple')), false);
  assert.equal(JSON.parse(await readFile(join(f.output, 'notarization.json'))).status, 'Invalid');
  await access(join(f.output, 'notarization-log.json'));
});
test('wait timeout saves submission ID and refuses a duplicate upload in the same output', async t => {
  const f = await fixture(t, 'Accepted', true);await assert.rejects(notarizeApp('/tmp/Test.app', f.output, config, f.run), /Resume submission/);
  const receipt = JSON.parse(await readFile(join(f.output, 'notarization.json')));assert.equal(receipt.id, f.id);assert.equal(receipt.waitIncomplete, true);
  await assert.rejects(notarizeApp('/tmp/Test.app', f.output, config, f.run), /already exists/);
  assert.equal(f.calls.filter(x => x.includes('submit')).length, 1);
});

test('builder refuses existing output before credential lookup or generated writes', async t => {
  const f = await fixture(t);
  for (const name of ['Tokenlight-mac-arm64.zip', 'notarization.json']) {
    const path = join(f.output, name); await writeFile(path, 'prior evidence');
    const result = spawnSync(process.execPath, ['scripts/build.mjs', '--developer-id'], { encoding: 'utf8', env: { ...process.env, ...env, TOKENLIGHT_OUTPUT_DIR: f.output } });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Refusing to reuse build output/);
    assert.equal(await readFile(path, 'utf8'), 'prior evidence'); await rm(path);
  }
});
test('nonzero wait queries the existing submission and captures a rejection log', async t => {
  const f = await fixture(t, 'Invalid', true, 'Invalid');
  await assert.rejects(notarizeApp('/tmp/Test.app', f.output, config, f.run), /Notarization Invalid/);
  assert.equal(JSON.parse(await readFile(join(f.output, 'notarization.json'))).status, 'Invalid');
  await access(join(f.output, 'notarization-log.json'));
  assert.equal(f.calls.filter(x => x.includes('submit')).length, 1);
  assert.equal(f.calls.some(x => x.includes('staple')), false);
});
test('successful submission receipt prevents another upload after temporary ZIP removal', async t => {
  const f = await fixture(t); await notarizeApp('/tmp/Test.app', f.output, config, f.run);
  await assert.rejects(notarizeApp('/tmp/Test.app', f.output, config, f.run), /already exists/);
  assert.equal(f.calls.filter(x => x.includes('submit')).length, 1);
});
