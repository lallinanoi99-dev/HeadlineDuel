// /app/new — Start a duel
import { CATEGORIES, CONFIDENCE, DURATIONS, IMAGE_CATEGORY } from '../config.js';
import { $, $$, esc, toast, copy, versionHTML, catName, icon } from '../util.js';
import { api, reasonHash, txErrorMessage, wallet, bus, explorerTx } from '../chain.js';
import { predict, uploadImage, WORKER_CONFIGURED } from '../ai.js';
import { wordFilter } from '../filter.js';
import { sideLetter } from './shared.js';

const LIMITS = { question: 100, context: 100, version: 140 };
const len = (s) => [...String(s || '')].length;
const DEFAULT_Q = 'Which would make you click?';

export async function renderNew(root) {
  document.title = 'Start a duel — Headline Duel';
  const q = new URLSearchParams(location.search);
  const st = {
    category: Number.isInteger(Number(q.get('cat'))) && q.get('cat') !== null ? Math.min(5, Math.max(0, Number(q.get('cat')))) : 0,
    question: DEFAULT_Q,
    context: '',
    a: '',
    b: '',
    duration: 0,
    prediction: null, // {pick, confidence, reason, offline} | {error} | {blocked, why}
    predKey: '',
    busy: false,
  };
  let rematchOf = null;

  if (q.get('rematch') !== null) {
    try {
      const d = await api.getDuel(Number(q.get('rematch')));
      if (d) {
        rematchOf = d;
        st.category = d.category;
        st.question = d.question;
        st.a = d.winner === 2 ? d.b : d.a; // winner (or A on a tie) vs a new challenger
      }
    } catch {}
  }

  const isImage = () => st.category === IMAGE_CATEGORY;
  const key = () => JSON.stringify([st.category, st.question, st.context, st.a, st.b]);

  root.innerHTML = `
    <div class="app__head">
      <div><h1>${rematchOf ? 'Start a rematch' : 'Start a duel'}</h1><p>${rematchOf ? `The winner of duel #${rematchOf.id} vs a new challenger.` : 'Two versions. Real people pick. AI guesses first.'}</p></div>
    </div>
    <div id="newBody" class="form">
      <div>
        <section class="panel">
          <h2>The question</h2>
          <div class="field">
            <label for="fQ">Question <span class="counter" id="cQ"></span></label>
            <input class="input" id="fQ" maxlength="140" value="${esc(st.question)}" placeholder="${DEFAULT_Q}">
          </div>
          <div class="field">
            <span class="field__label">Category</span>
            <div class="chips" id="fCat">${CATEGORIES.map((c, i) => `<button type="button" class="chip" data-cat="${i}" aria-pressed="${i === st.category}">${esc(c)}</button>`).join('')}</div>
          </div>
          <div class="field" style="margin-bottom:0">
            <label for="fCtx">Context <span class="muted" style="text-transform:none;letter-spacing:0">optional · one line</span><span class="counter" id="cCtx"></span></label>
            <input class="input" id="fCtx" maxlength="140" placeholder="for a coffee subscription, audience: students">
          </div>
        </section>
        <section class="panel">
          <h2>Two versions</h2>
          <div class="versions" id="versions"></div>
          <div class="field" style="margin:20px 0 0">
            <span class="field__label">Duration</span>
            <div class="segment" id="fDur">${DURATIONS.map((d, i) => `<button type="button" data-dur="${i}" aria-pressed="${i === st.duration}">${d.label}</button>`).join('')}</div>
          </div>
          <p class="err" id="formErr" style="margin-top:16px" hidden></p>
        </section>
      </div>
      <aside class="preview">
        <section class="panel">
          <h2>Preview</h2>
          <div id="preview"></div>
        </section>
        <section class="panel">
          <h2>AI prediction</h2>
          <div id="aiBox"><p class="muted">Ask the AI which version will win. Its pick and a hash of its reason are locked on-chain when you start — before anyone votes.</p></div>
          <div style="display:grid;gap:10px;margin-top:16px">
            <button class="btn btn--ghost btn--block" id="askAI" type="button">✨ Ask AI first</button>
            <button class="btn btn--primary btn--block" id="startBtn" type="button">Start duel</button>
            <p class="muted" style="font-size:13px;text-align:center" id="walletHint"></p>
          </div>
        </section>
      </aside>
    </div>`;

  const fQ = $('#fQ', root), fCtx = $('#fCtx', root);

  // ── versions (text or image) ──
  function drawVersions() {
    const box = $('#versions', root);
    box.innerHTML = [1, 2]
      .map((n) => {
        const k = n === 1 ? 'a' : 'b';
        const v = st[k];
        if (isImage()) {
          const src = v ? (v.startsWith('data:') ? v : versionHTML({ isImage: true, a: v, b: v }, 1).match(/src="([^"]+)"/)[1]) : '';
          return `<div class="vbox vbox--${k}"><div class="vbox__head"><span class="tagAB tagAB--${k}">${sideLetter(n)}</span><span class="counter">≤ 2 MB · PNG/JPG/WebP/GIF</span></div>
            <label class="drop" id="drop${k}">${src ? `<img src="${esc(src)}" alt="Version ${sideLetter(n)} preview">` : `<span>${icon('image')}<br>Drop or choose an image</span>`}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-side="${k}" aria-label="Upload version ${sideLetter(n)}"></label>
            <p class="err" id="err${k}" hidden></p></div>`;
        }
        return `<div class="vbox vbox--${k}"><div class="vbox__head"><span class="tagAB tagAB--${k}">${sideLetter(n)}</span><span class="counter" id="c${k}"></span></div>
          <textarea class="textarea" id="f${k}" maxlength="200" placeholder="${n === 1 ? 'How we cut our cloud bill in half' : 'Our cloud bill was $40k. Now it’s $19k.'}" aria-label="Version ${sideLetter(n)}">${esc(v)}</textarea></div>`;
      })
      .join('');

    if (isImage()) {
      $$('input[type=file]', box).forEach((inp) =>
        inp.addEventListener('change', async () => {
          const k = inp.dataset.side;
          const file = inp.files[0];
          const err = $(`#err${k}`, root);
          err.hidden = true;
          if (!file) return;
          const drop = $(`#drop${k}`, root);
          drop.classList.add('is-busy');
          try {
            st[k] = await uploadImage(file);
            invalidate();
            drawVersions();
          } catch (e) {
            drop.classList.remove('is-busy');
            err.textContent = e.message || 'Upload failed — try again.';
            err.hidden = false;
          }
        }),
      );
    } else {
      ['a', 'b'].forEach((k) => {
        const t = $(`#f${k}`, root);
        t.addEventListener('input', () => { st[k] = t.value; invalidate(); counters(); drawPreview(); });
      });
    }
    counters();
    drawPreview();
  }

  function counters() {
    const set = (id, v, max) => {
      const n = $(id, root);
      if (!n) return;
      n.textContent = `${len(v)}/${max}`;
      n.classList.toggle('is-over', len(v) > max);
    };
    set('#cQ', st.question, LIMITS.question);
    set('#cCtx', st.context, LIMITS.context);
    if (!isImage()) { set('#ca', st.a, LIMITS.version); set('#cb', st.b, LIMITS.version); }
  }

  function drawPreview() {
    const d = { id: '—', question: st.question || DEFAULT_Q, category: st.category, a: st.a || (isImage() ? '' : 'Version A'), b: st.b || (isImage() ? '' : 'Version B'), isImage: isImage() };
    const side = (n) => (isImage() && !(n === 1 ? st.a : st.b) ? '<span class="muted" style="font-size:13px">No image yet</span>' : versionHTML(d, n));
    $('#preview', root).innerHTML = `<div class="dcard"><div class="dcard__body">
      <div class="dcard__top"><span class="chip">${esc(catName(st.category))}</span><span class="mono muted" style="font-size:12px">${DURATIONS[st.duration].label}</span></div>
      <p class="dcard__q">${esc(d.question)}</p>
      <div class="dcard__vs"><div class="dcard__side dcard__side--a"><span class="tagAB tagAB--a">A</span>${side(1)}</div><span class="vs vs--sm">VS</span><div class="dcard__side dcard__side--b"><span class="tagAB tagAB--b" style="align-self:flex-end">B</span>${side(2)}</div></div>
    </div></div>`;
  }

  function invalidate() {
    if (st.prediction && st.predKey !== key()) {
      st.prediction = null;
      drawAI();
    }
  }

  function drawAI() {
    const box = $('#aiBox', root);
    const p = st.prediction;
    if (!p) {
      box.innerHTML = '<p class="muted">Ask the AI which version will win. Its pick and a hash of its reason are locked on-chain when you start — before anyone votes.</p>';
      return;
    }
    if (p.loading) { box.innerHTML = '<div class="skeleton" style="height:110px"></div>'; return; }
    if (p.blocked) { box.innerHTML = `<div class="notice notice--err" style="margin:0">⛔ Blocked: ${esc(p.why)}</div>`; return; }
    if (p.error) { box.innerHTML = `<div class="notice notice--warn" style="margin:0">AI unavailable: ${esc(p.error)} You can still start the duel with “No AI pick”.</div>`; return; }
    const cls = p.pick === 'A' ? 'a' : 'b';
    box.innerHTML = `<div class="aicard">
      <p class="aicard__pick">🤖 AI picks <span class="${cls}">${p.pick}</span> <span class="chip">${esc(p.confidence)} confidence</span></p>
      <p class="aicard__reason">“${esc(p.reason)}”</p>
      <p class="aicard__hash">keccak256(reason) = ${reasonHash(p.reason)}</p>
      ${p.offline ? '<p class="muted" style="font-size:13px">Offline heuristic — no AI Worker configured.</p>' : ''}
    </div>`;
  }

  function validate() {
    const errs = [];
    if (!st.question.trim()) st.question = DEFAULT_Q;
    if (len(st.question) > LIMITS.question) errs.push(`Question is over ${LIMITS.question} characters.`);
    if (len(st.context) > LIMITS.context) errs.push(`Context is over ${LIMITS.context} characters.`);
    if (!st.a.trim() || !st.b.trim()) errs.push(isImage() ? 'Upload both images.' : 'Write both versions.');
    if (!isImage() && (len(st.a) > LIMITS.version || len(st.b) > LIMITS.version)) errs.push(`Each version must be ${LIMITS.version} characters or less.`);
    if (st.a.trim() && st.a.trim() === st.b.trim()) errs.push('The two versions must be different.');
    const bad = [st.question, st.context, isImage() ? '' : st.a, isImage() ? '' : st.b].map(wordFilter).find(Boolean);
    if (bad) errs.push('Your text contains a blocked word. Please rephrase.');
    const box = $('#formErr', root);
    box.hidden = !errs.length;
    box.textContent = errs.join(' ');
    return errs.length === 0;
  }

  async function askAI() {
    if (!validate()) return null;
    st.prediction = { loading: true };
    drawAI();
    const k = key();
    try {
      const r = await predict({ question: st.question.trim(), category: st.category, context: st.context.trim(), a: st.a.trim(), b: st.b.trim(), isImage: isImage() });
      st.prediction = r.blocked ? { blocked: true, why: r.why } : { pick: r.pick, confidence: r.confidence, reason: String(r.reason || '').slice(0, 140), offline: r.offline };
    } catch (e) {
      st.prediction = { error: e.message || 'Request failed.' };
    }
    st.predKey = k;
    drawAI();
    return st.prediction;
  }

  async function start() {
    if (st.busy || !validate()) return;
    const btn = $('#startBtn', root);
    let p = st.prediction && st.predKey === key() ? st.prediction : await askAI();
    if (!p) return;
    if (p.blocked) return toast('Blocked: ' + p.why, 'err');
    let ai = { pick: 0, conf: 0, reason: '', hash: reasonHash('') };
    if (p.error) {
      if (!confirm('The AI is unavailable. Start this duel with “No AI pick”?')) return;
    } else {
      ai = { pick: p.pick === 'A' ? 1 : 2, conf: Math.max(1, CONFIDENCE.indexOf(p.confidence)), reason: p.reason, hash: reasonHash(p.reason) };
    }
    st.busy = true;
    btn.classList.add('is-busy');
    btn.textContent = 'Confirm in wallet…';
    try {
      const res = await api.startDuel({
        question: st.question.trim(), category: st.category, a: st.a.trim(), b: st.b.trim(), isImage: isImage(),
        aiPick: ai.pick, aiConfidence: ai.conf, aiReasonHash: ai.hash, aiReason: ai.reason, duration: DURATIONS[st.duration].seconds,
      });
      toast('Duel started — the AI pick is locked on-chain 🔒', 'ok');
      shareKit(res.id, res.hash);
    } catch (e) {
      toast(txErrorMessage(e), 'err', 6000);
      btn.textContent = 'Retry — Start duel';
    } finally {
      st.busy = false;
      btn.classList.remove('is-busy');
    }
  }

  function shareKit(id, hash) {
    const url = `${location.origin}${window.__BASE__ || '/'}d/${id}`;
    const text = `Help me pick: A or B? 👀 “${st.question.trim()}”`;
    const xUrl = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    $('#newBody', root).outerHTML = `
      <section class="panel sharekit" id="shareKit">
        <h2>🎉 Duel #${id} is live</h2>
        <p class="muted">Share it so real people vote. Results unlock for each voter after they vote.</p>
        <div class="sharekit__row"><input class="input sharekit__link" readonly value="${esc(url)}" aria-label="Duel link"><button class="btn btn--ghost" id="copyLink" type="button">${icon('copy')} Copy link</button></div>
        <div class="sharekit__row" style="align-items:flex-start">
          <div class="qr" id="qr" aria-label="QR code"></div>
          <div class="xpost" style="position:static;flex:1;min-width:240px;max-width:420px">
            <div class="xpost__head"><span class="xpost__avatar"></span><div><b>Ready X post</b><small>edit before posting</small></div><span class="xpost__x">𝕏</span></div>
            <p>${esc(text)}<br><span class="link">${esc(url)}</span></p>
          </div>
        </div>
        <div class="sharekit__row">
          <a class="btn btn--primary" href="${esc(xUrl)}" target="_blank" rel="noopener">Post on X ↗</a>
          <a class="btn btn--ghost" href="d/${id}" data-link>Open duel</a>
          ${hash ? `<a class="btn btn--ghost" href="${esc(explorerTx(hash))}" target="_blank" rel="noopener">View tx ↗</a>` : ''}
        </div>
      </section>`;
    $('#copyLink', root).addEventListener('click', () => copy(url, 'Link copied'));
    try { new window.QRCode($('#qr', root), { text: url, width: 160, height: 160, colorDark: '#1C1C1C', colorLight: '#FFFFFF' }); } catch { $('#qr', root).remove(); }
    window.gsap?.from('#shareKit', { y: 20, opacity: 0, duration: 0.5, ease: 'power3.out' });
  }

  // ── wire ──
  fQ.addEventListener('input', () => { st.question = fQ.value; invalidate(); counters(); drawPreview(); });
  fCtx.addEventListener('input', () => { st.context = fCtx.value; invalidate(); counters(); });
  $$('#fCat .chip', root).forEach((c) =>
    c.addEventListener('click', () => {
      const prevImage = isImage();
      st.category = Number(c.dataset.cat);
      $$('#fCat .chip', root).forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
      if (prevImage !== isImage()) { st.a = ''; st.b = ''; drawVersions(); }
      invalidate();
      drawPreview();
    }),
  );
  $$('#fDur button', root).forEach((b) =>
    b.addEventListener('click', () => {
      st.duration = Number(b.dataset.dur);
      $$('#fDur button', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      drawPreview();
    }),
  );
  $('#askAI', root).addEventListener('click', askAI);
  $('#startBtn', root).addEventListener('click', start);

  const hint = () => {
    const h = $('#walletHint', root);
    if (!h) return;
    h.textContent = !wallet.hasProvider ? 'You need MetaMask to start a duel.' : !wallet.account ? 'You’ll be asked to connect your wallet.' : !wallet.onRightChain ? 'You’ll be asked to switch to BOT Chain.' : `Starting as ${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)} · costs a little gas`;
  };
  bus.addEventListener('wallet', hint);
  hint();
  if (!WORKER_CONFIGURED) $('#askAI', root).title = 'No AI Worker configured — uses an offline heuristic';

  drawVersions();
  return () => bus.removeEventListener('wallet', hint);
}
