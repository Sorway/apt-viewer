const languageConfig = JSON.parse(document.querySelector('#language-data').textContent);
window.aptI18n = {
  locale: languageConfig.locale,
  t(key, values = {}) {
    return (languageConfig.messages[key] ?? key).replace(/\{(\w+)\}/g,
      (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
  },
};
window.aptI18n.bytes = value => {
  if (!Number.isFinite(value) || value < 0) return '—';
  const units = window.aptI18n.t('units.bytes').split('|');
  let index = 0;
  while (value >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  if (Math.round(value * 10) / 10 >= 1024 && index < units.length - 1) { value /= 1024; index++; }
  return value.toLocaleString(languageConfig.locale, { maximumFractionDigits: 1 }) + ' ' + units[index];
};
