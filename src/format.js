const number = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const httpLabels = {
  400: 'Requête incorrecte',
  401: 'Authentification requise',
  403: 'Accès interdit',
  404: 'Ressource introuvable',
  408: 'Délai de la requête dépassé',
  429: 'Trop de requêtes',
  500: 'Erreur interne du serveur',
  502: 'Réponse amont invalide',
  503: 'Service indisponible',
  504: 'Délai de réponse amont dépassé',
};
export function httpStatusLabel(code) {
  return httpLabels[code] || '';
}
export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—';
  const units = ['o', 'Kio', 'Mio', 'Gio', 'Tio', 'Pio'];
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
  return number.format(value) + ' ' + units[unit];
}
