import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {get} from 'node:http';
import {createApp} from '../src/app.js';

test('les pages référencent la version réelle des assets et leur cache est revalidé', async () => {
  const server = createApp({get: () => ({events: [], invalid: 0, error: null})}, {dns: {get: () => ''}}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(base + '/');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const html = await response.text();
    for (const file of ['style.css','theme.js','app.js','pagination.js']) {
      const content = await readFile(new URL('../public/'+file,import.meta.url));
      const version = createHash('sha256').update(content).digest('hex').slice(0,12);
      const url = '/assets/'+file+'?v='+version;
      assert.ok(html.includes(url));
      const asset = await fetch(base+url);
      assert.equal(asset.status, 200);
      assert.equal(asset.headers.get('cache-control'), 'no-cache');
      assert.equal(await asset.text(), content.toString());
      const unchanged = await new Promise((resolve,reject) => {
        get(base+url, {headers: {'If-None-Match':asset.headers.get('etag')}}, response => {response.resume();response.on('end',()=>resolve(response.statusCode));}).on('error',reject);
      });
      assert.equal(unchanged, 304);
    }
    assert.ok(!html.includes('Dans cette page'));
    assert.ok(html.includes('href="/clients"'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
