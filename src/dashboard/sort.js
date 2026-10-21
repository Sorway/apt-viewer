import { InvalidFilterError } from './filters.js';

const columns = {
  overview: ['time', 'ip', 'direction', 'bytes', 'resource'],
  clients: ['name', 'in', 'out', 'count', 'last'],
  endpoints: ['name', 'in', 'out', 'count', 'last'],
  activity: ['time', 'ip', 'direction', 'bytes', 'resource'],
  failures: ['time', 'ip', 'statusCode', 'resource', 'reason'],
  failureGroups: ['count', 'clientCount', 'statusCode', 'resource', 'reason', 'first', 'last'],
};
const textOrder = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

export function defaultOrder(key) {
  return ['name', 'ip', 'direction', 'resource', 'reason'].includes(key) ? 'asc' : 'desc';
}

export function readSort(query, screen) {
  const fallback = screen === 'failureGroups' ? 'last' : ['clients', 'endpoints'].includes(screen) ? 'out' : 'time';
  const key = query.sort ?? fallback;
  const order = query.order ?? defaultOrder(key);
  if (!columns[screen].includes(key) || !['asc', 'desc'].includes(order)) {
    throw new InvalidFilterError();
  }
  return { key, order };
}

export function sortRows(rows, { key, order }) {
  const direction = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    // Missing HTTP codes stay at the bottom in either direction.
    if (a[key] == null && b[key] != null) return 1;
    if (b[key] == null && a[key] != null) return -1;
    const difference = typeof a[key] === 'number'
      ? a[key] - b[key]
      : textOrder.compare(a[key] ?? '', b[key] ?? '');
    return difference * direction || (b.time ?? b.last) - (a.time ?? a.last) ||
      textOrder.compare(a.name ?? a.ip, b.name ?? b.ip);
  });
}
