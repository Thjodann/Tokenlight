const MODES = Object.freeze(['auto', 'dark', 'light']);
const normalizeColorMode = value => MODES.includes(value) ? value : 'auto';
const backgroundColor = dark => dark ? '#101417' : '#edf1f3';

function applyColorMode(mode, nativeTheme, window) {
  if (!MODES.includes(mode)) throw new Error('Choose Auto, Dark, or Light.');
  nativeTheme.themeSource = mode === 'auto' ? 'system' : mode;
  window?.setBackgroundColor(backgroundColor(nativeTheme.shouldUseDarkColors));
}

module.exports = { MODES, normalizeColorMode, backgroundColor, applyColorMode };
