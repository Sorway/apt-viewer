import {isIP} from 'node:net';
export function parseLine(line) {
  // Preserve pipes inside the resource: only the first four delimiters are structural.
  const m = /^(\d+(?:\.\d+)?)\|([IOE])\|(\d+)\|([^|]+)\|(.+)$/.exec(line.replace(/\r$/, ''));
  if (!m) return null;
  const seconds = Number(m[1]), bytes = Number(m[3]), ip = m[4].trim();
  if (!isIP(ip) || !Number.isSafeInteger(bytes) || seconds < 0 || seconds > 8640000000000 || !Number.isFinite(seconds)) return null;
  let resource = m[5];
  if (resource.length > 16384 || /[\x00-\x1f\x7f]/.test(resource)) return null;
  let failure;
  if (m[2] === 'E') {
    const detail = /^(.*?) \[(.+)\]$/.exec(resource);
    if (detail && detail[1]) resource = detail[1];
    const reason = detail && detail[1] ? detail[2] : 'Motif non fourni par le journal';
    const http = /\bHTTP error,\s*code:\s*([45]\d{2})\b/i.exec(reason);
    failure = {reason, statusCode: http ? Number(http[1]) : null};
  }
  let endpoint = resource.split('/')[0] || '(local)';
  try { if (/^https?:\/\//i.test(resource)) endpoint = new URL(resource).host; } catch { return null; }
  return {time:Math.floor(seconds*1000),direction:m[2],bytes,ip,resource,endpoint,...failure};
}
export function summarize(events) {
  const groups = key => Object.values(events.reduce((a,e) => {
    const k=e[key]; const g=a[k] ||= {name:k,in:0,out:0,count:0,last:0};
    if(e.direction==='I')g.in+=e.bytes; else if(e.direction==='O')g.out+=e.bytes; g.count++; g.last=Math.max(g.last,e.time); return a;
  },Object.create(null))).sort((a,b)=>b.out-a.out);
  return {incoming:events.filter(e=>e.direction==='I').reduce((a,e)=>a+e.bytes,0),outgoing:events.filter(e=>e.direction==='O').reduce((a,e)=>a+e.bytes,0),clients:groups('ip'),endpoints:groups('endpoint')};
}
