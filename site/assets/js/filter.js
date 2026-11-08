// Simple word filter — same list as worker/src/filter.js (keep both in sync).
// The Worker AI moderation catches what this short list misses.
const BLOCKED = [
  'fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'retard', 'whore', 'slut',
  'kill yourself', 'kys', 'rape', 'nazi', 'porn', 'xxx',
];

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

export function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] || c)
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ');
}

/** @returns {string|null} the matched word, or null if clean */
export function wordFilter(text) {
  const t = ` ${normalise(text)} `;
  for (const w of BLOCKED) {
    if (t.includes(` ${w} `) || (w.length > 4 && t.includes(w))) return w;
  }
  return null;
}
