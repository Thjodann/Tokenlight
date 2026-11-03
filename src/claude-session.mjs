// Credentials stay in Claude Code's stores; only the active request holds a token.
const valid = (record, now = Date.now()) => !!record?.accessToken && (!record.expiresAt || Number(record.expiresAt) > now);
export function selectClaudeSession(keychain, fallback, now = Date.now(), excludedToken = null) {
  const records = [keychain, fallback].filter(record => record?.accessToken !== excludedToken);
  return records.find(record => valid(record, now)) || records.find(record => record?.accessToken) || null;
}

export async function loadClaudeSession({ readKeychain, readFallback, ErrorType }, excludedToken = null) {
  let keychain, fallback, unavailable = false;
  if (readKeychain) {
    try { keychain = await readKeychain(); } catch (error) { unavailable = error.code !== 44; }
  }
  try { fallback = await readFallback(); } catch (error) { if (error.code !== 'ENOENT') unavailable = true; }
  const record = selectClaudeSession(keychain, fallback, Date.now(), excludedToken);
  if (!record && unavailable) throw new ErrorType('Claude’s credential store is locked or temporarily unavailable. Unlock your Mac; Tokenlight will retry automatically.', 'credentials', Date.now() + 60000);
  return record;
}

export async function readClaudeUsage({ load, request, renew, ErrorType }) {
  const reconnect = () => new ErrorType('Claude Code needs a renewed sign-in. Choose Sign in to Claude Code here; Tokenlight reconnects when sign-in finishes.', 'setup');
  let maintained = false;
  const recover = async (record, excluded = null) => {
    if (maintained || !renew || !record?.refreshToken) return null;
    maintained = true;
    await renew();
    const next = await load();
    return valid(next) && next.accessToken !== excluded ? next : null;
  };
  let record = await load();
  // Claude can replace a credential between the Keychain read and this check.
  if (record?.accessToken && !valid(record)) record = await load();
  if (!record?.accessToken) throw new ErrorType('Sign in to Claude Code, then choose Connect. API keys do not connect your subscription.', 'setup');
  if (!valid(record)) record = await recover(record);
  else if (record.expiresAt && Number(record.expiresAt) <= Date.now() + 120000) {
    // A failed proactive renewal must not discard a still-working access token.
    try { record = await recover(record) || record; } catch {}
  }
  if (!valid(record)) throw reconnect();
  try { return { record, usage: await request(record.accessToken) }; }
  catch (error) {
    if (error.code !== 'auth') throw error;
    let renewed = await load(record.accessToken);
    if (!valid(renewed) || renewed.accessToken === record.accessToken) renewed = await recover(record, record.accessToken);
    if (!valid(renewed) || renewed.accessToken === record.accessToken) throw reconnect();
    try { return { record: renewed, usage: await request(renewed.accessToken) }; }
    catch (retryError) { if (retryError.code === 'auth') throw reconnect(); throw retryError; }
  }
}
