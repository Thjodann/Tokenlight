const { createHash } = require('node:crypto');
const API_SOURCES = ['openai', 'anthropic', 'elevenlabs'];
const fingerprint = key => key ? createHash('sha256').update(key).digest('hex').slice(0, 20) : null;
const cacheAllowed = (id, entry, scopes) => !API_SOURCES.includes(id) || Boolean(scopes[id] && entry?.scope === scopes[id]);

function reconcileCredentials(cache, errors, scopes, credentials) {
  const changed = new Set();
  let removed = false;
  for (const id of API_SOURCES) {
    const next = fingerprint(credentials[id]);
    if (scopes[id] !== next) changed.add(id);
    scopes[id] = next;
    for (const key of Object.keys(cache)) {
      if (key.endsWith(':' + id) && !cacheAllowed(id, cache[key], scopes)) {
        delete cache[key]; removed = true;
      }
    }
    if (changed.has(id)) for (const key of Object.keys(errors)) if (key.endsWith(':' + id)) delete errors[key];
  }
  return { changed, removed };
}

module.exports = { cacheAllowed, reconcileCredentials, fingerprint };
