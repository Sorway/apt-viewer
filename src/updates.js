const releasesUrl = 'https://api.github.com/repos/Sorway/apt-viewer/releases/latest';
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
  let releaseUrl = null;
  let checkedAt = null;
  let lastSuccessAt = null;
  let error = null;
  let httpStatus = null;
  let nextCheck = 0;
  let pending;

  function status() {
    return { current: currentVersion, latest, releaseUrl, available: isNewerVersion(latest, currentVersion), checkedAt, lastSuccessAt, error, httpStatus };
  }

  return async function check() {
    if (pending) return pending;
    if (now() < nextCheck) return status();
    nextCheck = now() + checkInterval;
    pending = (async () => {
      try {
        error = null;
        httpStatus = null;
        const response = await request(releasesUrl, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'apt-viewer' },
          signal: AbortSignal.timeout(5000),
        });
        httpStatus = response.status;
        if (response.status === 404) {
          latest = null;
          releaseUrl = null;
          lastSuccessAt = new Date(now()).toISOString();
        } else if (response.ok) {
          const info = await response.json();
          const tag = info?.tag_name;
          if (info?.draft === false && info?.prerelease === false &&
              typeof tag === 'string' && /^v?\d+\.\d+\.\d+$/.test(tag) && parseVersion(tag)) {
            latest = tag.replace(/^v/, '');
            releaseUrl = `https://github.com/Sorway/apt-viewer/releases/tag/${tag}`;
            lastSuccessAt = new Date(now()).toISOString();
          } else {
            error = 'INVALID_RELEASE';
          }
        } else {
          error = response.status === 429 || (response.status === 403 && response.headers?.get('x-ratelimit-remaining') === '0')
            ? 'RATE_LIMIT' : 'HTTP_ERROR';
        }
      } catch (failure) {
        error = failure?.name === 'TimeoutError' || failure?.name === 'AbortError' ? 'TIMEOUT'
          : failure instanceof SyntaxError ? 'INVALID_RESPONSE' : 'NETWORK';
      } finally {
        checkedAt = new Date(now()).toISOString();
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
