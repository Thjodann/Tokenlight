const LAYOUTS = ['dashboard', 'mini'];
const MINIMUM = { width: 260, height: 180 };
const SIZES = { dashboard: [1320, 900], mini: [360, 300] };
const normalizeLayout = value => LAYOUTS.includes(value) ? value : 'dashboard';
function initialSize(requested, mode) {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(requested || '');
  if (match && +match[1] >= MINIMUM.width && +match[2] >= MINIMUM.height && +match[1] <= 4096 && +match[2] <= 4096) return [+match[1], +match[2]];
  return [...SIZES[normalizeLayout(mode)]];
}
class LayoutController {
  constructor(window, mode) { this.window = window; this.mode = normalizeLayout(mode); this.dashboardSize = null; }
  apply(mode) {
    if (!LAYOUTS.includes(mode)) throw new Error('Choose Dashboard or Mini.');
    if (mode === 'mini' && this.mode !== 'mini') {
      const size = this.window.getSize(), [width, height] = size;
      // Automatically compact windows are not useful full-dashboard restore points.
      if ((width >= 360 && height > 320 && (width > 440 || height > 440)) || (width >= 1000 && width / height >= 2.4)) this.dashboardSize = size;
    }
    this.window.setSize(...(mode === 'mini' ? SIZES.mini : this.dashboardSize || SIZES.dashboard));
    this.mode = mode;
  }
}
module.exports = { LAYOUTS, MINIMUM, normalizeLayout, initialSize, LayoutController };
