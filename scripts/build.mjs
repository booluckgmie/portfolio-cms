#!/usr/bin/env node
// content/catalog.json (private source, full URLs)
//   → data/catalog.json            public; locked cards have their URL removed
//   → netlify/private/links.json   locked URLs, bundled into the unlock function only
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const src  = JSON.parse(await readFile(new URL('content/catalog.json', root), 'utf8'));

const pub = { ...src, cards: [] };
const priv = {};
for (const c of src.cards) {
  const { lockKey, sourceKeys, auto, gone, ...card } = c; // never ship keys or sync internals
  if (card.locked) {
    if (card.url) priv[card.id] = card.url;
    card.url = '';
  }
  pub.cards.push(card);
}
pub._built = new Date().toISOString();

await mkdir(new URL('data/', root), { recursive: true });
await mkdir(new URL('netlify/private/', root), { recursive: true });
await writeFile(new URL('data/catalog.json', root), JSON.stringify(pub));
await writeFile(new URL('netlify/private/links.json', root), JSON.stringify(priv));
console.log(`[build] ${pub.cards.length} cards, ${Object.keys(priv).length} locked`);
