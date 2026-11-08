// /app/me — profile
import { $, $$, esc, fmt, pct, shortAddr } from '../util.js';
import { api, bus, connect, wallet, explorerAddress } from '../chain.js';
import { duelCardHTML, sideLetter } from './shared.js';

export async function renderMe(root) {
  document.title = 'My duels — Headline Duel';
  let tab = 'mine';

  async function draw() {
    if (!wallet.account) {
      root.innerHTML = `<div class="app__head"><div><h1>My duels</h1><p>Your duels, your votes and how often you side with the crowd.</p></div></div>
        <div class="empty"><h2>Connect your wallet</h2><p>${wallet.hasProvider ? 'Your profile is just your wallet — no accounts.' : 'Install MetaMask to start duels and vote.'}</p>
        <button class="btn btn--primary" id="meConnect" type="button">${wallet.hasProvider ? 'Connect wallet' : 'Install MetaMask'}</button></div>`;
      $('#meConnect', root).addEventListener('click', () => connect().catch(() => {}));
      return;
    }
    root.innerHTML = `<div class="skeleton" style="height:120px;margin-bottom:20px"></div><div class="grid">${'<div class="skeleton" style="height:280px"></div>'.repeat(3)}</div>`;
    const me = wallet.account;
    const [{ created, voted }, all, stats] = await Promise.all([api.duelsOf(me), api.listDuels(), api.stats().catch(() => null)]);
    const byId = new Map(all.map((d) => [d.id, d]));
    const mine = created.map((i) => byId.get(i)).filter(Boolean).reverse();
    const votedOn = voted.map((i) => byId.get(i)).filter(Boolean).reverse();
    const myChoices = await Promise.all(votedOn.map((d) => api.voteOf(d.id, me).catch(() => 0)));
    const choiceOf = new Map(votedOn.map((d, i) => [d.id, myChoices[i]]));

    const decided = votedOn.filter((d) => d.winner === 1 || d.winner === 2);
    const agreed = decided.filter((d) => choiceOf.get(d.id) === d.winner).length;
    const agreement = decided.length ? `${pct(agreed, decided.length)}%` : '—';
    const aiAcc = stats && stats.aiFinished ? `${pct(stats.aiCorrect, stats.aiFinished)}%` : '—';
    const wins = mine.filter((d) => !d.live && d.winner !== 3);

    root.innerHTML = `
      <div class="app__head">
        <div><h1>My duels</h1><p class="mono"><a href="${esc(explorerAddress(me))}" target="_blank" rel="noopener">${shortAddr(me)} ↗</a></p></div>
        <a class="btn btn--primary" href="app/new" data-link>Start a duel</a>
      </div>
      <div class="scorecards">
        <div class="stat"><p class="stat__num mono">${fmt(mine.length)}</p><p class="stat__label">duels started · ${fmt(wins.length)} decided</p></div>
        <div class="stat"><p class="stat__num mono">${fmt(votedOn.length)}</p><p class="stat__label">duels voted on</p></div>
        <div class="stat"><p class="stat__num mono">${agreement}</p><p class="stat__label">crowd agreement${decided.length ? ` · ${agreed}/${decided.length}` : ''}</p></div>
        <div class="stat"><p class="stat__num mono">${aiAcc}</p><p class="stat__label">AI accuracy (site-wide)${stats && stats.aiFinished ? ` · ${stats.aiCorrect}/${stats.aiFinished}` : ''}</p></div>
      </div>
      <div class="segment tablist" role="tablist">
        <button role="tab" data-t="mine" aria-selected="${tab === 'mine'}">My duels (${mine.length})</button>
        <button role="tab" data-t="voted" aria-selected="${tab === 'voted'}">Duels I voted on (${votedOn.length})</button>
      </div>
      <div id="meList"></div>`;

    const list = () => {
      const items = tab === 'mine' ? mine : votedOn;
      $('#meList', root).innerHTML = items.length
        ? `<div class="grid">${items.map((d) => {
            const c = choiceOf.get(d.id);
            const note = tab === 'voted'
              ? `<p class="mono muted" style="font-size:12px;margin-top:8px">You voted ${sideLetter(c)}${d.winner === 1 || d.winner === 2 ? (c === d.winner ? ' · <span style="color:var(--win)">with the crowd</span>' : ' · against the crowd') : ''}</p>`
              : `<p class="mono muted" style="font-size:12px;margin-top:8px">${d.live ? 'Live' : d.winner === 3 ? 'Draw' : `Winner: ${sideLetter(d.winner)}`}${d.hidden ? ' · hidden by curator' : ''}</p>`;
            return `<div>${duelCardHTML(d)}${note}</div>`;
          }).join('')}</div>`
        : `<div class="empty"><h2>${tab === 'mine' ? 'No duels yet' : 'No votes yet'}</h2><p>${tab === 'mine' ? 'Write it twice. Pick it once.' : 'Head to the wall and pick a side.'}</p><a class="btn btn--primary" href="${tab === 'mine' ? 'app/new' : 'app'}" data-link>${tab === 'mine' ? 'Start a duel' : 'Open the wall'}</a></div>`;
    };
    $$('[data-t]', root).forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.t;
      $$('[data-t]', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      list();
    }));
    list();
  }

  const onWallet = () => draw().catch(() => {});
  bus.addEventListener('wallet', onWallet);
  await draw();
  return () => bus.removeEventListener('wallet', onWallet);
}
