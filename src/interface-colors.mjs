// Recolor native chrome without changing its lightness hierarchy. The picker
// retains the raw selection; only the displayed theme tokens are transformed.
const native = {
  light: { bg: '#edf1f3', panel: '#fafcfd', raised: '#ffffff', line: '#d8e0e4', 'line-strong': '#becbd2', track: '#dfe7e9', accent: '#237762' },
  dark: { bg: '#101417', panel: '#191f23', raised: '#222a2f', line: '#303c43', 'line-strong': '#4c5e68', track: '#334047', accent: '#8bd6be' }
};
export const interfaceDefaults = dark => ({ surface: native[dark ? 'dark' : 'light'].bg, accent: native[dark ? 'dark' : 'light'].accent });
const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255);
const luminance = values => values.reduce((sum, v, i) => sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0);
function hueSaturation(hex) {
  const [r, g, b] = rgb(hex), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return [0, 0];
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  return [h, d / (1 - Math.abs(max + min - 1))];
}
function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); });
}
function atLuminance(hex, target, saturationLimit = 1) {
  const [h, saturation] = hueSaturation(hex), s = Math.min(saturation, saturationLimit);
  let lo = 0, hi = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(hsl(h, s, mid)) < target) lo = mid; else hi = mid;
  }
  return '#' + hsl(h, s, (lo + hi) / 2).map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
export function interfaceTokens(colors, dark) {
  const tokens = native[dark ? 'dark' : 'light'];
  return Object.fromEntries(Object.entries(tokens).map(([name, value]) => [name,
    atLuminance(name === 'accent' ? colors.accent : colors.surface, luminance(rgb(value)), name === 'accent' ? 1 : .25)
  ]));
}
