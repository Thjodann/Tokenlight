import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadCredentials, readProvider, ProviderError } from '../src/providers.mjs';
import { SOURCES, currentMonth } from '../src/model.mjs';

const id = process.argv[2], source = SOURCES.find(s => s.id === id);
if (!source) throw new Error('Choose one source: codex, claude, cursor, openai, anthropic, elevenlabs.');
const observedAt = new Date().toISOString(), month = currentMonth();
let proof;
try {
  const credentials = await loadCredentials(process.env.CODEX_SECRETS_ENV || join(homedir(), 'secrets.env'), {});
  const reading = await readProvider(id, month, { credentials, resourcePath: process.cwd(), allowKeychain: false });
  proof = { observedAt, source: source.title, month, result: 'success', monthlyAvailable: reading.monthly !== null,
    monthly: reading.monthly, unit: reading.unit, dailyBucketCount: reading.daily?.length ?? 0,
    allowanceWindowCount: reading.windows?.length ?? 0, partial: !!reading.partial, coverage: reading.coverage };
} catch (error) {
  proof = { observedAt, source: source.title, month, result: 'setup_or_error', code: error.code || 'unavailable',
    message: error instanceof ProviderError ? error.message : 'Verification could not finish. No credentials or response bodies were logged.' };
  process.exitCode = 1;
}
const dir = '.codex/output/connection-proof'; await mkdir(dir, { recursive: true });
const file = join(dir, `${id}-${observedAt.replace(/[:.]/g, '-')}.json`);
await writeFile(file, JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ ...proof, evidence: file }, null, 2));
