// Website (/) — GSAP animations + live data from the contract.
import { $, $$, esc, catName, fmt, pct, reducedMotion, isMobile } from './util.js';
import { api } from './chain.js';
import { resultCardHTML } from './views/shared.js';
import { loadStats } from './main.js';

const { gsap } = window;
let started = false;

export function initHome() {
  if (started) return;
  started = true;
  const mm = gsap.matchMedia();
  mm.add({ motion: '(prefers-reduced-motion: no-preference)', still: '(prefers-reduced-motion: reduce)' }, (ctx) => {
    const { motion } = ctx.conditions;
    const a = heroTitle(motion);
    const b = heroDemo(motion);
    reveals(motion);
    return () => { a && a(); b && b(); };
  });
  featureMenu();
  steps();
  loadLive();
}

export function showHome() {
  window.ScrollTrigger?.refresh();
}

// ── hero ───────────────────────────────────────────────────────────

function heroTitle(motion) {
  if (!motion || !window.SplitText) return null;
  const split = new window.SplitText('#heroTitle', { type: 'words,chars', wordsClass: 'word', charsClass: 'char' });
  gsap.from(split.chars, { yPercent: 110, opacity: 0, rotate: 6, stagger: 0.025, duration: 0.8, ease: 'power4.out', delay: 0.1 });
  gsap.from('.hero .kicker, .hero__sub, .hero__ctas, .hero .pills', { y: 18, opacity: 0, stagger: 0.08, duration: 0.7, ease: 'power3.out', delay: 0.35 });
  return () => split.revert();
}

const DEMO_ROUNDS = [
  { q: 'Which would make you click?', a: 'How we cut our cloud bill in half', b: 'Our cloud bill was $40k. Now it’s $19k.', pa: 38, ai: 2 },
  { q: 'Which tagline fits a coffee subscription for students?', a: 'Fuel for finals.', b: 'Fresh beans, every Monday.', pa: 64, ai: 2 },
  { q: 'Which email subject would you open?', a: 'You left something behind', b: 'Your 7-day streak is waiting 🔥', pa: 41, ai: 2 },
];

function heroDemo(motion) {
  const A = $('#demoTextA'), B = $('#demoTextB'), Q = $('#demoQ');
  const sideA = $('#demoA'), sideB = $('#demoB');
  const barA = $('#demoBarA'), barB = $('#demoBarB');
  const pA = $('#demoPctA'), pB = $('#demoPctB');
  const badge = $('#demoBadge'), badgeText = $('#demoBadgeText'), cursor = $('#demoCursor'), vs = $('#demoVS');
  const tabs = $$('#demoTabs .seg__tab');

  const markTab = (i) => tabs.forEach((t, n) => { t.classList.toggle('is-active', n === i); t.setAttribute('aria-selected', String(n === i)); });

  const setRound = (r, full) => {
    const crowd = 100 - r.pa > r.pa ? 2 : 1;
    const agreed = r.ai === crowd;
    Q.textContent = r.q;
    pA.textContent = r.pa + '%';
    pB.textContent = 100 - r.pa + '%';
    barA.style.flex = `0 0 ${r.pa}%`;
    badge.classList.toggle('is-surprise', !agreed);
    badgeText.textContent = agreed ? `AI picked ${r.ai === 1 ? 'A' : 'B'}. The crowd agreed.` : 'The crowd surprised the AI.';
    if (full) { A.textContent = r.a; B.textContent = r.b; }
  };

  if (!motion) {
    setRound(DEMO_ROUNDS[0], true);
    sideB.classList.add('is-chosen');
    tabs.forEach((t, i) => t.addEventListener('click', () => {
      markTab(i);
      setRound(DEMO_ROUNDS[i], true);
      const r = DEMO_ROUNDS[i];
      sideA.classList.toggle('is-chosen', r.pa > 50);
      sideB.classList.toggle('is-chosen', r.pa <= 50);
    }));
    return null;
  }

  const typeTo = (node, text, dur) => {
    const o = { n: 0 };
    return gsap.to(o, { n: text.length, duration: dur, ease: 'none', onUpdate: () => (node.textContent = text.slice(0, Math.round(o.n))) });
  };
  const rel = (el) => { // position of el relative to the window (cursor's container)
    const w = cursor.parentElement.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return { x: b.left - w.left, y: b.top - w.top, w: b.width, h: b.height };
  };

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4, paused: true });
  DEMO_ROUNDS.forEach((r, i) => {
    const pickB = 100 - r.pa >= r.pa;
    const target = pickB ? sideB : sideA;
    tl.addLabel(`r${i}`)
      .call(() => {
        markTab(i);
        setRound(r, false);
        A.textContent = '';
        B.textContent = '';
        sideA.classList.remove('is-chosen');
        sideB.classList.remove('is-chosen');
      })
      .set([barA, barB], { scaleX: 0 })
      .set([pA, pB], { opacity: 0 })
      .set(badge, { opacity: 0, y: 12, scale: 0.9 })
      .set(vs, { y: -160, opacity: 0, rotate: -20 })
      .set(cursor, { x: () => rel(sideA).x + rel(sideA).w * 0.3, y: () => rel(sideA).y + rel(sideA).h + 120, opacity: 0 })
      .add(typeTo(A, r.a, Math.min(1.4, r.a.length * 0.04)))
      .add(typeTo(B, r.b, Math.min(1.4, r.b.length * 0.04)), '+=0.15')
      .to(vs, { y: 0, opacity: 1, rotate: 0, duration: 0.9, ease: 'bounce.out' }, '+=0.1')
      .to(cursor, { opacity: 1, duration: 0.2 })
      .to(cursor, { x: () => rel(target).x + rel(target).w * 0.55, y: () => rel(target).y + rel(target).h * 0.55, duration: 0.9, ease: 'power2.inOut' })
      .to(cursor, { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1 })
      .call(() => target.classList.add('is-chosen'))
      .to(barA, { scaleX: 1, duration: 0.9, ease: 'power3.out' }, '+=0.15')
      .to(barB, { scaleX: 1, duration: 0.9, ease: 'power3.out' }, '<')
      .to([pA, pB], { opacity: 1, duration: 0.3 }, '-=0.3')
      .to(badge, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(2.2)' })
      .to(cursor, { opacity: 0, duration: 0.3 }, '<')
      .to({}, { duration: 2.2 });
  });

  tabs.forEach((t, i) => t.addEventListener('click', () => { tl.play(`r${i}`); }));
  const st = window.ScrollTrigger.create({ trigger: '.showcase', start: 'top bottom', end: 'bottom top', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
  return () => { tl.kill(); st.kill(); };
}

function reveals(motion) {
  if (!motion) return;
  $$('[data-reveal]').forEach((n) => {
    gsap.from(n, { y: 34, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: n, start: 'top 88%', once: true } });
  });
  gsap.from('.statement__text b', { opacity: 0.25, stagger: 0.15, scrollTrigger: { trigger: '.statement', start: 'top 75%', end: 'bottom 60%', scrub: true } });
}

// ── section 4: vertical menu + stage (Flip) ────────────────────────

const TABS = [
  { layout: 'split', url: 'd/12', q: 'Which would make you click?', a: 'The 4-day week, one year later', b: 'We tried a 4-day week. Here’s what broke.', ma: 41, ai: 'B · medium',
    title: 'Headlines that earn the click', text: 'See whether a concrete number beats a clever line, and read why people picked it.' },
  { layout: 'stack', url: 'd/27', q: 'Which ad line sells the bike lock?', a: 'Thieves hate this lock.', b: 'Lock it in 3 seconds. Keep it for 10 years.', ma: 55, ai: 'B · high',
    title: 'Ads people would actually stop for', text: 'Test the benefit against the punchline before you spend on the campaign.' },
  { layout: 'inbox', url: 'd/33', q: 'Which email subject would you open?', a: 'Your 7-day streak is waiting 🔥', b: 'You left something behind', ma: 47, ai: 'A · low',
    title: 'Subjects that get opened', text: 'Curiosity or clarity? Find out from real people before you hit send to your whole list.' },
  { layout: 'chips', url: 'd/40', q: 'Best name for a tiny budgeting app?', a: 'Pennywise', b: 'Coinjar', ma: 32, ai: 'B · medium',
    title: 'Names that stick', text: 'Say them out loud, then let strangers decide. Every reason is kept on-chain.' },
];

function featureMenu() {
  const mock = $('#mock');
  const items = $$('#vmenu .vmenu__item');
  const DUR = 5;
  let i = 0, progress = null, inView = false;

  const apply = (t) => {
    mock.dataset.layout = t.layout;
    $('#mockQ').textContent = t.q;
    $('#mockA').textContent = t.a;
    $('#mockB').textContent = t.b;
    $('#mockUrl').textContent = 'headlineduel.xyz/' + t.url;
    $('#mockAI').textContent = `AI pick locked: ${t.ai}`;
    $('#featTitle').textContent = t.title;
    $('#featText').textContent = t.text;
    mock.querySelector('.mock__card--a i').style.setProperty('--w', t.ma + '%');
    mock.querySelector('.mock__card--b i').style.setProperty('--w', 100 - t.ma + '%');
  };

  const go = (k, user = false) => {
    i = (k + TABS.length) % TABS.length;
    items.forEach((b, n) => { b.classList.toggle('is-active', n === i); b.setAttribute('aria-selected', String(n === i)); });
    const t = TABS[i];
    if (reducedMotion() || !window.Flip) apply(t);
    else {
      const state = window.Flip.getState('#mock [data-flip-id]');
      apply(t);
      window.Flip.from(state, { duration: 0.6, ease: 'power3.inOut', absolute: true, simple: true });
      gsap.from(['#mock p', '#featTitle', '#featText'], { opacity: 0, y: 8, duration: 0.4, delay: 0.15, stagger: 0.04 });
    }
    progress?.kill();
    $$('.vmenu__bar').forEach((b) => gsap.set(b, { scaleX: 0 }));
    if (reducedMotion() || user) return; // user picked: stop auto-advance
    if (inView) progress = gsap.fromTo(items[i].querySelector('.vmenu__bar'), { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: 'none', onComplete: () => go(i + 1) });
  };

  let userPicked = false;
  items.forEach((b, n) => b.addEventListener('click', () => { userPicked = true; go(n, true); }));
  window.ScrollTrigger.create({
    trigger: '#duels .feature', start: 'top 80%', end: 'bottom 20%',
    onToggle: (s) => { inView = s.isActive; if (inView && !userPicked) go(i); else progress?.pause(); },
  });
  apply(TABS[0]);
}

// ── section 5: 01–04 expanding panels (Flip) ───────────────────────

function steps() {
  const wrap = $('#steps');
  const panels = $$('.stp', wrap);
  let i = 0, timer = null;

  function animateStep(k) {
    const s = panels[k];
    if (reducedMotion()) {
      $$('.mini__type', panels[0]).forEach((n) => (n.textContent = n.dataset.text));
      return;
    }
    if (k === 0) {
      const tl = gsap.timeline({ delay: 0.3 });
      $$('.mini__type', s).forEach((n) => {
        const text = n.dataset.text;
        const o = { n: 0 };
        n.textContent = '';
        tl.to(o, { n: text.length, duration: text.length * 0.05, ease: 'none', onUpdate: () => (n.textContent = text.slice(0, Math.round(o.n))) });
      });
    } else if (k === 1) {
      gsap.fromTo($('.mini__robot', s), { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, delay: 0.3, ease: 'bounce.out' });
      gsap.fromTo($('.mini__lock', s), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, delay: 0.7, ease: 'back.out(2)' });
    } else if (k === 2) {
      gsap.fromTo($('.mini__half--b', s), { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, delay: 0.6 });
      gsap.fromTo($('.mini__half--a', s), { opacity: 1 }, { opacity: 0.4, duration: 0.3, delay: 0.8 });
      gsap.fromTo($('.mini__reason', s), { y: 14, opacity: 0 }, { y: 0, opacity: 1, delay: 1 });
    } else if (k === 3) {
      gsap.fromTo([$('.mini__ba', s), $('.mini__bb', s)], { scaleX: 0 }, { scaleX: 1, duration: 0.9, delay: 0.3, ease: 'power3.out' });
      gsap.fromTo($('.mini__win', s), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, delay: 1, ease: 'back.out(2)' });
    }
  }

  function go(k) {
    if (k === i && panels[k].classList.contains('is-active')) return;
    i = (k + panels.length) % panels.length;
    const state = !reducedMotion() && window.Flip && !isMobile() ? window.Flip.getState(panels) : null;
    panels.forEach((p, n) => p.classList.toggle('is-active', n === i));
    if (state) window.Flip.from(state, { duration: 0.7, ease: 'power3.inOut', simple: true });
    animateStep(i);
  }

  panels.forEach((p, n) => {
    p.addEventListener('click', () => { stop(); go(n); });
    p.addEventListener('mouseenter', () => { if (!isMobile()) { stop(); go(n); } });
    p.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stop(); go(n); } });
  });

  const play = () => { if (!timer && !reducedMotion()) timer = setInterval(() => go(i + 1), 4200); };
  const stop = () => { clearInterval(timer); timer = null; };
  wrap.addEventListener('mouseleave', play);
  window.ScrollTrigger.create({ trigger: wrap, start: 'top 80%', end: 'bottom 20%', onEnter: () => { animateStep(i); play(); }, onEnterBack: play, onLeave: stop, onLeaveBack: stop });
  if (reducedMotion()) animateStep(0);
}

// ── live data ──────────────────────────────────────────────────────

async function loadLive() {
  let duels = [];
  try {
    duels = (await api.listDuels()).filter((d) => !d.hidden);
  } catch {}

  // Section 2 — marquee of real live questions
  const live = duels.filter((d) => d.live);
  const items = (live.length ? live : duels).slice(-14).reverse();
  const track = $('#marqueeTrack');
  if (items.length === 0) {
    track.innerHTML = '<span class="marquee__item">No live duels yet. Be the first.</span>';
  } else {
    const html = items
      .map((d) => `<a class="marquee__item" href="d/${d.id}" data-link><span class="chip">${esc(catName(d.category))}</span>${esc(d.question)}${d.isImage ? '' : ` “${esc(d.a.slice(0, 40))}” vs “${esc(d.b.slice(0, 40))}”`}</a>`)
      .join('');
    track.innerHTML = html + html; // duplicated for a seamless loop
    if (!reducedMotion()) {
      requestAnimationFrame(() => {
        const w = track.scrollWidth / 2;
        gsap.to(track, { x: -w, duration: Math.max(20, w / 50), ease: 'none', repeat: -1 });
      });
    }
  }

  // Section 7 — a real finished duel result card
  const finished = duels.filter((d) => !d.live && d.total > 0).sort((a, b) => b.total - a.total)[0];
  const body = $('#realCardBody');
  if (finished) {
    let reason = '';
    try { reason = await api.aiReason(finished); } catch {}
    body.innerHTML = `<a href="d/${finished.id}" data-link>${resultCardHTML(finished, reason)}</a>`;
  } else {
    body.innerHTML = '<p class="muted" style="text-align:center">No finished duels yet. The first one will show up here.</p>';
  }

  // Section 9 + bento — real stats
  const s = await loadStats();
  if (s) {
    const targets = { duels: s.duels, votes: s.votes, acc: s.aiFinished ? s.acc : 0 };
    $$('[data-stat]').forEach((n) => {
      const end = targets[n.dataset.stat];
      if (reducedMotion()) return (n.textContent = fmt(end));
      const o = { v: 0 };
      gsap.to(o, { v: end, duration: 1.6, ease: 'power2.out', scrollTrigger: { trigger: n, start: 'top 90%', once: true }, onUpdate: () => (n.textContent = fmt(Math.round(o.v))) });
    });
    if (!s.aiFinished) $('[data-stat="acc"]').nextElementSibling.textContent = 'AI accuracy % (no finished duels yet)';
    $('#bentoAcc').textContent = s.aiFinished ? `${pct(s.aiCorrect, s.aiFinished)}%` : '—%';
  }
}
