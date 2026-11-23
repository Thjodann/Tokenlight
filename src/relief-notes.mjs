const WALL_PERCENT = 100;

/** Stable identity for one allowance on a source. */
export function limitKey(window) {
  const label = String(window?.label || 'Allowance');
  return window?.pool ? `${window.pool}:${label}` : label;
}

/** Short name used in a relief note. */
export function displayLimit(window, sourceId) {
  const label = String(window?.label || 'Allowance').replace(/^5 hour$/i, '5-hour session').replace(/^(?:7 day|1 week)$/i, 'Weekly').replace(/7 day$/i, 'weekly').replace(/^Subscription allowance$/i, 'Subscription cycle');
  if (sourceId === 'claude' && window?.pool === 'fable') return 'Fable · weekly';
  return sourceId === 'cursor' && window?.pool ? `${label} · cycle` : label;
}

function finitePercent(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A reached cap counts only when the reading is not a switched-off meter still under its limit. */
export function paidIsWall(paid) {
  if (!paid || paid.capReached !== true) return false;
  const underLimit = typeof paid.used === 'number' && typeof paid.limit === 'number' && paid.limit > 0 && paid.used < paid.limit;
  return !(paid.enabled === false && underLimit);
}

/** Extra usage can be announced open only when the provider says it is on and the cap is clear. */
export function paidIsAvailable(paid) {
  return !!paid && paid.capReached !== true && paid.enabled === true;
}

function remembered(memory) {
  const walls = memory && typeof memory.walls === 'object' && memory.walls && !Array.isArray(memory.walls) ? { ...memory.walls } : {};
  for (const key of Object.keys(walls)) if (walls[key] !== true) delete walls[key];
  return { seen: memory?.seen === true, walls, paidWall: memory?.paidWall === true };
}

function joinNames(names) {
  if (names.length <= 1) return names[0] || '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

/**
 * Compare one successful source reading with the walls Tokenlight has already seen.
 * The first reading is remembered quietly. A missing window list leaves memory unchanged.
 * @param {{ id?: string, title?: string, windows?: Array<{ label?: string, pool?: string, percent?: number }> | null, paidUsage?: { capReached?: boolean, enabled?: boolean | null, used?: number | null, limit?: number | null } | null }} source
 * @param {{ seen?: boolean, walls?: Record<string, boolean>, paidWall?: boolean } | null | undefined} memory
 * @returns {{ memory: { seen: boolean, walls: Record<string, boolean>, paidWall: boolean }, note: { title: string, body: string } | null }}
 */
export function reliefUpdate(source, memory) {
  const prior = remembered(memory);
  const windows = Array.isArray(source?.windows) ? source.windows : null;
  if (!windows) return { memory: prior, note: null };
  const title = String(source?.title || source?.id || 'Source');
  const nextWalls = { ...prior.walls };
  const opened = [];
  if (!prior.seen) {
    for (const window of windows) {
      const percent = finitePercent(window?.percent);
      if (percent != null && percent >= WALL_PERCENT) nextWalls[limitKey(window)] = true;
    }
    return { memory: { seen: true, walls: nextWalls, paidWall: paidIsWall(source?.paidUsage) }, note: null };
  }
  for (const window of windows) {
    const percent = finitePercent(window?.percent);
    if (percent == null) continue;
    const key = limitKey(window);
    if (percent >= WALL_PERCENT) nextWalls[key] = true;
    else if (prior.walls[key] === true) {
      delete nextWalls[key];
      opened.push(displayLimit(window, source?.id));
    } else delete nextWalls[key];
  }
  let paidWall = prior.paidWall;
  if (source?.paidUsage) {
    if (paidIsWall(source.paidUsage)) paidWall = true;
    else if (prior.paidWall && paidIsAvailable(source.paidUsage)) {
      paidWall = false;
      opened.push('extra usage');
    }
  }
  const note = opened.length ? { title: `${title} is open again`, body: joinNames(opened) } : null;
  return { memory: { seen: true, walls: nextWalls, paidWall }, note };
}

/** Relief notes are on unless explicitly silenced, and sample data never announces. */
export function reliefEnabled(settings, demo) {
  return demo !== true && settings?.reliefNotes !== false;
}
