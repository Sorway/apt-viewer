import {createStore} from './reader.js';
import {createApp} from './app.js';
function integer(key,fallback,min,max){const n=Number(process.env[key]??fallback);if(!Number.isInteger(n)||n<min||n>max)throw Error(`Configuration invalide: ${key}`);return n;}
const host=process.env.HOST||'127.0.0.1';
if(!['127.0.0.1','::1','localhost'].includes(host)&&process.env.ALLOW_REMOTE!=='true')throw Error('Accès distant: configurer un proxy authentifié puis ALLOW_REMOTE=true si nécessaire.');
const store=createStore(process.env.LOG_PATH||'/var/log/apt-cacher-ng/apt-cacher.log',integer('MAX_BYTES',16777216,1024,67108864),integer('MAX_EVENTS',50000,1,200000));
await store.refresh();
const timer=setInterval(()=>store.refresh(),integer('POLL_MS',5000,1000,60000));
const server=createApp(store,{demo:process.env.DEMO==='true'}).listen(integer('PORT',3000,1,65535),host,()=>console.log(`apt-viewer écoute sur ${host}; état des logs: ${store.get().error||'OK'}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(timer);server.close(()=>process.exit(0));});
