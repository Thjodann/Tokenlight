// Signal T: the selected Tokenlight identity, reconstructed as flat vector paths.
// Shared by the renderer, icon builder and portable artwork exports.
export const BRAND_COLORS = Object.freeze({ charcoal: '#111A1D', white: '#E9F0EE', mint: '#8AD9C2', lightMint: '#28745F' });

const T = 'M366 295H447Q494 295 494 342V433H638Q647 433 647 442V528Q647 537 638 537H494V635C494 692 523 719 584 719H618C650 719 674 742 674 770C674 811 617 839 561 839C425 839 357 767 357 643V304Q357 295 366 295Z';

function sector(start, end) {
  const outer = 308, inner = 231, corner = 8;
  const point = (r, a) => { const t = a * Math.PI / 180; return `${(474 + r * Math.cos(t)).toFixed(3)} ${(497 + r * Math.sin(t)).toFixed(3)}`; };
  const a = corner / outer * 180 / Math.PI, b = corner / inner * 180 / Math.PI;
  return `M${point(outer, start + a)}A${outer} ${outer} 0 0 1 ${point(outer, end - a)}Q${point(outer, end)} ${point(outer - corner, end)}L${point(inner + corner, end)}Q${point(inner, end)} ${point(inner, end - b)}A${inner} ${inner} 0 0 0 ${point(inner, start + b)}Q${point(inner, start)} ${point(inner + corner, start)}L${point(outer - corner, start)}Q${point(outer, start)} ${point(outer, start + a)}Z`;
}

const ARC = [[-90, -62], [-56, -28], [-22, 0]].map(([a, b]) => sector(a, b));
export function brandPaths(ink = BRAND_COLORS.white, accent = BRAND_COLORS.mint) {
  return `<path fill="${ink}" d="${T}"/>${ARC.map(d => `<path fill="${accent}" d="${d}"/>`).join('')}`;
}

export function brandMark(ink = 'currentColor', accent = 'var(--accent)') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="472" height="696" viewBox="332 168 472 696" aria-hidden="true" focusable="false">${brandPaths(ink, accent)}</svg>`;
}

export function brandIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="44" y="44" width="936" height="936" rx="218" fill="${BRAND_COLORS.charcoal}"/>${brandPaths()}</svg>`;
}
