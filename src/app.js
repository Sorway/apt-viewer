import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { buildActivityChart } from './activity-chart.js';
import { createClientDns } from './dns.js';
import {
  createFilterUrl,
  describeFilters,
  filterEvents,
  InvalidFilterError,
  readFilters,
} from './filters.js';
import { formatBytes, httpStatusLabel } from './format.js';
import { summarize } from './parser.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageSize = 50;
const screens = {
  overview: { path: '/', title: 'Vue d’ensemble', template: 'index' },
  clients: { path: '/clients', title: 'Clients', template: 'groups' },
  endpoints: { path: '/endpoints', title: 'Dépôts', template: 'groups' },
  activity: { path: '/activity', title: 'Activité', template: 'activity' },
  failures: { path: '/failures', title: 'Requêtes non abouties', template: 'failures' },
};
const navigation = Object.entries(screens).map(([id, screen]) => ({
  id,
  path: screen.path,
  title: id === 'failures' ? 'Échecs' : screen.title,
}));

function assetVersions() {
  const files = ['style.css', 'theme.js', 'app.js', 'pagination.js'];
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

export function createApp(
  store,
  { name = hostname(), demo = false, dns = createClientDns() } = {},
) {
  const app = express();
  const versions = assetVersions();

  app.disable('x-powered-by');
  app.use(helmet());
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));
  app.locals.httpStatusLabel = httpStatusLabel;
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

  function pageData(req, screen = 'overview') {
    const config = screens[screen];
    const failures = screen === 'failures';
    const status = store.get();
    const filters = readFilters(req.query, failures);
    const source = status.events.filter(event =>
      failures ? event.direction === 'E' : event.direction !== 'E',
    );
    const events = filterEvents(source, filters).sort((a, b) => b.time - a.time);
    const summary = summarize(events);

    let groups;
    if (screen === 'clients') groups = summary.clients;
    if (screen === 'endpoints') groups = summary.endpoints;

    const resultTotal = groups ? groups.length : events.length;
    const pages = Math.max(1, Math.ceil(resultTotal / pageSize));
    const requestedPage = Number.parseInt(req.query.page, 10) || 1;
    const page = Math.min(pages, Math.max(1, requestedPage));
    const offset = (page - 1) * pageSize;
    const filterUrl = createFilterUrl(filters, config.path);

    return {
      name,
      demo,
      q: filters,
      status,
      basePath: config.path,
      screen,
      pageTitle: config.title,
      navigation,
      failures,
      filterUrl,
      activeFilters: describeFilters(filters, filterUrl),
      failureCount: status.events.filter(event => event.direction === 'E').length,
      summary,
      total: events.length,
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
      options: summarize(source),
      clientName: ip => dns.get(ip),
      bytes: formatBytes,
      date: time => new Date(time).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }),
      pageUrl: page => filterUrl({ page: String(page) }),
    };
  }

  for (const [screen, config] of Object.entries(screens)) {
    app.get(config.path, (req, res) => {
      const data = pageData(req, screen);
      const overview = screen === 'overview';
      res.render(config.template, {
        ...data,
        clientActivity: overview ? buildActivityChart(data.summary.clients) : null,
        destinationActivity: overview ? buildActivityChart(data.summary.endpoints) : null,
      });
    });
  }

  app.get('/healthz', (req, res) => {
    const ok = !store.get().error;
    res.status(ok ? 200 : 503).json({ ok });
  });

  app.get('/api/failures', (req, res) => {
    const data = pageData(req, 'failures');
    res.json({
      filters: data.q,
      status: publicStatus(data.status),
      total: data.total,
      httpErrors: data.httpErrors,
      events: data.events,
      page: data.page,
      pages: data.pages,
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
      demo,
      filters: data.q,
      status: publicStatus(data.status),
      summary: data.summary,
      total: data.total,
      events: data.events,
      page: data.page,
      pages: data.pages,
    });
  });

  app.use((error, req, res, next) => {
    if (error instanceof InvalidFilterError) {
      return res.status(400).send('Filtres invalides.');
    }
    console.error('Erreur interne :', error);
    res.status(500).send('Erreur interne.');
  });

  return app;
}
