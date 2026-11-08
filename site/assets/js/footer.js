// Footer DVD screensaver: the BOT Chain logo bounces around the panel,
// changing colour A-blue → B-coral → yellow on each wall hit, with a cheer on corners.
import { $, reducedMotion, isMobile } from './util.js';

const COLOURS = ['#3D7BFF', '#FF5C39', '#39FF7A'];

export function initFooter() {
  const panel = $('#dvd');
  const logo = $('#dvdLogo');
  const corner = $('#dvdCorner');
  if (!panel || !logo) return;

  let x = 40, y = 30, vx = 1, vy = 1, c = 0, raf = 0, last = 0, visible = false, hovering = false;
  const speed = () => (isMobile() ? 70 : 120); // px per second

  const centre = () => {
    const w = panel.clientWidth - logo.offsetWidth;
    const h = panel.clientHeight - logo.offsetHeight;
    x = w / 2; y = h / 2;
    logo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const cheer = () => {
    const { gsap } = window;
    if (!gsap) return;
    gsap.killTweensOf(corner);
    gsap.fromTo(corner, { opacity: 0, scale: 0.6, y: 10 }, { opacity: 1, scale: 1.15, y: 0, duration: 0.35, ease: 'back.out(3)' });
    gsap.to(corner, { opacity: 0, duration: 0.5, delay: 1.2 });
    gsap.fromTo(logo, { scale: 1 }, { scale: 1.25, duration: 0.15, yoyo: true, repeat: 3 });
  };

  const tick = (t) => {
    raf = requestAnimationFrame(tick);
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (hovering) return;
    const maxX = panel.clientWidth - logo.offsetWidth;
    const maxY = panel.clientHeight - logo.offsetHeight;
    const s = speed();
    x += vx * s * dt;
    y += vy * s * dt;
    let hitX = false, hitY = false;
    if (x <= 0) { x = 0; vx = 1; hitX = true; }
    else if (x >= maxX) { x = maxX; vx = -1; hitX = true; }
    if (y <= 0) { y = 0; vy = 1; hitY = true; }
    else if (y >= maxY) { y = maxY; vy = -1; hitY = true; }
    // Count near-misses (within 4px of the other wall) as corners too
    if (hitX && !hitY && (y < 4 || y > maxY - 4)) hitY = true;
    if (hitY && !hitX && (x < 4 || x > maxX - 4)) hitX = true;
    if (hitX || hitY) {
      c = (c + 1) % COLOURS.length;
      logo.style.color = COLOURS[c];
    }
    if (hitX && hitY) cheer();
    logo.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const start = () => { if (!raf && !reducedMotion()) { last = 0; raf = requestAnimationFrame(tick); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  logo.addEventListener('mouseenter', () => (hovering = true));
  logo.addEventListener('mouseleave', () => (hovering = false));

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start(); else stop();
  }).observe(panel);

  const rm = matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotion = () => {
    if (rm.matches) { stop(); centre(); logo.style.color = COLOURS[0]; }
    else if (visible) start();
  };
  rm.addEventListener?.('change', applyMotion);
  window.addEventListener('resize', () => { if (reducedMotion()) centre(); });
  centre();
  applyMotion();
}
