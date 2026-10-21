import { createHash } from 'node:crypto';

function failureKey(event) {
  return JSON.stringify([event.statusCode ?? null, event.resource, event.reason || '']);
}

export function failureId(event) {
  return createHash('sha256').update(failureKey(event)).digest('hex');
}

export function groupFailures(events) {
  const groups = new Map();
  for (const event of events) {
    if (event.direction !== 'E') continue;
    const key = failureKey(event);
    if (!groups.has(key)) {
      groups.set(key, {
        id: failureId(event),
        statusCode: event.statusCode ?? null,
        resource: event.resource,
        reason: event.reason,
        count: 0,
        first: event.time,
        last: event.time,
        clients: new Set(),
      });
    }
    const group = groups.get(key);
    group.count++;
    group.first = Math.min(group.first, event.time);
    group.last = Math.max(group.last, event.time);
    group.clients.add(event.ip);
  }
  return [...groups.values()].map(group => ({
    ...group,
    clientCount: group.clients.size,
    clients: [...group.clients].sort(),
  }));
}
