import { CHAIN, CONTRACT_ADDRESS, DEMO, IS_CONFIGURED, NETWORK, REPO_URL, X_URL } from './config.js';
import { $, $$, copy, hydrateIcons, LOGO_SVG, shortAddr, toast, fmt, pct, icon } from './util.js';
import { api, bus, connect, disconnect, explorerAddress, initWallet, switchChain, wallet } from './chain.js';
import { initHome, showHome } from './home.js';
import { initFooter } from './footer.js';
import { renderWall } from './views/wall.js';
import { renderNew } from './views/new.js';
import { renderDuel } from './views/duel.js';
import { renderMe } from './views/me.js';
import { renderPage } from './views/pages.js';

const BASE = window.__BASE__ || '/';
const { gsap } = window;
if (gsap && window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger, window.SplitText, window.Flip, window.Draggable);

// ───────────────────────────── router ─────────────────────────────

const ROUTES = [
  [/^$/, () => ({ view: 'home' })],
  [/^app$/, () => ({ view: 'app', render: renderWall, nav: 'app' })],
  [/^app\/new$/, () => ({ view: 'app', render: renderNew })],
  [/^app\/me$/, () => ({ view: 'app', render: renderMe })],
  [/^d\/(\d+)$/, (m) => ({ view: 'app', render: renderDuel, params: { id: Number(m[1]) } })],
  [/^(guide|about|privacy|terms)$/, (m) => ({ view: 'app', render: renderPage, params: { page: m[1] } })],
];

let cleanup = null;
let pendingScroll = null;

export function currentPath() {
  let p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, '');
  p = p.replace(/index\.html$/, '').replace(/\/+$/, '');
  return p;
}

export function navigate(path, { replace = false } = {}) {
  const url = BASE + path.replace(/^\//, '');
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  route();
}

async function route() {
  const path = currentPath();
  let match = null;
  for (const [re, fn] of ROUTES) {
    const m = path.match(re);
    if (m) { match = fn(m); break; }
  }
  if (!match) match = { view: 'app', render: renderPage, params: { page: '404' } };

  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  cleanup = null;

  const home = $('#home');
  const app = $('#app');
  $$('.nav__link').forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === match.nav));

  if (match.view === 'home') {
    $('#appBand').hidden = true;
    app.innerHTML = '';
    home.hidden = false;
    document.title = 'Headline Duel — Let the crowd pick';
    showHome();
    if (pendingScroll) {
      const id = pendingScroll;
      pendingScroll = null;
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    } else {
      window.scrollTo(0, 0);
    }
  } else {
    home.hidden = true;
    $('#appBand').hidden = false;
    app.innerHTML = '';
    window.scrollTo(0, 0);
    try {
      cleanup = await match.render(app, match.params || {});
    } catch (e) {
      app.innerHTML = `<div class="empty"><h2>Couldn’t load this page</h2><p>${e?.message ? String(e.message).slice(0, 160).replace(/</g, '&lt;') : 'Network error.'}</p><button class="btn btn--ghost" onclick="location.reload()">Retry</button></div>`;
    }
    hydrateIcons(app);
  }
  window.ScrollTrigger?.refresh();
}

window.addEventListener('popstate', route);

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a');
  if (!a || a.target === '_blank') return;
  const raw = a.getAttribute('href') || '';
  if (raw.startsWith('#')) {
    e.preventDefault();
    closeMenus();
    const id = raw.slice(1);
    if (!id) return;
    if (currentPath() === '') document.getElementById(id)?.scrollIntoView();
    else { pendingScroll = id; navigate(''); }
    return;
  }
  if (!a.hasAttribute('data-link')) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  closeMenus();
  const path = (url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname) + url.search;
  navigate(path);
});

// ───────────────────────────── nav ─────────────────────────────

function closeMenus() {
  $('.dropdown')?.classList.remove('is-open');
  $('.dropdown__btn')?.setAttribute('aria-expanded', 'false');
  $('#mobileMenu').hidden = true;
  $('#burger').setAttribute('aria-expanded', 'false');
}

function initNav() {
  const dd = $('.dropdown');
  const btn = $('.dropdown__btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !dd.classList.contains('is-open');
    dd.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!dd.contains(e.target)) { dd.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
  $('#burger').addEventListener('click', () => {
    const m = $('#mobileMenu');
    m.hidden = !m.hidden;
    $('#burger').setAttribute('aria-expanded', String(!m.hidden));
  });
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function renderWalletBtn() {
  const b = $('#walletBtn');
  b.classList.remove('is-wrong');
  if (!wallet.hasProvider) {
    b.textContent = 'Install MetaMask';
    b.onclick = () => window.open('https://metamask.io/download/', '_blank', 'noopener');
    return;
  }
  if (!wallet.account) {
    b.textContent = 'Connect wallet';
    b.onclick = () => connect().catch((e) => e?.code !== 4001 && toast(e.message || 'Could not connect', 'err'));
    return;
  }
  if (!wallet.onRightChain) {
    b.classList.add('is-wrong');
    b.textContent = 'Switch to BOT Chain';
    b.onclick = () => switchChain().catch(() => toast('Could not switch network', 'err'));
    return;
  }
  b.innerHTML = `<span class="dot"></span><span class="mono">${shortAddr(wallet.account)}</span>`;
  b.title = 'Click to disconnect';
  b.onclick = () => { if (confirm('Disconnect this wallet from Headline Duel?')) disconnect(); };
}

// ───────────────────────────── stats (footer + home) ─────────────────

export async function loadStats() {
  try {
    const s = await api.stats();
    const acc = pct(s.aiCorrect, s.aiFinished);
    $('#footerStats').textContent = `DUELS ${fmt(s.duels)} · VOTES ${fmt(s.votes)} · AI RIGHT ${s.aiFinished ? acc + '%' : '—'}`;
    return { ...s, acc };
  } catch {
    $('#footerStats').textContent = 'DUELS — · VOTES — · AI RIGHT —';
    return null;
  }
}

// ───────────────────────────── boot ─────────────────────────────

function boot() {
  hydrateIcons();
  $$('[data-logo]').forEach((n) => (n.innerHTML = LOGO_SVG));

  if (DEMO) {
    const bn = $('#demo-banner');
    bn.hidden = false;
    bn.innerHTML = IS_CONFIGURED
      ? 'Demo mode: data lives only in this browser.'
      : 'Demo mode: no contract is configured yet, so duels and votes are stored only in this browser. <a href="about" data-link>How to deploy</a>';
  } else if (NETWORK === 'testnet') {
    const bn = $('#demo-banner');
    bn.hidden = false;
    bn.textContent = `Testnet — ${CHAIN.name} (chain ID ${CHAIN.chainId})`;
  }

  // Footer contract strip
  $('#chainIdLbl').textContent = CHAIN.chainId;
  $('#addrLbl').textContent = IS_CONFIGURED ? shortAddr(CONTRACT_ADDRESS) : 'not deployed yet';
  $('#explorerBtn').href = IS_CONFIGURED ? explorerAddress(CONTRACT_ADDRESS) : CHAIN.explorer;
  $('#contractCopy').addEventListener('click', () => IS_CONFIGURED ? copy(CONTRACT_ADDRESS, 'Contract address copied') : toast('Contract not deployed yet'));
  $('#xLink').href = X_URL;
  $('#ghLink').href = REPO_URL;
  $('#ghLink2').href = REPO_URL;

  initNav();
  bus.addEventListener('wallet', renderWalletBtn);
  renderWalletBtn();
  initWallet();
  initHome();
  initFooter();
  loadStats();
  route();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { icon };
