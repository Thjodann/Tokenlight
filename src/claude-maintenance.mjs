import { spawn as spawnProcess } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import login from './claude-login.cjs';

async function findBinary() {
  for (const file of ['/opt/homebrew/bin/claude', '/usr/local/bin/claude', join(homedir(), '.local/bin/claude')]) {
    try { await access(file, constants.X_OK); return file; } catch {}
  }
  return null;
}

// Claude's interactive startup owns refresh-token rotation and Keychain writes.
// No prompt/input, hooks, tools, MCP servers or browser authorization are sent.
export function createClaudeMaintenance({ spawn = spawnProcess, binary = findBinary, environment = process.env,
  now = Date.now, timeoutMs = 20000, pollMs = 500, cooldownMs = 60000 } = {}) {
  let pending = null, retryAt = 0;
  return function maintain({ load, cwd = homedir(), ownChildren = new Set() }) {
    if (pending) return pending;
    if (now() < retryAt) return Promise.resolve({ renewed: false, retryAt });
    pending = (async () => {
      const before = await load(), executable = await binary();
      if (!executable) return { renewed: false, unavailable: true };
      const env = { ...login.loginEnvironment(environment), BROWSER: '/usr/bin/false',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1', TERM: 'xterm-256color' };
      return new Promise(resolve => {
        let child, timer, poll, killTimer, settled = false, checking = false, closed = false;
        const finish = renewed => {
          if (settled) return;
          settled = true; clearTimeout(timer); clearTimeout(poll);
          retryAt = renewed ? 0 : now() + cooldownMs;
          if (child && !closed) {
            child.stdin?.end();
            // script forwards termination to its terminal child; escalate only
            // this still-owned wrapper if shutdown stalls.
            killTimer = setTimeout(() => { child.kill('SIGKILL'); }, 2000); killTimer.unref?.();
            child.kill('SIGTERM');
          }
          resolve({ renewed, retryAt: renewed ? null : retryAt });
        };
        const check = async () => {
          if (settled || checking) return;
          checking = true;
          try {
            const record = await load();
            if (record?.accessToken && record.accessToken !== before?.accessToken && (!record.expiresAt || Number(record.expiresAt) > now())) { finish(true); return; }
          } catch { /* A temporarily locked store must not become a sign-in error. */ }
          finally { checking = false; }
          if (!settled) poll = setTimeout(check, pollMs);
        };
        try {
          // macOS script supplies the TTY required for interactive startup.
          // stdin must be /dev/null: Node sockets fail script’s tcgetattr.
          // The output /dev/null prevents a terminal transcript.
          child = spawn('/usr/bin/script', ['-q', '/dev/null', executable, '--setting-sources', '',
            '--settings', '{"disableAllHooks":true}', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--tools', ''],
          { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
          ownChildren.add(child);
          child.stdout.on('data', () => {});

          child.once('error', () => { ownChildren.delete(child); finish(false); });
          child.once('close', async () => {
            closed = true; ownChildren.delete(child); clearTimeout(killTimer);
            if (settled) return;
            try { const record = await load(); finish(!!record?.accessToken && record.accessToken !== before?.accessToken && (!record.expiresAt || Number(record.expiresAt) > now())); }
            catch { finish(false); }
          });
          timer = setTimeout(() => finish(false), timeoutMs);
          void check();
        } catch { finish(false); }
      });
    })().finally(() => { pending = null; });
    return pending;
  };
}
export const maintainClaudeSession = createClaudeMaintenance();
