import test from 'node:test';
import assert from 'node:assert/strict';
import { dmgOptions, imageCapacity, validateDmgInput, notarizeDiskImage } from '../scripts/dmg.mjs';

test('DMG output is explicit and preview cannot silently become a release', () => {
  assert.throws(() => dmgOptions(['--output', '/tmp/dmg']), /exactly one/);
  assert.throws(() => dmgOptions(['--preview', '--developer-id', '--output', '/tmp/dmg']), /exactly one/);
  assert.throws(() => dmgOptions(['--preview', '--output']), /Missing value/);
  assert.equal(dmgOptions(['--preview', '--output', '/tmp/dmg']).preview, true);
});
test('DMG requires the matching stapled app and human approval before a release', () => {
  const r = { version: '0.6.9', appPath: '/tmp/Tokenlight.app', signing: { mode: 'developer-id', teamId: '4JP4HKB6SJ', notarization: { stapled: true } } };
  const p = { CFBundleIdentifier: 'com.jared.tokenlight', CFBundleShortVersionString: '0.6.9' };
  assert.doesNotThrow(() => validateDmgInput(r, p, { humanApproval: 'pending' }, true));
  assert.throws(() => validateDmgInput(r, p, { humanApproval: 'pending' }, false), /approval/);
  assert.throws(() => validateDmgInput(r, { ...p, CFBundleShortVersionString: '0.6.8' }, {}, true), /matching version/);
  assert.throws(() => validateDmgInput({ ...r, signing: { mode: 'ad-hoc' } }, p, {}, true), /Developer ID/);
});
test('DMG space estimate includes raw image, worst-case compressed image and reserve', () => {
  const x = imageCapacity(500 * 1024 ** 2);
  assert.ok(x.imageMiB > 500);
  assert.equal(x.requiredFreeBytes, (x.imageMiB * 2 + 512) * 1024 ** 2);
});
test('interrupted DMG notarization saves and resumes the same submission without a second upload', async () => {
  const id = '74d2348b-dcd7-460f-a8a7-cd4175962223', calls = [], saved = [];
  const run = (_, args) => {
    calls.push(args);
    if (args[0] === 'notarytool' && args[1] === 'submit') return { stdout: JSON.stringify({ id, status: 'In Progress' }) };
    if (args[1] === 'wait') throw new Error('timeout');
    if (args[1] === 'info') return { stdout: JSON.stringify({ id, status: 'In Progress' }) };
    throw new Error('must not staple unfinished submission');
  };
  await assert.rejects(notarizeDiskImage('/tmp/app.dmg', '/tmp/receipt', { profile: 'example' }, run, async (_, body) => saved.push(JSON.parse(body))), /Resume submission/);
  assert.equal(calls.filter(a => a[1] === 'submit').length, 1);
  assert.equal(saved[0].id, id);
  assert.ok(saved.every(x => x.stapled === false));
});
