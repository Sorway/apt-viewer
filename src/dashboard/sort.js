import { InvalidFilterError } from './filters.js';

const columns = {
  overview: ['time', 'ip', 'direction', 'bytes', 'resource'],
  clients: ['name', 'in', 'out', 'count', 'last'],
  endpoints: ['name', 'in', 'out', 'count', 'last'],
  activity: ['time', 'ip', 'direction', 'bytes', 'resource'],
  failures: ['time', 'ip', 'statusCode', 'resource', 'reason'],
  failureGroups: ['count', 'clientCount', 'statusCode', 'resource', 'reason', 'first', 'last'],
};
const defaultColumns = {
  overview: 'time',
  clients: 'out',
  endpoints: 'out',
  activity: 'time',
  failures: 'time',
  failureGroups: 'last',
};
const textOrder = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

export function defaultOrder(key) {
  return ['name', 'ip', 'direction', 'resource', 'reason'].includes(key) ? 'asc' : 'desc';
}

export function readSort(query, screen) {
  const key = query.sort ?? defaultColumns[screen];
  const order = query.order ?? defaultOrder(key);
  if (!columns[screen].includes(key) || !['asc', 'desc'].includes(order)) {
    throw new InvalidFilterError();
  }
  return { key, order };
}

export function nextSortOrder(sorting, key) {
  if (sorting.key !== key) return defaultOrder(key);
  return sorting.order === 'asc' ? 'desc' : 'asc';
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
