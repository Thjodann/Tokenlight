# Spending, usage value and account insights

## Scope and provenance

The approved view shows known plan fees plus metered costs as a monthly cost subtotal. Usage value is separate: included subscription activity is not treated as an additional bill. There is no inference from remaining credits, a spending cap, Fable allowance value, or usage percentage to money spent. Values are USD; other currencies are not silently converted. Provider cost reports are before account credits and can lag; this subtotal is not a settled invoice and excludes unknown components and tax.

Local plan fees carry forward from their selected effective month; previous months retain their earlier prices. Clearing creates an unknown fee from that month. Metered amounts apply to one calendar month and override, rather than add to, a provider-reported amount. APIs default to no fixed plan fee until a local fee schedule is entered. Manual invoice amounts can represent post-credit amounts when desired; provider-sourced rows remain labeled before credits. Records belong to the connection and should be updated when switching accounts.

Account start dates are optional, local records. Age is elapsed years since that date, not a credential issue date, first observed event or first log. No creation date is invented. The longest-running account is selected only from supplied dates.

Most used means the source with the largest reported activity count. APIs count requests, Cursor counts billing events and Claude counts local assistant replies. Counts retain their units and rankings are an approximate activity comparison. Favorite model means most frequent model in the recorded activity, rather than a declared personal preference. Different scopes can overlap (for example Cursor own-key traffic also appearing in an API organization); rankings and usage values do not attempt unsupported cross-provider deduplication. Credits and tokens are not compared to rank providers.

## Reporting interfaces

- [OpenAI Usage and Costs APIs](https://developers.openai.com/cookbook/examples/completions_usage_api): usage grouped by model, disjoint uncached input/cached input/output, and `num_model_requests`. Costs use `/v1/organization/costs`, dollar-valued `amount.value`, explicit currency, and complete pagination. A complete empty cost response means no costs reported yet, not a final zero invoice. Optional cost failure does not discard token activity.
- [Anthropic Usage and Cost Analytics](https://platform.claude.com/docs/en/manage-claude/usage-cost-analytics-api): `group_by[]=model`, `usage.requests`, cache creation split by 5-minute/1-hour duration, and token categories. The existing analytics cost adapter preserves its decimal-string-in-cents conversion and reporting watermark. These organization costs are separate from Claude subscription extra usage.
- [Cursor event cost fields](https://prod.cursor.com/docs/account/teams/admin-api): `tokenUsage.totalCents` is model value; `chargedCents` and Cursor fees have different semantics. Tokenlight's personal account interface exposes event model value and retains it as usage value. It does not call included usage an extra paid charge or interpret untyped on-demand summary amounts as dollars. Missing paid charges can be entered locally. This personal interface is not the public team API.
- Claude Code: request/model/token counters are derived from its existing local assistant-message history. Repeated streaming messages share one request identity. Prompt and response text are not retained in these metrics. Local activity excludes other devices and remote sessions; the estimate remains partial. Current subscription extra spending is used only for its actual current month and matching reading period.
- Codex, ElevenLabs and Ollama continue to expose their existing activity/credit/allowance views. Their current adapters do not provide model-level monthly request attribution; no model preference or API-equivalent cost is fabricated for these sources. Ollama rolling request/value windows are not treated as calendar-month spending.

Read-only probes on 2026-11-01 confirmed OpenAI cost access, model-grouped OpenAI/Anthropic usage access, and Cursor event model/cost fields. Private probes retain response shapes, not credentials, account identifiers or response bodies.

## Estimation catalog

Public rates were checked on **2026-11-01 UTC**:

- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

The bundled catalog in `src/pricing.mjs` uses standard short-context text rates per million tokens. Input, output, cached reads and supported cache-write durations are separate. Unknown models, special model variants and unsupported audio modalities are excluded explicitly. Date-suffixed versions map only to known model bases. Claude cache writes without a supplied duration use the standard 5-minute assumption. OpenAI cache-write charges are not inferred from undocumented counters. Tools, taxes, long-context uplifts, regional processing, batch, priority and fast-tier adjustments are excluded. Historical activity is valued at the catalog date's rates, not presented as a historical bill.

Provider-reported Cursor event values and matched Anthropic model list-price costs take precedence over rate reconstruction, including an explicit zero. Otherwise usage value is reconstructed only when a known model and sufficient counters are present. Unknown values stay unknown. Values are aggregated by model; the per-request, per-event or per-reply figure in details is a labeled average, not a claim that every call cost that amount.

## Layouts and verification

Wide mode is automatic at widths of at least 1000 pixels and aspect ratios of at least 2.4. It shows a horizontal instrument for each source and keeps a route to totals and details. Mini stays explicit and automatic for genuinely small windows, but a wide short viewport no longer falls into Mini solely because its height is below 320 pixels. Returning from Mini restores a usable previous wide size. Taller ultrawide windows add the cost/age instruments and model mileage below the source rack.

The Insights tab includes provider costs, coverage, request counts, optional ages, and model mileage. Source sheets provide local fee/date controls and pricing links. Existing color modes and source colors apply. Normal portrait and Mini retain their respective layouts. Exports include the derived insight summary while continuing to omit authentication scopes and credentials.
