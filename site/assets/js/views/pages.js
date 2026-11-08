// Small static pages: guide, about, privacy, terms, 404
import { CHAIN, CONTRACT_ADDRESS, IS_CONFIGURED, REPO_URL } from '../config.js';
import { esc } from '../util.js';
import { explorerAddress } from '../chain.js';

const PAGES = {
  guide: {
    title: 'Writing better headlines',
    html: `<h1>Writing better headlines</h1>
      <p>A duel only teaches you something if the two versions differ in <b>one</b> clear way. A few patterns that are worth testing:</p>
      <h2>1 · Concrete beats clever</h2><p>“Our cloud bill was $40k. Now it’s $19k.” vs “How we cut our cloud bill in half”. Numbers make a promise feel real.</p>
      <h2>2 · Benefit vs feature</h2><p>“Lock it in 3 seconds” (benefit) vs “Hardened steel shackle” (feature).</p>
      <h2>3 · Curiosity vs clarity</h2><p>“You left something behind” vs “Your cart is waiting — 10% off today”. Curiosity can win opens and lose trust.</p>
      <h2>4 · Short vs specific</h2><p>Names and taglines often win on rhythm. Say them out loud.</p>
      <h2>5 · Give context</h2><p>Add one line — “for a coffee subscription, audience: students” — so strangers can judge for the right reader.</p>
      <h2>Read the reasons</h2><p>The split tells you <i>what</i> won. The reasons and the AI theme summary tell you <i>why</i> — that’s what you carry to the next draft. Then start a rematch: winner vs a new challenger.</p>`,
  },
  about: {
    title: 'About',
    html: () => `<h1>About Headline Duel</h1>
      <p>Headline Duel lets you post two versions of a headline, tagline, ad, email subject, name or image and let real people pick. One vote per wallet. The AI makes its guess first, and that guess is locked on-chain before anyone votes.</p>
      <h2>On BOT Chain</h2>
      <p>Everything lives in one smart contract on ${esc(CHAIN.name)} (chain ID ${CHAIN.chainId}). There is no backend database: duels are contract storage, votes and reasons are events read with <code>getLogs</code>.</p>
      <p>Contract: ${IS_CONFIGURED ? `<a href="${esc(explorerAddress(CONTRACT_ADDRESS))}" target="_blank" rel="noopener"><code>${esc(CONTRACT_ADDRESS)}</code> ↗</a>` : '<b>not deployed yet</b> — the site is running in demo mode.'}</p>
      <h2>How the AI pick is locked</h2>
      <p>When you start a duel, the AI's pick (A/B), its confidence and <code>keccak256(reason)</code> are stored in the duel. The reason text is emitted in the <code>DuelStarted</code> event; the results page recomputes the hash and shows ✓ when they match.</p>
      <h2>Deploying your own</h2>
      <p>See the README in the <a href="${esc(REPO_URL)}" target="_blank" rel="noopener">GitHub repo</a>: compile <code>contracts/HeadlineDuel.sol</code> in Remix (evmVersion <code>paris</code>, via IR on), deploy to testnet then mainnet, and paste the address into <code>site/assets/js/config.js</code>.</p>`,
  },
  privacy: {
    title: 'Privacy',
    html: `<h1>Privacy</h1>
      <p>Headline Duel has no accounts and no database. We don't use cookies or analytics.</p>
      <h2>What is public</h2><p>Duels, votes, vote reasons and wallet addresses are written to BOT Chain, a public blockchain. They can't be deleted. Don't put personal information in duels or reasons.</p>
      <h2>AI</h2><p>When you ask for a prediction or open a results page, the duel text and public reasons are sent to our Cloudflare Worker, which calls an AI model. The Worker doesn't log request content.</p>
      <h2>Images</h2><p>Images for image duels are uploaded to IPFS, which is public and permanent.</p>
      <h2>Local storage</h2><p>Your browser may store small preferences (like network choice). Demo mode stores demo duels in your browser only.</p>`,
  },
  terms: {
    title: 'Terms',
    html: `<h1>Terms</h1>
      <p>Headline Duel is provided as-is, without warranties. You're responsible for what you post and for your wallet and gas fees.</p>
      <h2>Content rules</h2><p>No hate, harassment, sexual content, threats, personal data or spam. Offensive text is blocked by a word filter and AI moderation; the curator can hide duels from the site. On-chain data itself can't be removed.</p>
      <h2>No financial product</h2><p>There are no tokens, payments or rewards. Votes are opinions, not advice.</p>`,
  },
  404: {
    title: 'Page not found',
    html: `<div class="empty"><h2>Page not found</h2><p>That page doesn't exist.</p><a class="btn btn--primary" href="./" data-link>Go home</a></div>`,
  },
};

export function renderPage(root, { page }) {
  const p = PAGES[page] || PAGES[404];
  document.title = `${p.title} — Headline Duel`;
  const html = typeof p.html === 'function' ? p.html() : p.html;
  root.innerHTML = page === '404' || !PAGES[page] ? html : `<article class="prose">${html}</article>`;
}
