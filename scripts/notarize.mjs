import { writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { runTool } from './signing.mjs';

export async function notarizeApp(appPath, output, config, run = runTool, save = writeFile) {
  const submissionZip = join(output, 'notary-submission.zip');
  // A fresh output directory is mandatory: never overwrite a prior submission.
  for (const name of ['notary-submission.zip', 'notarization.json', 'notarization-log.json']) {
    try { await access(join(output, name)); throw new Error('Notarization submission already exists; inspect its receipt before retrying.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  run('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', appPath, submissionZip], { timeout: 180000 });
  const auth = ['--keychain-profile', config.profile, '--output-format', 'json'];
  const submit = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'submit', submissionZip, ...auth, '--no-progress'], { timeout: 300000 }).stdout);
  if (!/^[a-f0-9-]{36}$/i.test(submit.id || '')) throw new Error('Notary service did not return a submission ID. Inspect server state before retrying.');
  const receipt = { id: submit.id, status: submit.status, stapled: false };
  const persist = () => save(join(output, 'notarization.json'), JSON.stringify(receipt, null, 2));
  await persist(); // Save before waiting: a timeout must not trigger another upload.
  console.log(`Notarization submitted: ${submit.id}`);
  try {
    const result = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'wait', submit.id, ...auth, '--timeout', '20m', '--no-progress'], { timeout: 1220000 }).stdout);
    receipt.status = result.status; await persist();
  } catch (error) {
    // wait may fail for a rejected submission as well as for a timeout.
    // Query that same ID once before deciding whether processing is unfinished.
    try {
      const info = JSON.parse(run('/usr/bin/xcrun', ['notarytool', 'info', submit.id, ...auth]).stdout);
      receipt.status = info.status;
    } catch { /* Preserve the known submission if Apple's status is unavailable. */ }
    if (!['Accepted', 'Invalid', 'Rejected'].includes(receipt.status)) {
      receipt.waitIncomplete = true; await persist();
      throw new Error(`Notarization wait incomplete. Resume submission ${submit.id}; do not upload again.`, { cause: error });
    }
    await persist();
  }
  const log = run('/usr/bin/xcrun', ['notarytool', 'log', submit.id, '--keychain-profile', config.profile]).stdout;
  await save(join(output, 'notarization-log.json'), log);
  if (receipt.status !== 'Accepted') throw new Error(`Notarization ${receipt.status}. See notarization-log.json; no final release archive produced.`);
  run('/usr/bin/xcrun', ['stapler', 'staple', appPath], { timeout: 180000 });
  run('/usr/bin/xcrun', ['stapler', 'validate', appPath]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
  receipt.stapled = true; receipt.gatekeeper = 'accepted'; await persist();
  await rm(submissionZip); // Only this invocation's temporary upload archive.
  return receipt;
}
