import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
const resolver = new Resolver({timeout: 1500, tries: 1});
export function createClientDns({reverse = ip => resolver.reverse(ip), now = Date.now, maxEntries = 2048, concurrency = 4} = {}) {
  const cache = new Map(), pending = new Set(), queue = [];
  let active = 0;
  function drain() {
    while (active < concurrency && queue.length) {
      const ip = queue.shift(); active++;
      Promise.resolve().then(() => reverse(ip)).then(names => {
        const name = names.find(n => typeof n === 'string' && n.length <= 253 && /^[a-zA-Z0-9_.-]+$/.test(n))?.replace(/\.$/, '') || '';
        save(ip, name, name ? 300000 : 60000);
      }, () => save(ip, '', 60000)).finally(() => { active--; pending.delete(ip); drain(); });
    }
  }
  function save(ip, name, ttl) {
    cache.delete(ip);
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(ip, {name, expires: now() + ttl});
  }
  return {get(ip) {
    if (!isIP(ip)) return '';
    const entry = cache.get(ip);
    if ((!entry || entry.expires <= now()) && !pending.has(ip) && pending.size < maxEntries) {
      pending.add(ip); queue.push(ip); drain();
    }
    return entry && entry.expires > now() ? entry.name : '';
  }};
}
