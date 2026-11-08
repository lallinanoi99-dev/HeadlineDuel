// /d/:id — vote page + live results
import { CONFIDENCE, REPO_URL } from '../config.js';
import { $, $$, esc, toast, copy, fmt, pct, catName, versionHTML, shortAddr, timeAgo, isMobile, reducedMotion, icon } from '../util.js';
import { api, bus, wallet, txErrorMessage, reasonHash, explorerTx, explorerAddress } from '../chain.js';
import { moderate, summarise } from '../ai.js';
import { aiBadgeHTML, resultCardHTML, sideLetter, statusText } from './shared.js';

const MAX_REASON = 140;

export async function renderDuel(root, { id }) {
  const { gsap } = window;
  let duel = null, aiReason = '', myVote = 0, votes = null, curator = null, chart = null, poll = null, drag = null;
  let picked = 0, busy = false, summaryCache = null, summaryFor = -1;

  root.innerHTML = '<div class="skeleton" style="height:70px;margin-bottom:18px"></div><div class="skeleton" style="height:min(62vh,560px)"></div>';

  async function load() {
    duel = await api.getDuel(id);
    if (!duel) return;
    const [r, v, c] = await Promise.all([
      api.aiReason(duel).catch(() => ''),
      wallet.account ? api.voteOf(id, wallet.account).catch(() => 0) : 0,
      api.curator().catch(() => null),
    ]);
    aiReason = r; myVote = v; curator = c;
  }

  const isCreator = () => wallet.account && duel && wallet.account.toLowerCase() === duel.creator.toLowerCase();
  const isCurator = () => wallet.account && curator && wallet.account.toLowerCase() === curator.toLowerCase();
  const canVote = () => duel.live && !myVote && !isCreator() && !duel.hidden;
  const revealed = () => !duel.live || Boolean(myVote) || isCreator();

  function render() {
    if (chart) { chart.destroy(); chart = null; }
    if (drag) { drag.kill(); drag = null; }
    if (!duel) {
      document.title = 'Duel not found — Headline Duel';
      root.innerHTML = `<div class="empty"><h2>Duel not found</h2><p>There’s no duel #${esc(id)} on BOT Chain.</p><a class="btn btn--primary" href="app" data-link>Back to the wall</a></div>`;
      return;
    }
    document.title = `${duel.question} — Headline Duel #${duel.id}`;
    if (duel.hidden && !isCurator()) {
      root.innerHTML = `<div class="empty"><h2>This duel was hidden</h2><p>The curator hid duel #${duel.id} for breaking the content rules.</p><a class="btn btn--primary" href="app" data-link>Back to the wall</a></div>`;
      return;
    }
    const can = canVote();
    root.innerHTML = `
      <div class="duel ${revealed() ? 'has-sticky' : ''}">
        ${duel.hidden ? '<div class="notice notice--warn">Hidden from the wall by the curator.</div>' : ''}
        ${!wallet.hasProvider && duel.live ? '<div class="notice notice--warn">Install MetaMask to vote — one vote per wallet keeps it fair. <a class="btn btn--ghost btn--sm" href="https://metamask.io/download/" target="_blank" rel="noopener">Get MetaMask ↗</a></div>' : ''}
        ${wallet.account && !wallet.onRightChain ? '<div class="notice notice--warn">You’re on the wrong network. Use “Switch to BOT Chain” in the top bar.</div>' : ''}
        <div class="duel__head">
          <div>
            <div class="duel__meta"><span class="chip">${esc(catName(duel.category))}</span><span class="chip">#${duel.id}</span><span class="chip">${esc(statusText(duel))}</span>${revealed() ? `<span class="chip">${fmt(duel.total)} votes</span>` : ''}</div>
            <h1 class="duel__q" style="margin-top:14px">${esc(duel.question)}</h1>
          </div>
          <div class="duel__meta">
            <button class="btn btn--ghost btn--sm" id="shareBtn" type="button">${icon('share')} Share</button>
            <a class="btn btn--ghost btn--sm" id="reportBtn" target="_blank" rel="noopener" href="${esc(`${REPO_URL}/issues/new?title=${encodeURIComponent(`Report duel #${duel.id}`)}&body=${encodeURIComponent(`Duel: ${location.href}\nReason: `)}`)}">${icon('flag')} Report</a>
          </div>
        </div>

        ${!duel.live ? bannerHTML() : ''}

        <div class="vsplit" id="vsplit">
          ${[1, 2].map((n) => `<button class="vside vside--${n === 1 ? 'a' : 'b'} ${myVote === n ? 'is-picked' : ''} ${myVote && myVote !== n ? 'is-dim' : ''}" data-side="${n}" ${can ? '' : 'disabled'} aria-pressed="${myVote === n}" aria-label="Vote ${sideLetter(n)}">
            <span class="vside__tag">${sideLetter(n)}${myVote === n ? ' · your vote' : ''}</span>
            ${versionHTML(duel, n)}
            ${can ? `<span class="vside__key">${n === 1 ? '← press' : 'press →'}</span>` : ''}
          </button>`).join('')}
          <div class="vs" id="vsBadge">VS</div>
        </div>

        ${can ? `
        <div class="votebox" id="votebox">
          <div class="field">
            <label for="reason">Why? <span class="muted" style="text-transform:none;letter-spacing:0">optional</span><span class="counter" id="cReason">0/${MAX_REASON}</span></label>
            <input class="input" id="reason" maxlength="200" placeholder="${isMobile() ? 'Tap a side (or swipe), then say why' : 'Pick a side (← / →), then say why — e.g. “B feels clearer”'}">
          </div>
          <button class="btn btn--primary btn--lg" id="voteBtn" type="button" disabled>Pick a side</button>
        </div>` : ''}

        <div id="results"></div>
      </div>`;

    $('#shareBtn', root).addEventListener('click', share);
    if (can) wireVoting();
    renderResults(false);
  }

  function bannerHTML() {
    if (duel.winner === 3) return `<div class="banner banner--draw" style="margin-bottom:16px">🤝 It’s a tie${duel.total ? ` — ${fmt(duel.votesA)} each` : ' — no votes'}</div>`;
    const w = duel.winner;
    return `<div class="banner banner--${w === 1 ? 'a' : 'b'}" style="margin-bottom:16px">🏆 ${sideLetter(w)} wins with ${pct(w === 1 ? duel.votesA : duel.votesB, duel.total)}% of ${fmt(duel.total)} votes</div>`;
  }

  // ── voting ──
  function choose(n) {
    picked = n;
    $$('.vside', root).forEach((b) => {
      const s = Number(b.dataset.side);
      b.classList.toggle('is-picked', s === n);
      b.classList.toggle('is-dim', s !== n);
      b.setAttribute('aria-pressed', String(s === n));
    });
    const vb = $('#voteBtn', root);
    vb.disabled = false;
    vb.className = `btn btn--lg ${n === 1 ? 'btn--a' : 'btn--b'}`;
    vb.textContent = `Vote ${sideLetter(n)}`;
    $('#reason', root).focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!canVote() || busy) return;
    if (e.target.matches('input, textarea') && e.target.value) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); choose(1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); choose(2); }
    if (e.key === 'Enter' && picked && e.target.id === 'reason') submitVote();
  }

  function wireVoting() {
    $$('.vside', root).forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.side))));
    const r = $('#reason', root);
    r.addEventListener('input', () => {
      const n = [...r.value].length;
      const c = $('#cReason', root);
      c.textContent = `${n}/${MAX_REASON}`;
      c.classList.toggle('is-over', n > MAX_REASON);
    });
    $('#voteBtn', root).addEventListener('click', submitVote);

    // Mobile: swipe the card left (A) or right (B)
    if (window.Draggable && isMobile()) {
      const el = $('#vsplit', root);
      [drag] = window.Draggable.create(el, {
        type: 'x',
        minimumMovement: 8,
        allowNativeTouchScrolling: true,
        dragClickables: false,
        onDrag() { gsap.set(el, { rotate: this.x / 40 }); },
        onRelease() {
          if (this.x < -80) choose(1);
          else if (this.x > 80) choose(2);
          gsap.to(el, { x: 0, rotate: 0, duration: 0.35, ease: 'back.out(2)' });
        },
      });
    }
  }

  async function submitVote() {
    if (busy || !picked) return;
    const reason = $('#reason', root).value.trim();
    if ([...reason].length > MAX_REASON) return toast(`Keep your reason to ${MAX_REASON} characters.`, 'err');
    const btn = $('#voteBtn', root);
    busy = true;
    btn.classList.add('is-busy');
    btn.textContent = reason ? 'Checking reason…' : 'Confirm in wallet…';
    try {
      if (reason) {
        const m = await moderate([reason]);
        if (!m.ok) { toast(`Reason blocked: ${m.reason}`, 'err', 6000); return; }
        btn.textContent = 'Confirm in wallet…';
      }
      const res = await api.vote(id, picked, reason);
      toast('Vote recorded on BOT Chain ✓', 'ok');
      await afterVote(res.hash);
    } catch (e) {
      toast(txErrorMessage(e), 'err', 6000);
      btn.textContent = `Retry — Vote ${sideLetter(picked)}`;
    } finally {
      busy = false;
      btn?.classList.remove('is-busy');
    }
  }

  async function afterVote(hash) {
    const chosen = $(`.vside[data-side="${picked}"]`, root);
    const other = $(`.vside[data-side="${picked === 1 ? 2 : 1}"]`, root);
    if (!reducedMotion() && gsap) {
      const away = picked === 1 ? 60 : -60; // slide the other side out through its own edge
      await gsap.timeline()
        .to(other, { xPercent: isMobile() ? 0 : away, yPercent: isMobile() ? away : 0, opacity: 0, duration: 0.5, ease: 'power3.in' })
        .to('#vsBadge', { scale: 0, opacity: 0, duration: 0.25 }, '<')
        .to(chosen, { scale: 1.03, duration: 0.25, ease: 'power2.out' }, '<0.15')
        .to(chosen, { scale: 1, duration: 0.3, ease: 'power2.inOut' })
        .then();
    }
    await load();
    votes = null; // refetch
    render();
    if (hash) toast('View your vote on the explorer', 'info');
    $('#results', root)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  // ── results ──
  async function renderResults(isRefresh) {
    const box = $('#results', root);
    if (!box) return;
    if (!revealed()) {
      box.innerHTML = `<div class="lockcard"><h3>🔒 Vote to see results</h3><p>Results stay hidden until you vote, so nobody just follows the crowd.</p>${aiBadgeHTML(duel, { revealed: false })}</div>`;
      return;
    }
    const pa = pct(duel.votesA, duel.total), pb = duel.total ? 100 - pa : 0;
    const verified = duel.aiPick ? reasonHash(aiReason) === duel.aiReasonHash : null;
    box.innerHTML = `
      <div class="results">
        <div class="bigbar" aria-label="A ${pa}%, B ${pb}%">
          <div class="bigbar__a" style="flex:0 0 ${duel.total ? pa : 50}%"></div><div class="bigbar__b" style="flex:1"></div>
          <span class="l">A ${pa}%</span><span class="r">B ${pb}%</span>
        </div>
        <div class="duel__meta" style="justify-content:space-between">
          <span class="mono muted">${fmt(duel.votesA)} A · ${fmt(duel.votesB)} B · ${fmt(duel.total)} votes</span>
          ${aiBadgeHTML(duel)}
        </div>
        ${duel.aiPick ? `<div class="panel" style="margin:0"><p>🤖 AI predicted <b>${sideLetter(duel.aiPick)}</b> with ${esc(CONFIDENCE[duel.aiConfidence])} confidence: “${esc(aiReason || '…')}”</p>
          <p class="verify ${verified ? 'verify--ok' : 'verify--bad'}" style="margin-top:8px">${verified ? '✓ Matches the hash locked at creation' : '⚠ Reason text does not match the locked hash'} · ${esc(duel.aiReasonHash.slice(0, 10))}…${esc(duel.aiReasonHash.slice(-6))}</p></div>`
          : '<div class="panel" style="margin:0"><p class="muted">🤖 No AI pick was locked for this duel.</p></div>'}
        <div class="results__row">
          <section class="panel" style="margin:0"><h2>Votes over time</h2><div class="chartbox"><canvas id="chart" aria-label="Votes over time"></canvas></div></section>
          <section class="panel" style="margin:0"><h2>AI summary of reasons</h2><div id="themes"><div class="skeleton" style="height:80px"></div></div></section>
        </div>
        <section class="panel" style="margin:0"><h2>Top reasons</h2><div class="reasons" id="reasons"><div class="skeleton" style="height:120px"></div><div class="skeleton" style="height:120px"></div></div></section>
        ${isCreator() || isCurator() ? `<section class="panel" style="margin:0"><h2>${isCreator() ? 'Your duel' : 'Curator'}</h2><div class="creator-actions">
          ${isCreator() && duel.live ? '<button class="btn btn--danger" id="endBtn" type="button">End early</button>' : ''}
          ${isCreator() ? `<button class="btn btn--ghost" id="pngBtn" type="button">${icon('download')} Download result card</button>
          <a class="btn btn--ghost" href="app/new?rematch=${duel.id}" data-link>${icon('repeat')} Start a rematch</a>` : ''}
          ${isCurator() ? `<button class="btn btn--ghost" id="hideBtn" type="button">${duel.hidden ? 'Unhide duel' : 'Hide duel'}</button>` : ''}
        </div></section>` : `<div class="creator-actions"><button class="btn btn--ghost" id="pngBtn" type="button">${icon('download')} Download result card</button></div>`}
        <p class="mono muted" style="font-size:12px">Created by <a href="${esc(explorerAddress(duel.creator))}" target="_blank" rel="noopener">${shortAddr(duel.creator)}</a> at block ${fmt(duel.createdBlock)} · all votes are public events</p>
      </div>
      <div class="stickybar"><div class="bigbar"><div class="bigbar__a" style="flex:0 0 ${duel.total ? pa : 50}%"></div><div class="bigbar__b" style="flex:1"></div><span class="l">A ${pa}%</span><span class="r">B ${pb}%</span></div><span class="mono" style="font-size:13px">${fmt(duel.total)}</span></div>`;

    if (!isRefresh && !reducedMotion() && gsap) {
      gsap.from($$('.bigbar__a, .bigbar__b', box), { scaleX: 0, duration: 1.1, ease: 'power3.out', stagger: 0.05 });
      gsap.from($$('.results > *', box), { y: 16, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' });
    }

    $('#endBtn', root)?.addEventListener('click', () => write('endEarly', () => api.endEarly(id), 'Duel ended'));
    $('#hideBtn', root)?.addEventListener('click', () => write('setHidden', () => api.setHidden(id, !duel.hidden), duel.hidden ? 'Duel unhidden' : 'Duel hidden'));
    $('#pngBtn', root)?.addEventListener('click', downloadCard);

    if (!votes) {
      try { votes = await api.votes(duel); } catch { votes = []; }
    }
    if (!$('#reasons', root)) return; // navigated away
    drawReasons();
    drawChart();
    drawThemes();
  }

  function drawReasons() {
    const list = (side) => {
      const items = votes.filter((v) => v.choice === side && v.reason).slice(-6).reverse();
      return `<div><h3><span class="tagAB tagAB--${side === 1 ? 'a' : 'b'}">${sideLetter(side)}</span> Newest reasons for ${sideLetter(side)}</h3>${items.length ? `<ul>${items.map((v) => `<li><span>${esc(v.reason)}</span><small>${v.ts ? timeAgo(v.ts) : ''}</small></li>`).join('')}</ul>` : '<p class="muted">No reasons yet.</p>'}</div>`;
    };
    $('#reasons', root).innerHTML = list(1) + list(2);
  }

  function drawChart() {
    const canvas = $('#chart', root);
    if (!canvas || !window.Chart) return;
    const sorted = votes.slice().sort((a, b) => a.ts - b.ts);
    let a = 0, b = 0;
    const start = sorted[0]?.ts ? sorted[0].ts - 60 : Math.floor(Date.now() / 1000);
    const pts = [{ t: start, a: 0, b: 0 }];
    sorted.forEach((v) => { if (v.choice === 1) a++; else b++; pts.push({ t: v.ts, a, b }); });
    const label = (t) => new Date(t * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    chart = new window.Chart(canvas, {
      type: 'line',
      data: {
        labels: pts.map((p) => label(p.t)),
        datasets: [
          { label: 'A', data: pts.map((p) => p.a), borderColor: '#3D7BFF', backgroundColor: 'rgba(61,123,255,.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
          { label: 'B', data: pts.map((p) => p.b), borderColor: '#FF5C39', backgroundColor: 'rgba(255,92,57,.12)', fill: true, tension: 0.3, pointRadius: 0, borderWidth: 2 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reducedMotion() ? false : { duration: 800 },
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#A3A09A', boxWidth: 12, font: { family: 'Geist Mono' } } } },
        scales: {
          x: { ticks: { color: '#77746e', maxTicksLimit: 5, font: { family: 'Geist Mono', size: 10 } }, grid: { color: '#2e2e2e' } },
          y: { beginAtZero: true, ticks: { color: '#77746e', precision: 0, font: { family: 'Geist Mono', size: 10 } }, grid: { color: '#2e2e2e' } },
        },
      },
    });
  }

  async function drawThemes() {
    const box = $('#themes', root);
    const withReasons = votes.filter((v) => v.reason);
    if (withReasons.length < 2) { box.innerHTML = '<p class="muted">The AI will group reasons into themes once a few people explain their vote.</p>'; return; }
    try {
      if (!summaryCache || summaryFor !== withReasons.length) {
        summaryCache = await summarise(duel, withReasons);
        summaryFor = withReasons.length;
      }
      if (!$('#themes', root)) return;
      const s = summaryCache;
      const row = (side, arr) => arr.length ? `<p style="margin:6px 0"><b>${side}:</b></p><div class="themes">${arr.map((t) => `<span class="theme theme--${side.toLowerCase()}">${esc(t.theme)} <b>${t.count}</b></span>`).join('')}</div>` : '';
      const html = row('A', s.A || []) + row('B', s.B || []);
      $('#themes', root).innerHTML = (html || '<p class="muted">No clear themes yet.</p>') + `<p class="muted" style="font-size:12px;margin-top:12px">${s.offline ? 'Grouped by exact wording (no AI Worker configured).' : 'Grouped by AI from real reasons only — counts are recomputed from the reasons.'}</p>`;
    } catch {
      if ($('#themes', root)) $('#themes', root).innerHTML = '<p class="muted">AI summary unavailable right now.</p>';
    }
  }

  async function write(_name, fn, okMsg) {
    try {
      await fn();
      toast(okMsg, 'ok');
      await load();
      render();
    } catch (e) {
      toast(txErrorMessage(e), 'err', 6000);
    }
  }

  async function downloadCard() {
    if (!window.htmlToImage) return toast('Image export is still loading — try again', 'err');
    const holder = document.createElement('div');
    holder.className = 'card-export';
    holder.innerHTML = resultCardHTML(duel, aiReason);
    document.body.append(holder);
    try {
      await document.fonts?.ready;
      const url = await window.htmlToImage.toPng(holder.firstElementChild, { pixelRatio: 2, backgroundColor: '#272727', cacheBust: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = `headline-duel-${duel.id}.png`;
      a.click();
    } catch {
      toast('Could not create the image (an image host may block it).', 'err');
    } finally {
      holder.parentNode?.removeChild(holder);
    }
  }

  function share() {
    const url = location.href.split('?')[0];
    const text = `Help me pick: A or B? 👀 “${duel.question}”`;
    if (navigator.share && isMobile()) navigator.share({ title: 'Headline Duel', text, url }).catch(() => {});
    else copy(url, 'Link copied');
  }

  // ── boot ──
  try { await load(); } catch (e) {
    root.innerHTML = `<div class="empty"><h2>Couldn’t reach BOT Chain</h2><p>${esc(e.message || 'Network error')}</p><button class="btn btn--ghost" onclick="location.reload()">Retry</button></div>`;
    return;
  }
  render();
  document.addEventListener('keydown', onKey);

  const onWallet = async () => { await load(); votes = null; picked = 0; render(); };
  bus.addEventListener('wallet', onWallet);

  // Live refresh (votes update for everyone)
  poll = setInterval(async () => {
    if (!duel || !revealed() || busy || document.hidden) return;
    try {
      const fresh = await api.getDuel(id);
      if (fresh && (fresh.total !== duel.total || fresh.live !== duel.live || fresh.hidden !== duel.hidden)) {
        const statusChanged = fresh.live !== duel.live || fresh.hidden !== duel.hidden;
        duel = fresh;
        votes = null;
        if (statusChanged) render(); else { if (chart) { chart.destroy(); chart = null; } renderResults(true); }
      }
    } catch {}
  }, 15000);

  return () => {
    clearInterval(poll);
    document.removeEventListener('keydown', onKey);
    bus.removeEventListener('wallet', onWallet);
    if (chart) chart.destroy();
    if (drag) drag.kill();
  };
}

