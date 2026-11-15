import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const { DashboardWindows } = createRequire(import.meta.url)('../src/dashboard-windows.cjs');

function browser(width = 720, height = 640) {
  const window = new EventEmitter();
  window.destroyed = false;
  window.webContents = { mainFrame: {} };
  window.isDestroyed = () => window.destroyed;
  window.getSize = () => [width, height];
  window.close = () => {
    window.destroyed = true;
    window.emit('closed');
  };
  return window;
}

test('a pop-out record restores its own color mode and interface colors', () => {
  const dashboards = new DashboardWindows();
  const colors = { surface: '#101820', accent: '#8ee3c7' };
  const first = dashboards.add(browser(), {
    kiosk: true,
    id: 'dashboard-1',
    provider: 'devin',
    colorMode: 'dark',
    colors
  });
  const saved = dashboards.record(first);

  first.window.close();
  const restored = dashboards.add(browser(saved.width, saved.height), {
    kiosk: true,
    ...saved,
    colors: saved.interfaceColors
  });
  const snapshot = dashboards.snapshot(restored, {
    version: '0.6.13',
    month: '2026-11',
    appearance: { dark: false },
    cards: [],
    settings: { showRemainingAllowance: true, interfaceColors: null, accountProfiles: {} }
  });

  assert.equal(snapshot.presentation.id, 'dashboard-1');
  assert.equal(snapshot.presentation.colorMode, 'dark');
  assert.deepEqual(snapshot.presentation.interfaceColors, colors);
  assert.equal(snapshot.presentation.interfaceColorsCustom, true);
  assert.equal(snapshot.appearance.dark, true);
});

test('closed pop-outs retain dormant records for the next reopen', async () => {
  const main = await readFile(new URL('../src/main.cjs', import.meta.url), 'utf8');
  assert.match(main, /browser\.on\('close',[\s\S]*closedRecord = dashboards\.record\(entry\)/);
  assert.match(main, /const retainedRecord = closedRecord \|\| savedRecord/);
  assert.match(main, /closedDashboardRecords = \[\{ \.\.\.retainedRecord, open: false \}/);
  assert.match(main, /closedDashboardRecords\.shift\(\)/);
  assert.match(main, /colorMode: restoredMode, colors: restoredColors/);
});
