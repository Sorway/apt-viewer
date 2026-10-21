import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../languages/', import.meta.url));
const catalogs = new Map();
for (const file of readdirSync(directory).filter(file => /^[a-z]{2}\.lang$/.test(file)).sort()) {
  const messages = JSON.parse(readFileSync(new URL(`../languages/${file}`, import.meta.url), 'utf8'));
  if (!messages || typeof messages._name !== 'string' || typeof messages._locale !== 'string' || !Object.values(messages).every(value => typeof value === 'string')) {
    throw new Error(`Invalid language file: ${file}`);
  }
  new Intl.NumberFormat(messages._locale);
  catalogs.set(file.slice(0, -5), messages);
}
if (!catalogs.has('fr')) throw new Error('Missing languages/fr.lang');

export const languages = ['fr', ...catalogs.keys()].filter((code, index, codes) => codes.indexOf(code) === index)
  .map(code => ({ code, name: catalogs.get(code)._name }));

export function getLanguage(code = 'fr') {
  const lang = catalogs.has(code) ? code : 'fr';
  const messages = { ...catalogs.get('fr'), ...catalogs.get(lang) };
  const t = (key, values = {}) => (messages[key] ?? key).replace(/\{(\w+)\}/g,
    (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  return { lang, locale: messages._locale, messages, t };
}

export function languageMiddleware(req, res, next) {
  const cookie = (req.headers.cookie || '').split(';').find(item => item.trim().startsWith('apt-viewer-language='));
  let code = 'fr';
  try { code = decodeURIComponent(cookie?.trim().slice('apt-viewer-language='.length) || 'fr'); } catch {}
  const language = getLanguage(code);
  Object.assign(res.locals, language, {
    languages,
    languageUrl: code => `/language?lang=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(req.originalUrl)}`,
    languageData: JSON.stringify(language).replaceAll('<', '\\u003c'),
  });
  res.set('Content-Language', language.lang);
  next();
}

export function changeLanguage(req, res) {
  if (typeof req.query.lang !== 'string' || !catalogs.has(req.query.lang)) {
    return res.status(400).send(res.locals.t('errors.invalidLanguage'));
  }
  const target = req.query.returnTo;
  const returnTo = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') && !target.includes('\\') && !/[\r\n]/.test(target)
    ? target : '/';
  res.cookie('apt-viewer-language', req.query.lang, {
    httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  res.redirect(303, returnTo);
}
