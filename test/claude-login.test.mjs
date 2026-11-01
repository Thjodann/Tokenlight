import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import login from '../src/claude-login.cjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(options = {}) {
  const states = [], children = [], ownChildren = new Set(); let successful = 0;
  const controller = login.createClaudeLogin({ environment: { PATH: 'fixture-path', ELECTRON_RUN_AS_NODE: '1', ANTHROPIC_API_KEY: 'fixture-api', ANTHROPIC_AUTH_TOKEN: 'fixture-auth', CLAUDE_CODE_OAUTH_TOKEN: 'fixture-oauth', CLAUDE_CONFIG_DIR: 'fixture-profile' }, cwd: '/fixture/user-data',
    spawn: (binary, args, opts) => { const child = new EventEmitter(); child.stdout = new EventEmitter(); child.kill = () => child.emit('exit', null); children.push({ child, binary, args, opts }); return child; },
    onState: state => states.push(state), onSuccess: async () => { successful++; }, ownChildren, ...options });
  return { controller, states, children, ownChildren, success: () => successful };
}

test('sign-in owns one official CLI process and automatically syncs after completion', async () => {
  const h = harness(); h.controller.start('/fixture/claude'); h.controller.start('/fixture/claude');
  assert.equal(h.children.length, 1);
  const { child, args, opts } = h.children[0];
  assert.deepEqual(args, ['auth', 'login', '--claudeai']);
  assert.equal(opts.env.BROWSER, '/usr/bin/open'); assert.equal(opts.env.PATH, 'fixture-path');
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CONFIG_DIR']) assert.equal(opts.env[key], undefined);
  child.stdout.emit('data', 'fixture-private-oauth-output');
  child.emit('exit', 0); await tick();
  assert.equal(h.success(), 1); assert.equal(h.states.at(-1).pending, false); assert.equal(h.ownChildren.size, 0);
  assert.ok(!JSON.stringify(h.states).includes('fixture-private-oauth-output'));
});

test('failed startup and cancelled sign-in clear pending state without exposing process output', async () => {
  const h = harness(); h.controller.start('/fixture/claude');
  h.children[0].child.emit('error', new Error('private token text')); await tick();
  assert.equal(h.states.at(-1).error, true); assert.equal(h.ownChildren.size, 0);
  h.controller.start('/fixture/claude'); h.children[1].child.emit('exit', 1); await tick();
  assert.equal(h.children.length, 2); assert.equal(h.states.at(-1).pending, false); assert.equal(h.success(), 0);
  assert.ok(!JSON.stringify(h.states).includes('private token text'));
});

test('timeout clears the orphan process and allows retry', async () => {
  const h = harness({ timeoutMs: 10 }); h.controller.start('/fixture/claude');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.match(h.states.at(-1).message, /timed out/); assert.equal(h.ownChildren.size, 0);
  h.controller.start('/fixture/claude'); assert.equal(h.children.length, 2); h.children[1].child.emit('exit', 1);
});

test('a failed post-login usage check is reported without falsely confirming sync', async () => {
  const h = harness({ onSuccess: async () => { throw new Error('private refresh error'); } });
  h.controller.start('/fixture/claude'); h.children[0].child.emit('exit', 0); await tick();
  assert.equal(h.states.at(-1).error, true); assert.match(h.states.at(-1).message, /usage could not refresh/);
  assert.ok(!JSON.stringify(h.states).includes('private refresh error'));
});
