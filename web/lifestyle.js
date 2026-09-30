'use strict';
let brightenUntil=0,quietApplied=null;
function updateQuiet(){
 const quiet=settings.quiet&&Routines.quiet(new Date())&&Date.now()>=brightenUntil;
 document.documentElement.classList.toggle('quiet-hours',!!quiet);
 if(quiet!==quietApplied){quietApplied=quiet;window.DashboardNative?.setQuietMode?.(!!quiet);}
 $('quiet-setting').checked=!!settings.quiet;
}
$('quiet-setting').onchange=e=>{settings.quiet=e.target.checked;save();updateQuiet();};
document.addEventListener('pointerdown',()=>{if(settings.quiet&&Routines.quiet(new Date())){brightenUntil=Date.now()+120000;updateQuiet();}});
document.addEventListener('visibilitychange',()=>{quietApplied=null;updateQuiet();});
$('scan-pairing').onclick=()=>window.DashboardNative?.scanPairing?window.DashboardNative.scanPairing():showDetail('PAIR YOUR PHONE','Scan from the Seeker',['On the Hermes Mac, generate a private pairing QR using the deployment command. Open it on the Mac and scan it from these settings on the Seeker.']);
function renderToday(){
 const pending=taskState.pending.length;
 $('today-status').textContent=(window.liveMode?(transport==='connected'?`MAC · ${age(receivedAt)}`:'OFFLINE · SAVED DATA'):'DEMO · MAC NOT PAIRED')+(pending?` · ${pending} TO SYNC`:'')+(quietApplied?' · QUIET HOURS':'');
 $('today-temperature').textContent=$('weather-temperature').textContent;
 $('today-weather').textContent=$('weather-conditions').textContent;
 $('today-weather-status').textContent=$('weather-status').textContent;
 $('today-family').replaceChildren(...Array.from($('family-clocks').children,n=>n.cloneNode(true)));
 const reminders=taskItems().filter(i=>i.kind==='reminder'&&!i.completed).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at)),next=reminders[0];
 $('today-reminder-title').textContent=next?next.title:'Nothing scheduled';
 $('today-reminder-time').textContent=next?`${Date.parse(next.due_at)<=Date.now()?'DUE · ':''}${taskTime(next.due_at)}${next.repeat&&next.repeat!=='none'?' · '+next.repeat:''}`:'Tap to add a reminder';
 $('today-reminder').classList.toggle('is-due',!!next&&Date.parse(next.due_at)<=Date.now());
 $('today-reminder').onclick=()=>next?openReminder(next):showTaskEditor('reminder');
 const shopping=taskItems().filter(i=>i.kind==='shopping'&&!i.completed);
 $('today-shopping-count').textContent=`${shopping.length} ${shopping.length===1?'item':'items'} to get`;
 $('today-shopping-preview').textContent=shopping.length?shopping.slice(0,3).map(i=>`${i.title}${(i.quantity||1)>1?' ×'+i.quantity:''}`).join(' · '):'Your list is clear · tap to add';
 $('today-shopping').onclick=()=>switchPage('shopping');
 const b=briefings[0];$('today-briefing-title').textContent=b?.title||'Ready when Hermes is';
 $('today-briefing-body').textContent=b?.body?.[0]||'Your latest summary will appear here.';
 $('today-briefing-time').textContent=b?(window.liveMode?`Published ${age(b.published_at)} · tap to read`:'DEMO CONTENT · tap to read'):'Awaiting first briefing';
 $('today-briefing').onclick=()=>b?openBriefing(b):switchPage('briefings');
}
updateQuiet();renderToday();setInterval(()=>{updateQuiet();renderToday();},1000);
