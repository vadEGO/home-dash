(function(root){
 'use strict';
 const zone='Australia/Sydney';
 function dateKey(date,tz){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
 function parts(date,tz){return Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
 function clock(date,tz){const p=parts(date,tz);return `${p.hour}:${p.minute}`;}
 function dayOffset(date,tz){const a=parts(date,zone),b=parts(date,tz);return Math.round((Date.UTC(+b.year,+b.month-1,+b.day)-Date.UTC(+a.year,+a.month-1,+a.day))/86400000);}
 const rad=Math.PI/180;
 // NOAA-style approximation for Sydney; returns event minute in UTC on a 24-hour clock.
 function solarUTC(year,month,day,rise){
  const n=Math.floor((Date.UTC(year,month-1,day)-Date.UTC(year,0,0))/86400000),lng=151.2093/15;
  const t=n+((rise?6:18)-lng)/24,M=.9856*t-3.289;
  const L=((M+1.916*Math.sin(M*rad)+.020*Math.sin(2*M*rad)+282.634)%360+360)%360;
  let RA=Math.atan(.91764*Math.tan(L*rad))/rad;RA=(RA+360)%360;
  RA=(RA+Math.floor(L/90)*90-Math.floor(RA/90)*90)/15;
  const sinDec=.39782*Math.sin(L*rad),cosDec=Math.cos(Math.asin(sinDec));
  const cosH=(Math.cos(90.833*rad)-sinDec*Math.sin(-33.8688*rad))/(cosDec*Math.cos(-33.8688*rad));
  let H=Math.acos(Math.max(-1,Math.min(1,cosH)))/rad;if(rise)H=360-H;
  return ((H/15+RA-.06571*t-6.622-lng)%24+24)%24*60;
 }
 function sunTimes(date){
  const p=parts(date,zone),base=Date.UTC(+p.year,+p.month-1,+p.day);
  const offset=(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute)-Math.floor(date.getTime()/60000)*60000)/60000;
  return {rise:(solarUTC(+p.year,+p.month,+p.day,true)+offset+1440)%1440,set:(solarUTC(+p.year,+p.month,+p.day,false)+offset+1440)%1440,minute:+p.hour*60+ +p.minute};
 }
 function theme(mode,date){if(mode==='light'||mode==='dark')return mode;const s=sunTimes(date);return s.minute>=s.rise&&s.minute<s.set?'light':'dark';}
 function sparkline(values){if(values.length<2||values.some(v=>!Number.isFinite(v)))return '';const lo=Math.min(...values),span=Math.max(...values)-lo||1;return values.map((v,i)=>`${(i/(values.length-1)*96+2).toFixed(1)},${(23-(v-lo)/span*20).toFixed(1)}`).join(' ');}
 function meaningfulChange(before,after){return ['score','bias','rationale','rank'].some(k=>before[k]!==after[k]);}
 const api={zone,clock,dayOffset,dateKey,sunTimes,theme,sparkline,meaningfulChange};
 if(typeof module!=='undefined')module.exports=api;else root.DashboardCore=api;
})(typeof window==='undefined'?globalThis:window);
