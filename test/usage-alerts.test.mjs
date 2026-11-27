import test from 'node:test';
import assert from 'node:assert/strict';
import { usageAlertUpdate, alertCandidates, normalizeThresholds, usageAlertsEnabled, DEFAULT_THRESHOLDS } from '../src/usage-alerts.mjs';

const NOW = Date.UTC(2026, 10, 27, 12);
const HOUR = 3600000;
const claude = windows => ({ id: 'claude', title: 'Claude Code', windows });
const step = (windows, memory, thresholds = DEFAULT_THRESHOLDS, now = NOW) => usageAlertUpdate(claude(windows), memory, thresholds, now);
const seen = (windows = []) => step(windows, null).memory;

test('thresholds are sorted, unique whole percentages with a default', () => {
  assert.deepEqual(normalizeThresholds(undefined), [80, 95]);
  assert.deepEqual(normalizeThresholds([95, 80, 80, 0, 100, 50.5, '75', 75]), [75, 80, 95]);
  assert.deepEqual(normalizeThresholds([]), []);
});

test('alerts are on unless silenced, and sample data never alerts', () => {
  assert.equal(usageAlertsEnabled({}, false), true);
  assert.equal(usageAlertsEnabled({ usageAlerts: false }, false), false);
  assert.equal(usageAlertsEnabled({}, true), false);
});

test('the first reading is remembered quietly even past a threshold', () => {
  const { memory, note } = step([{ label: '5 hour', percent: 88, resetsAt: NOW + HOUR }], null);
  assert.equal(note, null);
  assert.deepEqual(memory.limits['5 hour'], { at: 80, resetsAt: NOW + HOUR });
});

test('crossing a threshold notifies once, and the next threshold notifies once more', () => {
  let memory = seen([{ label: '5 hour', percent: 40 }]);
  const crossed = step([{ label: '5 hour', percent: 82, resetsAt: NOW + 2 * HOUR + 5 * 60000 }], memory);
  assert.deepEqual(crossed.note, { title: 'Claude Code passed 80%', body: '5-hour session 82% used · resets in 2h 5m' });
  memory = crossed.memory;
  assert.equal(step([{ label: '5 hour', percent: 89 }], memory).note, null);
  const higher = step([{ label: '5 hour', percent: 96 }], memory);
  assert.equal(higher.note.title, 'Claude Code passed 95%');
  assert.equal(step([{ label: '5 hour', percent: 99 }], higher.memory).note, null);
});

test('jumping past several thresholds sends one note for the highest', () => {
  const { note, memory } = step([{ label: '7 day', percent: 97 }], seen());
  assert.equal(note.title, 'Claude Code passed 95%');
  assert.equal(note.body, 'Weekly 97% used');
  assert.equal(memory.limits['7 day'].at, 95);
});

test('a reading that hovers at a threshold does not announce again', () => {
  let { memory } = step([{ label: '5 hour', percent: 80.5 }], seen());
  for (const percent of [79.2, 80.1, 77, 81]) {
    const next = step([{ label: '5 hour', percent }], memory);
    assert.equal(next.note, null, `hovering at ${percent}`);
    memory = next.memory;
  }
});

test('a reset re-arms the thresholds for the next period', () => {
  const first = step([{ label: '5 hour', percent: 85, resetsAt: NOW + HOUR }], seen());
  const after = step([{ label: '5 hour', percent: 3, resetsAt: NOW + 6 * HOUR }], first.memory, DEFAULT_THRESHOLDS, NOW + 2 * HOUR);
  assert.equal(after.note, null);
  assert.equal(after.memory.limits['5 hour'], undefined);
  const again = step([{ label: '5 hour', percent: 81, resetsAt: NOW + 6 * HOUR }], after.memory, DEFAULT_THRESHOLDS, NOW + 3 * HOUR);
  assert.equal(again.note.title, 'Claude Code passed 80%');
});

test('a passed reset re-arms even when the new period opens above the threshold', () => {
  const first = step([{ label: '7 day', percent: 85, resetsAt: NOW + HOUR }], seen());
  const next = step([{ label: '7 day', percent: 84, resetsAt: NOW + 168 * HOUR }], first.memory, DEFAULT_THRESHOLDS, NOW + 2 * HOUR);
  assert.equal(next.note.title, 'Claude Code passed 80%');
});

test('falling below a higher threshold keeps the lower one announced', () => {
  const high = step([{ label: '5 hour', percent: 96 }], seen());
  const dipped = step([{ label: '5 hour', percent: 84 }], high.memory);
  assert.equal(dipped.note, null);
  assert.equal(dipped.memory.limits['5 hour'].at, 80);
  assert.equal(step([{ label: '5 hour', percent: 95 }], dipped.memory).note.title, 'Claude Code passed 95%');
});

test('a blank or unreported reading never fires and keeps what was announced', () => {
  const first = step([{ label: '5 hour', percent: 85 }], seen());
  for (const percent of [null, undefined, NaN, -1, '90']) {
    const blank = step([{ label: '5 hour', percent }], first.memory);
    assert.equal(blank.note, null);
    assert.deepEqual(blank.memory.limits, first.memory.limits);
  }
  const missing = usageAlertUpdate({ id: 'claude', title: 'Claude Code', windows: null }, first.memory);
  assert.equal(missing.note, null);
  assert.deepEqual(missing.memory, first.memory);
});

test('only the binding gate is announced, and a gate is announced when it becomes binding', () => {
  let memory = seen([{ label: '5 hour', percent: 10 }, { label: '7 day', percent: 10 }]);
  const both = step([{ label: '5 hour', percent: 90, resetsAt: NOW + HOUR }, { label: '7 day', percent: 82, resetsAt: NOW + 100 * HOUR }], memory);
  assert.equal(both.note.body.split('\n').length, 1);
  assert.match(both.note.body, /^5-hour session 90% used/);
  assert.equal(both.memory.limits['7 day'], undefined, 'a gate that is not binding is not marked announced');
  const shifted = step([{ label: '5 hour', percent: 2, resetsAt: NOW + 6 * HOUR }, { label: '7 day', percent: 83, resetsAt: NOW + 100 * HOUR }], both.memory, DEFAULT_THRESHOLDS, NOW + 2 * HOUR);
  assert.match(shifted.note.body, /^Weekly 83% used/);
});

test('a model lane is announced on its own beside the binding gate', () => {
  const windows = [{ label: '5 hour', percent: 20 }, { label: '7 day', percent: 30 }, { label: '7 day', pool: 'fable', percent: 81 }];
  assert.deepEqual(alertCandidates(windows, NOW).map(w => w.pool || w.label), ['7 day', 'fable']);
  const { note } = step(windows, seen());
  assert.equal(note.body, 'Fable · weekly 81% used');
});

test('an expired window is not a candidate', () => {
  const { note } = step([{ label: '5 hour', percent: 99, resetsAt: NOW - 1 }], seen());
  assert.equal(note, null);
});

test('no thresholds means no notes', () => {
  assert.equal(step([{ label: '5 hour', percent: 99 }], seen(), []).note, null);
});
