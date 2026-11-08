import { CONFIDENCE } from '../config.js';
import { esc, catName, timeLeft, fmt, pct, versionHTML, shortAddr } from '../util.js';

export const sideLetter = (n) => (n === 1 ? 'A' : n === 2 ? 'B' : '');

/** The "AI vs crowd" badge. `revealed` = viewer may see results. */
export function aiBadgeHTML(d, { revealed = true } = {}) {
  if (!d.aiPick) return '<span class="ai-badge ai-badge--none">🤖 No AI pick</span>';
  const conf = CONFIDENCE[d.aiConfidence] || '';
  if (!revealed) return `<span class="ai-badge ai-badge--none">🤖 AI guess locked on-chain — vote to reveal</span>`;
  const pick = sideLetter(d.aiPick);
  if (d.live) {
    const lead = d.votesA > d.votesB ? 1 : d.votesB > d.votesA ? 2 : 0;
    if (!lead) return `<span class="ai-badge ai-badge--none">🤖 AI picked ${pick} (${conf}) — too close to call</span>`;
    return lead === d.aiPick
      ? `<span class="ai-badge ai-badge--ok">🤖 AI picked ${pick} (${conf}) — the crowd agrees so far</span>`
      : `<span class="ai-badge ai-badge--surprise">👀 AI picked ${pick} (${conf}) — the crowd disagrees so far</span>`;
  }
  if (d.winner === 3) return `<span class="ai-badge ai-badge--none">🤖 AI picked ${pick} — it’s a tie</span>`;
  return d.winner === d.aiPick
    ? `<span class="ai-badge ai-badge--ok">🤖 AI picked ${pick} — ✓ the crowd agreed</span>`
    : '<span class="ai-badge ai-badge--surprise">👀 The crowd surprised the AI</span>';
}

export function statusText(d) {
  if (d.hidden) return 'Hidden';
  if (d.live) return timeLeft(d.endsAt);
  if (d.winner === 3) return d.total ? 'Draw' : 'Ended · no votes';
  return `${sideLetter(d.winner)} won`;
}

/** Card on the Duel wall. */
export function duelCardHTML(d) {
  return `<a class="dcard" href="d/${d.id}" data-link aria-label="${esc(d.question)}">
    <div class="dcard__body">
      <div class="dcard__top"><span class="chip">${esc(catName(d.category))}</span><span class="mono muted" style="font-size:12px">#${d.id}</span></div>
      <p class="dcard__q">${esc(d.question)}</p>
      <div class="dcard__vs">
        <div class="dcard__side dcard__side--a"><span class="tagAB tagAB--a">A</span>${versionHTML(d, 1)}</div>
        <span class="vs vs--sm">VS</span>
        <div class="dcard__side dcard__side--b"><span class="tagAB tagAB--b" style="align-self:flex-end">B</span>${versionHTML(d, 2)}</div>
      </div>
      <div class="dcard__meta"><span>${fmt(d.total)} vote${d.total === 1 ? '' : 's'}</span><span class="${d.live ? '' : 'dcard__win'}">${esc(statusText(d))}</span></div>
    </div>
  </a>`;
}

/** Shareable result card (home section 7, duel page, PNG export). */
export function resultCardHTML(d, aiReason = '', { id = '' } = {}) {
  const pa = pct(d.votesA, d.total), pb = d.total ? 100 - pa : 0;
  const side = (n) => {
    const win = !d.live && d.winner === n;
    return `<div class="rcard__side rcard__side--${n === 1 ? 'a' : 'b'} ${win ? 'is-win' : ''}">
      ${win ? '<span class="rcard__crown">🏆 Winner</span>' : ''}
      <span class="tagAB tagAB--${n === 1 ? 'a' : 'b'}">${n === 1 ? 'A' : 'B'}</span>
      ${versionHTML(d, n)}
      <p class="rcard__pct">${n === 1 ? pa : pb}%</p>
    </div>`;
  };
  return `<div class="rcard" ${id ? `id="${id}"` : ''}>
    <div class="rcard__top"><span class="chip">${esc(catName(d.category))}</span>${aiBadgeHTML(d)}</div>
    <h3 class="rcard__q">${esc(d.question)}</h3>
    <div class="rcard__vs">${side(1)}${side(2)}</div>
    ${aiReason ? `<p class="muted" style="margin-top:14px">🤖 “${esc(aiReason)}”</p>` : ''}
    <div class="rcard__foot"><span>${fmt(d.total)} votes · ${esc(statusText(d))}</span><span>headlineduel · duel #${d.id} · by ${shortAddr(d.creator)}</span></div>
  </div>`;
}
