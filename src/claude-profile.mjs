// Keep only display metadata from the profile belonging to the selected OAuth token.
const text = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : null;
export function claudeProfile(profile, record = {}, now = Date.now()) {
  const fallback = { plan: text(record.subscriptionType), accountConnection: null };
  if (!text(profile?.account?.uuid) || !text(profile?.organization?.uuid)) return fallback;
  const org = profile.organization, account = profile.account;
  const plan = ({claude_pro:'pro',claude_max:'max',claude_ultra:'ultra',team:'team',enterprise:'enterprise'})[org.organization_type]
    || (account.has_claude_max === true ? 'max' : account.has_claude_pro === true ? 'pro' : null);
  return { plan: plan || fallback.plan, accountConnection: {
    plan: plan || fallback.plan, planSource: plan ? 'profile' : 'credential',
    organizationName: text(org.name), organizationId: text(org.uuid), verifiedAt: now
  } };
}
export async function readClaudeProfile(record, request) {
  try { return claudeProfile(await request(record.accessToken), record); }
  catch { return claudeProfile(null, record); } // Optional metadata must not break a usage sync.
}
