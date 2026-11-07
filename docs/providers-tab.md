# Dashboard Providers tab

Open a normal **Dashboard pop-out**, then choose **Providers**. The branded native
selector shows one provider at a time. Account and API readings stay in separate
source lanes, with independent units, allowances and activity scales. Each pop-out
retains its provider, source, detail section and reading position through refresh,
theme changes, resize and tab navigation. Other tabs and Desktop/Mini/Wide views
retain their existing presentation.

## Layout acceptance: no scrolling

For Providers/pop-out layout work, needing to scroll means a breakpoint or form
factor has not been designed yet. Both the summary and deliberately opened Details
must fit without horizontal or vertical scrolling at the supported native minimum
**260×180**, tall narrow windows, intermediate shapes and ultra-wide strips. The
28px native-style titlebar is included in rendered viewport checks. This criterion
applies to Providers in this revision; it does not authorize redesigning other tabs.
Do not conceal overflow, clip data or shrink text to solve a failed fit.

The summary chooses a purposeful density from the available per-source lane area,
including chrome, picker and source count. Small windows keep the allowance gauge,
activity, reset and Details control; larger areas add the independent trend,
balance, cost and model preview. Up to three allowance rings and two model previews
keep high-cardinality summaries readable. These previews never sum unrelated pools
or interaction units. Complete readings remain reachable in Details.

**Details** replaces the summary in place. Its source/section picker selects
Allowances, Activity, Balances, Costs, Models or Scope. Previous/next controls page
through all entries and complete text, including long identifiers and notes. Pages
are packed against the actual painted area; text is split losslessly at Unicode
code-point boundaries. Larger areas show more items per page. Resizing retains an
item/character anchor rather than a fragile pixel offset. No detail content is
concealed behind an overflow rule. The native selector supports keyboard selection;
Left/Right or Page Up/Down move detail pages, Home/End select first/last, and Escape
returns to the summary and its originating Details button. These keys do not
intercept native select behavior. Page controls retain focus at their boundaries.

Remaining allowance honors the existing preference in gauge fill, visible labels,
tooltips and accessible text. Warnings remain based on used values. Current limits
and balances, monthly activity and cost retain their existing scopes. Missing
readings stay unreported. Full identifiers/scope live in Details and tooltips.

## Window, data and authority

The source Details shortcut **View in Providers** focuses an existing Dashboard
pop-out and selects its provider while retaining that pop-out's reporting month.
Without a pop-out it opens a normal Dashboard directly to Providers, inheriting
the source window's reporting month and follow-current behavior. Normal Dashboard
menu, dimensions and lifecycle apply. No separate Provider window/menu exists.
Selection is per window and is not persisted across application restarts.

Only the active Providers tab receives its scoped sanitized provider snapshot.
The main process validates IDs and filters cards, profiles and metadata before
IPC; credential configuration, raw errors and account scope identifiers are absent.
Leaving Providers restores the normal sanitized Dashboard snapshot. Presentation
selection IPC does not authorize settings, credentials, refresh or connection
mutations for pop-outs, subframes or unregistered callers. Pagination is local
renderer presentation state and introduces no IPC or data collection.

Linux source/rendered tests use invented fixtures only, including long and numerous
allowances, balances, models and notes. Native Mac window/menu acceptance and
packaging belong to the liaison after review. Prior source/evidence is retained;
this revision changes no version, dependencies, pricing, ranking, provider logic,
installed app, release or integration state.
