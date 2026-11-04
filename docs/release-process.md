# Local build and review

1. Run `npm ci --no-audit --no-fund` with Node 24 or newer on Apple silicon macOS. Dependencies are pinned in package-lock.json.
2. Run `npm run check` and `npm test`.
3. Run `npm run build`. The script uses Electron's documented manual app layout, generates a deterministic icon, bundles the standalone Codex helper, writes a source receipt and signs only the task-owned app with an ad hoc identity.
4. Inspect `.codex/output/latest-build.json` for the exact appPath, artifactPath, sourceId and hashes. Signing happens in a task-owned temporary directory to avoid metadata being added by synced folders. A zip containing the single app is retained under a timestamped `.codex/output/builds/` directory. Original installed apps and source directories are preserved.
5. Launch that exact app with an isolated `TOKENLIGHT_PROFILE=/absolute/task-owned/directory`. Use `TOKENLIGHT_DEMO=1` for clearly marked sample data; this skips live reads. Use normal native controls to verify the packaged renderer, navigation, settings, targets and recovery. Reading screenshots/source is not interaction acceptance.
6. Verify the helper from `Contents/Resources/vendor/codex --version` and `codesign --verify --deep --strict /absolute/Tokenlight.app`. A copied helper originally signed as part of another bundle is re-signed only in vendor/ when its relocated signature fails.
7. Run the approved TLC and QA Workshop stages, verify eligible repairs, rebuild affected packages and retain raw reports. Live provider proof is a separate acceptance layer from sample-data UI testing. Never count missing credentials as successful live integration.
8. Run `npm run archive` after the source matches the latest build. It refuses a changed source baseline and copies an allowlist into a self-contained source archive. User data, secrets files, credentials, caches, build directories and personal client data are excluded.
9. Verify a clean rebuild from the extracted archive before final handoff. Keep exact package identity in the report. Copy the vetted app and its receipt into the chat's outputs directory for human testing.
10. Stop for Jared's testing and feedback. Then perform the independent Fresh Eyes review, second TLC, single-agent QA and final package verification. Create the reusable app-delivery skill from actual evidence. Wait for explicit acceptance and a concrete cleanup scope before removing the scaffold.

This process produces a local personal build. It does not notarize, publish, use an Apple signing account, create remote repositories or change provider billing. Any later public release needs its own authorized release workflow.


## Developer ID release setup

For direct distribution, use the explicit `npm run build:release` mode after source checks and tests. It requires `TOKENLIGHT_SIGNING_IDENTITY`, `TOKENLIGHT_TEAM_ID` and `TOKENLIGHT_NOTARY_PROFILE`; missing identity, notarization or validation fails the build. `npm run signing:check` validates those selectors and the named Keychain profile without exposing credentials. `npm run notary:setup` is a human-run secure Terminal setup helper.

The release path signs staged nested code, verifies Developer ID/team/runtime/timestamps, submits to Apple's notary service, records the submission ID and log, staples and validates the accepted ticket, and assesses Gatekeeper before creating the final ZIP. The external build receipt records both canonical input and shipped Codex hashes. Keep source identity separate from signed executable bytes. See [signing setup and remaining acceptance](developer-id-signing-and-updates.md).

This command uploads the staged app to Apple for notarization. It does not install the app, publish a GitHub release, replace existing release assets or implement in-app updates. Those actions require their corresponding authorized workflow.


## Verified local Developer ID configuration — 2026-11-03

Team: Aurelius Games LLC (`4JP4HKB6SJ`). Identity selector: `D152C8089CE2E5C6E22505DA9F83C668F564B613`. Notary profile: `tokenlight-notary`. Certificate expiry: 2027-12-03 17:46:31 UTC. These are non-secret selectors; credentials remain in Keychain. `npm run build:release` passed actual signing, Apple acceptance, staple and Gatekeeper checks, including a fresh dependency install/rebuild from the exact retained source archive. Use fresh output paths and the existing documented selectors for each release. Preserve canonical helper input bytes and record shipped signed bytes separately.

The 0.6.8 signing review package is local evidence only. Do not overwrite published 0.6.8 assets. Add the updater and test manual bootstrap, downloaded/quarantined/offline launch and signed A-to-B replacement before claiming in-app updating is ready.

## In-app updates (0.6.9 onward)

Use `npm run build:release` for distributed updates. Its reduced packaged package.json enables the built-in updater only after the mandatory signing/notarization pipeline succeeds. Preserve bundle ID `com.jared.tokenlight`, architecture, signing team and monotonically increasing versions. Publish the notarized `-mac-arm64.zip` app artifact; keep rebuild ZIP names free of platform markers so the update service cannot mistake them for apps. Confirm the public update service selects the intended signed asset after release publication. Never retrofit historical assets/tags to enable updates.

The first updater-enabled signed app needs one manual install. Before calling the feature ready, prove signed A-to-B download, deferred restart and replacement with an isolated profile; compare settings and encrypted-vault hashes and verify all seven live reads after launch. Exercise no-update, offline and bad-package paths. Local feed fixtures must use a separate QA bundle ID/profile and localhost-only test configuration, not production feed overrides. The actual GitHub-feed selection and Applications installation remain distinct checks.
