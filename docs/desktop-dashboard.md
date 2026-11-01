# Desktop dashboard · 0.5.2

At 1000×560 and larger, Overview, Accounts and API usage use a shared source ledger instead of independent tiles. Provider colors and logos anchor each row. Columns align selected-month usage, current allowance pools, current credits, usage value and known cost. Select a row for the existing source sheet.

The five summary readings always describe all sources; the source ledger and daily-chart selector follow the chosen filter. At heights above 700 pixels, the remaining canvas shows a source-specific daily bar chart and the top three models across all sources. All models opens Insights. Daily history excludes future days and other months; gaps remain unreported. No sources with different units are summed into one usage chart.

At shorter heights, analysis collapses first. Below the desktop breakpoint, the existing dimension-aware instruments remain. Mini retains Overview, Accounts, API usage and Insights down to the 260×180 minimum. Detailed records and the full Insights ledger can scroll; the source overview fits supported sizes.

Current allowance percentages and credit balances do not become historical when changing the reporting month. USD values remain separate from actual charges. Incomplete costs use *, partial usage/pricing uses ~, and missing data stays unreported. No connection, credential, pricing or billing behavior changes in this release.

The in-app Signal T and packaged ICNS derive from the same vector geometry in src/brand.mjs. Light, dark and automatic appearance remain supported.
