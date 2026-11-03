# Desktop allowance instruments

Overview groups seven integrations into five flat provider instruments. Each provider uses its existing color and logo. Segmented concentric arcs echo Tokenlight's brand mark: the outer ring is the first reported allowance pool, and each inner ring has a matching legend marker. Every legend shows its own percentage used and reset time. Separate pools are never averaged or added together. The large center number is explicitly tied to the outer pool, rather than a combined score.

Reported absolute allowance amounts appear alongside the percentage when the provider supplies both a numerator and a limit. Subscriptions that supply percentages only do not acquire a fabricated token limit. Missing and expired pools remain unreported, not zero. The painted arc stops at 100%; an over-limit numeric reading remains unchanged. Segment fill is fractional rather than rounding to whole segments.

Current allowances occupy the main canvas; selected-month activity and current balances sit in a separate band below. Account and API sources retain separate readings and source-detail buttons within each provider. The five summary metrics describe all seven sources, while Accounts and API usage filter instruments and the daily-chart selector. Actual costs remain separate from estimated usage value. Incomplete cost components use *, partial records/pricing use ~, and unknown values remain unreported.

The instrument workspace appears at 1000×760+, 1200×640+, or wide/short 1400×480+. Medium windows arrange instruments across two rows with gauges beside their legends. Wide, short windows use a compact horizontal gauge/legend layout. Secondary daily history and model mileage appear above 1000px viewport height with sufficient width; they collapse before the allowance readings do. Smaller sizes retain the existing compact, mini and micro presentations and filters down to the 260×180 minimum. Detailed records and Insights may scroll.

The daily chart preserves reported zeroes and excludes future, invalid and other-month dates. Gaps are unreported; mixed provider units are never summed into a single activity chart. Changing the selected month does not change current allowance windows or balances.

The main-window stylesheet is scoped to this workspace. Popout dashboards retain their independent, more minimal presentation. Light, dark and automatic appearance remain supported. This redesign changes no connection, credential, pricing, billing or installation behavior.
