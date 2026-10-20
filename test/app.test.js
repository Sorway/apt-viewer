import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseLine,summarize} from '../src/parser.js';
import {readSnapshot,createStore} from '../src/reader.js';
import {createApp} from '../src/app.js';
const line='1700000000|O|1234|192.0.2.1|deb.debian.org/debian/pool/p.deb';
test('format standard, IPv6, CRLF, URL et pipes',()=>{
 assert.equal(parseLine(line+'\r').bytes,1234);
 assert.equal(parseLine(line.replace('192.0.2.1','2001:db8::1')).ip,'2001:db8::1');
 assert.equal(parseLine(line+'|suffix').resource.endsWith('|suffix'),true);
 assert.equal(parseLine(line.replace('deb.debian.org','https://deb.debian.org')).endpoint,'deb.debian.org');
});
test('rejet données malformées, débordements, IP et types inconnus',()=>{
 for(const x of ['', 'garbage',line.replace('|O|','|H|'),line.replace('|1234|','|-1|'),line.replace('|1234|','|99999999999999999|'),line.replace('192.0.2.1','bad-ip'),line.replace('1700000000','99999999999999999'),line+'\x00'])assert.equal(parseLine(x),null);
});
test('agrégats ne confondent pas I et O',()=>{
 const s=summarize([parseLine(line),parseLine(line.replace('|O|','|I|'))]);
 assert.equal(s.incoming,1234);assert.equal(s.outgoing,1234);assert.equal(s.clients.length,1);
 assert.equal(summarize([parseLine(line.replace('deb.debian.org/debian/pool/p.deb','__proto__'))]).endpoints.length,1);
});
test('lecture bornée, lignes partielles, remplacement et troncature',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'apt-'));const f=path.join(dir,'log');
 try {
 await writeFile(f,line+'\n'+line.slice(0,12));
 assert.equal((await readSnapshot(f)).events.length,1);
 await appendFile(f,line.slice(12)+'\ninvalid\n');
 let s=await readSnapshot(f); assert.equal(s.events.length,2);assert.equal(s.invalid,1);
 s=await readSnapshot(f,Buffer.byteLength(line)+9);assert.equal(s.truncated,true);assert.ok(s.events.length<=1);
 await rename(f,f+'.1');await writeFile(f,line.replace('|1234|','|77|')+'\n');assert.equal((await readSnapshot(f)).events[0].bytes,77);
 await writeFile(f,'');assert.equal((await readSnapshot(f)).events.length,0);
 await writeFile(f,(line+'\n').repeat(4));s=await readSnapshot(f,10000,2);assert.equal(s.events.length,2);assert.equal(s.truncated,true);
 const store=createStore(f);await store.refresh();await rm(f);await store.refresh();assert.equal(store.get().error,'ENOENT');assert.equal(store.get().events.length,4);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('routes EJS, filtres API, échappement XSS, santé et sécurité',async()=>{
 const events=[parseLine(line),parseLine(line.replace('192.0.2.1','192.0.2.2').replace('p.deb','<script>alert(1)</script>'))];
 const state={events,error:null,invalid:0,readAt:new Date().toISOString()};
 const server=createApp({get:()=>state},{dns:{get:()=>''}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try {
 const res=await fetch(base+'/activity');const html=await res.text();assert.equal(res.status,200);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>alert'));assert.ok(res.headers.get('content-security-policy'));assert.equal(res.headers.get('x-powered-by'),null);
 const d=await (await fetch(base+'/api/dashboard?ip=192.0.2.1')).json();assert.equal(d.total,1);
 const t=await (await fetch(base+'/api/dashboard?from=2023-11-14T22:14')).json();assert.equal(t.total,0);
 assert.equal((await fetch(base+'/?from=bad')).status,400);assert.equal((await fetch(base+'/?ip[x]=y')).status,200);
 assert.equal((await fetch(base+'/?ip=a&ip=b')).status,400);
 assert.equal((await fetch(base+'/healthz')).status,200);state.error='EACCES';assert.equal((await fetch(base+'/healthz')).status,503);
 } finally {await new Promise(r=>server.close(r));}
});
