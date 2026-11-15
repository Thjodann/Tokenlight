import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = async name => readFile(new URL('../src/' + name, import.meta.url), 'utf8');

test('Connections exposes an accessible dual-color control and reset', async () => {
  const html = await source('index.html');
  assert.match(html, /id="surface-color" type="color"/);
  assert.match(html, /id="accent-color" type="color"/);
  assert.match(html, /id="reset-interface-colors"/);
  assert.match(html, /role="group" aria-label="Interface colors"/);
});

test('interface colors cross the bridge, persist, and survive demo snapshots', async () => {
  const [preload, main, renderer, demo] = await Promise.all([
    source('preload.cjs'),
    source('main.cjs'),
    source('renderer.mjs'),
    source('demo-data.mjs')
  ]);
  assert.match(preload, /interfaceColors: colors => invoke\('set-interface-colors', colors\)/);
  assert.match(main, /async setInterfaceColors\(value\)/);
  assert.match(main, /handle\('set-interface-colors'/);
  assert.match(main, /interfaceColors: this\.settings\.interfaceColors \|\| null/);
  assert.match(renderer, /syncInterfaceColors\(effectiveInterfaceColors\(value\), dark\)/);
  assert.match(renderer, /value\?\.presentation\?\.dashboard && value\.presentation\.interfaceColorsCustom/);
  assert.match(demo, /interfaceColors: settings\.interfaceColors \|\| null/);
});

test('custom chrome colors do not replace provider identities', async () => {
  const [styles, polish] = await Promise.all([source('styles.css'), source('surface-polish.css')]);
  for (const provider of ['openai', 'anthropic', 'cursor', 'elevenlabs', 'ollama', 'devin']) {
    assert.match(styles, new RegExp('\\[data-provider=' + provider + '\\]\\{--source-accent:'));
  }
  const customBlock = polish.match(/:root\[data-interface-colors="custom"\] \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.ok(customBlock.includes('--accent:'));
  assert.ok(!customBlock.includes('--source-accent'));
});
