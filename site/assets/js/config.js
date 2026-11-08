// ────────────────────────────────────────────────────────────────
// Headline Duel — site configuration (edit here after deploying).
// ────────────────────────────────────────────────────────────────

/** Mainnet contract on BOT Chain (chain ID 677). The single source of truth for the address. */
export const MAINNET_CONTRACT_ADDRESS = '0x2D140F58c2A2D97927E11BFc888A0144668b47FD';

/** Testnet contract (chain ID 968) — used when the URL has ?net=testnet. */
export const TESTNET_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Cloudflare Worker (shared Week 1 Worker) base URL, no trailing slash. */
export const WORKER_URL = 'https://headline-duel-worker.example.workers.dev';

export const SITE_URL = 'https://headlineduel.xyz';
export const REPO_URL = 'https://github.com/lallinanoi99-dev/HeadlineDuel';
export const X_URL = 'https://x.com/';
export const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/';

export const CHAINS = {
  mainnet: {
    chainId: 677,
    hex: '0x2a5',
    name: 'BOT Chain',
    rpc: 'https://rpc.botchain.ai',
    explorer: 'https://scan.botchain.ai',
    currency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
    contract: MAINNET_CONTRACT_ADDRESS,
  },
  testnet: {
    chainId: 968,
    hex: '0x3c8',
    name: 'BOT Chain Testnet',
    rpc: 'https://rpc.bohr.life',
    explorer: 'https://scan.bohr.life',
    currency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
    contract: TESTNET_CONTRACT_ADDRESS,
  },
};

const params = new URLSearchParams(location.search);
let net = 'mainnet';
try {
  if (params.get('net')) sessionStorage.setItem('hd-net', params.get('net'));
  net = sessionStorage.getItem('hd-net') === 'testnet' ? 'testnet' : 'mainnet';
} catch { net = params.get('net') === 'testnet' ? 'testnet' : 'mainnet'; }

export const NETWORK = net;
export const CHAIN = CHAINS[NETWORK];
export const CONTRACT_ADDRESS = CHAIN.contract;
export const IS_CONFIGURED = !/^0x0{40}$/i.test(CONTRACT_ADDRESS);

/**
 * Demo mode: when no contract is configured (or ?demo=1), the app runs on an in-browser
 * mock chain so the whole flow can be tried. It is always clearly labelled on screen.
 */
export const DEMO = !IS_CONFIGURED || params.get('demo') === '1';

export const CATEGORIES = ['Headline', 'Tagline', 'Ad', 'Email subject', 'Name', 'Image'];
export const IMAGE_CATEGORY = 5;
export const DURATIONS = [
  { label: '24 hours', seconds: 86400 },
  { label: '3 days', seconds: 259200 },
  { label: '7 days', seconds: 604800 },
];
export const CONFIDENCE = ['', 'low', 'medium', 'high'];
