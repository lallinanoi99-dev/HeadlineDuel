/**
 * Headline Duel — Cloudflare Worker (shared Week-1 Worker)
 *
 *   POST /duel/predict   versions + context → { pick: "A"|"B", confidence, reason } (or { blocked })
 *   POST /duel/summary   real vote reasons   → { A: [{theme,count}], B: [...] }
 *   POST /duel/moderate  { texts: [] }       → { ok, reason? }   (vote reasons)
 *   POST /upload         multipart "file"    → { cid }           (IPFS via Pinata, ≤ 2 MB images)
 *
 * Key kept as a secret · CORS locked to ALLOWED_ORIGINS · rate limited · nothing is logged.
 */
import Anthropic from '@anthropic-ai/sdk';
import { wordFilter } from './filter.js';

const CATEGORIES = ['Headline', 'Tagline', 'Ad', 'Email subject', 'Name', 'Image'];
const MAX_UPLOAD = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// ───────────────────────────── helpers ─────────────────────────────

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const list = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.includes(origin) ? origin : null;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(origin) },
  });
}

const memoryBuckets = new Map();
async function rateLimited(request, env, route) {
  const ip = request.headers.get('CF-Connecting-IP') || 'anon';
  const key = `${route}:${ip}`;
  if (env.RATE_LIMITER && typeof env.RATE_LIMITER.limit === 'function') {
    const { success } = await env.RATE_LIMITER.limit({ key });
    return !success;
  }
  // Best-effort fallback (per isolate): 20 requests / minute / route / IP.
  const now = Date.now();
  const b = memoryBuckets.get(key);
  if (!b || now - b.start > 60_000) {
    memoryBuckets.set(key, { start: now, n: 1 });
    if (memoryBuckets.size > 5000) memoryBuckets.clear();
    return false;
  }
  b.n += 1;
  return b.n > 20;
}

const clip = (s, n) => String(s ?? '').slice(0, n);

/** Ask Claude for a JSON object matching `schema`. Returns the parsed object or throws. */
async function askJSON(env, { system, content, schema, maxTokens = 1024 }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const res = await client.beta.messages.create({
    model: env.MODEL || 'claude-opus-5-5',
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') {
    const err = new Error('refused');
    err.refusal = true;
    throw err;
  }
  const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return JSON.parse(text);
}

// ───────────────────────────── routes ──────────────────────────────

const PREDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['safe', 'unsafe_reason', 'pick', 'confidence', 'reason'],
  properties: {
    safe: { type: 'boolean' },
    unsafe_reason: { type: 'string' },
    pick: { type: 'string', enum: ['A', 'B'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reason: { type: 'string' },
  },
};

async function predict(body, env) {
  const category = CATEGORIES[Number(body.category)] || 'Headline';
  const isImage = Boolean(body.isImage);
  const question = clip(body.question || 'Which would make you click?', 100);
  const context = clip(body.context, 160);
  const a = clip(body.a, isImage ? 120 : 140);
  const b = clip(body.b, isImage ? 120 : 140);
  if (!a || !b) return { status: 400, data: { error: 'Both versions are required.' } };

  for (const t of [question, context, isImage ? '' : a, isImage ? '' : b]) {
    const hit = wordFilter(t);
    if (hit) return { status: 200, data: { blocked: true, why: 'That text contains a blocked word.' } };
  }

  const content = [];
  const intro =
    `Category: ${category}\nQuestion asked to voters: ${question}\n` +
    (context ? `Context from the creator: ${context}\n` : '');
  if (isImage) {
    const gw = env.IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/';
    if (!/^[a-zA-Z0-9]{46,64}$/.test(a) || !/^[a-zA-Z0-9]{46,64}$/.test(b)) {
      return { status: 400, data: { error: 'Image duels need two IPFS CIDs.' } };
    }
    content.push({ type: 'text', text: `${intro}\nVersion A:` });
    content.push({ type: 'image', source: { type: 'url', url: gw + a } });
    content.push({ type: 'text', text: 'Version B:' });
    content.push({ type: 'image', source: { type: 'url', url: gw + b } });
  } else {
    content.push({ type: 'text', text: `${intro}\nVersion A: """${a}"""\nVersion B: """${b}"""` });
  }
  content.push({
    type: 'text',
    text:
      'Predict which version most real people would pick for this question. ' +
      'Also check both versions and the question for hate, harassment, sexual content, or threats (set safe=false with a short unsafe_reason if so; otherwise unsafe_reason="").',
  });

  const out = await askJSON(env, {
    system:
      'You are the prediction engine for Headline Duel, a site where people vote between two versions of a headline, tagline, ad, email subject, name or image. ' +
      'Your guess is locked on-chain before any votes, so commit to one answer. ' +
      '"reason" is ONE plain sentence of at most 120 characters, written for the creator (e.g. "B states a concrete benefit and is shorter."). ' +
      'Confidence is "high" only when one version is clearly stronger.',
    content,
    schema: PREDICT_SCHEMA,
    maxTokens: 600,
  });

  if (!out.safe) return { status: 200, data: { blocked: true, why: clip(out.unsafe_reason || 'Content not allowed.', 140) } };
  return {
    status: 200,
    data: { pick: out.pick, confidence: out.confidence, reason: clip(out.reason, 140).trim() },
  };
}

const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['A', 'B'],
  properties: {
    A: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['theme', 'ids'],
        properties: { theme: { type: 'string' }, ids: { type: 'array', items: { type: 'integer' } } },
      },
    },
    B: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['theme', 'ids'],
        properties: { theme: { type: 'string' }, ids: { type: 'array', items: { type: 'integer' } } },
      },
    },
  },
};

async function summary(body, env) {
  const raw = Array.isArray(body.reasons) ? body.reasons.slice(0, 300) : [];
  const reasons = raw
    .map((r) => ({ side: Number(r.choice) === 1 ? 'A' : Number(r.choice) === 2 ? 'B' : null, text: clip(r.reason, 140).trim() }))
    .filter((r) => r.side && r.text && !wordFilter(r.text));
  if (reasons.length === 0) return { status: 200, data: { A: [], B: [] } };

  const lines = reasons.map((r, i) => `${i}\t${r.side}\t${r.text.replace(/\s+/g, ' ')}`).join('\n');
  const out = await askJSON(env, {
    system:
      'You group real voter reasons into short themes. Never invent reasons. ' +
      'Each theme is 1–4 lowercase words (e.g. "clearer benefit", "shorter"). ' +
      'Put each reason id in at most one theme, only under the side it was given for. Up to 4 themes per side; skip reasons that fit no theme.',
    content: [
      {
        type: 'text',
        text: `Question: ${clip(body.question, 100)}\nVersion A: ${clip(body.a, 140)}\nVersion B: ${clip(body.b, 140)}\n\nReasons (id, side, text):\n${lines}`,
      },
    ],
    schema: SUMMARY_SCHEMA,
    maxTokens: 1500,
  });

  // Recount from ids so counts can never exceed the real reasons.
  const clean = (side) => {
    const used = new Set();
    return (out[side] || [])
      .map((t) => {
        const ids = (t.ids || []).filter((id) => reasons[id] && reasons[id].side === side && !used.has(id));
        ids.forEach((id) => used.add(id));
        return { theme: clip(t.theme, 40).trim(), count: ids.length };
      })
      .filter((t) => t.theme && t.count > 0)
      .sort((x, y) => y.count - x.count)
      .slice(0, 4);
  };
  return { status: 200, data: { A: clean('A'), B: clean('B') } };
}

const MODERATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['safe', 'reason'],
  properties: { safe: { type: 'boolean' }, reason: { type: 'string' } },
};

async function moderate(body, env) {
  const texts = (Array.isArray(body.texts) ? body.texts : []).slice(0, 5).map((t) => clip(t, 160)).filter(Boolean);
  for (const t of texts) {
    if (wordFilter(t)) return { status: 200, data: { ok: false, reason: 'That text contains a blocked word.' } };
  }
  if (texts.length === 0) return { status: 200, data: { ok: true } };
  const out = await askJSON(env, {
    system:
      'You moderate short public comments on a voting site. Mark safe=false only for hate, harassment, sexual content, threats, doxxing or spam links. Mild opinions and criticism are fine. reason: short, or "".',
    content: [{ type: 'text', text: texts.map((t, i) => `${i + 1}. ${t}`).join('\n') }],
    schema: MODERATE_SCHEMA,
    maxTokens: 300,
  });
  return { status: 200, data: out.safe ? { ok: true } : { ok: false, reason: clip(out.reason || 'Not allowed.', 140) } };
}

async function upload(request, env) {
  if (!env.PINATA_JWT) return { status: 503, data: { error: 'Uploads are not configured.' } };
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_UPLOAD + 64 * 1024) return { status: 413, data: { error: 'Image is larger than 2 MB.' } };
  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') return { status: 400, data: { error: 'No file.' } };
  if (file.size > MAX_UPLOAD) return { status: 413, data: { error: 'Image is larger than 2 MB.' } };
  if (!IMAGE_TYPES.includes(file.type)) return { status: 415, data: { error: 'Use PNG, JPEG, WebP or GIF.' } };

  const fd = new FormData();
  fd.append('file', file, 'duel-image');
  fd.append('pinataMetadata', JSON.stringify({ name: 'headline-duel' }));
  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.PINATA_JWT}` },
    body: fd,
  });
  if (!res.ok) return { status: 502, data: { error: 'IPFS upload failed.' } };
  const { IpfsHash } = await res.json();
  return { status: 200, data: { cid: IpfsHash } };
}

// ───────────────────────────── entry ───────────────────────────────

const ROUTES = {
  '/duel/predict': predict,
  '/duel/summary': summary,
  '/duel/moderate': moderate,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);

    if (request.method === 'OPTIONS') {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (!origin) return new Response('Forbidden', { status: 403 });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);

    const route = url.pathname.replace(/\/+$/, '');
    if (route !== '/upload' && !ROUTES[route]) return json({ error: 'Not found' }, 404, origin);
    if (await rateLimited(request, env, route)) return json({ error: 'Too many requests — try again in a minute.' }, 429, origin);

    try {
      if (route === '/upload') {
        const r = await upload(request, env);
        return json(r.data, r.status, origin);
      }
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'AI is not configured.' }, 503, origin);
      const body = await request.json().catch(() => ({}));
      const r = await ROUTES[route](body, env);
      return json(r.data, r.status, origin);
    } catch (err) {
      // Intentionally no logging of request content.
      if (err && err.refusal) return json({ error: 'The AI declined this one.' }, 422, origin);
      return json({ error: 'AI is unavailable right now.' }, 502, origin);
    }
  },
};
