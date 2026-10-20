import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createApp} from '../src/app.js';

test('navigation filtrée : retirer un filtre conserve les autres et remet la pagination à zéro', async () => {
  const events = Array.from({length: 60}, (_, i) => ({ip: '192.0.2.1', time: 1700000000000 + i, direction: 'O', bytes: 1, resource: 'repo/pkg', endpoint: 'repo'}));
  const server = createApp({get: () => ({events, invalid: 0, error: null})}, {dns: {get: () => ''}}).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base + '/activity?ip=192.0.2.1&endpoint=repo&page=2')).text();
    const chip = /class="filter-chip" href="([^"]+)" aria-label="Retirer le filtre Client/.exec(html);
    assert.ok(chip);
    const removal = new URL(chip[1].replaceAll('&amp;', '&'), base);
    assert.equal(removal.searchParams.get('endpoint'), 'repo');
    assert.equal(removal.searchParams.has('ip'), false);
    assert.equal(removal.searchParams.has('page'), false);
    assert.ok(html.includes('51–60 sur 60'));
    assert.ok(html.includes('aria-disabled="true">Suivant'));
    assert.ok(html.includes('rel="prev"'));
    assert.ok(!html.includes('rel="next"'));
    assert.ok(html.includes('title="Filtrer ce client"'));
    const first = await (await fetch(base + '/activity?page=1')).text();
    assert.ok(first.includes('aria-disabled="true">← Précédent'));
    assert.ok(first.includes('rel="next"'));
    const hostile = await (await fetch(base + '/?q=%3Cscript%3E')).text();
    assert.ok(hostile.includes('Recherche : &lt;script&gt;'));
    assert.ok(!hostile.includes('Recherche : <script>'));
    const missing = await (await fetch(base + '/failures?ip=192.0.2.9&endpoint=old.repo&code=500')).text();
    assert.ok(missing.includes('value="192.0.2.9" selected'));
    assert.ok(missing.includes('value="old.repo" selected'));
    assert.ok(missing.includes('value="500" selected'));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

async function browserHarness() {
  const element = () => ({listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, setCustomValidity(value) { this.validationMessage = value; }});
  const fields = {q: {value: ''}, ip: {value: ''}, endpoint: {value: ''}, direction: {value: ''}, from: {...element(), value: ''}, to: {...element(), value: ''}};
  const form = {...element(), elements: {namedItem: name => fields[name]}, contains: target => Object.values(fields).includes(target)};
  const auto = {...element(), checked: false};
  const refresh = element();
  const status = {};
  const feedback = {};
  const nodes = {'#auto': auto, '#refresh': refresh, '.filters': form, '#refresh-status': status, '.filter-feedback': feedback};
  const document = {...element(), hidden: false, activeElement: null, documentElement: {dataset: {theme: 'dark'}}, querySelector: selector => nodes[selector], querySelectorAll: () => []};
  const intervals = [];
  let reloads = 0;
  let selection = '';
  runInNewContext(await readFile(new URL('../public/app.js', import.meta.url), 'utf8'), {
    document, window: {getSelection: () => selection},
    sessionStorage: {getItem: () => 'true', setItem() {}},
    FormData: class { entries() { return Object.entries(fields).map(([key, field]) => [key, field.value]); } },
    setTimeout() {}, setInterval: callback => intervals.push(callback), queueMicrotask: callback => callback(),
    location: {reload: () => reloads++},
  });
  return {fields, form, auto, refresh, status, feedback, document, tick: () => intervals[0](), reloads: () => reloads, select: value => { selection = value; }};
}

test('actualisation suspendue après saisie même après avoir quitté le formulaire, reprise si les valeurs sont rétablies', async () => {
  const ui = await browserHarness();
  ui.fields.q.value = 'package';
  ui.form.listeners.input();
  ui.document.activeElement = null;
  ui.form.listeners.focusout();
  ui.tick();
  assert.equal(ui.reloads(), 0);
  assert.equal(ui.feedback.hidden, false);
  assert.equal(ui.refresh.disabled, true);
  assert.ok(ui.status.textContent.includes('En pause'));
  ui.fields.q.value = '';
  ui.form.listeners.input();
  assert.equal(ui.refresh.disabled, false);
  assert.equal(ui.feedback.hidden, true);
  ui.tick();
  assert.equal(ui.reloads(), 1);
});

test('la lecture, la sélection de texte et les dates incohérentes sont protégées', async () => {
  const ui = await browserHarness();
  ui.document.hidden = true;
  ui.tick();
  ui.document.hidden = false;
  ui.document.activeElement = ui.fields.q;
  ui.tick();
  ui.document.activeElement = null;
  ui.select('un nom de paquet');
  ui.tick();
  assert.equal(ui.reloads(), 0);
  ui.select('');
  ui.fields.from.value = '2026-10-20T12:00';
  ui.fields.to.value = '2026-10-19T12:00';
  ui.form.listeners.input();
  assert.ok(ui.fields.to.validationMessage);
  ui.fields.to.value = '2026-10-21T12:00';
  ui.form.listeners.input();
  assert.equal(ui.fields.to.validationMessage, '');
});
