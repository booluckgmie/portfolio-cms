#!/usr/bin/env node
// content/catalog.json (private source, full URLs)
//   → dist/data/catalog.json   public; locked cards have their URL removed
//   → dist/index.html          (+ anything in public/)  ← the only folder that gets published
//   → private/links.json       locked URLs, bundled into the unlock function only (never in dist/)
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

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

await rm(new URL('dist/', root), { recursive: true, force: true });
await mkdir(new URL('dist/data/', root), { recursive: true });
await mkdir(new URL('private/', root), { recursive: true });
await cp(new URL('index.html', root), new URL('dist/index.html', root));
if (existsSync(new URL('public/', root))) await cp(new URL('public/', root), new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/data/catalog.json', root), JSON.stringify(pub));
await writeFile(new URL('private/links.json', root), JSON.stringify(priv));
console.log(`[build] ${pub.cards.length} cards, ${Object.keys(priv).length} locked → dist/`);
