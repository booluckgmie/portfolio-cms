import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handleUnlock } from '../lib/unlock-core.mjs';

let links;
function load() {
  if (!links) {
    try { links = JSON.parse(readFileSync(join(process.cwd(), 'private', 'links.json'), 'utf8')); }
    catch { links = {}; }
  }
  return links;
}

export default { fetch: (req) => handleUnlock(req, load()) };
