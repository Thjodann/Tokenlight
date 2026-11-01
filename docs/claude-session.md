# Claude Code session recovery (0.5.3)

Tokenlight uses the default Claude Code subscription profile. It reads current credentials on each request, with permission for Keychain access. A valid fallback at `~/.claude/.credentials.json` can replace an expired Keychain record. Tokenlight never stores access or refresh tokens in its cache, settings, exports, or build artifacts.

After a rejected request, Tokenlight rereads the credential stores and retries once only when a different valid credential is available. Network failures and rate limits are not retried this way. It checks again when the window gains focus or the Mac wakes (once per minute at most, respecting rate-limit backoff), and an expired credential timestamp makes the next scheduled reading due even when the usage cache is recent.

If Claude has not renewed its login, source details provide **Sign in to Claude Code**. This launches the installed official CLI with `auth login --claudeai`, keeps one login process, uses the CLI’s own browser flow with an explicit macOS browser opener, and refreshes usage after completion. The CLI runs in the app data directory with API/auth override variables removed and the default profile selected. The user reviews authorization on Claude’s own page. Tokenlight does not parse or recreate its OAuth links. Raw CLI output, OAuth state, codes, and secrets are never displayed or persisted. Failure/cancellation/timeout clears the pending UI with a useful message.

Anthropic controls expiry and revocation. This repair prevents stale credential selection and missed renewal, but cannot make a provider login permanent. Claude Code 2.1.153 reported `loggedIn: true` from `claude auth status` while its access token was expired, so that command is not treated as live verification or a guaranteed refresh. Tokenlight does not perform a private refresh-token exchange or spend inference tokens to renew a session.

References: [Claude authentication](https://code.claude.com/docs/en/authentication), [CLI reference](https://code.claude.com/docs/en/cli-reference).

Verification: credential-selection/rotation/error regression tests, actual service focus/backoff tests, CLI lifecycle tests and an actual packaged browser sign-in, and a fresh live usage read. The installed-app verification report records the final seven-source sync separately.
