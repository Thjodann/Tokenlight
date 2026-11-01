// Credentials stay in Claude Code's stores; only the active request holds a token.
const valid = (record, now = Date.now()) => !!record?.accessToken && (!record.expiresAt || Number(record.expiresAt) > now);
export function selectClaudeSession(keychain, fallback, now = Date.now()) {
  const records = [keychain, fallback];
  return records.find(record => valid(record, now)) || records.find(record => record?.accessToken) || null;
}

export async function readClaudeUsage({ load, request, ErrorType }) {
  const reconnect = () => new ErrorType('Claude Code needs a renewed sign-in. Choose Sign in to Claude Code here; Tokenlight reconnects when sign-in finishes.', 'setup');
  let record = await load();
  // Claude can replace a credential between the Keychain read and this check.
  if (record?.accessToken && !valid(record)) record = await load();
  if (!record?.accessToken) throw new ErrorType('Sign in to Claude Code, then choose Connect. API keys do not connect your subscription.', 'setup');
  if (!valid(record)) throw reconnect();
  try { return { record, usage: await request(record.accessToken) }; }
  catch (error) {
    if (error.code !== 'auth') throw error;
    const renewed = await load();
    if (!valid(renewed) || renewed.accessToken === record.accessToken) throw reconnect();
    try { return { record: renewed, usage: await request(renewed.accessToken) }; }
    catch (retryError) { if (retryError.code === 'auth') throw reconnect(); throw retryError; }
  }
}
