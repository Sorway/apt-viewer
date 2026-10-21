import assert from 'node:assert/strict';
import { createUpdateChecker, isNewerVersion } from '../../src/updates.js';

const release = (tag = 'v1.0.2', extra = {}) => ({ tag_name: tag, draft: false, prerelease: false, ...extra });
const ok = data => ({ status: 200, ok: true, json: async () => data });
let now = 1000;
let calls = 0;
let response = ok(release());
const check = createUpdateChecker('1.0.1', {
  now: () => now,
  request: async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/Sorway/apt-viewer/releases/latest');
    assert.equal(options.headers.Accept, 'application/vnd.github+json');
    assert(options.signal instanceof AbortSignal);
    calls++;
    if (response instanceof Error) throw response;
    return response;
  },
});

const initial = await Promise.all([check(), check(), check()]);
assert.equal(calls, 1);
assert.deepEqual(initial[0], initial[1]);
assert.equal(initial[0].latest, '1.0.2');
assert.equal(initial[0].available, true);
assert.equal(initial[0].releaseUrl, 'https://github.com/Sorway/apt-viewer/releases/tag/v1.0.2');
assert.equal(initial[0].checkedAt, new Date(now).toISOString());
assert.equal(initial[0].lastSuccessAt, initial[0].checkedAt);
assert.equal(initial[0].error, null);
const successfulAt = initial[0].lastSuccessAt;
await check();
assert.equal(calls, 1);

for (const [failure, expected] of [
  [new Error('offline'), 'NETWORK'],
  [new DOMException('timeout', 'TimeoutError'), 'TIMEOUT'],
  [{ status: 429, ok: false }, 'RATE_LIMIT'],
  [{ status: 403, ok: false, headers: new Headers({ 'x-ratelimit-remaining': '0' }) }, 'RATE_LIMIT'],
  [{ status: 403, ok: false, headers: new Headers() }, 'HTTP_ERROR'],
  [{ status: 500, ok: false }, 'HTTP_ERROR'],
  [{ status: 200, ok: true, json: async () => { throw new SyntaxError('invalid JSON'); } }, 'INVALID_RESPONSE'],
  [ok(release('v1.0.3-rc.1')), 'INVALID_RELEASE'],
]) {
  now += 3600000;
  response = failure;
  const info = await check();
  assert.equal(info.error, expected);
  assert.equal(info.latest, '1.0.2');
  assert.equal(info.checkedAt, new Date(now).toISOString());
  assert.equal(info.lastSuccessAt, successfulAt);
  const before = calls;
  await check();
  assert.equal(calls, before, 'A failed check must still be cached');
}

now += 3600000;
response = { status: 404, ok: false };
const absent = await check();
assert.equal(absent.latest, null);
assert.equal(absent.releaseUrl, null);
assert.equal(absent.available, false);
assert.equal(absent.error, null);
assert.equal(absent.lastSuccessAt, absent.checkedAt);

for (const data of [release('v01.0.2'), release('master'), release('v1.0.2', { draft: true }), release('v1.0.2', { prerelease: true }), null]) {
  const checker = createUpdateChecker('1.0.1', { request: async () => ok(data) });
  const info = await checker();
  assert.equal(info.latest, null);
  assert.equal(info.available, false);
  assert.equal(info.error, 'INVALID_RELEASE');
}
for (const [next, current, newer] of [
  ['1.0.10', '1.0.2', true], ['1.0.1', '1.0.1', false], ['1.0.0', '1.0.1', false],
  ['1.0.1', '1.0.1-rc.1', true], ['1.0.1-rc.2', '1.0.1', false],
]) assert.equal(isNewerVersion(next, current), newer);

console.log('PASS: release selection, cache/coalescing, last check/success, network/timeout/rate-limit/HTTP/JSON errors and version ordering.');
