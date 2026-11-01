# Tokenlight

A personal macOS app for viewing OpenAI/Codex, Anthropic/Claude Code, Cursor and ElevenLabs usage. Source and scaffold are retained until human acceptance.

## Rebuild

Requires macOS on Apple silicon, Node 24 or later, npm, and the standard macOS command-line build tools. Extract the rebuild archive into a local, non-synced folder before building. Runtime does not need Node/npm or a development server.

```
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
```

The build uses the pinned Electron and icon-renderer versions in package-lock.json and invokes the installed Electron package’s idempotent runtime installer. A fresh npm ci is sufficient; no prior Electron launch or separate manual download is required. A Codex native helper and its receipt live in vendor/; the build discovers the local official Codex CLI only when that helper has not yet been prepared. Source archives retain the helper so later rebuilds do not depend on the installed Codex version.

## Run

```
npm start
```

The native app defaults to ~/secrets.env when it exists. Choose another file in Connections, or save individual keys with macOS secure storage. No secret values are copied from a secrets file into the app’s configuration or build. Supported names: OPENAI_ADMIN_KEY (or OPENAI_ADMIN_API_KEY or OPEN_AI_ADMIN_KEY), ANTHROPIC_ADMIN_KEY (or ANTHROPIC_ADMIN_API_KEY), ELEVENLABS_API_KEY. Ordinary API keys are detected as fallback credentials but may lack usage permissions.

Codex uses its account RPC read methods. Cursor reads the local desktop session in memory and retrieves account-wide dashboard usage; this personal interface is not the public team API. Claude Code requires a real subscription login; Connect reads its local session. Where available, Claude tokens come from local Code logs and exclude other devices and remote sessions. Account allowance windows are reported separately. No adapter creates model requests or changes billing settings.

For an isolated sample-data preview, use TOKENLIGHT_PROFILE=/absolute/owned/test-directory TOKENLIGHT_DEMO=1 npm start. The sample banner remains visible and live provider reads are disabled. Sample data is not live integration evidence.

## Evidence and permissions

Project evidence lives in .codex/output/. Live probes save shapes and status codes only, excluding raw responses, credentials and account identifiers. QA uses task-owned data directories. Personal client sessions and shared settings are read, never rewritten by the monitor.

Initial and final QA passes, human testing, independent review, TLC and acceptance are distinct stages. Do not remove sources or evidence before acceptance. Do not publish this personal build or add hosted authentication without reviewing provider requirements.

## Appearance and compact layouts

Choose Auto, Dark, or Light from the toolbar or View → Appearance. Auto follows macOS appearance without changing the system setting. The choice persists across launches. The layout supports narrow portrait and short landscape windows, with independent scrolling inside source-detail sheets. The minimum window size is 320×320; this is still a macOS app, not an iOS or Android build.

For repeatable isolated layout checks, combine a task-owned TOKENLIGHT_PROFILE with TOKENLIGHT_DEMO=1 and TOKENLIGHT_WINDOW_SIZE=390x740 or 740x390. No layout override changes the default user profile.


## Restored development repository

This repository restores the verified Tokenlight 0.2.0 source. The bundled Codex helper is stored with Git LFS. Install Git LFS and run `git lfs pull` after cloning before building. Use the pinned dependencies and build commands above. Personal credentials, app data, generated builds and the local Beads database are excluded from Git.

Mac App Store feasibility is tracked locally in Beads as `tokenlight-fua`. All six integrations are required; the investigation must establish provider-approved access and Apple App Sandbox compatibility before proposing release changes.
