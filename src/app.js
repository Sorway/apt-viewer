import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { buildActivityChart } from './dashboard/activity-chart.js';
import { createClientDns } from './dashboard/dns.js';
import {
  createFilterUrl,
  describeFilters,
  filterEvents,
  InvalidFilterError,
  readFilters,
  timeRange,
} from './dashboard/filters.js';
import { formatBytes, httpStatusLabel } from './dashboard/format.js';
import { summarize } from './logs/parser.js';
import { defaultOrder, readSort, sortRows } from './dashboard/sort.js';
import { buildTimeline } from './dashboard/timeline.js';
import { groupFailures } from './dashboard/failures.js';
import { createUpdateChecker } from './updates.js';
import { changeLanguage, getLanguage, languageMiddleware, languages } from './i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSize = 50;
const screens = {
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

function assetVersions() {
  const files = [
    'css/style.css',
    'js/theme.js',
    'js/app.js',
    'js/pagination.js',
    'js/timeline.js',
    'js/error.js',
    'js/footer.js',
    'js/updates.js',
    'js/i18n.js',
  ];
  return Object.fromEntries(
    files.map(file => {
      const contents = readFileSync(path.join(root, 'public', file));
      const version = createHash('sha256').update(contents).digest('hex').slice(0, 12);
      return [file, version];
    }),
  );
}

function publicStatus(status) {
  return {
    error: status.error,
    readAt: status.readAt,
    invalid: status.invalid,
    truncated: status.truncated,
  };
}

function groupedFailureView(query) {
  if (query.view === undefined) return !['time', 'ip'].includes(query.sort);
  if (!['groups', 'events'].includes(query.view)) throw new InvalidFilterError();
  return query.view === 'groups';
}

export function createApp(
  store,
  { name = hostname(), dns = createClientDns(), checkForUpdates } = {},
) {
  const app = express();
  const versions = assetVersions();

  app.disable('x-powered-by');
  app.use(helmet());
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'src', 'views'));
  app.locals.appVersion = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const checkUpdates = checkForUpdates ?? createUpdateChecker(app.locals.appVersion);
  Object.assign(app.locals, getLanguage('fr'), { languages });
  app.locals.assetUrl = file => `/assets/${file}?v=${versions[file]}`;

  app.use(
    '/assets',
    express.static(path.join(root, 'public'), {
      maxAge: 0,
      setHeaders: res => res.setHeader('Cache-Control', 'no-cache'),
    }),
  );
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(languageMiddleware);
  app.use((req, res, next) => {
    res.locals.httpStatusLabel = code => httpStatusLabel(code, res.locals.t);
    next();
  });
  app.get('/language', changeLanguage);

  function pageData(req, screen = 'overview', { entity = null, grouped = false } = {}) {
    const { t, locale } = req.res.locals;
    const config = entity ? { ...screens[screen], path: entity.path } : screens[screen];
    const failures = screen === 'failures';
    const status = store.get();
    const filters = readFilters(req.query, failures);
    if (entity) filters[entity.key] = entity.value;
    const sorting = readSort(req.query, grouped ? 'failureGroups' : screen);
    const now = Date.now();
    const scope = entity ? status.events.filter(event => event[entity.key] === entity.value) : status.events;
    const source = scope.filter(event =>
      failures ? event.direction === 'E' : event.direction !== 'E',
    );
    const filtered = filterEvents(source, filters, now);
    const events = grouped ? filtered : sortRows(filtered, sorting);
    const summary = summarize(events);

    let groups;
    if (screen === 'clients') groups = sortRows(summary.clients, sorting);
    if (screen === 'endpoints') groups = sortRows(summary.endpoints, sorting);
    if (grouped) groups = sortRows(groupFailures(events), sorting);

    const resultTotal = groups ? groups.length : events.length;
    const pages = Math.max(1, Math.ceil(resultTotal / pageSize));
    const requestedPage = Number.parseInt(req.query.page, 10) || 1;
    const page = Math.min(pages, Math.max(1, requestedPage));
    const offset = (page - 1) * pageSize;
    const urlFilters = { ...filters, sort: sorting.key, order: sorting.order };
    if (failures) urlFilters.view = grouped ? 'groups' : 'events';
    const visibleFilters = { ...filters };
    if (entity) {
      delete urlFilters[entity.key];
      delete visibleFilters[entity.key];
    }
    const buildFilterUrl = createFilterUrl(urlFilters, config.path);
    const filterUrl = (changes = {}, target = config.path) => buildFilterUrl({
      ...(entity && target !== config.path ? { [entity.key]: entity.value } : {}), ...changes,
    }, target);
    const profileEvents = entity ? filterEvents(scope, filters, now) : null;
    const profileFailures = entity ? sortRows(groupFailures(profileEvents), { key: 'last', order: 'desc' }) : null;

    return {
      name,
      entity,
      profile: entity ? {
        errors: profileEvents.filter(event => event.direction === 'E').length,
        last: profileEvents.reduce((last, event) => Math.max(last ?? 0, event.time), null),
        failureGroups: profileFailures,
      } : null,
      q: filters,
      sorting,
      sortUrl: key => filterUrl({
        sort: key,
        order: sorting.key === key ? (sorting.order === 'asc' ? 'desc' : 'asc') : defaultOrder(key),
      }),
      timeline: screen === 'overview' || entity
        ? buildTimeline(profileEvents || filterEvents(status.events, filters, now), timeRange(filters, now), now)
        : null,
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

  for (const [screen, config] of Object.entries(screens)) {
    app.get(config.path, (req, res) => {
      const data = pageData(req, screen, { grouped: screen === 'failures' && groupedFailureView(req.query) });
      const overview = screen === 'overview';
      res.render(config.template, {
        ...data,
        clientActivity: overview ? buildActivityChart(data.summary.clients) : null,
        destinationActivity: overview ? buildActivityChart(data.summary.endpoints) : null,
      });
    });
  }

  for (const [kind, key] of [['clients', 'ip'], ['endpoints', 'endpoint']]) {
    app.get(`/${kind}/:id`, (req, res) => {
      const value = req.params.id;
      if (value.length > 200 || /[\x00-\x1f]/.test(value) || (kind === 'clients' && !isIP(value))) {
        throw new InvalidFilterError();
      }
      const entity = { kind, key, value, path: `/${kind}/${encodeURIComponent(value)}` };
      res.render('detail', pageData(req, 'activity', { entity }));
    });
  }

  app.get('/api/version', async (req, res) => {
    res.json(await checkUpdates());
  });

  app.get('/healthz', (req, res) => {
    const ok = !store.get().error;
    res.status(ok ? 200 : 503).json({ ok });
  });

  app.get('/api/failures', (req, res) => {
    const data = pageData(req, 'failures');
    res.json({
      filters: data.q,
      sorting: data.sorting,
      status: publicStatus(data.status),
      total: data.total,
      httpErrors: data.httpErrors,
      events: data.events,
      page: data.page,
      pages: data.pages,
    });
  });

  app.get('/api/failure-groups', (req, res) => {
    const data = pageData(req, 'failures', { grouped: true });
    res.json({
      filters: data.q, sorting: data.sorting, status: publicStatus(data.status),
      total: data.total, groupTotal: data.groupTotal, groups: data.groupRows,
      page: data.page, pages: data.pages,
    });
  });

  app.get('/api/client-names', (req, res) => {
    const ips = [...new Set(store.get().events.map(event => event.ip))].slice(-2048);
    res.json(Object.fromEntries(ips.map(ip => [ip, dns.get(ip)])));
  });

  app.get('/api/dashboard', (req, res) => {
    const data = pageData(req);
    res.json({
      name,
      filters: data.q,
      sorting: data.sorting,
      status: publicStatus(data.status),
      timeline: data.timeline,
      summary: data.summary,
      total: data.total,
      events: data.events,
      page: data.page,
      pages: data.pages,
    });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof InvalidFilterError) {
      return res.status(400).send(res.locals.t('errors.invalidFilters'));
    }
    console.error('Erreur interne :', error);
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ error: res.locals.t('errors.internalMessage') });
    }
    res.status(500).render('error', (renderError, html) => {
      if (renderError) {
        console.error('Affichage de la page d’erreur impossible :', renderError);
        return res.type('text').send(res.locals.t('errors.internalMessage'));
      }
      res.send(html);
    });
  });

  return app;
}
