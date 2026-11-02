# Metric presentation

Activity, allowances, balances and costs keep distinct meanings in every layout. This is a presentation change; provider normalization, reads, historical records and pricing are unchanged.

| Role | Display rule |
| --- | --- |
| Activity | Selected calendar month in the source's native token or credit units. Missing activity says Not reported. A current allowance never substitutes for it. |
| Allowances | Current named session, weekly or billing-cycle pools. Equal-width stacked gauges show percent used. Each pool keeps its own reset period. |
| Balances | Current provider-reported balances, with their names and currency/credit units. Missing balances stay unreported. Costs and cap warnings never substitute for balances. |
| Cost | Known charges and estimated usage value stay separate. Coverage and partial markers remain attached. |

Claude local activity is labeled this Mac and partial when applicable. Its Fable allowance remains distinct from the paid-monthly cap. The cap displays the exact reported used/limit amounts and exhaustion warning without inventing a comparable percentage. Cursor pools retain their separate names. Genuine zeros, missing readings, stale status and expired-window handling stay distinct.

Desktop headers identify selected-month activity versus current allowances/balances. Compact layouts retain these meanings and reduce secondary content as space runs out. Tall Mini and sidebar rows allocate more height to sources with multiple pools; smaller windows omit secondary gauges/charts rather than relabeling a different metric as activity. Full balance descriptions and all allowances remain in accessible labels/tooltips and the main window's details. Passive Dashboard windows remain read only.

Verification: 105 tests, syntax/CSP policy checks and diff checks passed. Browser source previews used synthetic fixtures at 1440×900 desktop and Dashboard, 1440×400 short-wide, 260×900 Mini/sidebar, 260×1080 sidebar and 260×180 minimum Mini. Light/dark were inspected. Desktop and Mini account/API filters returned 3/4 rows and Insights opened normally in the actual-Service fixture. No page scrolling was required in these checks. At 260×600, the passive display uses its reduced activity/status layout.

Evidence: `.codex/output/metric-consistency/` contains screenshots, browser measurements and logs. The static layout fixture has no viewState bridge, so interactive filtering was verified separately through the actual-Service synthetic fixture on port 4179. Neither preview reads personal keys or accounts. Packaged and installed-app verification has not run for these source edits; Applications remains the prior 0.6.1 release.
