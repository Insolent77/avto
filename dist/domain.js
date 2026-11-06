export const defaultSchedule=()=>({week:Array.from({length:7},(_,i)=>({open:i!==0,start:'09:00',end:'20:00'})),exceptions:{}});
export const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export const clock=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export const dateKey=(date=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(date);
export function validateDate(date){const d=new Date(date+'T12:00:00+03:00');return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!isNaN(d)&&dateKey(d)===date&&date>=dateKey()&&date<=dateKey(new Date(Date.now()+60*864e5));}
export function available(config,schedule,bookings,date,serviceId){
 const s=config.services.find(s=>s.id===serviceId);if(!s||!validateDate(date))return [];
 const day=new Date(date+'T12:00:00+03:00').getUTCDay();const hours=schedule.exceptions[date]||schedule.week[day];if(!hours.open)return [];
 const slots=[];for(let start=minutes(hours.start);start+s.duration<=minutes(hours.end);start+=30){
 if(Date.parse(date+'T'+clock(start)+config.offset)<=Date.now()+15*60e3)continue;
 for(let resource=1;resource<=config.resources;resource++){
 if(!bookings.some(b=>b.date===date&&b.resource===resource&&b.status!=='cancelled'&&start<b.start+b.duration&&start+s.duration>b.start)){slots.push(clock(start));break;}
 }}return slots;
}
export function validateSchedule(s){if(!s||!Array.isArray(s.week)||s.week.length!==7||!s.exceptions||typeof s.exceptions!=='object'||Array.isArray(s.exceptions)||Object.keys(s.exceptions).length>366)return false;
 const valid=h=>h&&typeof h.open==='boolean'&&/^([01]\d|2[0-3]):[03]0$/.test(h.start)&&/^([01]\d|2[0-3]):[03]0$/.test(h.end)&&(!h.open||minutes(h.start)<minutes(h.end));
 return s.week.every(valid)&&Object.entries(s.exceptions).every(([d,h])=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&valid(h));}
