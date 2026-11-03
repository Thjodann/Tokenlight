import { providerFor } from './provider-branding.mjs';

const names = { openai: 'OpenAI', anthropic: 'Anthropic', cursor: 'Cursor', elevenlabs: 'ElevenLabs', ollama: 'Ollama Cloud' };
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
