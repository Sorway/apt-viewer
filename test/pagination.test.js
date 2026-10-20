import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

async function harness({failure = false} = {}) {
  const listeners = {};
  const browserListeners = {};
  let current;
  let focused = false;
  const root = page => {
    const feedback = {hidden: true, textContent: ''};
    const busy = new Map();
    const pagination = {querySelector: () => feedback, setAttribute: (key,value) => busy.set(key,value), removeAttribute: key => busy.delete(key)};
    const table = {scrollTop: 0, scrollLeft: 0};
    const indicator = {textContent: `Page ${page} / 3`, focus: options => { focused = options.preventScroll; }};
    return {table, feedback, busy, querySelector: selector => selector === '.pagination' ? pagination : selector === '.pagination-feedback' ? feedback : selector === '.pagination-page' ? indicator : selector === '.result-range' ? {textContent: page === 1 ? '1–50 sur 120' : '51–100 sur 120'} : selector.startsWith('a[rel=') ? indicator : null, replaceWith: node => { current = node; }};
  };
  current = root(1);
  current.table.scrollTop = 340;
  current.table.scrollLeft = 60;
  const location = {href: 'http://localhost/activity?ip=192.0.2.1', origin: 'http://localhost', pathname: '/activity', reload() { this.reloaded = true; }};
  const entries = [];
  const history = {state: null,
    replaceState(state, unused, url) { this.state = state; entries.push({kind:'replace',state,url}); },
    pushState(state, unused, url) { this.state = state; location.href = url; entries.push({kind:'push',state,url}); },
  };
  const window = {location, history, scrollX: 0, scrollY: 720, addEventListener: (type, fn) => {browserListeners[type] = fn;}, scrollTo: value => {window.scrollX = value.left; window.scrollY = value.top;}};
  const document = {addEventListener: (type, fn) => {listeners[type] = fn;}, querySelector: selector => selector === '#results' ? current : selector === '#results .scroll' ? current.table : null};
  let requested;
  let resolveFetch;
  const fetch = url => {requested = url; return new Promise(resolve => {resolveFetch = () => resolve({ok: !failure, text: async () => 'page'});});};
  const DOMParser = class {parseFromString() {const next = root(location.href.includes('page=2') ? 1 : 2);return {querySelector: selector => selector === '#results' ? next : null};}};
  runInNewContext(await readFile(new URL('../public/pagination.js',import.meta.url),'utf8'), {document, window, fetch, DOMParser, URL});
  const click = (overrides = {}) => {
    const link = {href: 'http://localhost/activity?ip=192.0.2.1&page=2#results', rel: 'next', target: '', hasAttribute: () => false};
    const event = {button: 0, target: {closest: () => link}, preventDefault() {this.prevented = true;}, ...overrides};
    listeners.click(event);
    return event;
  };
  return {click, window, history, entries, current: () => current, requested: () => requested, focused: () => focused,
    complete: async () => {resolveFetch(); await new Promise(resolve => setImmediate(resolve));},
    back: state => {location.href = 'http://localhost/activity?ip=192.0.2.1'; browserListeners.popstate({state});},
  };
}

test('pagination sans rechargement : conserve le scroll de la page et du tableau, les filtres et le focus', async () => {
  const ui = await harness();
  assert.equal(ui.click().prevented, true);
  assert.equal(ui.current().busy.get('aria-busy'), 'true');
  assert.equal(ui.requested(), 'http://localhost/activity?ip=192.0.2.1&page=2');
  await ui.complete();
  assert.equal(ui.window.scrollY, 720);
  assert.equal(ui.current().table.scrollTop, 340);
  assert.equal(ui.current().table.scrollLeft, 60);
  assert.equal(ui.focused(), true);
  assert.ok(ui.current().feedback.textContent.includes('Page 2 / 3'));
  assert.equal(ui.entries.filter(entry => entry.kind === 'push').length, 1);
  assert.equal(ui.window.location.reloaded, undefined);
  ui.back(ui.entries[0].state);
  await ui.complete();
  assert.equal(ui.current().table.scrollTop, 340);
  assert.equal(ui.window.scrollY, 720);
  assert.equal(ui.entries.filter(entry => entry.kind === 'push').length, 1);
});

test('échec réseau : conserve la liste et permet de réessayer, sans changer l’URL', async () => {
  const ui = await harness({failure:true});
  const original = ui.current();
  ui.click();
  await ui.complete();
  assert.equal(ui.current(), original);
  assert.equal(ui.current().busy.has('aria-busy'), false);
  assert.ok(ui.current().feedback.textContent.includes('réessayer'));
  assert.equal(ui.entries.length, 0);
  assert.equal(ui.window.location.reloaded, undefined);
  assert.equal(ui.click().prevented, true);
  await ui.complete();
});

test('Ctrl-clic et clic du milieu gardent le comportement natif des liens', async () => {
  const ui = await harness();
  assert.equal(ui.click({ctrlKey:true}).prevented, undefined);
  assert.equal(ui.click({button:1}).prevented, undefined);
  assert.equal(ui.requested(), undefined);
});
