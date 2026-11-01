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
