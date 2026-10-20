import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = {}; this.attributes = new Map(); this.dataset = {};
    this.hidden = false; this.scrollTop = 0; this.offsetTop = 0; this.offsetHeight = 30; this.clientHeight = 200;
    this.classes = new Set();
    this.classList = {add: key => this.classes.add(key), remove: key => this.classes.delete(key), toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key)};
  }
  append(...nodes) { for (const node of nodes) {node.parentElement = this; this.children.push(node);} }
  replaceChildren() { this.children = []; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { this.lastEvent = event; for (const fn of this.listeners[event.type] || []) fn(event); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return {right: 400}; }
  select() { this.textSelected = true; }
  querySelector(tag) { return this.children.find(child => child.tag === tag); }
}

async function picker(value = '') {
  const documentListeners = {};
  const document = {createElement: tag => new Element(tag), addEventListener: (type, fn) => {documentListeners[type] = fn;}};
  const script = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = script.indexOf('function enhanceFilterSelect(');
  const end = script.indexOf("document.querySelectorAll('select[data-search-select]')");
  const context = {document, window: {innerWidth: 1200}, Event};
  runInNewContext(script.slice(start, end), context);
  const field = new Element();
  const label = new Element('label'); label.textContent = 'Client IP';
  const select = new Element('select'); select.id = 'client-ip'; select.value = value;
  select.dataset.searchPlaceholder = 'Rechercher une IP ou un nom…';
  select.options = [
    {value: '', textContent: 'Tous les clients', dataset: {}},
    {value: '192.0.2.1', textContent: '192.0.2.1 (node.example)', dataset: {clientIp:'192.0.2.1'}},
    {value: '192.0.2.2', textContent: '192.0.2.2 (vault.example)', dataset: {clientIp:'192.0.2.2'}},
  ];
  Object.defineProperty(select, 'selectedOptions', {get: () => select.options.filter(option => option.value === select.value)});
  field.append(label, select);
  context.enhanceFilterSelect(select);
  const root = field.children[2], input = root.children[0], popup = root.children[2], list = popup.children[0];
  const fire = (target, type, extra = {}) => target.dispatchEvent({type, preventDefault() {this.prevented = true;}, ...extra});
  return {select, label, root, input, popup, list, fire, documentListeners};
}

test('recherche par nom DNS ou IP et sélection de la vraie valeur du filtre', async () => {
  const ui = await picker();
  ui.fire(ui.input, 'focus');
  assert.equal(ui.list.children.length, 3);
  assert.equal(ui.label.htmlFor, ui.input.id);
  ui.input.value = 'VAULT'; ui.fire(ui.input, 'input');
  assert.equal(ui.list.children.length, 1);
  const row = ui.list.children[0];
  assert.equal(row.children[0].children[0].textContent, '192.0.2.2');
  assert.equal(row.children[0].children[1].textContent, 'vault.example');
  assert.equal(ui.input.attributes.get('aria-activedescendant'), row.id);
  ui.fire(ui.input, 'keydown', {key:'Enter'});
  assert.equal(ui.select.value, '192.0.2.2');
  assert.equal(ui.select.lastEvent.type, 'change');
  assert.equal(ui.select.lastEvent.bubbles, true);
  assert.equal(ui.popup.hidden, true);
  assert.equal(ui.input.value, '192.0.2.2 (vault.example)');
  ui.input.value = '192.0.2.1'; ui.fire(ui.input, 'input');
  assert.equal(ui.list.children.length, 1);
});

test('navigation clavier, annulation et absence de résultat sans sélection accidentelle', async () => {
  const ui = await picker('192.0.2.1');
  ui.fire(ui.input, 'focus');
  ui.fire(ui.input, 'keydown', {key:'ArrowDown'});
  ui.fire(ui.input, 'keydown', {key:'Enter'});
  assert.equal(ui.select.value, '192.0.2.2');
  ui.input.value = 'node'; ui.fire(ui.input, 'input');
  ui.fire(ui.input, 'keydown', {key:'Escape'});
  assert.equal(ui.select.value, '192.0.2.2');
  assert.equal(ui.input.value, '192.0.2.2 (vault.example)');
  ui.input.value = 'missing'; ui.fire(ui.input, 'input');
  assert.equal(ui.list.children[0].textContent, 'Aucun résultat');
  ui.fire(ui.input, 'keydown', {key:'Enter'});
  assert.equal(ui.select.value, '192.0.2.2');
  ui.fire(ui.input, 'blur');
  assert.equal(ui.popup.hidden, true);
});

test('les noms DNS mis à jour restent disponibles dans le sélecteur', async () => {
  const ui = await picker('192.0.2.1');
  ui.select.options[1].textContent = '192.0.2.1 (renamed.example)';
  ui.documentListeners['client-names-updated']();
  assert.equal(ui.input.value, '192.0.2.1 (renamed.example)');
  ui.fire(ui.input, 'focus');
  ui.input.value = 'renamed'; ui.fire(ui.input, 'input');
  assert.equal(ui.list.children.length, 1);
  ui.fire(ui.input, 'keydown', {key:'Enter'});
  assert.equal(ui.select.value, '192.0.2.1');
});
