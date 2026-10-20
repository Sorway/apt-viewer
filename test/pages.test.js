import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../src/app.js';

test('pages séparées, pagination des groupes et filtres conservés entre pages', async () => {
  const events = Array.from({length: 65}, (_, i) => ({ip: `192.0.2.${i+1}`, endpoint: `repo${i}.example`, resource: `repo${i}.example/package.deb`, time: 1700000000000+i, bytes: 100+i, direction: 'O'}));
  events.push(...Array.from({length: 20}, () => ({...events[0]})));
  events.push({...events[0], direction: 'E', statusCode: 503, reason: 'HTTP error, code: 503'});
  const server = createApp({get: () => ({events, invalid: 0, error: null})}, {dns: {get: () => ''}}).listen(0,'127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = async route => {
    const response = await fetch(base+route);
    assert.equal(response.status, 200);
    return response.text();
  };
  try {
    const overview = await page('/');
    assert.ok(overview.includes('class="client-pie"'));
    assert.ok(!overview.includes('id="results"'));
    assert.ok(!overview.includes('package.deb'));
    for (const route of ['/clients', '/endpoints', '/activity', '/failures']) {
      const html = await page(route);
      assert.ok(!html.includes('class="client-pie"'));
      assert.ok(html.includes('id="results"'));
      const navigation = /<nav class="primary-nav"[\s\S]*?<\/nav>/.exec(html)[0];
      assert.equal((navigation.match(/aria-current="page"/g)||[]).length, 1);
      assert.ok(new RegExp('href="'+route+'" class="active').test(navigation));
    }
    for (const route of ['/clients', '/endpoints']) {
      const html = await page(route+'?page=2');
      assert.ok(html.includes('51–65 sur 65'));
      const rows = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)[1];
      assert.equal((rows.match(/<tr>/g)||[]).length, 15);
      assert.ok(html.includes(route+'?page=1#results'));
      assert.ok(!rows.includes('class="failure-code"'));
      assert.ok(rows.includes('/activity?'));
    }
    const filtered = await page('/clients?direction=O&ip=192.0.2.1&page=2');
    assert.ok(filtered.includes('1–1 sur 1'));
    assert.ok(filtered.includes('href="/activity?ip=192.0.2.1&amp;direction=O"'));
    assert.ok(filtered.includes('href="/failures?ip=192.0.2.1"'));
    const failures = await page('/failures?code=503&ip=192.0.2.1');
    assert.ok(failures.includes('href="/clients?ip=192.0.2.1"'));
    const empty = await page('/endpoints?endpoint=missing.repo');
    assert.ok(empty.includes('Aucune donnée dans cette sélection'));
    assert.ok(empty.includes('0–0 sur 0'));
    assert.equal((await fetch(base+'/clients?direction=E')).status,400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
