import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cursorStoragePassword } from '../src/cursor-storage.mjs';

const absent = () => Object.assign(new Error('Keychain item not found'), { code: 44 });

test('Cursor reads the current Cursor Key account when the legacy account is absent', async () => {
  const accounts = [];
  const password = await cursorStoragePassword(async (binary, args, options) => {
    assert.equal(binary, '/usr/bin/security');
    assert.equal(args[args.indexOf('-s') + 1], 'Cursor Safe Storage');
    assert.equal(options.timeout, 15000);
    const account = args[args.indexOf('-a') + 1]; accounts.push(account);
    if (account === 'Cursor') throw absent();
    assert.equal(account, 'Cursor Key');
    return { stdout: 'fixture-password\n' };
  });
  assert.equal(password, 'fixture-password');
  assert.deepEqual(accounts, ['Cursor', 'Cursor Key']);
});

test('a valid legacy Cursor account needs no additional Keychain read', async () => {
  let calls = 0;
  assert.equal(await cursorStoragePassword(async () => { calls++; return { stdout: 'fixture-legacy\n' }; }), 'fixture-legacy');
  assert.equal(calls, 1);
});

test('Keychain denial is preserved without trying a different account', async () => {
  const denied = Object.assign(new Error('Access denied'), { code: 36 }); let calls = 0;
  await assert.rejects(cursorStoragePassword(async () => { calls++; throw denied; }), error => error === denied);
  assert.equal(calls, 1);
});

test('a missing current account fails after only the two known account names', async () => {
  const accounts = [];
  await assert.rejects(cursorStoragePassword(async (_, args) => { accounts.push(args[args.indexOf('-a') + 1]); throw absent(); }), error => error.code === 44);
  assert.deepEqual(accounts, ['Cursor', 'Cursor Key']);
});
