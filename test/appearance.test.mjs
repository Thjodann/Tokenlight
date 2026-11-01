import test from 'node:test';
import assert from 'node:assert/strict';
import appearance from '../src/appearance.cjs';

test('appearance modes map to native overrides and Auto follows changing system colors', () => {
  let systemDark = false, source = 'system';
  const nativeTheme = {
    set themeSource(value) { source = value; }, get themeSource() { return source; },
    get shouldUseDarkColors() { return source === 'dark' || (source === 'system' && systemDark); }
  };
  let color;
  const window = { setBackgroundColor(value) { color = value; } };
  appearance.applyColorMode('dark', nativeTheme, window);
  assert.equal(source, 'dark'); assert.equal(color, '#101417');
  appearance.applyColorMode('light', nativeTheme, window);
  assert.equal(source, 'light'); assert.equal(color, '#edf1f3');
  appearance.applyColorMode('auto', nativeTheme, window);
  assert.equal(source, 'system'); assert.equal(nativeTheme.shouldUseDarkColors, false);
  systemDark = true;
  assert.equal(nativeTheme.shouldUseDarkColors, true);
  assert.equal(appearance.backgroundColor(nativeTheme.shouldUseDarkColors), '#101417');
});

test('invalid stored modes migrate to Auto and invalid requests do not mutate native appearance', () => {
  for (const invalid of [undefined, null, '', 'system', 'sepia', {}, 2]) {
    assert.equal(appearance.normalizeColorMode(invalid), 'auto');
    const nativeTheme = { themeSource: 'light' };
    assert.throws(() => appearance.applyColorMode(invalid, nativeTheme), /Choose Auto/);
    assert.equal(nativeTheme.themeSource, 'light');
  }
  assert.equal(appearance.normalizeColorMode('dark'), 'dark');
});
