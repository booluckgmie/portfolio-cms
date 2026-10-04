#!/usr/bin/env node
// Pulls deployed projects from GitHub, Netlify and Vercel and merges them into
// content/catalog.json. Your own edits (title, desc, group, icon, locked, ...)
// are never overwritten — only machine-owned fields are refreshed.
//
// Env: GITHUB_TOKEN (optional), NETLIFY_TOKEN, VERCEL_TOKEN
// Config: content/sync.config.json
import { readFile, writeFile } from 'node:fs/promises';

const CATALOG = new URL('../content/catalog.json', import.meta.url);
const CONFIG  = new URL('../content/sync.config.json', import.meta.url);

const cfg     = JSON.parse(await readFile(CONFIG, 'utf8'));
const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
const groupIds = new Set(catalog.groups.map(g => g.id));

const PLATFORM = {
  netlify: { label: 'Netlify', color: '#00ad9f' },
  vercel:  { label: 'Vercel',  color: '#9aa4b2' },
  github:  { label: 'GitHub',  color: '#8b949e' },
};

const ICONS = [ // [regex on framework/language/topics/name, tabler icon]
  [/next/i, 'brand-nextjs'], [/react/i, 'brand-react'], [/vue|nuxt/i, 'brand-vue'],
  [/svelte/i, 'brand-svelte'], [/angular/i, 'brand-angular'], [/astro/i, 'rocket'],
  [/python|flask|django|streamlit|fastapi/i, 'brand-python'], [/typescript/i, 'brand-typescript'],
  [/javascript|node/i, 'brand-javascript'], [/php|laravel/i, 'brand-php'],
  [/dash|chart|analytic|kpi|report/i, 'chart-dots-3'], [/map|geo/i, 'map-2'],
  [/blog|news|docs/i, 'news'], [/shop|store|commerce/i, 'shopping-cart'],
  [/ai|llm|gpt|claude|ml/i, 'sparkles'],
];

const log  = (...a) => console.log('[sync]', ...a);
const warn = (...a) => console.warn('[sync]', ...a);

async function getJSON(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'portfolio-cms-sync', ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

// ── Collectors: each returns [{ platform, key, name, url, repo, desc, updated, ... }] ──
async function fromGitHub() {
  const user = cfg.github?.user;
  const token = process.env.GITHUB_TOKEN;
  if (!user && !token) return null;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const base = (token && cfg.github?.includePrivate)
    ? 'https://api.github.com/user/repos?affiliation=owner&per_page=100'
    : `https://api.github.com/users/${user}/repos?type=owner&per_page=100`;
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await getJSON(`${base}&page=${page}`, headers);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos
    .filter(r => (cfg.github?.includeForks || !r.fork) && (cfg.github?.includePrivate || !r.private))
    .map(r => {
      const homepage = (r.homepage || '').trim();
      const pages = r.has_pages ? `https://${r.owner.login.toLowerCase()}.github.io/${r.name === `${r.owner.login}.github.io` ? '' : r.name + '/'}` : '';
      return {
        platform: 'github', name: r.name, repo: r.html_url, repoKey: r.full_name.toLowerCase(),
        url: /^https?:\/\//.test(homepage) ? homepage : pages,
        desc: r.description || '', updated: r.pushed_at, archived: r.archived, private: r.private,
        hints: [r.language, ...(r.topics || [])].filter(Boolean), topics: r.topics || [],
      };
    });
}

async function fromNetlify() {
  const token = process.env.NETLIFY_TOKEN;
  if (!token || cfg.netlify?.enabled === false) return null;
  const sites = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await getJSON(`https://api.netlify.com/api/v1/sites?per_page=100&page=${page}&filter=all`, { Authorization: `Bearer ${token}` });
    sites.push(...batch);
    if (batch.length < 100) break;
  }
  return sites.filter(s => s.published_deploy || s.deploy_url).map(s => {
    const repoUrl = s.build_settings?.repo_url || '';
    return {
      platform: 'netlify', name: s.name, id: s.id,
      url: s.custom_domain ? `https://${s.custom_domain}` : (s.ssl_url || s.url),
      repo: repoUrl, repoKey: repoKeyOf(repoUrl),
      desc: '', updated: s.published_deploy?.published_at || s.updated_at,
      thumb: s.screenshot_url || s.published_deploy?.screenshot_url || '',
      hints: [s.build_settings?.cmd].filter(Boolean),
    };
  });
}

async function fromVercel() {
  const token = process.env.VERCEL_TOKEN;
  if (!token || cfg.vercel?.enabled === false) return null;
  const team = cfg.vercel?.teamId || process.env.VERCEL_TEAM_ID;
  const out = [];
  let until = '';
  for (let i = 0; i < 20; i++) {
    const qs = new URLSearchParams({ limit: '100', ...(team && { teamId: team }), ...(until && { until }) });
    const res = await getJSON(`https://api.vercel.com/v9/projects?${qs}`, { Authorization: `Bearer ${token}` });
    out.push(...res.projects);
    if (!res.pagination?.next) break;
    until = res.pagination.next;
  }
  return out.filter(p => p.targets?.production || p.latestDeployments?.length).map(p => {
    const alias = p.targets?.production?.alias || [];
    const custom = alias.find(a => !a.endsWith('.vercel.app')) || alias[0];
    const link = p.link?.type === 'github' ? `https://github.com/${p.link.org}/${p.link.repo}` : '';
    return {
      platform: 'vercel', name: p.name, id: p.id,
      url: `https://${custom || `${p.name}.vercel.app`}`,
      repo: link, repoKey: repoKeyOf(link),
      desc: '', updated: p.updatedAt ? new Date(p.updatedAt).toISOString() : '',
      hints: [p.framework].filter(Boolean),
    };
  });
}

function repoKeyOf(u) {
  const m = /github\.com[/:]([^/]+\/[^/.#?]+)/i.exec(u || '');
  return m ? m[1].toLowerCase() : '';
}
const hostOf = u => { try { return new URL(u).host.toLowerCase().replace(/^www\./, ''); } catch { return ''; } };
const slug   = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const human  = s => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// ── Gather ──
const results = {};
for (const [name, fn] of Object.entries({ github: fromGitHub, netlify: fromNetlify, vercel: fromVercel })) {
  try {
    results[name] = await fn();
    log(name.padEnd(8), results[name] ? `${results[name].length} found` : 'skipped (no token)');
  } catch (e) { warn(name, 'failed:', e.message); results[name] = undefined; }
}
const ok = Object.keys(results).filter(k => results[k]);
if (!ok.length) { log('nothing to sync.'); process.exit(0); }

// ── Group candidates into one project each (same repo or same host) ──
const projects = [];
const byRepo = new Map(), byHost = new Map();
function place(item) {
  let p = (item.repoKey && byRepo.get(item.repoKey)) || (item.url && byHost.get(hostOf(item.url)));
  if (!p) { p = { items: [] }; projects.push(p); }
  p.items.push(item);
  if (item.repoKey) byRepo.set(item.repoKey, p);
  if (item.url) byHost.set(hostOf(item.url), p);
}
// deployed platforms first so GitHub repos only attach / add Pages & homepage projects
[...(results.netlify || []), ...(results.vercel || []), ...(results.github || [])].forEach(place);

const ignore = new Set((cfg.ignore || []).map(s => s.toLowerCase()));
const ignorePatterns = (cfg.ignorePatterns || []).map(r => new RegExp(r, 'i'));
const rules = (cfg.rules || []).map(r => ({ ...r, re: new RegExp(r.match, 'i') }));

function toCandidate(p) {
  const deployed = p.items.filter(i => i.url);
  if (!deployed.length) return null; // repo with nothing deployed → not a portfolio item
  const gh = p.items.find(i => i.platform === 'github');
  if (gh?.topics?.includes('portfolio-hidden')) return null;
  const primary = deployed.find(i => i.platform !== 'github') || deployed[0];
  const custom  = deployed.find(i => !/\.(netlify\.app|vercel\.app|github\.io)/.test(i.url));
  const name = gh?.name || primary.name;
  if (ignorePatterns.some(re => re.test(name))) return null;
  if (ignore.has(name.toLowerCase()) || p.items.some(i => ignore.has(i.name.toLowerCase()))) return null;
  const platforms = [...new Set(deployed.map(i => i.platform))];
  const hints = p.items.flatMap(i => i.hints || []).join(' ') + ' ' + name;
  const rule = rules.find(r => r.re.test(name)) || {};
  const topicGroup = (gh?.topics || []).map(t => /^group-(.+)$/.exec(t)?.[1]).find(g => groupIds.has(g));
  const updated = p.items.map(i => i.updated).filter(Boolean).sort().pop() || '';
  return {
    key: p.items.map(i => `${i.platform}:${i.id || i.name}`),
    id: 'p_' + slug(name),
    url: (custom || primary).url,
    title: human(name),
    tag: PLATFORM[primary.platform].label,
    desc: gh?.desc || `Live on ${platforms.map(x => PLATFORM[x].label).join(' & ')}${updated ? ` · updated ${updated.slice(0, 10)}` : ''}.`,
    group: topicGroup || (groupIds.has(rule.group) ? rule.group : cfg.defaultGroup),
    icon: rule.icon || ICONS.find(([re]) => re.test(hints))?.[1] || '',
    color: rule.color || '',
    locked: rule.locked ?? (gh?.topics?.includes('portfolio-locked') || !!cfg.newCardsLocked),
    faded: !!gh?.archived,
    repo: gh?.repo || p.items.find(i => i.repo)?.repo || '',
    platforms, updated,
    thumbUrl: p.items.find(i => i.thumb)?.thumb || '',
  };
}

const candidates = projects.map(toCandidate).filter(Boolean);

// ── Merge ──
// url/repo/platforms/updated are refreshed every run; SEED fields are filled once, then yours.
const SEED = ['title', 'tag', 'desc', 'group', 'icon', 'color', 'locked', 'faded', 'thumbUrl'];
let added = 0, updatedN = 0, gone = 0;

const norm = u => hostOf(u) + (new URL(u, 'https://x').pathname.replace(/\/$/, ''));
const existingBy = c => catalog.cards.find(x =>
  x.id === c.id ||
  c.key.some(k => k.startsWith('netlify:') && x.id === 'nl_' + k.slice(8, 20)) || // cards from the old Netlify importer
  (x.sourceKeys || []).some(k => c.key.includes(k)) ||
  (x.url && c.url && norm(x.url) === norm(c.url)));

const seen = new Set();
for (const c of candidates) {
  const card = existingBy(c);
  if (card) {
    seen.add(card.id);
    const before = JSON.stringify(card);
    Object.assign(card, { repo: c.repo || card.repo, platforms: c.platforms, updated: c.updated, sourceKeys: c.key });
    if (card.auto) { // hand-made cards keep their own url and text
      card.url = c.url;
      for (const f of SEED) if (card[f] === undefined || card[f] === '') card[f] = c[f];
      if (card.gone) { delete card.gone; card.faded = c.faded; }
    }
    if (JSON.stringify(card) !== before) updatedN++;
  } else {
    const g = catalog.groups.find(x => x.id === c.group);
    const { key, ...rest } = c;
    catalog.cards.push({ ...rest, color: c.color || g?.color || '#4f7cff', newTab: true, size: '', auto: true, sourceKeys: key });
    seen.add(c.id); added++;
  }
}
// Auto cards whose platform responded but no longer lists them → fade, don't delete.
for (const card of catalog.cards) {
  if (!card.auto || seen.has(card.id) || card.gone) continue;
  const platformsChecked = (card.sourceKeys || []).map(k => k.split(':')[0]);
  if (platformsChecked.length && platformsChecked.every(p => ok.includes(p))) {
    card.gone = true; card.faded = true; gone++;
  }
}

// de-dupe ids defensively
const ids = new Set();
for (const c of catalog.cards) { while (ids.has(c.id)) c.id += '_'; ids.add(c.id); }

if (added || updatedN || gone) catalog._synced = new Date().toISOString();
await writeFile(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
log(`done — ${added} added, ${updatedN} updated, ${gone} marked gone. Total ${catalog.cards.length}.`);
