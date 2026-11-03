import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mainDashboardOpener, createStatusBar } = require('../src/status-bar.cjs');

function browser(minimized = false) {
  const calls = [];
  return { calls, isDestroyed: () => false, isMinimized: () => minimized,
    restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus') };
}

test('Open Dashboard restores and focuses the existing main window', async () => {
  const main = browser(true);
  const open = mainDashboardOpener({ getWindow: () => main, createWindow: () => assert.fail('duplicate main window') });
  await open(); assert.deepEqual(main.calls, ['restore', 'show', 'focus']);
});

test('concurrent reopen requests create one main window after it was closed', async () => {
  let release, created = 0; const main = browser();
  const gate = new Promise(resolve => { release = resolve; });
  const open = mainDashboardOpener({ getWindow: () => ({ isDestroyed: () => true }), createWindow: async () => { created++; await gate; return { window: main }; } });
  const a = open(), b = open(); release(); await Promise.all([a, b]);
  assert.equal(created, 1); assert.deepEqual(main.calls, ['show', 'focus']);
});

test('failed window creation permits a later retry', async () => {
  let attempt = 0; const main = browser();
  const open = mainDashboardOpener({ getWindow: () => null, createWindow: async () => { if (++attempt === 1) throw new Error('load failure'); return { window: main }; } });
  await assert.rejects(open(), /load failure/); await open(); assert.equal(attempt, 2);
});

test('macOS tray contains usable Open and Quit controls and cleans up on quit', async () => {
  const app = new EventEmitter(); let quit = 0, opened = 0, destroyed = 0;
  app.quit = () => quit++;
  const representations = []; let template;
  const image = { addRepresentation: r => representations.push(r), setTemplateImage: value => { template = value; } };
  class Tray {
    constructor(value) { assert.equal(value, image); }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
    destroy() { destroyed++; }
  }
  const tray = createStatusBar({ app, Tray, Menu: { buildFromTemplate: x => x }, nativeImage: { createEmpty: () => image }, platform: 'darwin', openDashboard: async () => { opened++; } });
  assert.equal(tray.tooltip, 'Tokenlight'); assert.equal(template, true);
  assert.deepEqual(representations.map(x => x.scaleFactor), [1, 2]);
  assert.deepEqual(tray.menu.filter(x => x.label).map(x => x.label), ['Open Dashboard', 'Quit Tokenlight']);
  tray.menu[0].click(); await Promise.resolve(); assert.equal(opened, 1);
  tray.menu[2].click(); assert.equal(quit, 1);
  app.emit('will-quit'); assert.equal(destroyed, 1);
});

test('other platforms retain the prior window-close behavior without a macOS tray', () => {
  assert.equal(createStatusBar({ platform: 'linux' }), null);
});

test('template artwork contains transparent black PNGs at 18 and 36 pixels', async () => {
  const sharp = (await import('sharp')).default;
  for (const [index, data] of require('../src/status-icon.cjs').entries()) {
    const { data: pixels, info } = await sharp(Buffer.from(data, 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 18 * (index + 1)); assert.equal(info.height, info.width);
    let visible = 0, transparent = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      assert.equal(pixels[i] + pixels[i + 1] + pixels[i + 2], 0);
      if (pixels[i + 3]) visible++; else transparent++;
    }
    assert.ok(visible && transparent);
  }
});
