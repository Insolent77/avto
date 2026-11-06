import http from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {available,defaultSchedule,minutes,validateSchedule,validateDate} from './dist/domain.js';
const root=dirname(fileURLToPath(import.meta.url)), staticRoot=resolve(root,'dist');
const config=JSON.parse(readFileSync(resolve(staticRoot,'business.json')));
const dbPath=process.env.DB_PATH||resolve(root,'data/bookings.sqlite');mkdirSync(dirname(resolve(dbPath)),{recursive:true});
const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL, token_hash TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,car TEXT NOT NULL,service_id TEXT NOT NULL,service_name TEXT NOT NULL,price INTEGER NOT NULL,date TEXT NOT NULL,start INTEGER NOT NULL,duration INTEGER NOT NULL,resource INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS occupancies (booking_id TEXT REFERENCES bookings(id),date TEXT NOT NULL,resource INTEGER NOT NULL,minute INTEGER NOT NULL, UNIQUE(date,resource,minute));`);
db.prepare('INSERT OR IGNORE INTO settings VALUES (?,?)').run('schedule',JSON.stringify(defaultSchedule()));
const schedule=()=>JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('schedule').value);
const sessions=new Map(), limits=new Map();const hash=s=>createHash('sha256').update(s).digest('hex');
const record=r=>r&&({id:r.id,name:r.name,phone:r.phone,car:r.car,serviceId:r.service_id,serviceName:r.service_name,price:r.price,date:r.date,start:r.start,duration:r.duration,resource:r.resource,status:r.status});
function json(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));}
function fail(status,message){throw Object.assign(new Error(message),{status});}
function owner(req){const cookie=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('session='))?.slice(8);const s=sessions.get(cookie);if(!s||s<Date.now())fail(401,'Войдите в кабинет мастера');return cookie;}
function rate(req,key,max){const id=req.socket.remoteAddress+':'+key;const now=Date.now();let entry=limits.get(id);if(!entry||entry.until<now){entry={count:0,until:now+600000};limits.set(id,entry);}if(++entry.count>max)fail(429,'Слишком много запросов. Повторите через 10 минут.');if(limits.size>10000)for(const[k,v]of limits)if(v.until<now)limits.delete(k);}
async function body(req){let s='';for await(const part of req){s+=part;if(s.length>16000)fail(413,'Слишком большой запрос');}try{return JSON.parse(s);}catch{fail(400,'Некорректный JSON');}}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path.startsWith('/api/')){
 if(!['GET','POST','PUT','PATCH'].includes(req.method))fail(405,'Метод не поддерживается');
 if(req.method!=='GET'){
 const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)fail(403,'Недопустимый источник запроса');
 if(!String(req.headers['content-type']).startsWith('application/json'))fail(415,'Ожидается JSON');
 }
 if(path==='/api/config'&&req.method==='GET')return json(res,200,{...config,mode:'server'});
 if(path==='/api/slots'&&req.method==='GET'){
 rate(req,'slots',600);const date=url.searchParams.get('date'),service=url.searchParams.get('service');if(!validateDate(date||''))fail(400,'Выберите дату в ближайшие 60 дней');
 const rows=db.prepare('SELECT * FROM bookings WHERE date=?').all(date).map(record);return json(res,200,{slots:available(config,schedule(),rows,date,service)});
 }
 if(path==='/api/bookings'&&req.method==='POST'){
 rate(req,'booking',20);const b=await body(req);const service=config.services.find(s=>s.id===b.serviceId);
 if(!service||!validateDate(b.date||'')||!/^([01]\d|2[0-3]):[03]0$/.test(b.time||'')||typeof b.name!=='string'||b.name.trim().length<2||b.name.length>80||!/^\+?[0-9 ()-]{10,24}$/.test(b.phone||'')||String(b.phone).replace(/\D/g,'').length<10||typeof b.car!=='string'||b.car.length>100||!b.consent||!/^[-\w]{20,80}$/.test(b.requestKey||'')||!/^[-\w]{32,128}$/.test(b.token||''))fail(400,'Проверьте имя, телефон и параметры записи');
 db.exec('BEGIN IMMEDIATE');try{
 const previous=db.prepare('SELECT * FROM bookings WHERE request_key=?').get(b.requestKey);
 if(previous){if(previous.token_hash!==hash(b.token))fail(409,'Ключ запроса уже использован');db.exec('COMMIT');return json(res,200,record(previous));}
 const rows=db.prepare('SELECT * FROM bookings WHERE date=?').all(b.date).map(record);
 if(!available(config,schedule(),rows,b.date,service.id).includes(b.time))fail(409,'Это время уже занято. Выберите другое окно.');
 const start=minutes(b.time);const resource=Array.from({length:config.resources},(_,i)=>i+1).find(r=>!rows.some(x=>x.resource===r&&x.status!=='cancelled'&&start<x.start+x.duration&&start+service.duration>x.start));
 if(!resource)fail(409,'Все боксы заняты');const id=randomBytes(12).toString('hex');
 db.prepare('INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,b.requestKey,hash(b.token),b.name.trim(),b.phone,b.car,service.id,service.name,service.price,b.date,start,service.duration,resource,'pending',new Date().toISOString());
 const insert=db.prepare('INSERT INTO occupancies VALUES (?,?,?,?)');for(let m=start;m<start+service.duration;m+=30)insert.run(id,b.date,resource,m);
 db.exec('COMMIT');return json(res,201,record(db.prepare('SELECT * FROM bookings WHERE id=?').get(id)));
 }catch(e){db.exec('ROLLBACK');throw e;}}
 if(path==='/api/login'&&req.method==='POST'){
 rate(req,'login',8);const b=await body(req);if(!process.env.OWNER_PASSWORD||process.env.OWNER_PASSWORD.length<16)fail(503,'Вход не настроен: задайте OWNER_PASSWORD длиной от 16 символов');
 if(!timingSafeEqual(Buffer.from(hash(String(b.password))),Buffer.from(hash(process.env.OWNER_PASSWORD))))fail(401,'Неверный пароль');
 const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*3600000);if(sessions.size>1000)for(const[k,v]of sessions)if(v<Date.now())sessions.delete(k);
 return json(res,200,{ok:true},{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV==='production'?'; Secure':''}`});}
 if(path==='/api/logout'&&req.method==='POST'){sessions.delete(owner(req));return json(res,200,{ok:true},{'Set-Cookie':'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
 if(path==='/api/owner'&&req.method==='GET'){owner(req);return json(res,200,{bookings:db.prepare('SELECT * FROM bookings ORDER BY date,start').all().map(record),schedule:schedule()});}
 if(path==='/api/schedule'&&req.method==='PUT'){owner(req);const b=await body(req);if(!validateSchedule(b))fail(400,'Проверьте график: шаг времени 30 минут, окончание позже начала');db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(b),'schedule');return json(res,200,{ok:true});}
 const match=path.match(/^\/api\/bookings\/([a-f0-9]{24})$/);
 if(match){const b=req.method==='GET'?null:await body(req);const row=db.prepare('SELECT * FROM bookings WHERE id=?').get(match[1]);if(!row)fail(404,'Запись не найдена');
 let isOwner=false;try{owner(req);isOwner=true;}catch{}
 const token=req.headers['x-booking-token'];if(!isOwner&&(!token||hash(token)!==row.token_hash))fail(403,'Нет доступа к записи');
 if(req.method==='GET')return json(res,200,record(row));
 if(req.method!=='PATCH')fail(405,'Метод не поддерживается');
 if(!['confirmed','completed','cancelled'].includes(b.status)||(!isOwner&&b.status!=='cancelled'))fail(403,'Действие недоступно');
 if(row.status==='cancelled'&&b.status!=='cancelled')fail(409,'Создайте новую запись вместо отменённой');
 db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE bookings SET status=? WHERE id=?').run(b.status,row.id);if(b.status==='cancelled')db.prepare('DELETE FROM occupancies WHERE booking_id=?').run(row.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return json(res,200,{ok:true});
 }fail(404,'Маршрут не найден');}
 if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Метод не поддерживается');
 const file=resolve(staticRoot,'.'+decodeURIComponent(path==='/'?'/index.html':path));if(!file.startsWith(staticRoot+'/')&&!file.startsWith(staticRoot+'\\'))fail(403,'Доступ запрещён');
 let data;try{data=readFileSync(file);}catch{fail(404,'Файл не найден');}
 const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
 res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){json(res,e.status||500,{error:e.status?e.message:'Ошибка сервера. Повторите позже.'});if(!e.status)console.error(e);}});
server.listen(process.env.PORT===undefined?8787:Number(process.env.PORT),process.env.HOST||'127.0.0.1',()=>console.log(`GRAPHITE: http://${process.env.HOST||'127.0.0.1'}:${server.address().port}`));
