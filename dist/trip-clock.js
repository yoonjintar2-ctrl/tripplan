// Dates and schedule times follow the viewer's device clock, matching the date picker.
export function clockParts(now=new Date()) {
  return {date:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,time:`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,minutes:now.getHours()*60+now.getMinutes()};
}
const ordinal=date=>{const [y,m,d]=date.split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};
export function tripPhase(trip,now=new Date()) {
  if(!trip?.id)return {mode:'empty'};
  const {date}=clockParts(now),remaining=ordinal(trip.start_date)-ordinal(date);
  if(remaining>0)return {mode:'upcoming',remaining};
  if(date<=trip.end_date)return {mode:'live',day:ordinal(date)-ordinal(trip.start_date)+1};
  return {mode:'ended'};
}
export function currentSchedule(items,now=new Date()) {
  const clock=clockParts(now),minute=t=>t&&/^\d{2}:\d{2}/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3,5))+(Number(t.slice(6,8))||0)/60:null;
  const today=items.filter(i=>i.item_date===clock.date&&minute(i.start_time)!=null).slice().sort((a,b)=>minute(a.start_time)-minute(b.start_time)||Number(a.sort_order||0)-Number(b.sort_order||0));
  for(let i=today.length-1;i>=0;i--){const start=minute(today[i].start_time),next=today.slice(i+1).find(j=>minute(j.start_time)>start),end=minute(today[i].end_time)??(next?minute(next.start_time):Math.min(1440,start+60));if(clock.minutes>=start&&clock.minutes<end)return {item:today[i],progress:Math.min(1,(clock.minutes-start)/Math.max(1,end-start)),end};}
  return null;
}
