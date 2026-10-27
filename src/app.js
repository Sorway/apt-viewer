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
import { InvalidFilterError } from './dashboard/filters.js';
import { httpStatusLabel } from './dashboard/format.js';
import { buildPageData, screens } from './dashboard/page-data.js';
import { createUpdateChecker } from './updates.js';
import { changeLanguage, getLanguage, languageMiddleware, languages } from './i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

  function pageData(req, screen = 'overview', options = {}) {
    return buildPageData({
      query: req.query,
      language: req.res.locals,
      status: store.get(),
      name,
      dns,
      screen,
      ...options,
    });
  }

  for (const [screen, config] of Object.entries(screens)) {
    app.get(config.path, (req, res) => {
      const grouped = screen === 'failures' && groupedFailureView(req.query);
      const data = pageData(req, screen, { grouped });
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
      filters: data.q,
      sorting: data.sorting,
      status: publicStatus(data.status),
      total: data.total,
      groupTotal: data.groupTotal,
      groups: data.groupRows,
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
