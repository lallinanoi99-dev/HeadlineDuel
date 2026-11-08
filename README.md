# Headline Duel

**Two versions. One winner.** Let real people pick your best headline, tagline or ad. Each wallet gets one vote, and the AI's guess is locked in before anyone votes.

Built on **BOT Chain** (mainnet chain ID 677).

| | |
|---|---|
| Mainnet contract | `0x0000000000000000000000000000000000000000` ← **replace after deploying** ([scan.botchain.ai](https://scan.botchain.ai)) |
| Live site | `https://headlineduel.xyz` (GitHub Pages + custom domain) |
| Worker | `https://headline-duel-worker.<subdomain>.workers.dev` |

> Until a contract address is set in `site/assets/js/config.js`, the site runs in **demo mode**. Duels and votes are then stored only in your browser, and a yellow banner says so on every page.

---

## What's in the repo

```
contracts/          Solidity contract, ABI, compile + test scripts (solc 0.8.24, paris)
worker/             Cloudflare Worker: /duel/predict · /duel/summary · /duel/moderate · /upload
site/               Static site for GitHub Pages (no build step)
  index.html        Website (/) and the app shell (/app, /app/new, /d/:id, /app/me)
  404.html          GitHub Pages deep-link fallback
  assets/css/       Styles (dark Monologue-style theme, duel colours)
  assets/js/        ES modules: config, chain (ethers v6), ai, router, views, GSAP animations
scripts/dev-server.mjs   Local static server with SPA fallback
.github/workflows/  Pages deploy and contract tests
```

## How it works

1. **Write** (`/app/new`): a question (≤ 100 chars), a category, an optional line of context, two versions (text ≤ 140 chars, or images ≤ 2 MB sent to IPFS) and a duration (24h, 3d or 7d).
2. **Predict**: `✨ Ask AI first` calls the Worker's `/duel/predict`, which returns `{ pick, confidence, reason }`. The same call moderates the content.
3. **Lock**: `startDuel` stores the AI's pick, its confidence and `keccak256(reason)`, and emits `DuelStarted(id, creator, aiPick, aiReason)`. The contract checks that the reason text matches the hash. If the AI is down, the duel starts with "No AI pick".
4. **Vote** (`/d/:id`): voters pick a side (click, ← / → keys, or swipe on mobile) and can add a reason (≤ 140 chars). Each wallet votes once. The creator can't vote. Votes are only accepted while the duel is live. Reasons are emitted in `Voted` events.
5. **Results**: these stay hidden until you vote, unless you're the creator or the duel has ended. The results page shows:
   - a split bar
   - a votes-over-time chart
   - the AI vs crowd badge
   - a ✓ when the reason text matches the hash locked at creation
   - the newest reasons for each side
   - an AI theme summary (`/duel/summary` groups only real reasons, and counts are recomputed from the reason IDs)

   The creator also gets **End early**, **Download result card** (PNG) and **Start a rematch** (winner vs a new challenger).
6. **Profile** (`/app/me`): your duels, the duels you voted on, your crowd-agreement score, and the site-wide AI accuracy from `stats()`.

**Content safety:**
- A word filter runs both in the browser and in the Worker.
- AI moderation checks versions (in `predict`) and reasons (`/duel/moderate`).
- A **Report** button opens a prefilled GitHub issue.
- The curator wallet can hide or unhide duels with `setHidden`.

## Contract

`contracts/HeadlineDuel.sol` (Solidity ^0.8.20). It has no tokens and no payments.

- `startDuel(question, category, a, b, isImage, aiPick, aiConfidence, aiReasonHash, aiReason, duration) → id`
  - `aiReason` is an extra parameter, so the contract can emit the reason text and check that it matches `aiReasonHash`.
- `vote(id, choice, reason)`: `1` = A, `2` = B.
- `endEarly(id)` can only be called by the creator. `setHidden(id, bool)` and `setCurator(addr)` can only be called by the curator.
- Views:
  - `getDuel`, `getDuels(from, count)`, `totalDuels`
  - `hasVoted`, `voteOf`
  - `winner` (0 live · 1 A · 2 B · 3 draw), `isLive`
  - `duelsOf`, `stats` (duels, votes, AI correct / AI finished)

Compile and test locally:

```bash
cd contracts && npm install && npm test
```

### Deploy with Remix

1. Open [remix.ethereum.org](https://remix.ethereum.org) and paste in `contracts/HeadlineDuel.sol`.
2. Set up the compiler:
   - version **0.8.24**
   - Advanced: **EVM version `paris`**
   - **Enable optimization** (200 runs), recommended for lower gas

   No special config file is needed. Via IR is not required.
3. In MetaMask, add the networks:
   - **Testnet:** chain ID 968, RPC `https://rpc.bohr.life`, explorer `https://scan.bohr.life`
   - **Mainnet:** chain ID 677, RPC `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai`

   (The app also adds and switches networks automatically.)
4. Deploy with **Injected Provider – MetaMask**, first on testnet, then on mainnet. The deployer becomes the curator.
5. Verify the contract on scan.botchain.ai (Solidity single file, same compiler settings).
6. Put the address in `site/assets/js/config.js` → `MAINNET_CONTRACT_ADDRESS`. That one constant feeds the footer, the explorer button and every chain read and write. Also paste the address at the top of this README.

To try the app against testnet, set `TESTNET_CONTRACT_ADDRESS` and open the site with `?net=testnet`.

## Worker (shared Week 1 Worker)

`worker/src/index.js`:

- `POST /duel/predict` returns `{ pick: "A"|"B", confidence: "low"|"medium"|"high", reason }`, or `{ blocked, why }`
- `POST /duel/summary` returns `{ A: [{theme, count}], B: [...] }`
- `POST /duel/moderate` returns `{ ok, reason? }`
- `POST /upload` takes a multipart `file` (PNG, JPEG, WebP or GIF, ≤ 2 MB), pins it on Pinata and returns `{ cid }`

How it's set up:
- AI calls use the official Anthropic SDK with structured JSON output (`claude-opus-5-5` by default, `MODEL` var).
- Keys are secrets.
- CORS is locked to `ALLOWED_ORIGINS`.
- Rate limiting uses Cloudflare's rate limiter binding, with an in-memory fallback.
- Observability is off and request bodies are never logged.

```bash
cd worker
npm install
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put PINATA_JWT
# edit ALLOWED_ORIGINS in wrangler.toml to your domain
npx wrangler deploy
```

Then set `WORKER_URL` in `site/assets/js/config.js`. If no Worker URL is set, the site falls back to a clearly labelled offline heuristic.

## Website & hosting

The site is plain HTML, CSS and ES modules, with libraries loaded from a CDN at pinned versions:
- ethers 6.13.4
- GSAP 3.13.0 (ScrollTrigger, SplitText, Flip, Draggable)
- Chart.js 4.4.1
- html-to-image 1.11.11
- qrcodejs 1.0.0

Local dev:

```bash
node scripts/dev-server.mjs 8080   # http://localhost:8080
```

GitHub Pages:
1. Settings → Pages → Source: **GitHub Actions**. `.github/workflows/pages.yml` publishes `site/` on every push to `main`.
2. Custom domain: rename `site/CNAME.example` to `site/CNAME` with your domain, then point DNS at GitHub Pages.
3. `404.html` forwards deep links like `/d/21` to the SPA. The site also works under `<user>.github.io/<repo>/` because the base path is detected automatically.

### Home page (10 sections, Monologue-style layout)

The page opens with an announcement bar ("Image duels are here →") and a navbar (Features dropdown · Wall · FAQ · Connect wallet · Start a duel). Then:

1. Hero with an animated demo duel: the text types in, the VS badge drops, a cursor votes, the bar fills and the AI badge pops
2. Live duels marquee, read from the contract
3. Intro statement with icons
4. Tab rail (Headlines, Ads, Email subjects, Names) that swaps the mock window with GSAP Flip, plus 4 feature cards with check badges
5. 01–04 "How it works" carousel (draggable, each step animates its mini screen)
6. Bento grid
7. "Share it anywhere": phone, desktop and X post previews, plus a real finished result card from the contract
8. Pricing ("Free. Just gas.") and the ✓/✗ comparison table
9. FAQ accordion and live stats (duels, votes, AI accuracy)
10. Final CTA: "Write it twice. Pick it once."

### Footer

The footer's DVD screensaver panel shows the **BOT Chain logo** bouncing around, changing colour on every wall hit (blue → coral → yellow) and showing "🎉 corner!" when it hits a corner. Clicking the logo opens https://botchain.ai. The bounce is slower on mobile, and the logo stays still in the centre when reduced motion is on.

Below the panel:
- the contract address, which copies on click
- **View on explorer ↗**, linking to `https://scan.botchain.ai/address/<MAINNET_CONTRACT_ADDRESS>`
- live `DUELS · VOTES · AI RIGHT`

To use the official BOT Chain artwork, replace the inline `<svg class="dvd__svg">` in `site/index.html`. Keep `fill`/`stroke` set to `currentColor` so the colour changes still work.

## Design

- **Colours:** charcoal `#272727` · cards `#1C1C1C` · hairlines `#363636` · text `#F5F2EA` · muted `#A3A09A` · A `#3D7BFF` · B `#FF5C39` · VS `#FFD23F` · win `#3DDC84`
- **Type:** Instrument Sans (headlines), Instrument Serif (the A/B copy being tested), Geist Mono (labels and counts)
- **Motion:** animations use transform and opacity only. Everything respects `prefers-reduced-motion`.
- **Layout:** desktop first. Tablet shows 2 cards per row. On mobile, A and B stack, the targets are bigger, you can swipe to vote, and the result bar stays stuck to the bottom of the screen.

## Out of scope (MVP)

More than 2 versions, real-traffic A/B testing, paid voters, demographics, comment threads, accounts, a backend database, NFTs.

© 2026 Headline Duel
