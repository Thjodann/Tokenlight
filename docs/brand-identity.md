# Tokenlight identity: Signal T

Jared selected Signal T (concept A) on 2026-11-01. The identity combines a custom lowercase t with three mint usage-meter segments. Production artwork reconstructs that direction as flat vector geometry: a white mark on a charcoal icon tile, with a dark-ink variant for light surfaces.

`src/brand.mjs` is the shared geometry and palette master. `brandMark()` supplies the decorative in-app header mark; `brandIcon()` supplies the 1024-pixel icon master. The renderer inherits its current theme colors. `scripts/render-icon.cjs` renders all native icon sizes and creates `Tokenlight.icns` through macOS iconutil. The canonical app build already includes this module and generated ICNS.

The native icon keeps a 44-pixel transparent outer margin at 1024 pixels, with a 936-pixel charcoal tile and 218-pixel corner radius. Foreground colors are white `#E9F0EE` and mint `#8AD9C2`; charcoal is `#111A1D`. Standalone light-surface artwork uses dark ink and mint `#28745F`. Keep the three arc gaps open and preserve the letter/arc proportions. Use the master vector for resizing.

The final brand kit includes standalone SVG/PNG marks, outlined Helvetica Neue Bold wordmarks, 16–1024 pixel icon PNGs, the complete native iconset, ICNS and a palette/size preview. Wordmark SVGs contain paths and need no installed font. The kit and QA receipt are retained in Jared's `~/.codex/output/tokenlight-final` delivery folder. The original generated concepts and prompts remain in `.codex/output/imagegen/tokenlight-icon-v1`.

Source integration, icon export and isolated native light/dark renderer checks were completed. This artwork change is prepared for the next app build; it does not replace the installed 0.5.1 bundle or publish a new release.
