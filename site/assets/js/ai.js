// Client for the shared Cloudflare Worker (/duel/predict, /duel/summary, /duel/moderate, /upload).
// If the Worker URL is not configured, an offline heuristic is used and labelled as such.
import { WORKER_URL } from './config.js';
import { wordFilter } from './filter.js';

export const WORKER_CONFIGURED = !/example\.workers\.dev/.test(WORKER_URL);

async function post(path, body, { timeout = 25000, form = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(WORKER_URL + path, {
      method: 'POST',
      headers: form ? undefined : { 'Content-Type': 'application/json' },
      body: form ? body : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The AI took too long — try again.');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ── offline fallbacks (only when no Worker is configured) ──
function heuristicPredict({ a, b, isImage }) {
  if (isImage) return { pick: 'A', confidence: 'low', reason: 'Offline guess: no AI configured, so A by default.', offline: true };
  const score = (s) => (/\d/.test(s) ? 2 : 0) + (s.length < 60 ? 1 : 0) + (/\byou(r)?\b/i.test(s) ? 1 : 0) - (s.length > 110 ? 1 : 0);
  const sa = score(a), sb = score(b);
  const pick = sb > sa ? 'B' : 'A';
  const confidence = Math.abs(sa - sb) >= 2 ? 'medium' : 'low';
  return { pick, confidence, reason: `Offline guess: ${pick} is more concrete and scannable.`, offline: true };
}

function heuristicSummary(reasons) {
  const group = (side) => {
    const m = new Map();
    reasons.filter((r) => r.choice === side && r.reason).forEach((r) => {
      const k = r.reason.trim().toLowerCase().replace(/[.!?]+$/, '');
      m.set(k, (m.get(k) || 0) + 1);
    });
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([theme, count]) => ({ theme, count }));
  };
  return { A: group(1), B: group(2), offline: true };
}

export async function predict(input) {
  const blocked = [input.question, input.context, input.isImage ? '' : input.a, input.isImage ? '' : input.b].map(wordFilter).find(Boolean);
  if (blocked) return { blocked: true, why: 'That text contains a blocked word.' };
  if (!WORKER_CONFIGURED) return heuristicPredict(input);
  return post('/duel/predict', input);
}

export async function summarise(duel, reasons) {
  if (!WORKER_CONFIGURED) return heuristicSummary(reasons);
  return post('/duel/summary', {
    question: duel.question,
    a: duel.isImage ? '[image A]' : duel.a,
    b: duel.isImage ? '[image B]' : duel.b,
    reasons: reasons.filter((r) => r.reason).map((r) => ({ choice: r.choice, reason: r.reason })),
  });
}

export async function moderate(texts) {
  const hit = texts.map(wordFilter).find(Boolean);
  if (hit) return { ok: false, reason: 'That text contains a blocked word.' };
  if (!WORKER_CONFIGURED || texts.every((t) => !t)) return { ok: true };
  try {
    return await post('/duel/moderate', { texts }, { timeout: 12000 });
  } catch {
    return { ok: true }; // moderation outage must not block voting; word filter already ran
  }
}

/** Upload an image (≤ 2 MB) to IPFS. Returns the CID (or a data: URL in offline demo mode). */
export async function uploadImage(file) {
  if (!file) throw new Error('No file selected.');
  if (file.size > 2 * 1024 * 1024) throw new Error('Image is larger than 2 MB.');
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Use PNG, JPEG, WebP or GIF.');
  if (!WORKER_CONFIGURED) {
    if (file.size > 400 * 1024) throw new Error('Offline demo: images up to 400 KB (no IPFS Worker configured).');
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('Could not read the image.'));
      r.readAsDataURL(file);
    });
  }
  const fd = new FormData();
  fd.append('file', file);
  const { cid } = await post('/upload', fd, { form: true, timeout: 60000 });
  return cid;
}
