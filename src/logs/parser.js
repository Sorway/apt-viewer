import { isIP } from 'node:net';

export function parseLine(line) {
  // Only the first four pipes are separators; a resource may contain more.
  const match = /^(\d+(?:\.\d+)?)\|([IOE])\|(\d+)\|([^|]+)\|(.+)$/.exec(line.replace(/\r$/, ''));
  if (!match) return null;

  const [, timestamp, direction, byteCount, address, rawResource] = match;
  const seconds = Number(timestamp);
  const bytes = Number(byteCount);
  const ip = address.trim();

  if (!isIP(ip) || !Number.isSafeInteger(bytes)) return null;
  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 8640000000000) return null;
  if (rawResource.length > 16384 || /[\x00-\x1f\x7f]/.test(rawResource)) return null;

  let resource = rawResource;
  let failure;
  if (direction === 'E') {
    const detail = /^(.*?) \[(.+)\]$/.exec(resource);
    let reason = 'Motif non fourni par le journal';
    if (detail && detail[1]) {
      resource = detail[1];
      reason = detail[2];
    }
    const httpError = /\bHTTP error,\s*code:\s*([45]\d{2})\b/i.exec(reason);
    failure = { reason, statusCode: httpError ? Number(httpError[1]) : null };
  }

  let endpoint = resource.split('/')[0] || '(local)';
  if (/^https?:\/\//i.test(resource)) {
    try {
      endpoint = new URL(resource).host;
    } catch {
      return null;
    }
  }

  return { time: Math.floor(seconds * 1000), direction, bytes, ip, resource, endpoint, ...failure };
}

function addToGroup(groups, name, event) {
  if (!groups.has(name)) {
    groups.set(name, { name, in: 0, out: 0, count: 0, last: 0 });
  }
  const group = groups.get(name);
  if (event.direction === 'I') group.in += event.bytes;
  if (event.direction === 'O') group.out += event.bytes;
  group.count++;
  group.last = Math.max(group.last, event.time);
}

export function summarize(events) {
  let incoming = 0;
  let outgoing = 0;
  const clients = new Map();
  const endpoints = new Map();

  for (const event of events) {
    if (event.direction === 'I') incoming += event.bytes;
    if (event.direction === 'O') outgoing += event.bytes;
    addToGroup(clients, event.ip, event);
    addToGroup(endpoints, event.endpoint, event);
  }

  const byOutgoingVolume = (a, b) => b.out - a.out;
  return {
    incoming,
    outgoing,
    clients: [...clients.values()].sort(byOutgoingVolume),
    endpoints: [...endpoints.values()].sort(byOutgoingVolume),
  };
}
