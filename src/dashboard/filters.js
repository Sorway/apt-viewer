import { getLanguage } from '../i18n.js';
import { failureId } from './failures.js';

const filterLabels = {
  ip: 'common.client',
  endpoint: 'common.endpoint',
  direction: 'common.flow',
  q: 'filters.search',
  from: 'filters.fromUtc',
  to: 'filters.toUtc',
  code: 'common.http',
  period: 'filters.period',
  error: 'failureGroups.error',
};

export const periods = { '1h': 3600000, '24h': 86400000, '7d': 604800000 };

export class InvalidFilterError extends Error {}

function parseDate(value) {
  // datetime-local inputs have no timezone; the filter form uses UTC.
  const localDate = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/;
  return Date.parse(localDate.test(value) ? `${value}Z` : value);
}

export function readFilters(query, failures = false) {
  const keys = ['ip', 'endpoint', 'direction', 'q', 'from', 'to', 'period'];
  if (failures) keys.push('code', 'error');

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
  if (filters.error && !/^[a-f0-9]{64}$/.test(filters.error)) throw new InvalidFilterError();
  if (filters.period && !Object.hasOwn(periods, filters.period)) throw new InvalidFilterError();

  const from = filters.from ? parseDate(filters.from) : -Infinity;
  const to = filters.to ? parseDate(filters.to) : Infinity;
  if (Number.isNaN(from) || Number.isNaN(to) || from > to) {
    throw new InvalidFilterError();
  }
  if (filters.from || filters.to) filters.period = '';

  return filters;
}

export function timeRange(filters, now = Date.now()) {
  if (filters.period) return { from: now - periods[filters.period], to: now };
  return {
    from: filters.from ? parseDate(filters.from) : -Infinity,
    to: filters.to ? parseDate(filters.to) : Infinity,
  };
}

export function filterEvents(events, filters, now = Date.now()) {
  const { from, to } = timeRange(filters, now);
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
    if (filters.error && failureId(event) !== filters.error) return false;
    return true;
  });
}

export function createFilterUrl(filters, basePath) {
  return (changes = {}, target = basePath) => {
    const values = { ...filters, ...changes };
    if (target !== basePath) {
      delete values.sort;
      delete values.order;
      delete values.page;
      delete values.view;
      delete values.error;
    }
    if (target === '/failures') delete values.direction;
    else delete values.code;

    const params = new URLSearchParams(
      Object.entries(values).filter(([, value]) => value !== '' && value != null),
    );
    return target + (params.size ? `?${params}` : '');
  };
}

export function describeFilters(filters, filterUrl, t = getLanguage('fr').t) {
  return Object.entries(filters)
    .filter(([, value]) => value)
    .map(([key, value]) => {
      let displayValue = value;
      if (key === 'direction') displayValue = t(value === 'I' ? 'common.incoming' : 'common.outgoing');
      if (key === 'code' && value === 'unknown') displayValue = t('filters.unknown');
      if (key === 'period') displayValue = t({ '1h': 'filters.hour', '24h': 'filters.day', '7d': 'filters.week' }[value]);
      if (key === 'error') displayValue = t('failureGroups.selected');

      return {
        key,
        label: t(filterLabels[key]),
        value: displayValue,
        url: filterUrl({ [key]: '' }),
      };
    });
}
