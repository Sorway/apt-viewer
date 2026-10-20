const filterLabels = {
  ip: 'Client',
  endpoint: 'Dépôt',
  direction: 'Flux',
  q: 'Recherche',
  from: 'Depuis (UTC)',
  to: 'Jusqu’au (UTC)',
  code: 'HTTP',
};

export class InvalidFilterError extends Error {}

function parseDate(value) {
  // datetime-local inputs have no timezone; the filter form uses UTC.
  const localDate = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/;
  return Date.parse(localDate.test(value) ? `${value}Z` : value);
}

export function readFilters(query, failures = false) {
  const keys = ['ip', 'endpoint', 'direction', 'q', 'from', 'to'];
  if (failures) keys.push('code');

  const filters = {};
  for (const key of keys) {
    const value = query[key];
    if (value !== undefined && (typeof value !== 'string' || value.length > 200)) {
      throw new InvalidFilterError();
    }
    filters[key] = value || '';
  }

  if (filters.direction && !['I', 'O'].includes(filters.direction)) {
    throw new InvalidFilterError();
  }
  if (failures && filters.direction) throw new InvalidFilterError();
  if (filters.code && !/^(?:[45]\d{2}|unknown)$/.test(filters.code)) {
    throw new InvalidFilterError();
  }

  const from = filters.from ? parseDate(filters.from) : -Infinity;
  const to = filters.to ? parseDate(filters.to) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) {
    throw new InvalidFilterError();
  }

  return filters;
}

export function filterEvents(events, filters) {
  const from = filters.from ? parseDate(filters.from) : -Infinity;
  const to = filters.to ? parseDate(filters.to) : Infinity;
  const search = filters.q.toLowerCase();

  return events.filter(event => {
    if (filters.ip && event.ip !== filters.ip) return false;
    if (filters.endpoint && event.endpoint !== filters.endpoint) return false;
    if (filters.direction && event.direction !== filters.direction) return false;
    if (event.time < from || event.time > to) return false;

    const resource = `${event.resource} ${event.reason || ''}`.toLowerCase();
    if (search && !resource.includes(search)) return false;
    if (filters.code === 'unknown' && event.statusCode) return false;
    if (filters.code && filters.code !== 'unknown' && String(event.statusCode) !== filters.code) {
      return false;
    }
    return true;
  });
}

export function createFilterUrl(filters, basePath) {
  return (changes = {}, target = basePath) => {
    const values = { ...filters, ...changes };
    if (target === '/failures') delete values.direction;
    else delete values.code;

    const params = new URLSearchParams(
      Object.entries(values).filter(([, value]) => value !== '' && value != null),
    );
    return target + (params.size ? `?${params}` : '');
  };
}

export function describeFilters(filters, filterUrl) {
  return Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      let displayValue = value;
      if (key === 'direction') displayValue = value === 'I' ? 'Entrant' : 'Sortant';
      if (key === 'code' && value === 'unknown') displayValue = 'Sans code';

      return {
        key,
        label: filterLabels[key],
        value: displayValue,
        url: filterUrl({ [key]: '' }),
      };
    });
}
