import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';

const resolver = new Resolver({ timeout: 1500, tries: 1 });
const positiveTtl = 5 * 60 * 1000;
const negativeTtl = 60 * 1000;

function validHostname(name) {
  return typeof name === 'string' && name.length <= 253 && /^[a-zA-Z0-9_.-]+$/.test(name);
}

export function createClientDns({
  reverse = ip => resolver.reverse(ip),
  now = Date.now,
  maxEntries = 2048,
  concurrency = 4,
} = {}) {
  const cache = new Map();
  const pending = new Set();
  const queue = [];
  let active = 0;

  function save(ip, name, ttl) {
    cache.delete(ip);
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(ip, { name, expires: now() + ttl });
  }

  function drain() {
    while (active < concurrency && queue.length) {
      const ip = queue.shift();
      active++;

      Promise.resolve()
        .then(() => reverse(ip))
        .then(
          names => {
            const name = names.find(validHostname)?.replace(/\.$/, '') || '';
            save(ip, name, name ? positiveTtl : negativeTtl);
          },
          () => save(ip, '', negativeTtl),
        )
        .finally(() => {
          active--;
          pending.delete(ip);
          drain();
        });
    }
  }

  function get(ip) {
    if (!isIP(ip)) return '';
    const entry = cache.get(ip);
    const expired = !entry || entry.expires <= now();
    if (expired && !pending.has(ip) && pending.size < maxEntries) {
      pending.add(ip);
      queue.push(ip);
      drain();
    }
    return entry && entry.expires > now() ? entry.name : '';
  }

  return { get };
}
