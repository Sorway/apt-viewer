import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseLine, summarize} from '../src/parser.js';
import {readSnapshot} from '../src/reader.js';
import {createApp} from '../src/app.js';

const errorLine = '1792509225|E|658|172.25.50.4|repo.zabbix.com/zabbix/Packages.gz [HTTP error, code: 503]';

test('lecture des erreurs E : code explicite, IPv6, motif et volumes séparés', () => {
  const e = parseLine(errorLine);
  assert.equal(e.direction, 'E');
  assert.equal(e.statusCode, 503);
  assert.equal(e.reason, 'HTTP error, code: 503');
  assert.equal(e.resource, 'repo.zabbix.com/zabbix/Packages.gz');
  assert.equal(e.endpoint, 'repo.zabbix.com');
  const timeout = parseLine('1792509225|E|0|2001:db8::1|https://repo.example/pkg|part [Connection timed out]\r');
  assert.equal(timeout.statusCode, null);
  assert.equal(timeout.reason, 'Connection timed out');
  assert.equal(timeout.resource, 'https://repo.example/pkg|part');
  assert.equal(timeout.endpoint, 'repo.example');
  assert.equal(parseLine(errorLine.split(' [')[0]).statusCode, null);
  const successful = parseLine(errorLine.replace('|E|', '|O|'));
  assert.equal(successful.statusCode, undefined);
  const summary = summarize([e, successful]);
  assert.equal(summary.outgoing, 658);
  assert.equal(summary.clients[0].out, 658);
  assert.equal(summary.clients[0].in, 0);
});

test('le lecteur conserve les erreurs E et compte seulement les lignes malformées comme invalides', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'apt-failures-'));
  try {
    const file = path.join(dir, 'cache.log');
    await writeFile(file, errorLine + '\ninvalid\n' + errorLine.replace('|E|', '|O|') + '\n');
    const snapshot = await readSnapshot(file);
    assert.equal(snapshot.events.length, 2);
    assert.equal(snapshot.invalid, 1);
    assert.equal(snapshot.events[0].statusCode, 503);
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('page des échecs : filtres, pagination, échappement et isolation du dashboard', async () => {
  const events = Array.from({length: 55}, (_, i) => parseLine(errorLine.replace('1792509225', String(1792509225 + i))));
  events.push(parseLine('1792509300|E|0|192.0.2.1|repo.example/pkg [Connection timed out <script>alert(1)</script>]'));
  events.push(parseLine('1792509301|E|12|192.0.2.2|repo.example/missing [HTTP error, code: 404]'));
  events.push(parseLine('1792509302|O|100|192.0.2.3|repo.example/success'));
  const state = {events, error: null, invalid: 0, readAt: null};
  const server = createApp({get: () => state}, {dns: {get: () => ''}}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = async query => (await fetch(base + '/api/failures' + query)).json();
  try {
    const res = await fetch(base + '/failures');
    const html = await res.text();
    assert.equal(res.status, 200);
    assert.ok(html.includes('Requêtes non abouties'));
    assert.ok(html.includes('503 — Service indisponible'));
    assert.ok(html.includes('404 — Ressource introuvable'));
    assert.ok(html.includes('HTTP error, code: 503'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('/failures?'));
    assert.ok(!html.includes('repo.example/success'));
    const all = await json('');
    assert.equal(all.total, 57);
    assert.equal(all.httpErrors, 56);
    assert.equal(all.events.length, 50);
    assert.equal(all.events[0].statusCode, 404);
    const second = await json('?page=2');
    assert.equal(second.total, 57);
    assert.equal(second.events.length, 7);
    assert.equal(second.pages, 2);
    assert.equal((await json('?code=503')).total, 55);
    assert.equal((await json('?code=unknown')).total, 1);
    assert.equal((await json('?ip=192.0.2.2&endpoint=repo.example&code=404&q=missing')).total, 1);
    assert.equal((await json('?q=timed%20out')).total, 1);
    assert.equal((await json('?from=2026-10-20T16:00')).total, 0);
    const empty = await (await fetch(base + '/failures?code=500')).text();
    assert.ok(empty.includes('Aucun échec enregistré'));
    for (const query of ['?code=200', '?code=503&code=404', '?from=bad', '?from=2026-10-20&to=2026-10-19']) {
      assert.equal((await fetch(base + '/failures' + query)).status, 400);
    }
    const dashboard = await (await fetch(base + '/api/dashboard')).json();
    assert.equal(dashboard.total, 1);
    assert.equal(dashboard.summary.outgoing, 100);
    assert.equal(dashboard.summary.clients.length, 1);
    assert.equal((await fetch(base + '/')).status, 200);
    state.error = 'EACCES';
    assert.ok((await (await fetch(base + '/failures')).text()).includes('Lecture indisponible : EACCES'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
