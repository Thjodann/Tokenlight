// Model-level counters are kept separate from account balances and billed costs.
const valid = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
export const modelName = value => typeof value === 'string' && value.trim() && value.length <= 200 ? value.trim() : 'Unattributed';
export function activityRow(raw, family, model, calls = null) {
  let input, output, cacheRead, cacheWrite, cacheWriteLong;
  if (family === 'openai') {
    cacheRead = raw.input_cached_tokens ?? 0; input = raw.input_tokens - cacheRead; output = raw.output_tokens; cacheWrite = 0; cacheWriteLong = 0;
  } else if (family === 'cursor') {
    input = raw.inputTokens; output = raw.outputTokens; cacheRead = raw.cacheReadTokens ?? 0; cacheWrite = raw.cacheWriteTokens ?? 0; cacheWriteLong = 0;
  } else {
    input = raw.uncached_input_tokens ?? raw.input_tokens; output = raw.output_tokens; cacheRead = raw.cache_read_input_tokens ?? 0;
    cacheWriteLong = raw.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    cacheWrite = raw.cache_creation_input_tokens != null ? raw.cache_creation_input_tokens - cacheWriteLong : raw.cache_creation?.ephemeral_5m_input_tokens ?? 0;
  }
  const measured = [input, output, cacheRead, cacheWrite, cacheWriteLong].every(valid);
  return { model: modelName(model), input: measured ? input : null, output: measured ? output : null, cacheRead: measured ? cacheRead : null, cacheWrite: measured ? cacheWrite : null, cacheWriteLong: measured ? cacheWriteLong : null,
    tokens: measured ? input + output + cacheRead + cacheWrite + cacheWriteLong : null, calls: valid(calls) ? calls : null,
    valueUSD: family === 'cursor' && valid(raw.totalCents) ? raw.totalCents / 100 : null,
    unsupportedModality: family === 'openai' && [raw.input_audio_tokens, raw.output_audio_tokens].some(n => valid(n) && n > 0) };
}
export function aggregateActivity(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = modelName(row.model);
    if (!grouped.has(key)) grouped.set(key, { model: key, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWriteLong: 0, tokens: 0, calls: 0, valueUSD: 0, unsupportedModality: false });
    const total = grouped.get(key);
    for (const field of ['input','output','cacheRead','cacheWrite','cacheWriteLong','tokens','calls','valueUSD']) total[field] = total[field] != null && valid(row[field]) ? total[field] + row[field] : null;
    total.unsupportedModality ||= !!row.unsupportedModality;
  }
  return [...grouped.values()].sort((a,b) => (b.calls ?? -1) - (a.calls ?? -1) || a.model.localeCompare(b.model));
}
