# Tokenlight DMG installer

The DMG is the manual installer. The existing signed ZIP remains the native updater payload. Both contain the same app; creating a DMG does not install Tokenlight, change its settings, or publish a release.

## Review the artwork and mounted layout

Run from the repository on macOS with Finder available:

```sh
npm run build:dmg -- --receipt /absolute/path/to/build-receipt.json --output /absolute/path/to/fresh-output --preview
```

This wraps an existing verified Developer ID app. It leaves that app and ZIP untouched. The local preview container is unsigned and explicitly ineligible for release. Artwork is in `docs/installer-art`; its receipt records human approval separately. The first dark concept was rejected and is retained only with private review outputs. The current candidate is text-free: flat mint segments and an arrow link the native app and Applications icons over Finder's normal background. The 800 × 360 point composition is packaged with separate 1× and 2× TIFF representations for Retina displays; do not flatten it to a single 1× image.

The mounted window contains exactly two visible items: Tokenlight.app and an Applications shortcut. Finder stores icon positions, image background and window geometry in the image. No installer scripts run on the user's Mac.

## Release build

After Jared approves the mounted artwork, update only its approval field to `approved` and record the decision. Reuse the existing Developer ID signing environment and Keychain profile documented in `developer-id-signing-and-updates.md`:

```sh
npm run build:release
npm run build:dmg -- --receipt /absolute/path/to/new/build-receipt.json --output /absolute/path/to/fresh-dmg-output --developer-id
npm run archive
```

The DMG validates the app and its stapled ticket, copies it, preserves its signature/helper bytes, configures Finder, creates a compressed read-only image, signs that image and notarizes/staples it. A submission ID is saved before waiting. On interruption, resume that same ID from `dmg-notarization.json`; never blindly rebuild or upload again.

Keep the app ZIP, DMG and source rebuild archive as distinct release assets. Do not replace the published ZIP or rebuild archive just to add the DMG. Publishing or editing an existing release requires the Release workflow and the relevant approval. Test the final mounted window and a copy out of the image before distribution; a different Mac and quarantine test remain separate from development-Mac verification.

Apple's reference: [Packaging Mac software for distribution](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution).
