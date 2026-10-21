import { getLanguage } from '../i18n.js';

const french = getLanguage('fr');
const httpCodes = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504];
export function httpStatusLabel(code, t = french.t) {
  return httpCodes.includes(Number(code)) ? t(`http.${code}`) : '';
}
export function formatBytes(value, locale = french.locale, units = french.t('units.bytes').split('|')) {
  if (!Number.isFinite(value) || value < 0) return '—';
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // Avoid displaying 1 024 Kio instead of 1 Mio after rounding.
  if (Math.round(value * 10) / 10 >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return value.toLocaleString(locale, { maximumFractionDigits: 1 }) + ' ' + units[unit];
}
