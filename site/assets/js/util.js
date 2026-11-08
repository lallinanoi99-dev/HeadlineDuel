import { CATEGORIES, IPFS_GATEWAY } from './config.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isMobile = () => matchMedia('(max-width: 720px)').matches;
export const ipfs = (cid) => IPFS_GATEWAY + encodeURIComponent(cid);
export const catName = (i) => CATEGORIES[i] ?? 'Headline';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function timeLeft(endsAt) {
  const s = Math.max(0, endsAt - Math.floor(Date.now() / 1000));
  if (s <= 0) return 'Ended';
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${Math.max(1, m)}m left`;
}

export function timeAgo(ts) {
  const s = Math.max(1, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export async function copy(text, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'ok');
  } catch {
    toast('Copy failed — select and copy manually', 'err');
  }
}

// ── toasts ─────────────────────────────────────────────────────────
export function toast(msg, kind = 'info', ms = 4200) {
  let wrap = $('#toasts');
  if (!wrap) {
    wrap = el('<div id="toasts" class="toasts" role="status" aria-live="polite"></div>');
    document.body.append(wrap);
  }
  const t = el(`<div class="toast toast--${kind}"><span>${esc(msg)}</span></div>`);
  wrap.append(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => {
    t.classList.remove('is-in');
    setTimeout(() => t.parentNode && t.parentNode.removeChild(t), 300);
  }, ms);
  return t;
}

// ── icons (inline SVG, stroke = currentColor) ─────────────────────
const P = {
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  robot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16h6"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  type: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h3l6 4V5L8 9H5a1 1 0 0 0-1 1Z"/><path d="M18 9a4 4 0 0 1 0 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h2M3 9h15V6"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 14v5h14v-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
  repeat: '<path d="M4 10a6 6 0 0 1 10-4l2 2M20 14a6 6 0 0 1-10 4l-2-2"/><path d="M16 4v4h-4M8 20v-4h4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  chain: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L12 6.3"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  ext: '<path d="M7 17 17 7M9 7h8v8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  free: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2a3 3 0 0 1-3-1.5M12 6v2M12 16v2"/>',
  rocket: '<path d="M5 15c-1 1-2 4-2 6 2 0 5-1 6-2M9 15l-3-3c2-5 6-9 13-9 0 7-4 11-9 13l-1-1Z"/><circle cx="15" cy="9" r="1.5"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
  xlogo: '<path d="M4 4l16 16M20 4 4 20" stroke-width="2.2"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.spark}</svg>`;
}

/** Replace every <i data-icon="name"></i> with the inline SVG. */
export function hydrateIcons(root = document) {
  $$('i[data-icon]', root).forEach((i) => {
    i.outerHTML = icon(i.dataset.icon, i.className);
  });
}

export const LOGO_SVG = `<svg class="logo-mark" viewBox="0 0 40 28" aria-hidden="true"><rect x="0.5" y="0.5" width="39" height="27" rx="8" fill="#1C1C1C" stroke="#363636"/><text x="7.5" y="19.5" font-family="Geist Mono, ui-monospace, monospace" font-size="13" font-weight="700" fill="#3D7BFF">A</text><rect x="19" y="6" width="2" height="16" rx="1" fill="#39FF7A"/><text x="24" y="19.5" font-family="Geist Mono, ui-monospace, monospace" font-size="13" font-weight="700" fill="#FF5C39">B</text></svg>`;

/** Render a version (text or image CID) as HTML. */
export function versionHTML(duel, side, cls = '') {
  const v = side === 1 ? duel.a : duel.b;
  if (duel.isImage) {
    const src = v.startsWith('data:') ? v : ipfs(v);
    return `<img class="v-img ${cls}" src="${esc(src)}" alt="Version ${side === 1 ? 'A' : 'B'}" loading="lazy" crossorigin="anonymous">`;
  }
  return `<span class="v-text ${cls}">${esc(v)}</span>`;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}
