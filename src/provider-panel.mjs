import { providerGroups, sourceLabel } from './provider-groups.mjs';
import { allowancePools, allowanceDial, allowanceAmount } from './allowance-dial.mjs';
import { activityReading, activityCaption, balanceReading, paidLimitText } from './metric-view.mjs';
import { creditAmount, allowanceContext } from './credit-view.mjs';
import { activityLine } from './usage-visuals.mjs';
import { monthlyInsights, sourceCost, limitedModelActivity } from './insights.mjs';
import { formatCount, finite, resetCountdown } from './model.mjs';
import { esc, usd } from './insight-view.mjs';
const connection = c => c.status === 'refreshing' ? 'Refreshing' : c.status === 'stale' ? 'Stale reading' : c.status === 'ready' ? c.partial ? 'Partial history' : 'Connected' : 'Needs connection';
const short = (value, n = 26) => Array.from(String(value)).length > n ? Array.from(String(value)).slice(0, n - 1).join('') + '…' : String(value);
const prose = text => ({ text: String(text) });
const missing = label => `<p class="provider-missing">${esc(label)} not reported</p>`;
// Presentation pages never combine source lanes, balances, units or allowance pools.
// Long labels/notes are real text pages, not ellipsized or hidden overflow.
export function providerDetailItems(card, snapshot) {
  const remaining = snapshot.settings?.showRemainingAllowance === true;
  const pools = allowancePools([card]), balance = balanceReading(card), cost = sourceCost(card, snapshot.settings, snapshot.month);
  const models = monthlyInsights({ ...snapshot, cards: [card] }).favorites;
  const allowances = pools.flatMap((p, index) => [
    { html: `<div class="provider-detail-reading">${allowanceDial([p], remaining)}<div><b title="${esc(p.label)}">${esc(short(p.label, 18))}</b><small>${p.resetsAt ? 'Resets ' + esc(resetCountdown(p.resetsAt)) : 'Reset not reported'}</small></div></div>` },
    prose(`${p.label}${allowanceAmount(p) ? ' · ' + allowanceAmount(p) + ' used' : ''} · ${p.resetsAt ? 'Resets ' + new Date(p.resetsAt).toLocaleString() : 'Reset not reported'}`)
  ]);
  if (!allowances.length) allowances.push({ html: missing('Allowance') });
  if (card.paidUsage) allowances.push(prose(paidLimitText(card)));
  return {
    allowances,
    activity: [{ html: `<div class="provider-detail-activity"><strong>${esc(activityReading(card))}</strong><small>${esc(activityCaption(card, snapshot.month))}</small><figure>${activityLine(card, snapshot.month)}</figure></div>` }, prose('Daily activity uses its own scale; gaps are unreported.')],
    balances: balance.balances.length ? balance.balances.map(b => prose(`${b.label}: ${b.unlimited ? 'Unlimited' : creditAmount(b.value, b.unit)}${b.allowance ? ' · ' + allowanceContext(b) : ''}`)) : [prose('Current balance not reported')],
    costs: [prose(`Known cost: ${usd(cost.total)}${cost.partial && cost.total !== null ? ' · partial' : ''}. Usage value: ${usd(cost.value.total)}${cost.value.partial && cost.value.total !== null ? ' · estimate / partial' : ''}. USD · usage value is not an extra charge.`)],
    models: models.length ? limitedModelActivity(models, models.length).flatMap((m, index) => [
      { html: `<div class="provider-detail-model"><small>Model ${index + 1}</small><strong>${formatCount(m.calls)}</strong><small>${esc(short(m.activityUnit, 30))}${card.partial || ['claude', 'codex'].includes(card.id) ? ' · partial' : ''}</small><svg viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="3" class="model-track"/><rect width="${m.calls / Math.max(1, ...models.filter(r => r.activityUnit === m.activityUnit).map(r => r.calls)) * 100}" height="3"/></svg></div>` }, prose(`${m.model} · ${m.activityUnit}`)
    ]) : [prose('Model activity not reported')],
    scope: [activityCaption(card, snapshot.month), card.coverage || 'Source scope only. Activity follows the reporting month; allowances and balances are current.', card.allowanceNote, card.creditNote, card.costNote, card.activityNote, card.historyNote, `Last reading: ${finite(card.lastUpdatedAt) ? new Date(card.lastUpdatedAt).toLocaleString() : 'Not reported'}`, `${card.title} · ${card.sourceLabel || 'Source not reported'}`, `${snapshot.demo ? 'Sample data · ' : ''}Activity · ${snapshot.month} UTC · limits and balances now. * Partial cost · ~ estimate · USD.`].filter(Boolean).map(prose)
  };
}
export function providerPanel(snapshot, requested = snapshot.presentation?.provider, regime = 'stacked', state = {}, viewport = { width: 440, height: 680 }) {
  const group = providerGroups(snapshot.cards).find(g => g.provider === requested);
  if (!group) return '<p class="provider-missing">No readings reported for this provider.</p>';
  const remaining = snapshot.settings?.showRemainingAllowance === true;
  const rows = viewport.width < 600 ? group.cards.length : 1;
  const laneHeight = (viewport.height - 74 - (['micro', 'strip'].includes(regime) ? 0 : 34) - (rows - 1) * 8) / rows;
  const compact = laneHeight < 370, micro = laneHeight < 210;
  const richStrip = micro && viewport.width >= 600 && viewport.width / (viewport.width >= 600 ? group.cards.length : 1) >= 550;
  const selected = group.cards.find(c => c.id === state.source);
  if (state.detail && selected) {
    const names = { allowances: 'Allowances', activity: 'Activity', balances: 'Balances', costs: 'Costs', models: 'Models', scope: 'Scope' };
    const section = Object.hasOwn(names, state.section) ? state.section : 'allowances';
    const items = providerDetailItems(selected, snapshot)[section];
    return `<div class="provider-monitor provider-reader" data-provider="${esc(group.provider)}" data-source="${esc(selected.id)}" data-section="${section}" aria-label="${esc(selected.title)} details"><div class="provider-reader-toolbar"><button type="button" data-provider-back data-provider-focus="back" aria-label="Back to provider summary" title="Back to summary (Escape)">←</button><label class="provider-sr" for="provider-section">Source and detail section</label><select id="provider-section" data-provider-focus="section">${group.cards.map(c => `<optgroup label="${esc(sourceLabel(c))}">${Object.entries(names).map(([id, label]) => `<option value="${esc(c.id)}:${id}" ${c.id === selected.id && id === section ? 'selected' : ''}>${esc(sourceLabel(c))} · ${label}</option>`).join('')}</optgroup>`).join('')}</select></div><div class="provider-reader-content" tabindex="0" data-provider-focus="content" aria-label="${esc(sourceLabel(selected))} · ${names[section]}"></div><template class="provider-reader-items">${items.map((item, index) => `<article data-item="${index}" ${item.text !== undefined ? 'data-prose' : ''}>${item.text !== undefined ? esc(item.text) : item.html}</article>`).join('')}</template><nav class="provider-pager" aria-label="Detail pages"><button type="button" data-provider-page="-1" data-provider-focus="previous" aria-label="Previous detail page" title="Previous page (Left arrow)">‹</button><output aria-live="polite"></output><button type="button" data-provider-page="1" data-provider-focus="next" aria-label="Next detail page" title="Next page (Right arrow)">›</button></nav></div>`;
  }
  return `<div class="provider-monitor" data-provider="${esc(group.provider)}" data-lane-count="${group.cards.length}" data-strip-rich="${richStrip}" data-density="${micro ? 'micro' : compact ? 'compact' : 'full'}" aria-label="${esc(group.title)} provider monitor"><div class="provider-lanes">${group.cards.map(c => {
    const pools = allowancePools([c]), primary = pools[0], balance = balanceReading(c), cost = sourceCost(c, snapshot.settings, snapshot.month);
    const models = limitedModelActivity(monthlyInsights({ ...snapshot, cards: [c] }).favorites, 2);
    return `<section class="provider-lane" data-source="${esc(c.id)}" aria-label="${esc(c.title)}"><header><h2>${esc(sourceLabel(c))}</h2><span class="connection" data-state="${esc(c.status)}" role="status" title="${esc(connection(c))}" aria-label="${esc(connection(c))}"><i aria-hidden="true"></i>${micro ? '' : esc(connection(c))}</span></header><div class="provider-primary">${pools.length ? allowanceDial(pools.slice(0, 3), remaining) : '<div class="provider-no-allowance" aria-label="Allowance not reported">—</div>'}<div class="provider-reading"><small title="${esc(activityCaption(c, snapshot.month))}">Activity · ${esc(snapshot.month)}</small><strong>${esc(activityReading(c))}</strong><small title="${esc(primary?.label || 'Allowance')} · ${primary?.resetsAt ? esc(new Date(primary.resetsAt).toLocaleString()) : 'Reset not reported'}">${primary?.resetsAt ? 'Resets ' + esc(resetCountdown(primary.resetsAt)) : 'Reset not reported'}</small></div></div>${richStrip ? `<div class="provider-strip-extra"><figure class="provider-summary-trend" aria-label="Daily activity · independent source scale; gaps are unreported">${activityLine(c, snapshot.month)}</figure><div class="provider-summary-finance"><span title="${esc(balance.title)}">${esc(balance.text)}<small>${esc(short(balance.label, 20))}</small></span><span>${usd(cost.total)}<small>Known cost${cost.partial && cost.total !== null ? ' *' : ''} · USD</small></span></div></div>` : ''}${!micro ? `<figure class="provider-summary-trend" aria-label="Daily activity · independent source scale; gaps are unreported">${activityLine(c, snapshot.month)}</figure><div class="provider-summary-finance"><span title="${esc(balance.title)}">${esc(balance.text)}<small>${esc(short(balance.label))}</small></span><span> ${usd(cost.total)}<small>Known cost${cost.partial && cost.total !== null ? ' *' : ''} · USD</small></span></div>` : ''}${!compact ? `<div class="provider-summary-pools">${pools.slice(0, 3).map(p => `<span title="${esc(p.label)}">${esc(short(p.label, 24))}</span>`).join('') || '<span>Allowance not reported</span>'}</div><div class="provider-summary-models">${models.map(m => `<span title="${esc(m.model + ' · ' + m.activityUnit)}">${esc(short(m.model, 23))}<b>${formatCount(m.calls)} ${esc(short(m.activityUnit, 16))}</b></span>`).join('') || '<span>Model activity not reported</span>'}</div>` : ''}<button type="button" class="provider-details-button" data-provider-detail="${esc(c.id)}" data-provider-focus="detail-${esc(c.id)}" aria-label="Details for ${esc(c.title)}">Details <span aria-hidden="true">↗</span></button></section>`;
  }).join('')}</div></div>`;
}

// Paginate against the *painted* content area (including native chrome). Text is
// split without loss, at Unicode code-point boundaries. No overflow is concealed.
// Anchor = item + character offset, so resize/reflow keeps the same reading.
export function mountProviderReader(root, state) {
  const content = root?.querySelector('.provider-reader-content'), template = root?.querySelector('.provider-reader-items');
  if (!content || !template) return null;
  const pages = []; let parts = [];
  const makePage = fragments => {
    const page = document.createElement('div'); page.className = 'provider-detail-page';
    for (const part of fragments) page.append(part.element.cloneNode(true));
    return page;
  };
  const fits = fragments => {
    const element = makePage(fragments); content.replaceChildren(element);
    const r = element.getBoundingClientRect(), box = content.getBoundingClientRect();
    return r.height <= box.height + .1 && r.width <= box.width + .1 && element.scrollWidth <= box.width + .1 && element.scrollHeight <= box.height + .1;
  };
  const flush = () => { if (parts.length) pages.push({ parts, element: makePage(parts) }); parts = []; };
  for (const item of template.content.children) {
    const number = Number(item.dataset.item);
    if (!item.hasAttribute('data-prose')) {
      const part = { item: number, offset: 0, end: 0, element: item.cloneNode(true) };
      if (parts.length && !fits([...parts, part])) flush();
      parts.push(part); continue;
    }
    const chars = Array.from(item.textContent); let offset = 0;
    do {
      let low = 1, high = chars.length - offset, best = 0;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2), candidate = item.cloneNode(false);
        candidate.textContent = chars.slice(offset, offset + mid).join('');
        if (fits([...parts, { element: candidate }])) { best = mid; low = mid + 1; } else high = mid - 1;
      }
      if (!best && parts.length) { flush(); continue; }
      // At the supported minimum there is always room for at least one line.
      best = Math.max(1, best);
      const element = item.cloneNode(false); element.textContent = chars.slice(offset, offset + best).join('');
      parts.push({ item: number, offset, end: offset + best, element }); offset += best;
      if (offset < chars.length) flush();
    } while (offset < chars.length);
  }
  flush();
  let index = Math.max(0, pages.findIndex(p => p.parts.some(part => part.item === (state.item || 0) && (part.end === 0 || (part.offset <= (state.offset || 0) && part.end > (state.offset || 0))))));
  const paint = (updateAnchor = false) => {
    const page = pages[index]; if (!page) return;
    content.replaceChildren(page.element);
    if (updateAnchor) { state.item = page.parts[0].item; state.offset = page.parts[0].offset; }
    root.querySelector('.provider-pager output').textContent = `${index + 1} / ${pages.length}`;
    // Keep controls focusable even at boundaries; an unavailable movement is a no-op.
    root.querySelector('[data-provider-page="-1"]').setAttribute('aria-disabled', String(index === 0));
    root.querySelector('[data-provider-page="1"]').setAttribute('aria-disabled', String(index === pages.length - 1));
  };
  paint();
  return { move(delta) { index = Math.max(0, Math.min(pages.length - 1, index + delta)); paint(true); }, count: pages.length };
}
