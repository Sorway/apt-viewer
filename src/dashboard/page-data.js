import { createFilterUrl, describeFilters, filterEvents, readFilters, timeRange } from './filters.js';
import { formatBytes } from './format.js';
import { summarize } from '../logs/parser.js';
import { nextSortOrder, readSort, sortRows } from './sort.js';
import { buildTimeline } from './timeline.js';
import { groupFailures } from './failures.js';

const pageSize = 50;
export const screens = {
  overview: { path: '/', title: 'nav.overview', template: 'index' },
  clients: { path: '/clients', title: 'nav.clients', template: 'groups' },
  endpoints: { path: '/endpoints', title: 'nav.endpoints', template: 'groups' },
  activity: { path: '/activity', title: 'nav.activity', template: 'activity' },
  failures: { path: '/failures', title: 'nav.failuresTitle', template: 'failures' },
};
const navigation = Object.entries(screens).map(([id, screen]) => ({
  id,
  path: screen.path,
  title: id === 'failures' ? 'nav.failures' : screen.title,
}));

function paginate(total, requestedPage) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const parsedPage = Number.parseInt(requestedPage, 10) || 1;
  const page = Math.min(pages, Math.max(1, parsedPage));
  return { page, pages, offset: (page - 1) * pageSize };
}

function buildGroups(screen, grouped, events, summary, sorting) {
  if (grouped) return sortRows(groupFailures(events), sorting);
  if (screen === 'clients') return sortRows(summary.clients, sorting);
  if (screen === 'endpoints') return sortRows(summary.endpoints, sorting);
  return undefined;
}

function buildProfile(events) {
  return {
    errors: events.filter(event => event.direction === 'E').length,
    last: events.reduce((last, event) => Math.max(last ?? 0, event.time), null),
    failureGroups: sortRows(groupFailures(events), { key: 'last', order: 'desc' }),
  };
}

function createPageFilterUrl(filters, sorting, basePath, { entity, failures, grouped }) {
  const urlFilters = { ...filters, sort: sorting.key, order: sorting.order };
  if (failures) urlFilters.view = grouped ? 'groups' : 'events';
  if (entity) delete urlFilters[entity.key];

  const buildUrl = createFilterUrl(urlFilters, basePath);
  return (changes = {}, target = basePath) => {
    // A profile's identity is in its path; preserve it as a filter when leaving.
    const entityFilter = entity && target !== basePath ? { [entity.key]: entity.value } : {};
    return buildUrl({ ...entityFilter, ...changes }, target);
  };
}

export function buildPageData({
  query,
  language: { t, locale },
  status,
  name,
  dns,
  screen = 'overview',
  entity = null,
  grouped = false,
}) {
  const config = entity ? { ...screens[screen], path: entity.path } : screens[screen];
  const failures = screen === 'failures';
  const filters = readFilters(query, failures);
  if (entity) filters[entity.key] = entity.value;
  const sorting = readSort(query, grouped ? 'failureGroups' : screen);
  const now = Date.now();
  const scope = entity
    ? status.events.filter(event => event[entity.key] === entity.value)
    : status.events;
  const source = scope.filter(event =>
    failures ? event.direction === 'E' : event.direction !== 'E',
  );
  const filtered = filterEvents(source, filters, now);
  const events = grouped ? filtered : sortRows(filtered, sorting);
  const summary = summarize(events);

  const groups = buildGroups(screen, grouped, events, summary, sorting);
  const resultTotal = groups?.length ?? events.length;
  const { page, pages, offset } = paginate(resultTotal, query.page);

  const filterUrl = createPageFilterUrl(filters, sorting, config.path, { entity, failures, grouped });
  const visibleFilters = { ...filters };
  if (entity) delete visibleFilters[entity.key];

  // Profiles and the overview timeline also include failures, unlike transfer tables.
  const profileEvents = entity ? filterEvents(scope, filters, now) : null;
  let timeline = null;
  if (screen === 'overview' || entity) {
    const timelineEvents = profileEvents ?? filterEvents(status.events, filters, now);
    timeline = buildTimeline(timelineEvents, timeRange(filters, now), now);
  }

  return {
    name,
    entity,
    profile: entity ? buildProfile(profileEvents) : null,
    q: filters,
    sorting,
    sortUrl: key => filterUrl({
      sort: key,
      order: nextSortOrder(sorting, key),
    }),
    timeline,
    status,
    basePath: config.path,
    screen: entity?.kind || screen,
    pageTitle: entity?.value || t(config.title),
    navigation: navigation.map(item => ({ ...item, title: t(item.title) })),
    failures,
    grouped,
    failureView: grouped ? 'groups' : 'events',
    groupTotal: groups?.length ?? 0,
    filterUrl,
    resetUrl: failures && !grouped ? `${config.path}?view=events` : config.path,
    entityUrl: (kind, value) => createFilterUrl(filters, config.path)(
      { [kind === 'clients' ? 'ip' : 'endpoint']: '' }, `/${kind}/${encodeURIComponent(value)}`,
    ),
    groupUrl: id => createFilterUrl({ ...filters, direction: '', view: 'events' }, '/failures')({ error: id }),
    activeFilters: describeFilters(visibleFilters, filterUrl, t),
    failureCount: status.events.filter(event => event.direction === 'E').length,
    summary,
    total: events.length,
    filterTotal: profileEvents?.length ?? events.length,
    resultTotal,
    groupRows: groups?.slice(offset, offset + pageSize),
    httpErrors: events.filter(event => event.statusCode).length,
    codes: [...new Set(source.map(event => event.statusCode).filter(Boolean))].sort(
      (a, b) => a - b,
    ),
    events: events.slice(offset, offset + pageSize),
    page,
    pages,
    pageSize,
    options: summarize(entity ? scope : source),
    clientName: ip => dns.get(ip),
    bytes: value => formatBytes(value, locale, t('units.bytes').split('|')),
    eventReason: event => event.reason === 'Motif non fourni par le journal' ? t('errors.noReason') : event.reason,
    date: time => new Date(time).toLocaleString(locale, { timeZone: 'Europe/Paris' }),
    clock: time => new Date(time).toLocaleTimeString(locale, { timeZone: 'Europe/Paris' }),
    pageUrl: page => filterUrl({ page: String(page) }),
  };
}

