// /app — the Duel wall
import { CATEGORIES } from '../config.js';
import { $, $$, esc } from '../util.js';
import { api } from '../chain.js';
import { duelCardHTML } from './shared.js';

const TABS = [
  ['live', 'Live'],
  ['ending', 'Ending soon'],
  ['top', 'Most voted'],
  ['finished', 'Finished'],
];

export async function renderWall(root) {
  document.title = 'The wall — Headline Duel';
  const q = new URLSearchParams(location.search);
  let tab = TABS.some(([k]) => k === q.get('tab')) ? q.get('tab') : 'live';
  let cat = q.get('cat') ?? 'all';

  root.innerHTML = `
    <div class="app__head">
      <div><h1>The wall</h1><p>Two versions, one winner. Pick a duel and vote.</p></div>
      <a class="btn btn--primary" href="app/new" data-link>Start a duel</a>
    </div>
    <div class="toolbar">
      <div class="segment" role="tablist" aria-label="Sort">${TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}</button>`).join('')}</div>
      <label class="sr-only" for="catFilter" hidden>Category</label>
      <select class="select" id="catFilter" aria-label="Filter by category">
        <option value="all">All categories</option>
        ${CATEGORIES.map((c, i) => `<option value="${i}" ${String(i) === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div id="wallGrid" class="grid">${'<div class="skeleton" style="height:300px"></div>'.repeat(6)}</div>`;

  let duels = [];
  try {
    duels = (await api.listDuels()).filter((d) => !d.hidden);
  } catch (e) {
    $('#wallGrid', root).outerHTML = `<div class="notice notice--err">Couldn’t reach BOT Chain right now. <button class="btn btn--ghost btn--sm" onclick="location.reload()">Retry</button></div>`;
    return;
  }

  const draw = (animate = true) => {
    let list = duels.slice();
    if (cat !== 'all') list = list.filter((d) => String(d.category) === cat);
    if (tab === 'live') list = list.filter((d) => d.live).sort((a, b) => b.id - a.id);
    if (tab === 'ending') list = list.filter((d) => d.live).sort((a, b) => a.endsAt - b.endsAt);
    if (tab === 'top') list = list.sort((a, b) => b.total - a.total);
    if (tab === 'finished') list = list.filter((d) => !d.live).sort((a, b) => b.endsAt - a.endsAt);
    const grid = $('#wallGrid', root);
    grid.innerHTML = list.length
      ? list.map(duelCardHTML).join('')
      : `<div class="empty" style="grid-column:1/-1"><h2>${tab === 'finished' ? 'No finished duels yet' : 'Nothing here yet'}</h2><p>${duels.length ? 'Try another tab or category.' : 'Be the first to start a duel.'}</p><a class="btn btn--primary" href="app/new" data-link>Start a duel</a></div>`;
    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    if (cat === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', cat);
    history.replaceState(null, '', url);
    if (animate && window.gsap && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.gsap.from($$('.dcard', grid), { y: 20, opacity: 0, stagger: 0.04, duration: 0.45, ease: 'power3.out' });
    }
  };

  $$('.segment button', root).forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      $$('.segment button', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    }),
  );
  $('#catFilter', root).addEventListener('change', (e) => {
    cat = e.target.value;
    draw();
  });
  draw();

  // keep time-left fresh
  const t = setInterval(() => draw(false), 60_000);
  return () => clearInterval(t);
}
