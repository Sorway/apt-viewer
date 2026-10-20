import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {hostname} from 'node:os';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {formatBytes,httpStatusLabel} from './format.js';
import {createClientDns} from './dns.js';
import {summarize} from './parser.js';
import {clientActivity} from './client-activity.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const screens = {
 overview: {path:'/', title:'Vue d’ensemble', description:'Transferts et activité du cache APT.', template:'index'},
 clients: {path:'/clients', title:'Clients', description:'Volumes et nombre d’événements par client.', template:'groups'},
 endpoints: {path:'/endpoints', title:'Dépôts', description:'Volumes et activité par dépôt.', template:'groups'},
 activity: {path:'/activity', title:'Activité', description:'Tous les événements de transfert, du plus récent au plus ancien.', template:'activity'},
 failures: {path:'/failures', title:'Requêtes non abouties', description:'Erreurs enregistrées par le cache APT.', template:'failures'},
};
export function createApp(store, {name=hostname(),demo=false,dns=createClientDns()}={}) {
 const app=express(); app.disable('x-powered-by'); app.use(helmet());
 app.locals.httpStatusLabel=httpStatusLabel;
 const assetVersions=Object.fromEntries(['style.css','theme.js','app.js','pagination.js'].map(file=>[file,createHash('sha256').update(readFileSync(path.join(root,'public',file))).digest('hex').slice(0,12)]));
 app.locals.assetUrl=file=>`/assets/${file}?v=${assetVersions[file]}`;
 app.set('view engine','ejs'); app.set('views',path.join(root,'views'));
 app.use('/assets',express.static(path.join(root,'public'),{maxAge:0,setHeaders:res=>res.setHeader('Cache-Control','no-cache')}));
 app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.get('/healthz',(req,res)=>res.status(store.get().error?503:200).json({ok:!store.get().error}));
 function data(req, screen='overview') {
   const failures=screen==='failures';
   const s=store.get(), q={};
   for(const key of ['ip','endpoint','direction','q','from','to',...(failures?['code']:[])]) { if(req.query[key]!==undefined && (typeof req.query[key]!=='string'||req.query[key].length>200))throw Error('FILTER'); q[key]=req.query[key]||''; }
   if(q.direction&&!['I','O'].includes(q.direction))throw Error('FILTER');
   if(failures && (q.direction || (q.code && !/^(?:[45]\d{2}|unknown)$/.test(q.code))))throw Error('FILTER');
   const parseDate=value=>Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(value)?value+'Z':value);
   const from=q.from?parseDate(q.from):-Infinity, to=q.to?parseDate(q.to):Infinity;
   if(Number.isNaN(from)||Number.isNaN(to)||from>to)throw Error('FILTER');
   const source=s.events.filter(e=>failures ? e.direction==='E' : e.direction!=='E');
   const events=source.filter(e=>(!q.ip||e.ip===q.ip)&&(!q.endpoint||e.endpoint===q.endpoint)&&(!q.direction||e.direction===q.direction)&&e.time>=from&&e.time<=to&&(!q.q||(e.resource+' '+(e.reason||'')).toLowerCase().includes(q.q.toLowerCase()))&&(!q.code||(q.code==='unknown'?!e.statusCode:String(e.statusCode)===q.code))).sort((a,b)=>b.time-a.time);
   const summary=summarize(events);
   const groups=screen==='clients'?summary.clients:screen==='endpoints'?summary.endpoints:null;
   const resultTotal=groups?groups.length:events.length;
   const pages=Math.max(1,Math.ceil(resultTotal/50)); const page=Math.min(pages,Math.max(1,Number.parseInt(req.query.page,10)||1));
   const basePath=screens[screen].path;
   const filterUrl=(changes={},target=basePath)=>{
     const values={...q,...changes};
     if(target==='/failures')delete values.direction;
     else delete values.code;
     const params=new URLSearchParams(Object.entries(values).filter(([,value])=>value!==''&&value!=null));
     return target+(params.size?'?'+params.toString():'');
   };
   const labels={ip:'Client',endpoint:'Dépôt',direction:'Flux',q:'Recherche',from:'Depuis (UTC)',to:'Jusqu’au (UTC)',code:'HTTP'};
   const activeFilters=Object.entries(q).filter(([,value])=>value).map(([key,value])=>({key,label:labels[key],value:key==='direction'?(value==='I'?'Entrant':'Sortant'):value==='unknown'&&key==='code'?'Sans code':value,url:filterUrl({[key]:''})}));
   return {name,demo,q,status:s,basePath,screen,pageTitle:screens[screen].title,pageDescription:screens[screen].description,navigation:Object.entries(screens).map(([id,s])=>({id,path:s.path,title:id==='failures'?'Échecs':s.title})),failures,filterUrl,activeFilters,failureCount:s.events.filter(e=>e.direction==='E').length,summary,total:events.length,resultTotal,groupRows:groups?.slice((page-1)*50,page*50),httpErrors:events.filter(e=>e.statusCode).length,codes:[...new Set(source.map(e=>e.statusCode).filter(Boolean))].sort((a,b)=>a-b),events:events.slice((page-1)*50,page*50),page,pages,options:summarize(source),clientName:ip=>dns.get(ip),bytes:formatBytes,date:n=>new Date(n).toLocaleString('fr-FR',{timeZone:'Europe/Paris'}),pageUrl:n=>filterUrl({page:String(n)})};
 }
 for(const [screen,config] of Object.entries(screens)) {
   app.get(config.path,(req,res,next)=>{try{const d=data(req,screen);res.render(config.template,{...d,clientActivity:screen==='overview'?clientActivity(d.summary.clients):null,destinationActivity:screen==='overview'?clientActivity(d.summary.endpoints):null});}catch(e){next(e);}});
 }
 app.get('/api/failures',(req,res,next)=>{try{const d=data(req,'failures');res.json({filters:d.q,status:{error:d.status.error,readAt:d.status.readAt,invalid:d.status.invalid,truncated:d.status.truncated},total:d.total,httpErrors:d.httpErrors,events:d.events,page:d.page,pages:d.pages});}catch(e){next(e);}});
 app.get('/api/client-names',(req,res)=>{const ips=[...new Set(store.get().events.map(e=>e.ip))].slice(-2048);res.json(Object.fromEntries(ips.map(ip=>[ip,dns.get(ip)])));});
 app.get('/api/dashboard',(req,res,next)=>{try{const d=data(req);res.json({name,demo,filters:d.q,status:{error:d.status.error,readAt:d.status.readAt,invalid:d.status.invalid,truncated:d.status.truncated},summary:d.summary,total:d.total,events:d.events,page:d.page,pages:d.pages});}catch(e){next(e);}});
 app.use((err,req,res,next)=>{if(err.message==='FILTER')return res.status(400).send('Filtres invalides.'); console.error('Erreur de rendu');res.status(500).send('Erreur interne.');});
 return app;
}
