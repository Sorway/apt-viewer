import {open} from 'node:fs/promises';
import {parseLine} from './parser.js';
export async function readSnapshot(path, maxBytes=16777216, maxEvents=50000) {
  const file=await open(path,'r');
  try {
    const stat=await file.stat();
    if (!stat.isFile()) throw new Error('NOT_REGULAR_FILE');
    const start=Math.max(0,stat.size-maxBytes), buffer=Buffer.alloc(Math.min(stat.size,maxBytes));
    let offset=0;
    while(offset<buffer.length) { const {bytesRead}=await file.read(buffer,offset,buffer.length-offset,start+offset); if(!bytesRead)break; offset+=bytesRead; }
    let text=buffer.subarray(0,offset).toString('utf8');
    if(start) { const end=text.indexOf('\n'); text=end<0?'':text.slice(end+1); }
    const lines=text.split('\n'); const partial=lines.pop(); // unfinished write is retried next poll
    const events=[]; let invalid=0;
    for(const line of lines) { if(!line.trim())continue; const e=parseLine(line); if(e)events.push(e); else invalid++; }
    const limited=events.length>maxEvents;
    return {events:events.slice(-maxEvents),invalid,truncated:start>0||limited,partial:!!partial,size:stat.size,readAt:new Date().toISOString()};
  } finally { await file.close(); }
}
export function createStore(path, maxBytes, maxEvents) {
  let state={events:[],invalid:0,error:'WAITING',readAt:null}, pending;
  return {get:()=>state, refresh() {
    if(pending)return pending;
    pending=readSnapshot(path,maxBytes,maxEvents).then(s=>{state={...s,error:null};}).catch(e=>{state={...state,error:['ENOENT','EACCES','EPERM'].includes(e.code)?e.code:'READ_ERROR'};}).finally(()=>{pending=null;});
    return pending;
  }};
}
