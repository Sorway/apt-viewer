import { createApp } from './app.js';
import { createStore } from './reader.js';

function readInteger(key, fallback, min, max) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Configuration invalide: ${key}`);
  }
  return value;
}

const host = process.env.HOST || '127.0.0.1';
const localHosts = ['127.0.0.1', '::1', 'localhost'];
if (!localHosts.includes(host) && process.env.ALLOW_REMOTE !== 'true') {
  throw new Error(
    'Accès distant: configurer un proxy authentifié puis ALLOW_REMOTE=true si nécessaire.',
  );
}

const logPath = process.env.LOG_PATH || '/var/log/apt-cacher-ng/apt-cacher.log';
const maxBytes = readInteger('MAX_BYTES', 16 * 1024 * 1024, 1024, 64 * 1024 * 1024);
const maxEvents = readInteger('MAX_EVENTS', 50000, 1, 200000);
const store = createStore(logPath, maxBytes, maxEvents);
await store.refresh();

const timer = setInterval(() => store.refresh(), readInteger('POLL_MS', 5000, 1000, 60000));
const port = readInteger('PORT', 3000, 1, 65535);
const app = createApp(store, { demo: process.env.DEMO === 'true' });
const server = app.listen(port, host, () => {
  console.log(`apt-viewer écoute sur ${host}; état des logs: ${store.get().error || 'OK'}`);
});

function shutdown() {
  clearInterval(timer);
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
