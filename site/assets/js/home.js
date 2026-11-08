// Website (/) — GSAP animations + live data from the contract.
import { $, $$, esc, catName, fmt, pct, reducedMotion } from './util.js';
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
    heroTitle(motion);
    heroDemo(motion);
    reveals(motion);
  });
  tabs();
  carousel();
  loadLive();
}

export function showHome() {
  window.ScrollTrigger?.refresh();
}

// ── hero ───────────────────────────────────────────────────────────

function heroTitle(motion) {
  if (!motion || !window.SplitText) return;
  const split = new window.SplitText('#heroTitle', { type: 'words,chars', wordsClass: 'word', charsClass: 'char' });
  gsap.from(split.chars, { yPercent: 110, opacity: 0, rotate: 6, stagger: 0.025, duration: 0.8, ease: 'power4.out', delay: 0.1 });
  gsap.from('.hero .eyebrow, .hero__sub, .hero__ctas, .pills', { y: 18, opacity: 0, stagger: 0.08, duration: 0.7, ease: 'power3.out', delay: 0.35 });
  return () => split.revert();
}

const DEMO_ROUNDS = [
  { a: 'How we cut our cloud bill in half', b: 'Our cloud bill was $40k. Now it’s $19k.', pa: 38, ai: 2, agreed: true },
  { a: 'Fuel for finals.', b: 'Fresh beans, every Monday.', pa: 64, ai: 2, agreed: false },
  { a: 'You left something behind', b: 'Your 7-day streak is waiting 🔥', pa: 41, ai: 2, agreed: true },
];

function heroDemo(motion) {
  const A = $('#demoTextA'), B = $('#demoTextB');
  const sideA = $('#demoA'), sideB = $('#demoB');
  const barA = $('#demoBarA'), barB = $('#demoBarB');
  const pA = $('#demoPctA'), pB = $('#demoPctB');
  const badge = $('#demoBadge'), cursor = $('#demoCursor'), vs = $('#demoVS');

  const setRound = (r, full) => {
    const winB = 100 - r.pa > r.pa;
    const crowd = winB ? 2 : 1;
    const agreed = r.ai === crowd;
    pA.textContent = r.pa + '%';
    pB.textContent = 100 - r.pa + '%';
    barA.style.flex = `0 0 ${r.pa}%`;
    badge.className = 'ai-badge ' + (agreed ? 'ai-badge--ok' : 'ai-badge--surprise');
    badge.textContent = agreed ? `🤖 AI picked ${r.ai === 1 ? 'A' : 'B'} — ✓ the crowd agreed` : '👀 The crowd surprised the AI';
    if (full) { A.textContent = r.a; B.textContent = r.b; }
  };

  if (!motion) {
    setRound(DEMO_ROUNDS[0], true);
    sideB.classList.add('is-chosen');
    return;
  }

  const typeTo = (node, text, dur) => {
    const o = { n: 0 };
    return gsap.to(o, { n: text.length, duration: dur, ease: 'none', onUpdate: () => (node.textContent = text.slice(0, Math.round(o.n))) });
  };

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6, paused: true });
  DEMO_ROUNDS.forEach((r) => {
    const pickB = 100 - r.pa >= r.pa;
    const target = pickB ? sideB : sideA;
    tl.call(() => {
      setRound(r, false);
      A.textContent = '';
      B.textContent = '';
      sideA.classList.remove('is-chosen');
      sideB.classList.remove('is-chosen');
    })
      .set([barA, barB], { scaleX: 0 })
      .set([pA, pB, badge], { opacity: 0 })
      .set(badge, { scale: 0.6 })
      .set(vs, { y: -160, opacity: 0, rotate: -20 })
      .set(cursor, { x: () => sideA.offsetLeft + sideA.offsetWidth * 0.3, y: () => sideA.offsetTop + sideA.offsetHeight + 120, opacity: 0 })
      .add(typeTo(A, r.a, Math.min(1.4, r.a.length * 0.04)))
      .add(typeTo(B, r.b, Math.min(1.4, r.b.length * 0.04)), '+=0.15')
      .to(vs, { y: 0, opacity: 1, rotate: 0, duration: 0.9, ease: 'bounce.out' }, '+=0.1')
      .to(cursor, { opacity: 1, duration: 0.2 })
      .to(cursor, {
        x: () => target.offsetLeft + target.offsetWidth * 0.55,
        y: () => target.offsetTop + target.offsetHeight * 0.55,
        duration: 0.9,
        ease: 'power2.inOut',
      })
      .to(cursor, { scale: 0.8, duration: 0.08, yoyo: true, repeat: 1 })
      .call(() => target.classList.add('is-chosen'))
      .to(barA, { scaleX: 1, duration: 0.9, ease: 'power3.out' }, '+=0.15')
      .to(barB, { scaleX: 1, duration: 0.9, ease: 'power3.out' }, '<')
      .to([pA, pB], { opacity: 1, duration: 0.3 }, '-=0.3')
      .to(badge, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)' })
      .to(cursor, { opacity: 0, duration: 0.3 }, '<')
      .to({}, { duration: 2.2 });
  });

  // only play while visible
  window.ScrollTrigger.create({ trigger: '.poster', start: 'top bottom', end: 'bottom top', onToggle: (s) => (s.isActive ? tl.play() : tl.pause()) });
  return () => tl.kill();
}

function reveals(motion) {
  if (!motion) return;
  $$('[data-reveal]').forEach((n) => {
    gsap.from(n, { y: 34, opacity: 0, duration: 0.8, ease: 'power3.out', scrollTrigger: { trigger: n, start: 'top 88%', once: true } });
  });
  gsap.from('.statement__text b', { opacity: 0.25, stagger: 0.15, scrollTrigger: { trigger: '.statement', start: 'top 75%', end: 'bottom 60%', scrub: true } });
}

// ── tab rail with Flip ─────────────────────────────────────────────

const TABS = [
  { layout: 'split', url: 'd/12', q: 'Which would make you click?', a: 'The 4-day week, one year later', b: 'We tried a 4-day week. Here’s what broke.', ma: 41, ai: 'B · medium' },
  { layout: 'stack', url: 'd/27', q: 'Which ad line sells the bike lock?', a: 'Thieves hate this lock.', b: 'Lock it in 3 seconds. Keep it for 10 years.', ma: 55, ai: 'B · high' },
  { layout: 'inbox', url: 'd/33', q: 'Which email subject would you open?', a: 'Your 7-day streak is waiting 🔥', b: 'You left something behind', ma: 47, ai: 'A · low' },
  { layout: 'chips', url: 'd/40', q: 'Best name for a tiny budgeting app?', a: 'Pennywise', b: 'Coinjar', ma: 32, ai: 'B · medium' },
];

function tabs() {
  const mock = $('#mock');
  const apply = (t) => {
    mock.dataset.layout = t.layout;
    $('#mockQ').textContent = t.q;
    $('#mockA').textContent = t.a;
    $('#mockB').textContent = t.b;
    $('#mockUrl').textContent = 'headlineduel.xyz/' + t.url;
    $('#mockAI').textContent = `🤖 AI pick locked: ${t.ai}`;
    mock.querySelector('.mock__card--a i').style.setProperty('--w', t.ma + '%');
    mock.querySelector('.mock__card--b i').style.setProperty('--w', 100 - t.ma + '%');
  };
  apply(TABS[0]);
  $$('.tabrail__tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = TABS[Number(btn.dataset.tab)];
      $$('.tabrail__tab').forEach((b) => { b.classList.toggle('is-active', b === btn); b.setAttribute('aria-selected', String(b === btn)); });
      if (reducedMotion() || !window.Flip) return apply(t);
      const state = window.Flip.getState('#mock [data-flip-id], #mock p');
      apply(t);
      window.Flip.from(state, { duration: 0.6, ease: 'power3.inOut', absolute: true, nested: true, fade: true, simple: true });
      gsap.from('#mock p', { opacity: 0, duration: 0.4, delay: 0.15 });
    });
  });
}

// ── 01–04 carousel ─────────────────────────────────────────────────

function carousel() {
  const track = $('#carTrack');
  const steps = $$('.step', track);
  const dots = $('#carDots');
  let i = 0;
  steps.forEach((_, k) => {
    const d = document.createElement('button');
    d.setAttribute('role', 'tab');
    d.setAttribute('aria-label', `Step ${k + 1}`);
    d.addEventListener('click', () => go(k));
    dots.append(d);
  });

  const offsetFor = (k) => steps[k].offsetLeft - steps[0].offsetLeft;
  const maxOffset = () => Math.max(0, track.scrollWidth - track.parentElement.clientWidth + 2 * parseFloat(getComputedStyle(track.parentElement).paddingLeft));

  function animateStep(k) {
    if (reducedMotion()) {
      $$('.mini__type', steps[0]).forEach((n) => (n.textContent = n.dataset.text));
      return;
    }
    const s = steps[k];
    if (k === 0) {
      const tl = gsap.timeline();
      $$('.mini__type', s).forEach((n) => {
        const text = n.dataset.text;
        const o = { n: 0 };
        n.textContent = '';
        tl.to(o, { n: text.length, duration: text.length * 0.05, ease: 'none', onUpdate: () => (n.textContent = text.slice(0, Math.round(o.n))) });
      });
    } else if (k === 1) {
      gsap.fromTo($('.mini__robot', s), { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'bounce.out' });
      gsap.fromTo($('.mini__lock', s), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, delay: 0.4, ease: 'back.out(2)' });
      gsap.fromTo($('.mini__hash', s), { opacity: 0 }, { opacity: 1, delay: 0.8 });
    } else if (k === 2) {
      gsap.fromTo($('.mini__half--b', s), { scale: 1 }, { scale: 1.06, duration: 0.25, yoyo: true, repeat: 1, delay: 0.3 });
      gsap.fromTo($('.mini__half--a', s), { opacity: 1 }, { opacity: 0.4, duration: 0.3, delay: 0.5 });
      gsap.fromTo($('.mini__reason', s), { y: 14, opacity: 0 }, { y: 0, opacity: 1, delay: 0.7 });
    } else if (k === 3) {
      gsap.fromTo([$('.mini__ba', s), $('.mini__bb', s)], { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: 'power3.out' });
      gsap.fromTo($('.mini__win', s), { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, delay: 0.7, ease: 'back.out(2)' });
    }
  }

  function go(k, animate = true) {
    i = (k + steps.length) % steps.length;
    const x = -Math.min(offsetFor(i), maxOffset());
    if (animate && !reducedMotion()) gsap.to(track, { x, duration: 0.7, ease: 'power3.inOut' });
    else gsap.set(track, { x });
    steps.forEach((s, n) => s.classList.toggle('is-active', n === i));
    $$('button', dots).forEach((d, n) => d.setAttribute('aria-selected', String(n === i)));
    animateStep(i);
  }

  $('#carPrev').addEventListener('click', () => go(i - 1));
  $('#carNext').addEventListener('click', () => go(i + 1));
  window.addEventListener('resize', () => go(i, false));

  if (window.Draggable) {
    window.Draggable.create(track, {
      type: 'x',
      bounds: { minX: -maxOffset(), maxX: 0 },
      edgeResistance: 0.8,
      dragClickables: true,
      onPress() { this.applyBounds({ minX: -maxOffset(), maxX: 0 }); },
      onDragEnd() {
        const x = -this.x;
        let best = 0, dist = Infinity;
        steps.forEach((_, n) => { const d = Math.abs(offsetFor(n) - x); if (d < dist) { dist = d; best = n; } });
        const moved = this.x - this.startX;
        if (best === i && Math.abs(moved) > 40) best = Math.max(0, Math.min(steps.length - 1, i + (moved < 0 ? 1 : -1)));
        go(best);
      },
    });
  }

  // autoplay while in view
  let timer = null;
  const play = () => { if (!timer && !reducedMotion()) timer = setInterval(() => go(i + 1), 4200); };
  const stop = () => { clearInterval(timer); timer = null; };
  window.ScrollTrigger.create({ trigger: '#carousel', start: 'top 80%', end: 'bottom 20%', onEnter: () => { go(i); play(); }, onEnterBack: play, onLeave: stop, onLeaveBack: stop });
  track.addEventListener('pointerdown', stop);
  go(0, false);
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
    track.innerHTML = '<span class="marquee__item">No live duels yet — be the first.</span>';
  } else {
    const html = items
      .map((d) => `<a class="marquee__item" href="d/${d.id}" data-link><span class="chip">${esc(catName(d.category))}</span>${esc(d.question)}${d.isImage ? '' : ` — “${esc(d.a.slice(0, 40))}” vs “${esc(d.b.slice(0, 40))}”`}</a>`)
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
