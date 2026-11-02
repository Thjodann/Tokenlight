# Dashboard windows

Select Overview, Accounts, API usage or Insights and the reporting month in the main window. Choose **New Dashboard Window** in the toolbar, or **File → New Dashboard Window** (`⌘⇧N` on Mac).

Dashboard Mode only opens in additional windows. The main window always keeps its navigation, appearance, connection and editing controls. Each display keeps the view and reporting month captured at creation. Current-month displays follow the calendar month when it changes; historical displays stay on their selected month. Changing the main filter or month does not retarget existing displays.

Displays contain no in-app buttons, fields, links or exit action. Resize them, move them between monitors or use native fullscreen. Close each with its native close control or `⌘W`; quitting Tokenlight closes all windows. Closing the main window leaves dashboards running. Reopening the app restores the control window.

The layout adjusts to the available width and height. Larger displays include summaries, current allowance pools, balances and daily charts. Secondary details drop away at smaller sizes, keeping source names and main readings visible. Compact Insights displays prioritize the five aggregate metrics. Missing readings remain unreported, stale readings stay labeled, units remain provider-specific, and usage value remains separate from known charges. Allowances and balances are current even when activity shows a historical month.

All windows use the existing shared refresh service, credential store and Auto/Dark/Light preference. One timer refreshes each distinct open month; concurrent requests for the same source/month share an in-flight read. Extra windows cannot change settings, authenticate, export or invoke provider actions: the main process validates both window identity and the top-level sender frame before allowing IPC. Display snapshots omit connection-file configuration.

Window positions and open dashboard windows are session-only. They are not restored after quitting the app. No macOS lockdown or forced fullscreen is enabled; these are display-only windows with normal manual window management.

## Verification

Run `npm test` and `npm run check`. Dashboard-specific coverage is in `test/dashboard.test.mjs`, `test/dashboard-windows.test.mjs`, and the multi-period service case in `test/service.test.mjs`.

The implementation was checked in an isolated Electron 45.2.1 sample-data session, including toolbar/keyboard creation, captured filters/months, no mode exit, and a dashboard surviving main-window closure. Source-preview viewport checks covered 260×180, 320×568, 800×400, 1440×900, 2560×360 and 3840×1080. Live account data and release installation are separate acceptance layers.
