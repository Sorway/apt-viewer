import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const node = (dataset = {}) => {
  const classes = new Set();
  return {dataset, classes, hidden: true, listeners: {}, textContent: '',
    classList: {add: key => classes.add(key), remove: key => classes.delete(key), toggle: (key,on) => on ? classes.add(key) : classes.delete(key)},
    addEventListener(type, fn) {this.listeners[type] = fn;},
    querySelector() {return null;},
  };
};

test('infobulle : valeurs au survol, nom DNS et sélection au clavier sans focus sur les parts', async () => {
  const name = node(), values = node(), tooltip = node();
  tooltip.querySelector = selector => selector === '.pie-tooltip-name' ? name : values;
  const slices = [node({chartSlice:'0',label:'192.0.2.1',count:'238',share:'33'}),node({chartSlice:'1',label:'Autres',count:'140',share:'19,4'})];
  const dns = {textContent:'192.0.2.1 (host.example)'};
  const rows = [node({chartRow:'0'}),node({chartRow:'1'})];
  rows[0].querySelector = () => dns;
  const svg = node(); svg.querySelectorAll = () => slices;
  const chart = {querySelector: selector => selector === '.client-pie' ? svg : tooltip, querySelectorAll: () => rows, contains: () => false};
  const document = node();
  const source = await readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const context = {document};
  runInNewContext(source.slice(source.indexOf('function enhancePieChart('),source.indexOf("document.querySelectorAll('.client-activity')")),context);
  context.enhancePieChart(chart);
  slices[0].listeners.pointerenter({pointerType:'mouse'});
  assert.equal(tooltip.hidden,false);
  assert.equal(name.textContent,'192.0.2.1 (host.example)');
  assert.equal(values.textContent,'238 événements · 33 %');
  assert.equal(slices[0].classes.has('is-highlighted'),true);
  assert.equal(rows[0].classes.has('is-highlighted'),true);
  slices[0].listeners.pointerleave({pointerType:'mouse'});
  assert.equal(tooltip.hidden,true);
  rows[1].listeners.focusin();
  assert.equal(name.textContent,'Autres');
  assert.equal(values.textContent,'140 événements · 19,4 %');
  document.listeners.keydown({key:'Escape'});
  assert.equal(tooltip.hidden,true);
  assert.equal(svg.classes.has('has-highlight'),false);
  slices[1].listeners.click({pointerType:'touch'});
  assert.equal(tooltip.hidden,false);
  document.listeners.pointerdown({target:{}});
  assert.equal(tooltip.hidden,true);
});
