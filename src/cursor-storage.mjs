// Keep this read limited to Cursor's known Safe Storage accounts.
export async function cursorStoragePassword(exec) {
  for (const account of ['Cursor', 'Cursor Key']) {
    try {
      const { stdout } = await exec('/usr/bin/security', ['find-generic-password', '-s', 'Cursor Safe Storage', '-a', account, '-w'], { timeout: 15000 });
      return stdout.trim();
    } catch (error) {
      // Only a missing item permits the compatibility lookup. Preserve denial,
      // cancellation and timeout instead of prompting for another account.
      if (error.code !== 44 || account === 'Cursor Key') throw error;
    }
  }
}
