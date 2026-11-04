import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';

if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Run npm run notary:setup yourself in Terminal. Credentials must be entered at the secure Apple prompt.');
const prompt = createInterface({ input: process.stdin, output: process.stdout });
let appleId, teamId;
try {
  appleId = (await prompt.question('Apple Account email for notarization: ')).trim();
  teamId = (await prompt.question('Developer Team ID (10 characters): ')).trim();
} finally { prompt.close(); }
if (!appleId.includes('@') || !/^[A-Z0-9]{10}$/.test(teamId)) throw new Error('Enter the Apple Account email and the intended Developer Team ID.');
console.log('Apple will securely prompt for an app-specific password, validate it, and save it in the local Keychain profile tokenlight-notary. Do not paste that password into chat.');
const result = spawnSync('/usr/bin/xcrun', ['notarytool', 'store-credentials', 'tokenlight-notary', '--apple-id', appleId, '--team-id', teamId], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
