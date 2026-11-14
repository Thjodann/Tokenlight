import { providerFor } from './provider-branding.mjs';

const names = { openai: 'OpenAI', anthropic: 'Anthropic', cursor: 'Cursor', elevenlabs: 'ElevenLabs', ollama: 'Ollama Cloud', devin: 'Devin' };
// Presentation grouping only: retain each original source and its reporting scope.
export function providerGroups(cards) {
  const groups = new Map();
  for (const card of cards) {
    const provider = providerFor(card.id) || card.id;
    if (!groups.has(provider)) groups.set(provider, { provider, title: names[provider] || card.title, cards: [] });
    groups.get(provider).cards.push(card);
  }
  return [...groups.values()];
}
export const sourceLabel = card => card.kind === 'api' ? 'API' : card.title;

function devinInView(view, snapshot) {
  // Sample data includes both the key and the sign-in, so Devin appears in both tabs.
  if (snapshot?.demo) return true;
  const links = snapshot?.devinLinks || {};
  const keys = snapshot?.settings?.savedKeys || [];
  if (view === 'account') return links.account === true || keys.includes('devinQuota');
  if (view === 'api') return links.api === true || keys.includes('devin');
  return false;
}

/** Accounts shows the signed-in quota. API usage shows the key’s ACU. Overview keeps both on the original card. */
export function presentCard(card, view) {
  if (!card || card.id !== 'devin' || view === 'overview' || view === 'insights') return card;
  if (view === 'account') return { ...card, title: 'Devin', monthly: null, daily: [], requestCount: null, modelUsage: [], apiCost: null, partial: false, breakdown: null };
  if (view === 'api') return { ...card, title: 'Devin API', windows: [], creditBalances: [], plan: null, allowanceNote: null };
  return card;
}

/** Overview keeps every source. Accounts and API usage follow each source’s kind, except Devin, which follows the credential that is actually saved. */
export function cardsForView(snapshot, view) {
  const cards = snapshot?.cards || [];
  if (view === 'overview' || view === 'insights') return cards;
  return cards.filter(card => card.id === 'devin' ? devinInView(view, snapshot) : card.kind === view).map(card => presentCard(card, view));
}
