# Devin Pro and Fusion metrics feasibility

Researched 2026-11-02 (America/Los_Angeles). Scope: Cognition Devin Pro, for a possible eighth Tokenlight integration. Documentation research only; no credentials, sign-in, inference, account changes, or installed-app changes.

## Final decision after the prototype

Production integration is deferred. The current allowance-only payoff does not justify fragile terminal automation and its maintenance. Keep the prototype; reconsider when Devin provides a stable structured Pro API/CLI/export, or substantially greater daily use makes the feature worthwhile. No production adapter or eighth card is implemented or approved by this deferral.

## Finding

Devin exposes useful Pro metrics in its authenticated products. A supported unattended Pro integration is **not established**: no documented public Pro quota/balance endpoint, third-party usage OAuth scope, or structured quota export was found. This is an evidence boundary, not proof that no private endpoint exists.

## Official signed-in routes

| Metric | Documented route | Tokenlight implication |
| --- | --- | --- |
| Daily/weekly quota and purchased on-demand usage | Pro allowances are shared across Cloud, CLI and Desktop. [Self-serve plans](https://docs.devin.ai/admin/billing/self-serve) | Show provider-reported windows separately from monthly activity. A quota percentage cannot establish token counts. |
| Plan and account usage | Desktop status widget → Plan Info; account Settings usage/plans. [Plans and Usage](https://docs.devin.ai/desktop/accounts/usage) | Confirms a human-visible source; does not establish an API or export contract. |
| Quota remaining and overage balance | Signed-in CLI `/usage` supports quota-billing accounts, explicitly documented in its May 1 release fix. [CLI changelog](https://docs.devin.ai/cli/changelog/stable) | A candidate for a bounded read-only CLI investigation; parsing terminal presentation would remain fragile. |
| Fusion tokens, model costs and estimated savings | `/session-stats` or `/stats`; lead and sidekick draw quota at their own rates. [Fusion CLI](https://docs.devin.ai/cli/fusion) | Session data must preserve both model roles and distinguish estimated value from paid charges. |

`devin auth login` is the official CLI login. Session statistics reflect server-supplied dimensions and cumulative resumed-session totals. The selected model may differ from the served model. The reference documents ATIF conversation export and some JSON commands, but does not establish a complete Pro quota/Fusion metrics export schema. [Commands and Flags](https://docs.devin.ai/cli/reference/commands)

## Documented APIs and restrictions

The Desktop API overview explicitly limits access to Enterprise. Pro sign-in does not establish eligibility. [API overview](https://docs.devin.ai/desktop/accounts/api-reference/api-introduction)

`GET https://server.codeium.com/api/v2alpha/analytics/consumption` accepts `start_date`, `end_date` (inclusive, maximum 90 days) and `product=agent`. Authentication uses a Devin service-user Bearer key with **Use Local Analytics API**, or a legacy Windsurf service key with **Analytics Read**. It is hourly aggregated and limited to ten report queries per hour per team.

Billing strategy controls fields: `ACU` supplies `billed_acus`; `CREDITS` supplies `prompt_credits`/`flex_credits`; selected teams with granular token billing use `DOLLARS` and `tokens.input_tokens`, `cache_read_tokens`, `cache_write_tokens`, `output_tokens`. Windsurf-key requests do not receive the token object. Grouping can expose model/session data, but prose includes session while the rendered parameter list omits it; verify that detail before implementation. None of this establishes Pro eligibility. [Get Consumption](https://docs.devin.ai/desktop/accounts/api-reference/get-consumption)

The alternative Cloud route, `GET https://api.devin.ai/v3/enterprise/consumption/daily/users/{user_id}`, is also Enterprise-only and reports ACUs rather than raw tokens; self-serve accounts receive 403. [Daily user consumption](https://docs.devin.ai/api-reference/v3/consumption/consumption-daily-users)

## Initial research recommendation (superseded by final decision)

Before building a card, run a separately authorized, read-only investigation of the official installed CLI and existing signed-in account: verify the actual Pro `/usage` and Fusion `/session-stats` fields, then determine whether an official local export supplies both lead and sidekick data without starting a model request. Ask Cognition which supported read-only interface is available to Pro integrations if documentation remains insufficient. This report does not authorize contacting support.

If viable, present current daily/weekly allowance, reset times and extra-usage balance first; show monthly tokens/model activity only when measured records support them. Label local/session-only coverage and deduplicate cumulative resumed totals. Do not infer tokens from allowance percentages, or label model-value estimates as charges.

Do not promise reliable background syncing from browser sign-in alone. Undocumented session endpoints and third-party reverse-engineered agent clients are not evidence of supported API access. The unrelated FusionCode product is outside this investigation.

## Verification boundary

Primary documentation and Context7's official Devin documentation index were reviewed, with an independent research pass. No live Pro endpoint, account balance, export completeness, lead/sidekick split, session renewal, or unattended polling was tested. No code change or build/test run was needed for this research deliverable.

## Authorized local prototype — 2026-11-02

The follow-up prototype successfully read the account's current allowance through the official bundled CLI. **An experimental allowance adapter is feasible; a complete monthly Fusion metrics integration is not yet justified.**

Observed environment:

- Devin Desktop 3.11.238, bundled CLI 3000.11.238 (9e593c73d4ca), under `Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin`; not on the shell PATH.
- `devin auth status` recognized the existing Devin Pro sign-in. No browser login or manually supplied credential was required. The initial sandboxed check failed because normal CLI log writes were prohibited; the normal-access retry succeeded.
- An isolated, empty-workspace probe used `--config` with empty hooks and `--respect-workspace-trust false`. No model prompt was sent. Only `/usage` and `/session-stats` were submitted.
- Native `/usage` returned current daily/weekly utilization and reset times. Consistent readings were observed after a separate CLI launch and on a repeated command. The CLI explicitly reported no quota consumed in the probe session. Account-specific values remain only in local evidence.
- `/session-stats` on the empty probe reported no completed turns. This confirms command execution, not Fusion token completeness. Extra-usage balance was absent and remains unknown; it must not become zero.

The retained probe uses a pseudo-terminal because no structured `/usage` output option is available in the inspected help. Terminal device-attribute/cursor queries must be answered, and startup/command readiness matters. The first simplistic attempt failed to return command results; the corrected terminal handshake worked. This is a meaningful maintenance tradeoff, not a supported Pro usage API.

Read-only local activity inspection found numeric generation metrics with exact duplicate records and no verified lead/sidekick split in the sample. Fields include input/output/cache-read metrics, with cache-creation metrics absent. Session-level credit/ACU values of zero do not establish actual subscription charges. Account-specific record counts and model activity remain only in local evidence.

A local ATIF transcript contained substantially fewer measured generation steps than the database's available activity. Neither file is therefore established as a complete monthly account history. No conversation text, credentials, account IDs or session titles were copied into the retained evidence.

Evidence: `.codex/output/devin-feasibility/probe-cli.py`, sanitized `usage.json`, `usage-repeat.json`, and `snapshot.json`. Snapshot fields for balance, monthly tokens and Fusion breakdown are explicitly null. Task-owned CLI processes were stopped; existing user sessions were not resumed or deleted. The CLI's ordinary logs/cache and empty-session lifecycle may be updated by running it.

Possible design if the deferred integration is reconsidered: begin with an opt-in **experimental Devin allowance connection** after reassessing value and reliability. Run the official CLI using its existing credentials; fail closed on unfamiliar output, retain the last successful reading with a stale timestamp, and never convert a failed read into zero. Bound process lifetime and refresh frequency, disable user hooks for the probe, keep tokens/credentials out of Tokenlight, and test a parser against captured numeric-only fixtures. Leave balance and monthly activity unreported until verified. Full Fusion activity requires a representative measured Fusion session and a reliable export/deduplication contract.

Verification limits: short repeated reads and CLI process restart succeeded. Expired-login recovery, network-failure behavior, long-running refresh, app upgrades, a nonzero purchased balance, and full Fusion session coverage remain untested. This prototype did not add a card, change Tokenlight source, restart the installed app, or publish anything.
