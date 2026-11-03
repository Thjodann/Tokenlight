import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createClaudeMaintenance } from '../src/claude-maintenance.mjs';
const tick = () => new Promise(r => setImmediate(r));
function harness(options = {}) {
  let record = { accessToken: 'fixture-old', expiresAt: 1, refreshToken: 'fixture-refresh' };
  const children = [], ownChildren = new Set();
  const maintain = createClaudeMaintenance({ binary: async () => '/fixture/claude', pollMs: 2, timeoutMs: 100, cooldownMs: 30,
    environment: { PATH: '/fixture/path', ANTHROPIC_API_KEY: 'fixture-api', CLAUDE_CODE_OAUTH_TOKEN: 'fixture-token', CLAUDE_CONFIG_DIR: '/fixture/profile', CLAUDE_CODE_USE_BEDROCK: '1', CLAUDECODE: '1', ELECTRON_RUN_AS_NODE: '1' },
    spawn: (binary, args, opts) => {
      const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stdin = new EventEmitter(); child.writes = [];
      child.stdin.write = value => child.writes.push(value); child.stdin.end = () => {};
      child.kill = signal => { child.signal = signal; child.emit('close', 0); };
      children.push({ child, binary, args, opts }); return child;
    }, ...options });
  return { maintain, children, ownChildren, load: async () => record, renew: () => { record = { accessToken: 'fixture-new', expiresAt: Date.now() + 3600000 }; } };
}

test('maintenance shares one official interactive startup and sends no prompt or credential', async () => {
  const h = harness(), options = { load: h.load, ownChildren: h.ownChildren, cwd: '/fixture/app-data' };
  const first = h.maintain(options), second = h.maintain(options); assert.equal(first, second);
  await tick(); assert.equal(h.children.length, 1); const c = h.children[0];
  assert.equal(c.binary, '/usr/bin/script'); assert.deepEqual(c.args.slice(0, 3), ['-q', '/dev/null', '/fixture/claude']);
  assert.equal(c.opts.cwd, '/fixture/app-data'); assert.equal(c.opts.stdio[0], 'ignore'); assert.equal(c.opts.env.BROWSER, '/usr/bin/false');
  for (const key of ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDECODE', 'ELECTRON_RUN_AS_NODE']) assert.equal(c.opts.env[key], undefined);
  assert.ok(c.args.includes('{"disableAllHooks":true}')); assert.ok(c.args.includes('{"mcpServers":{}}'));
  assert.equal(c.args.includes('-p'), false); assert.deepEqual(c.child.writes, []);
  c.child.stdout.emit('data', 'fixture-private-output'); h.renew();
  assert.equal((await first).renewed, true); assert.equal((await second).renewed, true);
  assert.equal(c.child.signal, 'SIGTERM'); assert.equal(h.ownChildren.size, 0);
});

test('failed renewal times out, cleans its process, and cannot spawn repeatedly during cooldown', async () => {
  let now = Date.now(); const h = harness({ timeoutMs: 10, now: () => now, cooldownMs: 60000 });
  const opts = { load: h.load, ownChildren: h.ownChildren };
  const result = await h.maintain(opts); assert.equal(result.renewed, false); assert.equal(result.retryAt, now + 60000);
  await h.maintain(opts); assert.equal(h.children.length, 1); assert.equal(h.ownChildren.size, 0);
  now += 60001; const retry = h.maintain(opts); await tick(); h.renew(); assert.equal((await retry).renewed, true); assert.equal(h.children.length, 2);
});

test('a CLI exit alone is not proof of renewal; a last-moment rotated credential is accepted', async () => {
  for (const rotated of [false, true]) {
    const h = harness(), pending = h.maintain({ load: h.load, ownChildren: h.ownChildren }); await tick();
    if (rotated) h.renew(); h.children[0].child.emit('close', 0);
    assert.equal((await pending).renewed, rotated); assert.equal(h.ownChildren.size, 0);
  }
});

test('missing CLI and private spawn errors are bounded and never expose raw output', async () => {
  const missing = harness({ binary: async () => null }); assert.equal((await missing.maintain({ load: missing.load })).unavailable, true); assert.equal(missing.children.length, 0);
  const h = harness(); const pending = h.maintain({ load: h.load, ownChildren: h.ownChildren }); await tick();
  h.children[0].child.emit('error', new Error('fixture-private-token'));
  const result = await pending; assert.equal(result.renewed, false); assert.ok(!JSON.stringify(result).includes('fixture-private-token')); assert.equal(h.ownChildren.size, 0);
});
