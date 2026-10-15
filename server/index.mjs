import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {scryptSync,randomBytes,timingSafeEqual} from 'node:crypto';
import {createStore} from './store.mjs';
import {createPostgresStore} from './postgres.mjs';
const production=process.env.NODE_ENV==='production';
const pin=process.env.COACH_PIN||(production?null:'0700');
if(!pin||(production&&!/^\d{6,12}$/.test(pin)))throw Error('Production requires COACH_PIN with 6–12 digits');
if(production&&!process.env.DATABASE_URL&&!process.env.DB_PATH)throw Error('Set DATABASE_URL for persistent cloud storage, or DB_PATH on a persistent disk');
const store=process.env.DATABASE_URL?await createPostgresStore(process.env.DATABASE_URL):createStore(process.env.DB_PATH||new URL('../.data/club.sqlite',import.meta.url).pathname);
const salt=randomBytes(32),hash=scryptSync(pin,salt,32),sessions=new Map(),attempts=new Map();
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/api/health'){await store.state();return send(res,200,{ok:true});}
  if(req.method==='GET'&&url.pathname==='/api/state')return send(res,200,await store.state());
  if(req.method==='POST'&&url.pathname.startsWith('/api/')){
   if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,{error:'Запрос отклонён'});
   if(req.headers.origin){let host;try{host=new URL(req.headers.origin).host;}catch{return send(res,403,{error:'Запрос отклонён'});}if(host!==req.headers.host)return send(res,403,{error:'Запрос отклонён'});}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>100000)return send(res,413,{error:'Слишком большой запрос'});}
   const data=JSON.parse(body||'{}');
   for(const [key,expires] of sessions)if(expires<Date.now())sessions.delete(key);
   for(const [key,value] of attempts)if(Date.now()-value.time>60000)attempts.delete(key);
   if(url.pathname==='/api/login'){
    // A global budget also protects the PIN behind a reverse proxy without trusting spoofable IP headers.
    const key='login',attempt=attempts.get(key);
    if(attempt?.count>=5)return send(res,429,{error:'Слишком много попыток. Подождите минуту.'});
    if(!timingSafeEqual(hash,scryptSync(String(data.pin||'').slice(0,128),salt,32))){attempts.set(key,{count:(attempt?.count||0)+1,time:attempt?.time||Date.now()});return send(res,401,{error:'Неверный PIN-код'});}
    const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);return send(res,200,{token});
   }
   const token=req.headers.authorization?.replace(/^Bearer /,'');if(!sessions.has(token))return send(res,401,{error:'Сессия завершена. Введите PIN ещё раз.'});
   if(url.pathname==='/api/logout'){sessions.delete(token);return send(res,200,{});}
   if(url.pathname==='/api/mutate')return send(res,200,await store.mutate(data.action,data.payload));
  }
  if(url.pathname.startsWith('/api/'))return send(res,404,{error:'Не найдено'});
  const root=resolve('dist'),path=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!path.startsWith(root+'/')&&path!==root)return send(res,403,{error:'Запрещено'});
  let file;try{file=await readFile(path);}catch{file=await readFile(resolve(root,'index.html'));res.setHeader('Content-Type','text/html; charset=utf-8');}
  if(!res.hasHeader('Content-Type'))res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(file);
 }catch(e){console.error('Request failed:',e.code||e.name);send(res,400,{error:(e.code?.startsWith('ERR_SQLITE')||/^[0-9A-Z]{5}$/.test(e.code||''))?'Не удалось сохранить данные. Проверьте участников и отметки.':e instanceof SyntaxError?'Некорректный запрос':e.message});}
});
server.listen(process.env.PORT||3001,'0.0.0.0',()=>console.log('Club API listening on '+(process.env.PORT||3001)));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(async()=>{await store.close();process.exit(0);}));
