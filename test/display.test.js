import test from 'node:test';
import assert from 'node:assert/strict';
import {hostname} from 'node:os';
import {formatBytes} from '../src/format.js';
import {createClientDns} from '../src/dns.js';
import {createApp} from '../src/app.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
test('conversions automatiques et frontières', () => {
 assert.equal(formatBytes(0), '0 o');
 assert.equal(formatBytes(1024), '1 Kio');
 assert.equal(formatBytes(1048576), '1 Mio');
 assert.equal(formatBytes(1110.3 * 1048576), '1,1 Gio');
 assert.equal(formatBytes(1024 ** 4), '1 Tio');
 assert.equal(formatBytes(1024 ** 5), '1 Pio');
 assert.equal(formatBytes(1024 ** 2 - 1), '1 Mio');
 assert.equal(formatBytes(NaN), '—');
});
test('DNS positif, négatif, expiration et rejet des noms invalides', async () => {
 let clock = 0, calls = 0;
 const dns = createClientDns({now:()=>clock, reverse:async ip=>{calls++; if(ip==='192.0.2.2')throw Error('ENOTFOUND');return ['<script>', 'client.example.'];}});
 assert.equal(dns.get('192.0.2.1'), '');await tick();
 assert.equal(dns.get('192.0.2.1'), 'client.example');assert.equal(calls,1);
 dns.get('192.0.2.2');await tick();assert.equal(dns.get('192.0.2.2'),'');assert.equal(calls,2);
 clock=60001;dns.get('192.0.2.2');await tick();assert.equal(calls,3);
 clock=300001;dns.get('192.0.2.1');await tick();assert.equal(calls,4);
 dns.get('not-an-ip');await tick();assert.equal(calls,4);
});
test('DNS concurrence, déduplication et file bornée', async () => {
 const releases=[];let calls=0;
 const dns=createClientDns({maxEntries:2,concurrency:1,reverse:()=>{calls++;return new Promise(r=>releases.push(r));}});
 dns.get('192.0.2.1');dns.get('192.0.2.1');dns.get('192.0.2.2');dns.get('192.0.2.3');
 await tick();assert.equal(calls,1);releases.shift()(['one.example']);await tick();assert.equal(calls,2);
 releases.shift()([]);await tick();assert.equal(calls,2);
});
test('hostname système, noms DNS échappés et filtre par IP conservé',async()=>{
 const state={events:[{ip:'192.0.2.1',time:1700000000000,direction:'O',bytes:1024,resource:'repo/pkg',endpoint:'repo'}],error:null,invalid:0,readAt:new Date().toISOString()};
 const server=createApp({get:()=>state},{dns:{get:()=> 'client.example'}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
 const html=await (await fetch(base)).text();assert.ok(html.includes(hostname()));assert.ok(html.includes('192.0.2.1 (client.example)'));assert.ok(html.includes('value="192.0.2.1"'));assert.ok(html.includes('1 Kio'));
 const names=await (await fetch(base+'/api/client-names')).json();assert.equal(names['192.0.2.1'],'client.example');
 } finally {await new Promise(r=>server.close(r));}
});
