import { handleUnlock } from '../../lib/unlock-core.mjs';
import links from '../../private/links.json';

export default (req) => handleUnlock(req, links);
