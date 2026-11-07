// Presentation regimes use the same width/height/aspect signals as the other
// instrument layouts. Short windows surface a glance; complete metrics stay in
// the source's Details rather than being compressed into unreadable text.
export function providerLayout(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'stacked';
  if (height <= 320 || (width < 560 && height <= 440)) return width >= 600 ? 'strip' : 'micro';
  if (width < 360 && height >= 600) return 'sidebar';
  if (width / height >= 12 / 5) return 'wide-short';
  if (width >= 1000 && height >= 700) return 'roomy';
  if (width >= 700 && height < 600) return 'wide-short';
  if (width >= 560) return 'square';
  return 'stacked';
}
