import test from 'node:test';
import assert from 'node:assert/strict';
import {clientActivity} from '../src/client-activity.js';
import {createApp} from '../src/app.js';

test('camembert classé par événements et non par octets, avec regroupement exact', () => {
  const clients = Array.from({length: 10}, (_, i) => ({name: `192.0.2.${i + 1}`, count: i + 1, out: 100 - i}));
  const chart = clientActivity(clients);
  assert.equal(chart.total, 55);
  assert.equal(chart.slices.length, 8);
  assert.equal(chart.slices[0].name, '192.0.2.10');
  assert.equal(chart.slices[0].count, 10);
  assert.equal(chart.slices[7].other, true);
  assert.equal(chart.slices[7].count, 6);
  assert.equal(chart.slices.reduce((sum, slice) => sum + slice.count, 0), chart.total);
  assert.ok(Math.abs(chart.slices.reduce((sum, slice) => sum + slice.share, 0) - 100) < 1e-10);
  assert.equal(clients[0].name, '192.0.2.1');
});

test('camembert vide et cercle complet avec un seul client', () => {
  assert.deepEqual(clientActivity([]), {total: 0, slices: []});
  const chart = clientActivity([{name: '::1', count: 5}]);
  assert.equal(chart.slices[0].share, 100);
  assert.equal((chart.slices[0].path.match(/A 112 112/g) || []).length, 2);
  assert.ok(!/NaN|Infinity/.test(chart.slices[0].path));
});

test('camembert sur toute la sélection filtrée, indépendant de la pagination', async () => {
  const events = Array.from({length: 80}, (_, i) => ({ip: i < 60 ? '192.0.2.1' : '192.0.2.2', time: 1700000000000, direction: 'O', bytes: 1, endpoint: 'repo', resource: 'repo/pkg'}));
  const server = createApp({get: () => ({events, error: null, invalid: 0})}, {dns: {get: () => ''}}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base + '/?page=2')).text();
    assert.ok(html.includes('192.0.2.1 : 60 événements, 75 %'));
    assert.ok(html.includes('192.0.2.2 : 20 événements, 25 %'));
    const filtered = await (await fetch(base + '/?ip=192.0.2.2')).text();
    assert.ok(filtered.includes('192.0.2.2 : 20 événements, 100 %'));
    assert.ok(!filtered.includes('192.0.2.1 : 60 événements'));
    const empty = await (await fetch(base + '/?ip=192.0.2.3')).text();
    assert.ok(empty.includes('Aucun événement pour les filtres sélectionnés.'));
    assert.ok(!empty.includes('class="client-pie"'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('camembert des destinations : nombre d’événements, filtres et exclusion des échecs', async () => {
  const events = Array.from({length:80}, (_, i) => ({ip:i%2?'192.0.2.2':'192.0.2.1', time:1700000000000, direction:'O', bytes:i<45?1:10000, endpoint:i<45?'repo-a.example':'repo-b.example', resource:'repo/package'}));
  events.push({...events[0],direction:'E',statusCode:503});
  const server=createApp({get:()=>({events,error:null,invalid:0})},{dns:{get:()=>''}}).listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const destination=html=>html.slice(html.indexOf('<section class="panel client-activity" aria-labelledby="destination-activity-title"'));
  try {
    const html=await(await fetch(base+'/?page=2')).text();
    assert.equal((html.match(/class="client-pie"/g)||[]).length,2);
    const chart=destination(html);
    assert.ok(chart.includes('repo-a.example : 45 événements, 56,3 %'));
    assert.ok(chart.includes('repo-b.example : 35 événements, 43,8 %'));
    assert.ok(chart.indexOf('repo-a.example :')<chart.indexOf('repo-b.example :'));
    assert.ok(chart.includes('/activity?endpoint=repo-a.example'));
    assert.ok(!chart.includes('data-client-ip='));
    const filtered=destination(await(await fetch(base+'/?ip=192.0.2.1')).text());
    assert.ok(filtered.includes('repo-a.example : 23 événements, 57,5 %'));
    const single=destination(await(await fetch(base+'/?endpoint=repo-b.example')).text());
    assert.ok(single.includes('repo-b.example : 35 événements, 100 %'));
    const empty=await(await fetch(base+'/?ip=missing')).text();
    assert.ok(!empty.includes('class="client-pie"'));
  } finally {await new Promise(resolve=>server.close(resolve));}
});
