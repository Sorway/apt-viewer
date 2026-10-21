const packageUrl = 'https://raw.githubusercontent.com/Sorway/apt-viewer/master/package.json';
const checkInterval = 60 * 60 * 1000;

function parseVersion(version) {
  if (typeof version !== 'string' || version.length > 100) return null;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/.exec(version);
  if (!match) return null;
  const prerelease = match[4]?.split('.') || [];
  const build = match[5]?.split('.') || [];
  if ([...prerelease, ...build].some(part => !/^[0-9A-Za-z-]+$/.test(part))) return null;
  if (prerelease.some(part => /^0\d+$/.test(part))) return null;
  return { core: match.slice(1, 4).map(BigInt), prerelease };
}

export function isNewerVersion(latest, current) {
  const next = parseVersion(latest);
  const installed = parseVersion(current);
  if (!next || !installed) return false;
  for (let index = 0; index < 3; index++) {
    if (next.core[index] !== installed.core[index]) return next.core[index] > installed.core[index];
  }
  if (!next.prerelease.length) return installed.prerelease.length > 0;
  if (!installed.prerelease.length) return false;
  for (let index = 0; index < Math.max(next.prerelease.length, installed.prerelease.length); index++) {
    const left = next.prerelease[index];
    const right = installed.prerelease[index];
    if (left === undefined) return false;
    if (right === undefined) return true;
    if (left === right) continue;
    const leftNumeric = /^\d+$/.test(left);
    const rightNumeric = /^\d+$/.test(right);
    if (leftNumeric && rightNumeric) return BigInt(left) > BigInt(right);
    if (leftNumeric !== rightNumeric) return !leftNumeric;
    return left > right;
  }
  return false;
}

export function createUpdateChecker(currentVersion, { request = fetch, now = Date.now } = {}) {
  let latest = null;
  let nextCheck = 0;
  let pending;

  function status() {
    return { current: currentVersion, latest, available: isNewerVersion(latest, currentVersion) };
  }

  return async function check() {
    if (pending) return pending;
    if (now() < nextCheck) return status();
    nextCheck = now() + checkInterval;
    pending = (async () => {
      try {
        const response = await request(packageUrl, {
          headers: { Accept: 'application/json', 'User-Agent': 'apt-viewer' },
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const info = await response.json();
          if (info?.name === 'apt-viewer' && parseVersion(info.version)) latest = info.version;
        }
      } catch {
        // Conserver la dernière vérification si GitHub est inaccessible.
      }
      return status();
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}
