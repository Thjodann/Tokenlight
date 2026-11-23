import test from 'node:test';
import assert from 'node:assert/strict';
import { reliefEnabled, reliefUpdate } from '../src/relief-notes.mjs';

const claude = (windows, paidUsage) => ({ id: 'claude', title: 'Claude Code', windows, paidUsage });

test('the first sight of a full limit is remembered and stays silent', () => {
  const { memory, note } = reliefUpdate(claude([{ label: '5 hour', percent: 100 }]), null);
  assert.equal(note, null);
  assert.equal(memory.seen, true);
  assert.equal(memory.walls['5 hour'], true);
});

test('a remembered wall notifies once when it opens and stays quiet afterward', () => {
  const first = reliefUpdate(claude([{ label: '5 hour', percent: 100 }]), null);
  const opened = reliefUpdate(claude([{ label: '5 hour', percent: 12 }]), first.memory);
  assert.deepEqual(opened.note, { title: 'Claude Code is open again', body: '5-hour session' });
  assert.equal(opened.memory.walls['5 hour'], undefined);
  const again = reliefUpdate(claude([{ label: '5 hour', percent: 0 }]), opened.memory);
  assert.equal(again.note, null);
});

test('a limit that never reached the wall stays silent when it resets', () => {
  const seen = reliefUpdate(claude([{ label: '7 day', percent: 94 }]), null);
  const reset = reliefUpdate(claude([{ label: '7 day', percent: 3 }]), seen.memory);
  assert.equal(reset.note, null);
  assert.equal(reset.memory.walls['7 day'], undefined);
});

test('a missing reading does not clear a remembered wall', () => {
  const walled = reliefUpdate(claude([{ label: '5 hour', percent: 100 }]), null);
  const missing = reliefUpdate({ id: 'claude', title: 'Claude Code' }, walled.memory);
  assert.equal(missing.note, null);
  assert.equal(missing.memory.walls['5 hour'], true);
  const empty = reliefUpdate(claude([]), walled.memory);
  assert.equal(empty.note, null);
  assert.equal(empty.memory.walls['5 hour'], true);
});

test('a paid cap that clears while extra usage is on notifies once', () => {
  const walled = reliefUpdate(claude([], { capReached: true, enabled: true, used: 20, limit: 20 }), null);
  assert.equal(walled.note, null);
  assert.equal(walled.memory.paidWall, true);
  const opened = reliefUpdate(claude([], { capReached: false, enabled: true, used: 0, limit: 20 }), walled.memory);
  assert.deepEqual(opened.note, { title: 'Claude Code is open again', body: 'extra usage' });
  assert.equal(opened.memory.paidWall, false);
});

test('extra usage that is merely off is not a wall and does not announce an opening', () => {
  const off = { capReached: true, enabled: false, used: 0, limit: 20 };
  const first = reliefUpdate(claude([], off), null);
  assert.equal(first.memory.paidWall, false);
  const remembered = { seen: true, walls: {}, paidWall: true };
  const stillOff = reliefUpdate(claude([], { capReached: false, enabled: false, used: 0, limit: 20 }), remembered);
  assert.equal(stillOff.note, null);
  assert.equal(stillOff.memory.paidWall, true);
});

test('two limits opening on one source become one note', () => {
  const walled = reliefUpdate(claude([{ label: '5 hour', percent: 100 }, { label: 'Fable · 7 day', pool: 'fable', percent: 100 }]), null);
  const opened = reliefUpdate(claude([{ label: '5 hour', percent: 4 }, { label: 'Fable · 7 day', pool: 'fable', percent: 6 }]), walled.memory);
  assert.equal(opened.note.title, 'Claude Code is open again');
  assert.equal(opened.note.body, '5-hour session and Fable · weekly');
});

test('sample data and an explicit off switch do not announce', () => {
  assert.equal(reliefEnabled({}, false), true);
  assert.equal(reliefEnabled({ reliefNotes: false }, false), false);
  assert.equal(reliefEnabled({}, true), false);
});
