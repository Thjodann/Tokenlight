# Dashboard windows

Select a view and reporting month in the main window, then choose **New Dashboard Window**, **File → New Dashboard Window**, or `⌘⇧N` on Mac. Dashboard Mode opens only in additional windows; the main window retains the full controls.

Each pop-out has a minimal four-button view strip: Overview, Accounts, API usage, and Insights. Labels reduce to icons in narrow windows, with tooltips and accessible names. Tab and Enter work, the selected view is announced, and focus survives refreshes. The filter applies only to that window. The reporting month is captured at creation; current-month displays follow the calendar while historical displays retain their month. Main-window changes do not retarget existing displays.

Overview and provider filters prioritize monthly activity, current allowance bars, balances, and daily activity plots. Insights uses separate horizontal charts for known cost, usage value, and model activity, plus a compact summary. Main-window source rows also include activity plots, and its Insights view uses the shared charts alongside the detailed accounting table.

The layout responds to both width and height. Tall side-mounted windows keep all seven sources and their charts visible. More allowance pools receive extra row space. Short wide windows arrange sources horizontally. Tiny windows retain provider readings and small chart strips; secondary labels, balances, and costs progressively yield space. At extremely small sizes some source labels abbreviate visually, with complete readings in accessible text. Insights prioritizes the two money charts when both width and height are limited. This is a glanceable display, not every detail at every size.

Missing data stays unreported; zero remains zero. Daily charts use each source's own scale, omit unreported days, and never compare unlike units. Usage value remains separate from actual known charges. Partial, stale, and connection states remain available through status glyphs and accessible labels. Allowances and balances are current even when activity shows a historical month. Coverage and accounting qualifications remain in tooltips and the shared legend.

Pop-outs have no settings, credential, authentication, export, or provider-action controls. The main process validates the registered window and top-level sender frame; only the window's local view filter is mutable. Snapshots omit connection-file configuration. All windows share the existing refresh service, credential store, demo state, and Auto/Dark/Light preference.

Resize and move windows normally, or use native fullscreen. Close each with its native control or `⌘W`; quitting Tokenlight closes all windows. Closing the main window leaves dashboards running. Reopening Tokenlight restores the control window. Dashboard windows and their positions are session-only, with no macOS lockdown or forced fullscreen.

## Verification

Run `npm test` and `npm run check`. Focused coverage is in `test/dashboard.test.mjs`, `test/dashboard-windows.test.mjs`, `test/usage-visuals.test.mjs`, and the multi-period service cases.

The latest TLC pass checked browser-rendered fixture previews at desktop, narrow sidebar, short ultrawide, and micro sizes, in light and dark themes. Keyboard activation and filter/focus retention through simulated snapshots were checked separately from the automated main-process IPC tests. Screenshots and the acceptance boundary are recorded in `.codex/output/dashboard-tlc/TLC-QA.md`. Packaging, native window management, installed-app behavior, and live provider refresh are separate release checks; they were not repeated for this source-only pass.
