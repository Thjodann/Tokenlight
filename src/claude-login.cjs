function loginEnvironment(environment) {
  const env = { ...environment, BROWSER: '/usr/bin/open' };
  for (const key of Object.keys(env)) if (key.startsWith('ELECTRON_') || key.startsWith('ANTHROPIC_') || key.startsWith('CLAUDE_') || key === 'CLAUDECODE') delete env[key];
  return env;
}
function createClaudeLogin({ spawn, onState, onSuccess, ownChildren, environment, cwd, timeoutMs = 180000 }) {
  let active = null;
  const pending = 'Finish Claude Code sign-in in your browser. Tokenlight will reconnect automatically.';
  return {
    start(binary) {
      if (active) return pending;
      const child = spawn(binary, ['auth', 'login', '--claudeai'], { cwd, env: loginEnvironment(environment), stdio: ['ignore', 'pipe', 'ignore'] });
      active = child; ownChildren.add(child);
      let settled = false;
      onState({ pending: true, message: pending });
      const finish = async (ok, message) => {
        if (settled) return;
        settled = true; clearTimeout(timer); ownChildren.delete(child);
        if (ok) {
          try { await onSuccess(); onState({ pending: false, message: 'Claude Code sign-in completed. Usage checked again.' }); }
          catch { onState({ pending: false, error: true, message: 'Sign-in completed, but usage could not refresh. Choose Connect to try again.' }); }
        } else onState({ pending: false, error: true, message });
        if (active === child) active = null;
      };
      const timer = setTimeout(() => { void finish(false, 'Claude Code sign-in timed out. Choose Sign in to try again.'); child.kill('SIGTERM'); }, timeoutMs);
      timer.unref?.();
      // Drain without retaining or interpreting private OAuth URLs or codes.
      child.stdout.on('data', () => {});
      child.once('error', () => { void finish(false, 'Claude Code could not start. Check its installation, then try Sign in again.'); });
      child.once('exit', code => { void finish(code === 0, 'Claude Code sign-in did not finish. Choose Sign in to try again.'); });
      return pending;
    }
  };
}
module.exports = { loginEnvironment, createClaudeLogin };
