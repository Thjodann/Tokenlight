// Shared by the main process (CommonJS) and usage-alerts.mjs.
/** Thresholds offered under View → Usage alert thresholds. */
const ALERT_CHOICES = Object.freeze([50, 75, 80, 90, 95]);
const DEFAULT_THRESHOLDS = Object.freeze([80, 95]);

/** Sorted, unique whole percentages between 1 and 99. A value that is not a list falls back to the defaults. */
function normalizeThresholds(value) {
  if (!Array.isArray(value)) return [...DEFAULT_THRESHOLDS];
  return [...new Set(value.filter(n => Number.isInteger(n) && n >= 1 && n <= 99))].sort((a, b) => a - b);
}

module.exports = { ALERT_CHOICES, DEFAULT_THRESHOLDS, normalizeThresholds };
