const updateBanner = document.querySelector('.update-banner');
const updateVersion = updateBanner.querySelector('[data-update-version]');
const dismissedUpdateKey = 'apt-viewer-dismissed-update';
let dismissedVersion;
let checkingVersion = false;

try {
  dismissedVersion = localStorage.getItem(dismissedUpdateKey);
} catch {}

async function checkVersion() {
  if (document.hidden || checkingVersion) return;
  checkingVersion = true;
  try {
    const response = await fetch('/api/version', { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return;
    const info = await response.json();
    const available = info.available === true && typeof info.latest === 'string';
    updateVersion.textContent = available ? `v${info.latest.replace(/^v/, '')}` : '';
    updateBanner.hidden = !available || info.latest === dismissedVersion;
    updateBanner.dataset.version = available ? info.latest : '';
  } catch {
    // La vérification ne doit pas interrompre l’utilisation du tableau de bord.
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

checkVersion();
setInterval(checkVersion, 60 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkVersion();
});
