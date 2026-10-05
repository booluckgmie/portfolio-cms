// Shared by the Netlify function and the Vercel function.
// POST { id, key } → { url } when the key matches.
// Keys live in Netlify env vars, never in the repo or the public catalog:
//   ACCESS_KEY   – default key for every locked card
//   ACCESS_KEYS  – optional JSON map of per-card keys, e.g. {"p_secret-app":"another-pass"}
import { createHash, timingSafeEqual } from 'node:crypto';

const sha = s => createHash('sha256').update(String(s)).digest();
const same = (a, b) => timingSafeEqual(sha(a), sha(b));
const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const wait = ms => new Promise(r => setTimeout(r, ms));

// links: { [cardId]: url }  (from private/links.json, supplied by the host wrapper)
export async function handleUnlock(req, links) {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let id, key;
  try { ({ id, key } = await req.json()); } catch { return json(400, { error: 'Bad request' }); }

  // Admin login: checked against ADMIN_KEY. 501 tells the page the server has none, so it can fall back.
  if (id === '__admin__') {
    const admin = process.env.ADMIN_KEY;
    if (!admin) return json(501, { error: 'ADMIN_KEY not configured' });
    if (typeof key === 'string' && same(key, admin)) return json(200, { ok: true });
    await wait(700);
    return json(401, { error: 'Incorrect admin key.' });
  }

  const url = links[id];
  let perCard = {};
  try { perCard = JSON.parse(process.env.ACCESS_KEYS || '{}'); } catch { /* ignore bad JSON */ }
  const expected = perCard[id] ?? process.env.ACCESS_KEY;

  if (!url || !expected || typeof key !== 'string' || !same(key, expected)) {
    await wait(700); // slow down guessing
    return json(401, { error: expected ? 'Incorrect key.' : 'Access key not configured on the server.' });
  }
  return json(200, { url });
}
