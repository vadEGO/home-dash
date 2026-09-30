/* Sydney calendar rules shared by offline reminder projection and quiet hours. */
(function(root){
 'use strict';
 const zone='Australia/Sydney';
 function parts(value){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));}
 function wall(value){const p=parts(value);return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);}
 function resolve(value){
  // Sydney uses UTC+10/+11 in supported contemporary schedules. Validate both
  // against IANA rather than assuming a DST boundary date.
  for(let minute=0;minute<=180;minute++){
   const target=value+minute*60000,candidates=[target-11*3600000,target-10*3600000].filter(t=>wall(t)===target);
   if(candidates.length)return Math.min(...candidates);
  }throw new Error('Could not resolve Sydney time');
 }
 function nextDue(anchor,after,repeat){
  const original=new Date(wall(anchor)),cutoff=Date.parse(after),local=new Date(wall(after));
  let date=new Date(Math.max(Date.UTC(original.getUTCFullYear(),original.getUTCMonth(),original.getUTCDate()),Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())));
  for(let i=0;i<370;i++,date.setUTCDate(date.getUTCDate()+1)){
   const day=date.getUTCDay(),last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
   const eligible=repeat==='daily'||repeat==='weekdays'&&day!==0&&day!==6||repeat==='weekly'&&day===original.getUTCDay()||repeat==='monthly'&&date.getUTCDate()===Math.min(original.getUTCDate(),last);
   if(eligible){const t=resolve(date.getTime()+original.getUTCHours()*3600000+original.getUTCMinutes()*60000+original.getUTCSeconds()*1000);if(t>cutoff)return new Date(t).toISOString();}
  }throw new Error('Unsupported recurrence');
 }
 function quiet(value){const hour=Number(parts(value).hour);return hour>=22||hour<7;}
 const api={nextDue,quiet};if(typeof module!=='undefined')module.exports=api;else root.Routines=api;
})(typeof window==='undefined'?globalThis:window);
