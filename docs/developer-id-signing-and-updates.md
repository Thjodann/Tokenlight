# Developer ID signing, notarization and updates

Research and local audit: 2026-11-02. Baseline: Tokenlight 0.6.5, commit 4588a8ca692b3cf7c68c58857b34a9941d96f79f. Research only; no certificate creation, account changes, software signing, submission, install or release in this pass.

## Setup implementation — 2026-11-03

The owner selected **Aurelius Games LLC**, team `4JP4HKB6SJ`. The Apple website confirmed active paid organization membership and Account Holder access. The owner issued a G2 Developer ID Application certificate using the Keychain-generated public CSR. Its public key matches that CSR, and importing the public certificate made the matching private-key signing identity available locally. No private key was exported and no Keychain access policy was changed. Earlier Xcode-disabled and missing-certificate observations are historical.

Verified identity: `Developer ID Application: Aurelius Games LLC (4JP4HKB6SJ)`, SHA-1 selector `D152C8089CE2E5C6E22505DA9F83C668F564B613`, expires **2027-12-03 17:46:31 UTC**. The owner saved the named `tokenlight-notary` profile, and authentication validated with Apple. Actual nested signing, notarization, staple validation, Gatekeeper assessment, a clean signed rebuild and all seven signed-app live reads passed. An isolated copy of the encrypted vault loaded without a warning. Applications installation migration and updater tests remain separate.

The builder now has two explicit modes:

- `npm run build` retains local ad hoc signing.
- `npm run build:release` requires a valid Developer ID Application identity for the selected team and a validated named notarytool Keychain profile. It signs the staged app with pinned `@electron/osx-sign` 2.7.2, verifies nested Mach-O code, submits to Apple, records the submission ID before waiting, retains the log, staples the accepted ticket, validates it and runs Gatekeeper assessment before creating the final ZIP. Failures never fall back to ad hoc signing.

One-time secure notarization setup, run by the owner in Terminal:

```sh
npm run notary:setup
```

The helper asks for the Apple Account email and Team ID, then lets Apple's own secure prompt collect the app-specific password and validate the local `tokenlight-notary` Keychain profile. It does not write the password to source, arguments, command history, reports or artifacts. Generate the app-specific password through [Apple Account](https://account.apple.com/); keep its creation and entry in the owner's hands.

Supply the following non-secret selectors at build time (the identity is the full certificate name or SHA-1 fingerprint; it is not a private key):

```sh
export TOKENLIGHT_SIGNING_IDENTITY='Developer ID Application: COMPANY (TEAM_ID)'
export TOKENLIGHT_TEAM_ID='TEAM_ID'
export TOKENLIGHT_NOTARY_PROFILE='tokenlight-notary'
npm run signing:check
npm run check
npm test
npm run build:release
npm run archive
```

Use a fresh `TOKENLIGHT_OUTPUT_DIR` for each attempt. Source manifests and the rebuild archive retain canonical input hashes; the external build receipt separately records `bundledCodexInputSha256`, shipped `bundledCodexSha256`, team, notarization result and verified code-object count. Signing affects the staged helper only. Rebuilding requires the same inputs and valid local signing credentials; timestamped signatures and notarization are not byte-reproducible.

If waiting times out, retain the output directory and inspect the recorded ID with `xcrun notarytool info ID --keychain-profile tokenlight-notary`; wait on that same ID rather than uploading again. If Apple accepted it, finish stapling/validation and final packaging under the existing delivery workflow. The builder refuses existing submission receipts, logs and archives before Keychain access or upload. If waiting returns an error, it queries that same submission once so a rejection can retain its diagnostic log. Do not replace the published 0.6.8 archives with this setup build.

The signing prerequisite is verified by two accepted notarizations and a clean archive rebuild with all 158 tests passing. Source identity: `ce079b4ae2243152576280377e0adb7108adefe82ff705b7409be34cc77ebf7f`. Evidence and current package links are in `.codex/output/developer-id-setup/FINAL-QA.md` and `delivery-receipt.json`. The original notarized ZIP launched independently, refreshed all seven integrations and rendered main/child Dashboard windows. The installed app and published release assets remain unchanged. Actual downloaded/quarantined installation, offline launch, normal-profile migration and the signed A-to-B updater test remain separate acceptance items.

## In-app updater implementation — 2026-11-03

Tokenlight 0.6.9 adds the built-in Electron `autoUpdater` without a new runtime dependency. Only packaged Developer ID release builds enable it; local ad hoc and development builds show the unavailable state. The feed is fixed in the main process to `https://update.electronjs.org/Thjodann/Tokenlight/darwin-arm64/APP_VERSION`. No renderer input, settings field or environment variable can redirect production updates. Provider keys, usage and account identifiers are not sent to the feed. Squirrel.Mac verifies incoming code signatures; release builds must continue using the stable bundle ID and intended Developer ID team.

Automatic downloads default on, check 30 seconds after startup and every six hours, and can be disabled in the Updates dialog. A manual check remains available. Concurrent checks coalesce while checking/downloading; a ready download is retained. Tokenlight never invokes installation on download completion. The app and menu-bar menus expose Check for Updates and Update Ready/Restart to Update. Restart requires a confirmation whose default is Later; settings writes finish before calling `quitAndInstall`. A downloaded update otherwise installs on the next launch. Popout content has no update indicator or controls. Native network/server errors are reduced to a safe retry message.

Verify with `npm run check` and `npm test`. The local fixture server `node scripts/verify-update.mjs APP_ZIP VERSION OUTPUT_DIR [PORT]` binds only 127.0.0.1 and serves the Squirrel response/ZIP. It is test tooling, not a production endpoint. Feed mode is controlled by OUTPUT_DIR/feed-mode.txt: update, none, offline, or bad (requires an intentionally invalid OUTPUT_DIR/bad.zip). Requests record path/method/time only. Use source copies for QA-only profile, bundle-ID, local feed and localhost ATS variations; never add those variations to a production build. Preserve actual notarization, native replacement and live connection evidence separately from unit tests.

The existing installed/public 0.6.8 has no updater. The first signed updater-enabled version requires a manual install. Publishing a verified newer release supplies updates; pushing source or publishing a draft alone does not. Keep published historical versions immutable. Signed A-to-B verification and the final evidence boundary are recorded in `.codex/output/in-app-updates/QA.md` when complete; no production-feed or installation acceptance is implied by this implementation description.

## Decision

Direct distribution is feasible. Retain Tokenlight's manual packaging and verified rebuild archive workflow, add an explicit Developer ID release mode using Electron's maintained signing/notarization libraries, then implement the built-in Electron updater. This is a recommendation, not an implemented pipeline. macOS automatic updates require a signed application. [Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater)

An active paid Apple Developer Program membership and the intended signing team are required; confirm those with the owner before setup. Developer ID Application is the certificate for applications distributed outside the Mac App Store. Developer ID Installer is for separately signing installer packages; this ZIP-distributed app does not currently need a PKG certificate. The development identity found locally is not the distribution identity. [Apple Developer ID certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)

## Verified local readiness

| Item | Observation | Implication |
| --- | --- | --- |
| Xcode | 26.6; notarytool and stapler resolve from selected Xcode | Required tools available |
| Signing identities | Outside-sandbox inspection finds one Apple Development identity; no valid Developer ID Application identity | Create or import the intended team's certificate with its private key |
| Installed bundle | com.jared.tokenlight; arm64; ad hoc; no TeamIdentifier; no hardened-runtime flag | Existing package is not a Developer ID release |
| Bundled Codex executable | Also ad hoc; no TeamIdentifier | Include explicitly in nested-code signing and validation |
| Build | scripts/build.mjs uses codesign --deep --sign - and ZIP packaging | Replace release-mode signing; retain deliberate local ad-hoc mode |
| Updater | No autoUpdater integration or updater dependency; no .github workflow | Signing alone cannot enable updates |
| Credentials | App uses Electron safeStorage for its local encrypted vault | Exercise existing-profile access across signing migration |

The sandbox initially reported zero identities; an approved read-only inspection outside it found the development identity. That observation does not establish the absence of certificates on Apple's portal, another Mac or another keychain. No key material was exported. Account membership/team are human-confirmed; portal agreement status, certificate quota and notarization credentials remain unverified.

## One-time owner setup

1. In Xcode, open Settings > Accounts, select the paid personal team, then Manage Certificates > + > Developer ID Application. Confirm the intended team. Import an existing identity only if its matching private key is available. Preserve other apps' certificates. [Apple Xcode certificate management](https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html)
2. When an intermediary is offered, use Developer ID G2. Apple's October 2026 notice says the original Sub-CA expires February 1, 2027; currently issued Developer ID certificates expire annually. Track renewal separately from membership. Securely timestamped, previously signed and notarized Mac apps continue working; future updates need a valid signing certificate. [Apple certificate transition](https://developer.apple.com/news/?id=w4atic4c)
3. Configure notarization authentication separately. For local operation, use an Apple Account app-specific password plus Team ID in a named notarytool Keychain profile. Enter the password through its secure prompt, not chat or command history. For later CI, an App Store Connect API key is an alternative. Certificate/private-key possession and notarization authentication are different requirements. [Apple notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow), [Electron notarize authentication](https://github.com/electron/notarize)

Installed notarytool help confirms store-credentials can prompt securely, validates by default, and supports API Key ID plus private-key path. Team API keys use an Issuer ID; Individual API keys omit it. Check the selected library/Xcode version before choosing that route. Credential creation, authorization and legal/account prompts remain human steps; none were performed here.

## Release pipeline to implement

Proposed stages:

1. Run source checks/tests and create a fresh staged bundle from frozen source. Retain the input manifest and rebuild scaffold.
2. Sign all staged executable code inside out: bundled Codex helper, Electron frameworks/helpers, then main app. Use explicit Developer ID identity, secure timestamp and Hardened Runtime. Use @electron/osx-sign rather than relying on a blanket --deep signing command. Entitlements must match the pinned Electron runtime and each executable's needs. Do not apply App Sandbox entitlements from MAS tutorials to this direct-distribution app. [Electron osx-sign](https://github.com/electron/osx-sign), [Apple distribution preparation](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution)
3. Verify nested signatures, runtime flags, team and entitlements. Submit a temporary ZIP with notarytool (or @electron/notarize), wait for Accepted, retain the submission ID and log, and stop on rejection. Staple the accepted ticket to the app, validate it, then create the final distributable ZIP from that stapled app. A ZIP itself is not the stapling target. [Apple notarization customization](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow), [Electron notarize](https://github.com/electron/notarize)
4. Perform Gatekeeper assessment and a real downloaded/quarantined installation test. A successful codesign check alone is insufficient. Test offline launch with the staple, the bundled helper and all seven integrations under the hardened build. [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
5. Compute final package hashes after signing/stapling, retain receipts, and publish only through the existing approved release workflow. Developer ID release mode must fail if identity, signing, notarization or validation is missing; never silently fall back to ad hoc.

Tokenlight-specific provenance correction: today the source manifest includes vendor/codex before final bundle signing. Developer ID signing changes executable bytes. Keep the canonical vendored input unchanged, sign its staged copy, and record both the input hash and shipped helper hash. Keep signing evidence outside the sealed app where possible. A clean rebuild must reproduce source identity and pass validation; timestamped signatures/notarization do not imply byte-identical ZIPs. This is an inference from the current build script, not a verified new implementation.

## In-app update route

Recommend Electron's built-in autoUpdater with the public update.electronjs.org service. Tokenlight already has a public GitHub repository and release assets. The service selects macOS ZIPs using -mac, -darwin or -osx and -arm64 for Apple silicon. The existing Tokenlight-0.6.5-mac-arm64.zip naming qualifies; the rebuild ZIP has no platform identifier and must remain excluded. Verify asset selection against each future release. [Electron update service requirements and naming](https://github.com/electron/update.electronjs.org#asset-naming-convention)

Proposed feed shape: https://update.electronjs.org/Thjodann/Tokenlight/darwin-arm64/VERSION. Use HTTPS and the running app's actual version. A published compatible release, rather than an ordinary source push, supplies an update. Keep the signing identity/team and bundle ID stable, verify incoming signatures, and never embed a GitHub token in a public client. [Electron updating applications](https://www.electronjs.org/docs/latest/tutorial/updates), [Squirrel.Mac](https://github.com/Squirrel/Squirrel.Mac#code-signing)

A small shared main-process updater module is preferable here to a build-system migration. The maintained update-electron-app wrapper is an alternative, but the current manual builder copies src and a reduced package.json, not production node_modules; adding that wrapper would also require bundling its runtime dependencies. Direct built-in autoUpdater avoids that packaging change. [update-electron-app](https://github.com/electron/update-electron-app)

Proposed user experience: Check for Updates in the application/status menu, clear current/checking/available/downloading/error states, and an explicit Restart to Update choice. Preserve Dashboard windows until restart is accepted. Test the tray lifecycle, child-process shutdown and manual-only kiosk closing against quitAndInstall. Background-check preference and download policy should be settled during implementation. Update checks send normal connection metadata and app version to the feed; provider credentials/usage must never enter that request.

Bootstrap: 0.6.5 contains no updater, so users must manually install the first signed updater-enabled version once. Then prove an actual signed version A to higher signed version B download, restart and replacement. Do not replace published 0.6.5 assets or move its tag to retrofit signing.

## Acceptance matrix

| Evidence | Required before calling it ready |
| --- | --- |
| Identity | Developer ID Application + matching private key for intended team; expiry recorded |
| Signing | Main, all helpers/frameworks and Codex verify; runtime/timestamp and per-file entitlements checked |
| Notarization | Accepted submission, retained log/ID, staple validates, Gatekeeper passes |
| Migration | Manual 0.6.5 to first signed app preserves settings and encrypted credentials, or gives a recoverable reauthorization path |
| Runtime | Tray/Dashboard behavior, all seven live reads, official Claude login and bundled Codex launch pass |
| Updates | Signed A to B succeeds; bad signature, offline/network interruption, no-update and postponed restart behave safely |
| Release | Correct architecture/source, update asset selection and remote hashes verified before publication |

No signing, Gatekeeper, notarization, credential migration or installed updater acceptance is claimed from this research.

## Reuse for future apps

Reuse the paid team, Developer ID identity and notary profile across eligible apps owned by that developer; each app keeps its own stable bundle ID, entitlement set, version, artifacts and update feed. Reassess native helpers and restricted capabilities per app. Signing/notarization do not require adopting the Mac App Store sandbox, so this route avoids making sandbox-compatible replacements for Tokenlight's account integrations a prerequisite. [Apple Developer ID](https://developer.apple.com/developer-id/)

Start with local signing on this Mac. If CI is later approved, use restricted release jobs with an ephemeral keychain, protected certificate/private-key and notary credentials, and cleanup after the job; never ship or include them in the source archive. [GitHub macOS certificate installation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/deployments/deploy-to-third-party-platforms/installing-an-apple-certificate-on-macos-runners-for-xcode-development)

Keep reusable mechanics separate from app configuration: preflight, staged signing, notarization, stapling, verification and receipts can be shared; provider paths, entitlements and IDs belong to each repository. After the first successful signed build and A-to-B update test, capture the observed workflow in the cross-project Electron delivery/release skills. This report is the reusable preparation; implementation and validation remain the next phase.
