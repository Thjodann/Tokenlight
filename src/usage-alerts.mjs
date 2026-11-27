import { bindingPool } from './allowance-dial.mjs';
import { resetCountdown } from './model.mjs';
import { limitKey, displayLimit } from './relief-notes.mjs';
import levels from './usage-alert-levels.cjs';

export const { ALERT_CHOICES, DEFAULT_THRESHOLDS, normalizeThresholds } = levels;

// A threshold is armed again only after the reading falls clearly below it, or
// after the reset the provider reported has passed. Without this margin a
// rolling window that hovers at 80% would announce on every refresh.
export const REARM_MARGIN = 5;

const percentOf = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const resetOf = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Usage alerts are on unless explicitly silenced, and sample data never announces. */
export function usageAlertsEnabled(settings, demo) {
  return demo !== true && settings?.usageAlerts !== false;
}

/**
 * The limits worth announcing for one source: the binding limit among those
 * that gate the whole source, plus the tightest limit of each model lane
 * (Fable, Cursor lanes), since a lane limit is binding for that lane.
 * Blank and expired readings are never candidates.
 */
export function alertCandidates(windows, now = Date.now()) {
  const live = (Array.isArray(windows) ? windows : []).filter(w => percentOf(w?.percent) != null && !(resetOf(w?.resetsAt) != null && w.resetsAt <= now));
  const card = {};
  const gates = live.filter(w => !w.pool).map(w => ({ ...w, card, window: w }));
  const picked = [];
  const binding = gates.length ? bindingPool(gates) : null;
  if (binding) picked.push(binding.window);
  const lanes = new Map();
  for (const w of live.filter(w => w.pool)) if (!lanes.has(w.pool) || w.percent > lanes.get(w.pool).percent) lanes.set(w.pool, w);
  return [...picked, ...lanes.values()];
}

function remembered(memory) {
  const limits = {};
  const source = memory && typeof memory.limits === 'object' && memory.limits && !Array.isArray(memory.limits) ? memory.limits : {};
  for (const [key, value] of Object.entries(source)) {
    const at = percentOf(value?.at);
    if (at) limits[key] = { at, resetsAt: resetOf(value?.resetsAt) };
  }
  return { seen: memory?.seen === true, limits };
}

const highestCrossed = (percent, thresholds) => thresholds.filter(t => percent >= t).at(-1) ?? 0;

// Lower the announced level once the reading has clearly fallen, or the reported reset has passed.
function rearmed(prior, percent, thresholds, now) {
  if (!prior) return 0;
  if (prior.resetsAt != null && prior.resetsAt <= now) return 0;
  if (percent > prior.at - REARM_MARGIN) return prior.at;
  return thresholds.filter(t => t < prior.at && percent > t - REARM_MARGIN).at(-1) ?? 0;
}

const pct = n => Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');

/**
 * Compare one successful source reading with the thresholds already announced.
 * The first reading is remembered quietly. A missing window list leaves memory unchanged.
 * Each threshold is announced at most once per reset period.
 * @param {{ id?: string, title?: string, windows?: Array<{ label?: string, pool?: string, percent?: number, resetsAt?: number }> | null }} source
 * @param {{ seen?: boolean, limits?: Record<string, { at: number, resetsAt: number | null }> } | null | undefined} memory
 * @param {number[]} thresholds
 * @returns {{ memory: { seen: boolean, limits: Record<string, { at: number, resetsAt: number | null }> }, note: { title: string, body: string } | null }}
 */
export function usageAlertUpdate(source, memory, thresholds = DEFAULT_THRESHOLDS, now = Date.now()) {
  const prior = remembered(memory);
  const windows = Array.isArray(source?.windows) ? source.windows : null;
  if (!windows) return { memory: prior, note: null };
  const levels = normalizeThresholds(thresholds);
  const candidates = new Set(alertCandidates(windows, now));
  const limits = { ...prior.limits };
  const crossings = [];
  for (const window of windows) {
    const percent = percentOf(window?.percent);
    if (percent == null) continue; // A blank reading says nothing about the threshold.
    const key = limitKey(window);
    let at = rearmed(prior.limits[key], percent, levels, now);
    // Only the limit that actually binds is raised, so a gate that was never
    // announced can still be announced when it becomes the binding one.
    if (candidates.has(window)) {
      const crossed = highestCrossed(percent, levels);
      if (crossed > at) {
        if (prior.seen) crossings.push({ window, percent, crossed });
        at = crossed;
      }
    }
    if (at) limits[key] = { at, resetsAt: resetOf(window.resetsAt) };
    else delete limits[key];
  }
  const next = { seen: true, limits };
  if (!crossings.length) return { memory: next, note: null };
  const title = String(source?.title || source?.id || 'Source');
  const top = Math.max(...crossings.map(c => c.crossed));
  const body = crossings.map(({ window, percent }) => {
    const reset = resetOf(window.resetsAt) != null ? ` · resets ${resetCountdown(window.resetsAt, now)}` : '';
    return `${displayLimit(window, source?.id)} ${pct(percent)}% used${reset}`;
  }).join('\n');
  return { memory: next, note: { title: `${title} passed ${top}%`, body } };
}
