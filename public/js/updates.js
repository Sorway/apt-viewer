const updateBanner = document.querySelector('.update-banner');
const updateVersion = updateBanner.querySelector('[data-update-version]');
const updateNotes = updateBanner.querySelector('[data-update-notes]');
const versionMenu = document.querySelector('.footer-update');
const latestVersion = versionMenu.querySelector('[data-latest-version]');
const lastChecked = versionMenu.querySelector('[data-update-checked]');
const updateState = versionMenu.querySelector('[data-update-state]');
const menuNotes = versionMenu.querySelector('[data-update-menu-notes]');
const dismissedUpdateKey = 'apt-viewer-dismissed-update';
let dismissedVersion;
let checkingVersion = false;

function showStatus(info) {
  const { t, locale } = window.aptI18n;
  latestVersion.textContent = info.latest ? `v${info.latest}` : '—';
  const date = new Date(info.checkedAt);
  if (info.checkedAt && Number.isFinite(date.getTime())) {
    lastChecked.dateTime = date.toISOString();
    lastChecked.textContent = new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short',
    }).format(date);
  }
  const errors = {
    NETWORK: 'update.errorNetwork', TIMEOUT: 'update.errorTimeout', RATE_LIMIT: 'update.errorRateLimit',
    INVALID_RELEASE: 'update.errorResponse', INVALID_RESPONSE: 'update.errorResponse', HTTP_ERROR: 'update.errorHttp',
  };
  updateState.dataset.error = String(Boolean(info.error));
  updateState.dataset.upToDate = String(!info.error && !info.available && Boolean(info.latest));
  updateState.textContent = info.error
    ? t(errors[info.error] || 'update.errorNetwork', { status: info.httpStatus || '—' })
    : t(info.available ? 'update.ready' : info.latest ? 'update.upToDate' : 'update.noRelease');
  menuNotes.hidden = !info.releaseUrl;
  menuNotes.href = 'https://github.com/Sorway/apt-viewer/releases/latest';
}

try {
  dismissedVersion = localStorage.getItem(dismissedUpdateKey);
} catch {}

async function checkVersion() {
  if (document.hidden || checkingVersion) return;
  checkingVersion = true;
  try {
    const response = await fetch('/api/version', { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('VERSION_STATUS');
    const info = await response.json();
    showStatus(info);
    const available = info.available === true && typeof info.latest === 'string';
    updateVersion.textContent = available ? `v${info.latest.replace(/^v/, '')}` : '';
    if (typeof info.releaseUrl === 'string') {
      const url = new URL(info.releaseUrl);
      if (url.origin === 'https://github.com' && url.pathname.startsWith('/Sorway/apt-viewer/releases/tag/')) {
        updateNotes.href = url.href;
        menuNotes.href = url.href;
      }
    }
    updateBanner.hidden = !available || info.latest === dismissedVersion;
    updateBanner.dataset.version = available ? info.latest : '';
  } catch {
    updateState.dataset.error = 'true';
    updateState.dataset.upToDate = 'false';
    updateState.textContent = window.aptI18n.t('update.errorCheck');
  } finally {
    checkingVersion = false;
  }
}

updateBanner.querySelector('[data-dismiss-update]').addEventListener('click', () => {
  dismissedVersion = updateBanner.dataset.version;
  updateBanner.hidden = true;
  document.querySelector('#refresh').focus({ preventScroll: true });
  try {
    localStorage.setItem(dismissedUpdateKey, dismissedVersion);
  } catch {}
});
versionMenu.addEventListener('toggle', () => {
  if (versionMenu.open) checkVersion();
});

checkVersion();
setInterval(checkVersion, 60 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkVersion();
});
