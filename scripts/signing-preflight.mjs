import { signingConfig, signingPreflight } from './signing.mjs';
console.log(JSON.stringify(signingPreflight(signingConfig(['--developer-id'])), null, 2));
