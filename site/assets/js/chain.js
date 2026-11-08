// Wallet + data layer. Two backends share one interface:
//   • ChainBackend — BOT Chain via ethers v6 (reads over public RPC, writes via MetaMask)
//   • DemoBackend  — in-browser mock used only when no contract is configured (clearly labelled)
import { ABI } from './abi.js';
import { CHAIN, CONTRACT_ADDRESS, DEMO } from './config.js';
import { toast, sleep } from './util.js';

const { ethers } = window;

// ───────────────────────────── wallet state ─────────────────────────────

export const wallet = {
  account: null,
  chainId: null,
  get hasProvider() {
    return DEMO || Boolean(window.ethereum);
  },
  get onRightChain() {
    return DEMO || this.chainId === CHAIN.chainId;
  },
  get ready() {
    return Boolean(this.account) && this.onRightChain;
  },
};
export const bus = new EventTarget();
const emit = () => bus.dispatchEvent(new Event('wallet'));

function normaliseChainId(id) {
  if (id == null) return null;
  return typeof id === 'string' ? parseInt(id, 16) : Number(id);
}

export async function initWallet() {
  if (DEMO) {
    try {
      wallet.account = localStorage.getItem('hd-demo-connected') ? demoAccount() : null;
    } catch {}
    wallet.chainId = CHAIN.chainId;
    emit();
    return;
  }
  const eth = window.ethereum;
  if (!eth) return emit();
  try {
    const [accounts, chainId] = await Promise.all([eth.request({ method: 'eth_accounts' }), eth.request({ method: 'eth_chainId' })]);
    wallet.account = accounts[0] ? ethers.getAddress(accounts[0]) : null;
    wallet.chainId = normaliseChainId(chainId);
  } catch {}
  eth.on?.('accountsChanged', (acc) => {
    wallet.account = acc[0] ? ethers.getAddress(acc[0]) : null;
    emit();
  });
  eth.on?.('chainChanged', (id) => {
    wallet.chainId = normaliseChainId(id);
    emit();
  });
  emit();
}

export async function connect() {
  if (DEMO) {
    try {
      localStorage.setItem('hd-demo-connected', '1');
    } catch {}
    wallet.account = demoAccount();
    emit();
    toast('Demo wallet connected', 'ok');
    return wallet.account;
  }
  const eth = window.ethereum;
  if (!eth) {
    window.open('https://metamask.io/download/', '_blank', 'noopener');
    throw new Error('MetaMask not installed');
  }
  const accounts = await eth.request({ method: 'eth_requestAccounts' });
  wallet.account = accounts[0] ? ethers.getAddress(accounts[0]) : null;
  wallet.chainId = normaliseChainId(await eth.request({ method: 'eth_chainId' }));
  emit();
  if (!wallet.onRightChain) await switchChain();
  return wallet.account;
}

export async function disconnect() {
  if (DEMO) {
    try {
      localStorage.removeItem('hd-demo-connected');
    } catch {}
  }
  wallet.account = null;
  emit();
}

export async function switchChain() {
  const eth = window.ethereum;
  if (!eth) return;
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hex }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code === 4902 || /Unrecognized chain|not been added/i.test(err?.message || '')) {
      await eth.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN.hex,
            chainName: CHAIN.name,
            nativeCurrency: CHAIN.currency,
            rpcUrls: [CHAIN.rpc],
            blockExplorerUrls: [CHAIN.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
  wallet.chainId = normaliseChainId(await eth.request({ method: 'eth_chainId' }));
  emit();
}

/** Ensure connected + right chain before a write. Returns the account. */
export async function requireWallet() {
  if (!wallet.hasProvider) {
    toast('Install MetaMask to vote or start duels', 'err');
    window.open('https://metamask.io/download/', '_blank', 'noopener');
    throw new Error('no-provider');
  }
  if (!wallet.account) await connect();
  if (!wallet.onRightChain) await switchChain();
  if (!wallet.ready) throw new Error('wallet-not-ready');
  return wallet.account;
}

// ───────────────────────────── helpers ─────────────────────────────────

const FRIENDLY = {
  NotFound: 'Duel not found.',
  NotCreator: 'Only the creator can do that.',
  NotCurator: 'Only the curator can do that.',
  NotLive: 'This duel has ended.',
  AlreadyVoted: 'You already voted on this duel.',
  CreatorCannotVote: 'You can’t vote on your own duel.',
};

export function txErrorMessage(err) {
  if (!err) return 'Something went wrong.';
  const code = err.code ?? err.info?.error?.code;
  if (code === 'ACTION_REJECTED' || code === 4001) return 'Transaction rejected in wallet.';
  const name = err.revert?.name || err.errorName;
  if (name === 'BadInput') return `Invalid input (${err.revert?.args?.[0] ?? '?'}).`;
  if (name && FRIENDLY[name]) return FRIENDLY[name];
  if (code === 'INSUFFICIENT_FUNDS') return 'Not enough BOT for gas.';
  if (err.message === 'no-provider' || err.message === 'MetaMask not installed') return 'MetaMask is required.';
  return err.shortMessage || err.reason || err.message || 'Transaction failed.';
}

function toDuel(id, r) {
  const d = {
    id: Number(id),
    creator: r.creator,
    question: r.question,
    category: Number(r.category),
    a: r.a,
    b: r.b,
    isImage: Boolean(r.isImage),
    aiPick: Number(r.aiPick),
    aiConfidence: Number(r.aiConfidence),
    aiReasonHash: r.aiReasonHash,
    endsAt: Number(r.endsAt),
    votesA: Number(r.votesA),
    votesB: Number(r.votesB),
    createdBlock: Number(r.createdBlock),
    ended: Boolean(r.ended),
    hidden: Boolean(r.hidden),
  };
  return withDerived(d);
}

function withDerived(d) {
  const now = Math.floor(Date.now() / 1000);
  d.total = d.votesA + d.votesB;
  d.live = !d.ended && now < d.endsAt;
  d.winner = d.live ? 0 : d.votesA > d.votesB ? 1 : d.votesB > d.votesA ? 2 : 3;
  return d;
}

// ───────────────────────────── chain backend ───────────────────────────

class ChainBackend {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(CHAIN.rpc, { chainId: CHAIN.chainId, name: CHAIN.name }, { staticNetwork: true });
    this.read = new ethers.Contract(CONTRACT_ADDRESS, ABI, this.provider);
    this.cache = new Map();
  }

  async writer() {
    await requireWallet();
    const bp = new ethers.BrowserProvider(window.ethereum);
    const signer = await bp.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  }

  async total() {
    return Number(await this.read.totalDuels());
  }

  async listDuels() {
    const total = await this.total();
    const out = [];
    const PAGE = 50;
    const pages = [];
    for (let from = 0; from < total; from += PAGE) pages.push(this.read.getDuels(from, PAGE).then((rows) => rows.map((r, i) => toDuel(from + i, r))));
    for (const p of await Promise.all(pages)) out.push(...p);
    out.forEach((d) => this.cache.set(d.id, d));
    return out;
  }

  async getDuel(id) {
    try {
      const r = await this.read.getDuel(id);
      const d = toDuel(id, r);
      this.cache.set(d.id, d);
      return d;
    } catch (e) {
      if (e?.revert?.name === 'NotFound' || /NotFound|revert/i.test(e?.message || '')) return null;
      throw e;
    }
  }

  async voteOf(id, addr) {
    if (!addr) return 0;
    return Number(await this.read.voteOf(id, addr));
  }

  async aiReason(duel) {
    if (!duel.aiPick) return '';
    const logs = await this.read.queryFilter(this.read.filters.DuelStarted(duel.id), duel.createdBlock, duel.createdBlock);
    return logs[0]?.args?.aiReason ?? '';
  }

  async logsInRange(filter, from, to) {
    try {
      return await this.read.queryFilter(filter, from, to);
    } catch {
      // RPC range limits: fall back to chunks.
      const out = [];
      const STEP = 10_000;
      for (let s = from; s <= to; s += STEP) out.push(...(await this.read.queryFilter(filter, s, Math.min(to, s + STEP - 1))));
      return out;
    }
  }

  async votes(duel) {
    const latest = await this.provider.getBlock('latest');
    const logs = await this.logsInRange(this.read.filters.Voted(duel.id), duel.createdBlock, latest.number);
    // Timestamps: interpolate between the creation block and latest block (cheap, good enough for a chart).
    const first = await this.provider.getBlock(duel.createdBlock);
    const span = Math.max(1, latest.number - first.number);
    const tsOf = (bn) => Math.round(first.timestamp + ((bn - first.number) / span) * (latest.timestamp - first.timestamp));
    return logs.map((l) => ({
      voter: l.args.voter,
      choice: Number(l.args.choice),
      reason: l.args.reason,
      block: l.blockNumber,
      ts: tsOf(l.blockNumber),
      tx: l.transactionHash,
    }));
  }

  async stats() {
    const [duelCount, voteCount, aiCorrect, aiFinished] = await this.read.stats();
    return { duels: Number(duelCount), votes: Number(voteCount), aiCorrect: Number(aiCorrect), aiFinished: Number(aiFinished) };
  }

  async duelsOf(addr) {
    const [created, voted] = await this.read.duelsOf(addr);
    return { created: created.map(Number), voted: voted.map(Number) };
  }

  async curator() {
    return this.read.curator();
  }

  async startDuel(p) {
    const c = await this.writer();
    const tx = await c.startDuel(p.question, p.category, p.a, p.b, p.isImage, p.aiPick, p.aiConfidence, p.aiReasonHash, p.aiReason, p.duration);
    const rc = await tx.wait();
    const ev = rc.logs.map((l) => { try { return c.interface.parseLog(l); } catch { return null; } }).find((x) => x?.name === 'DuelStarted');
    return { id: Number(ev?.args?.id ?? (await this.total()) - 1), hash: tx.hash };
  }

  async vote(id, choice, reason) {
    const c = await this.writer();
    const tx = await c.vote(id, choice, reason);
    await tx.wait();
    return { hash: tx.hash };
  }

  async endEarly(id) {
    const c = await this.writer();
    const tx = await c.endEarly(id);
    await tx.wait();
    return { hash: tx.hash };
  }

  async setHidden(id, hidden) {
    const c = await this.writer();
    const tx = await c.setHidden(id, hidden);
    await tx.wait();
    return { hash: tx.hash };
  }
}

// ───────────────────────────── demo backend ────────────────────────────

const DEMO_KEY = 'hd-demo-v1';

function demoAccount() {
  let a = null;
  try {
    a = localStorage.getItem('hd-demo-account');
    if (!a) {
      a = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
      localStorage.setItem('hd-demo-account', a);
    }
  } catch {
    a = '0x000000000000000000000000000000000000dE30';
  }
  return a;
}

function seedDemo() {
  const now = Math.floor(Date.now() / 1000);
  const fake = (n) => ethers.getAddress('0x' + String(n).padStart(40, 'a').slice(-40));
  const mk = (o) => ({ isImage: false, ended: false, hidden: false, aiConfidence: 2, createdBlock: 1, ...o });
  const reasonsA = ['Feels more personal', 'Shorter, punchier', 'Curiosity gap works', 'Clear promise'];
  const reasonsB = ['Clearer benefit', 'Shorter', 'Numbers make it concrete', 'Easier to read', 'Sounds less salesy'];
  const duels = [
    mk({ creator: fake(1), question: 'Which would make you click?', category: 0, a: 'How we cut our cloud bill in half', b: 'Our cloud bill was $40k. Now it’s $19k.', aiPick: 2, aiConfidence: 3, endsAt: now + 3600 * 20, votesA: 14, votesB: 23 }),
    mk({ creator: fake(2), question: 'Which tagline fits a coffee subscription for students?', category: 1, a: 'Fuel for finals.', b: 'Fresh beans, every Monday.', aiPick: 1, aiConfidence: 2, endsAt: now + 86400 * 2, votesA: 31, votesB: 12 }),
    mk({ creator: fake(3), question: 'Which email subject would you open?', category: 3, a: 'Your 7-day streak is waiting 🔥', b: 'You left something behind', aiPick: 1, aiConfidence: 1, endsAt: now + 3600 * 3, votesA: 8, votesB: 9 }),
    mk({ creator: fake(4), question: 'Best name for a tiny budgeting app?', category: 4, a: 'Pennywise', b: 'Coinjar', aiPick: 2, aiConfidence: 2, endsAt: now - 3600, votesA: 19, votesB: 41 }),
    mk({ creator: fake(5), question: 'Which ad line sells the bike lock?', category: 2, a: 'Thieves hate this lock.', b: 'Lock it in 3 seconds. Keep it for 10 years.', aiPick: 2, aiConfidence: 3, endsAt: now - 7200, votesA: 27, votesB: 22 }),
    mk({ creator: fake(6), question: 'Which would make you click?', category: 0, a: 'The 4-day week, one year later', b: 'We tried a 4-day week. Here’s what broke.', aiPick: 0, aiConfidence: 0, endsAt: now + 86400 * 6, votesA: 5, votesB: 11 }),
  ];
  const votes = {};
  const starts = {};
  duels.forEach((d, id) => {
    starts[id] = d.aiPick
      ? ['', 'Version A has a stronger hook for this audience.', 'Version B names a concrete outcome, so it feels more credible.'][d.aiPick]
      : '';
    d.aiReasonHash = d.aiPick ? ethers.id(starts[id]) : ethers.ZeroHash;
    const startTs = (d.endsAt > now ? now : d.endsAt) - 86400;
    d.startTs = startTs;
    const list = [];
    const n = d.votesA + d.votesB;
    for (let i = 0; i < n; i++) {
      const choice = i < d.votesA ? 1 : 2;
      const pool = choice === 1 ? reasonsA : reasonsB;
      list.push({ voter: fake(100 + id * 100 + i), choice, reason: i % 3 === 0 ? '' : pool[i % pool.length], ts: startTs + Math.round(Math.random() * 80000) });
    }
    list.sort((x, y) => x.ts - y.ts);
    votes[id] = list;
  });
  return { duels, votes, starts, myVotes: {} };
}

class DemoBackend {
  load() {
    try {
      const raw = localStorage.getItem(DEMO_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    const s = seedDemo();
    this.save(s);
    return s;
  }
  save(s) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(s));
    } catch {}
    this._mem = s;
  }
  get s() {
    return this._mem || (this._mem = this.load());
  }
  async tx() {
    await sleep(650);
    return { hash: ethers.hexlify(ethers.randomBytes(32)) };
  }
  async listDuels() {
    return this.s.duels.map((d, i) => withDerived({ ...d, id: i }));
  }
  async getDuel(id) {
    const d = this.s.duels[id];
    return d ? withDerived({ ...d, id: Number(id) }) : null;
  }
  async voteOf(id, addr) {
    if (!addr) return 0;
    return (this.s.votes[id] || []).find((v) => v.voter === addr)?.choice || 0;
  }
  async aiReason(duel) {
    return this.s.starts[duel.id] || '';
  }
  async votes(duel) {
    return (this.s.votes[duel.id] || []).map((v) => ({ ...v, block: 0 }));
  }
  async stats() {
    const all = await this.listDuels();
    let aiCorrect = 0, aiFinished = 0, votes = 0;
    all.forEach((d) => {
      votes += d.total;
      if (!d.aiPick || d.hidden) return;
      if (d.winner === 1 || d.winner === 2) {
        aiFinished++;
        if (d.winner === d.aiPick) aiCorrect++;
      }
    });
    return { duels: all.length, votes, aiCorrect, aiFinished };
  }
  async duelsOf(addr) {
    const created = [], voted = [];
    this.s.duels.forEach((d, i) => {
      if (d.creator === addr) created.push(i);
      if ((this.s.votes[i] || []).some((v) => v.voter === addr)) voted.push(i);
    });
    return { created, voted };
  }
  async curator() {
    return demoAccount();
  }
  async startDuel(p) {
    const acc = await requireWallet();
    const r = await this.tx();
    const s = this.s;
    s.duels.push({
      creator: acc, question: p.question, category: p.category, a: p.a, b: p.b, isImage: p.isImage,
      aiPick: p.aiPick, aiConfidence: p.aiConfidence, aiReasonHash: p.aiReasonHash,
      endsAt: Math.floor(Date.now() / 1000) + p.duration, votesA: 0, votesB: 0, createdBlock: 1, ended: false, hidden: false,
      startTs: Math.floor(Date.now() / 1000),
    });
    const id = s.duels.length - 1;
    s.starts[id] = p.aiReason;
    s.votes[id] = [];
    this.save(s);
    return { id, hash: r.hash };
  }
  async vote(id, choice, reason) {
    const acc = await requireWallet();
    const d = await this.getDuel(id);
    if (!d) throw Object.assign(new Error('x'), { revert: { name: 'NotFound' } });
    if (!d.live) throw Object.assign(new Error('x'), { revert: { name: 'NotLive' } });
    if (d.creator === acc) throw Object.assign(new Error('x'), { revert: { name: 'CreatorCannotVote' } });
    if (await this.voteOf(id, acc)) throw Object.assign(new Error('x'), { revert: { name: 'AlreadyVoted' } });
    const r = await this.tx();
    const s = this.s;
    s.votes[id].push({ voter: acc, choice, reason, ts: Math.floor(Date.now() / 1000) });
    if (choice === 1) s.duels[id].votesA++;
    else s.duels[id].votesB++;
    this.save(s);
    return r;
  }
  async endEarly(id) {
    const acc = await requireWallet();
    if (this.s.duels[id]?.creator !== acc) throw Object.assign(new Error('x'), { revert: { name: 'NotCreator' } });
    const r = await this.tx();
    const s = this.s;
    s.duels[id].ended = true;
    this.save(s);
    return r;
  }
  async setHidden(id, hidden) {
    await requireWallet();
    const r = await this.tx();
    const s = this.s;
    s.duels[id].hidden = hidden;
    this.save(s);
    return r;
  }
}

export const api = DEMO ? new DemoBackend() : new ChainBackend();

export const explorerAddress = (a) => `${CHAIN.explorer}/address/${a}`;
export const explorerTx = (h) => `${CHAIN.explorer}/tx/${h}`;
export const reasonHash = (text) => (text ? ethers.id(text) : ethers.ZeroHash);
