/* Offline prototype. Every market/weather/research value below is illustrative. */
'use strict';
const C=window.DashboardCore,$=id=>document.getElementById(id);
const defaults={theme:'auto',scroll:true,rotate:false,ticker:true};
let settings={...defaults},readIds=[];
try{settings={...defaults,...JSON.parse(localStorage.getItem('display')||'{}')};readIds=JSON.parse(localStorage.getItem('read')||'[]');}catch(e){}
const save=()=>{try{localStorage.setItem('display',JSON.stringify(settings));localStorage.setItem('read',JSON.stringify(readIds));}catch(e){}};
const assets=[
 {symbol:'SOL',glyph:'≋',price:'122.04',score:89,bias:'LONG',change:3.2,values:[10,12,11,14,13,17,15,16,20,18,22,19,23,25,23,27,28,27,31,30]},
 {symbol:'BTC',glyph:'₿',price:'64,280',score:89,bias:'SHORT',change:-1.4,values:[30,29,31,27,29,25,24,25,21,23,20,22,18,20,17,14,17,15,13,12]},
 {symbol:'ETH',glyph:'◇',price:'2,640',score:87,bias:'LONG',change:2.1,values:[12,13,12,14,13,18,16,20,19,23,21,24,22,25,28,27,29,26,30,31]},
 {symbol:'SUI',glyph:'S',price:'1.82',score:89,bias:'LONG',change:-.8,values:[29,28,30,26,28,24,23,25,21,22,20,22,19,21,17,19,16,18,15,16]},
 {symbol:'TAO',glyph:'τ',price:'312.80',score:86,bias:'LONG',change:4.6,values:[7,10,9,12,11,16,18,16,19,21,20,23,26,24,26,30,29,31,34,33]},
 {symbol:'PENDLE',glyph:'P',price:'4.18',score:86,bias:'LONG',change:1.7,values:[12,15,14,16,19,17,18,16,21,20,22,19,22,24,21,26,25,27,26,29]},
 {symbol:'NVDA',glyph:'N',price:'128.50',score:null,bias:'—',change:2.4,values:[12,14,13,16,17,15,19,18,22,20,24,23,22,26,25,29,27,29,28,32]},
 {symbol:'GLD',glyph:'G',price:'238.20',score:null,bias:'—',change:.6,values:[17,18,16,19,20,18,21,20,19,22,20,24,21,22,23,21,24,23,25,24]}
];
const briefings=[
 {id:'morning',title:'Your morning, in three points',sub:'A preview of the summaries Hermes will send here.',body:['This is a sample briefing, not a current news report.','Your chosen watchlist, Sydney weather and family clocks share one glanceable home screen.','Hermes will publish short summaries with original source links and publication timestamps.','No live connection is configured in this prototype.']},
 {id:'research',title:'What changed on your watchlist',sub:'Score changes, new evidence and ideas worth revisiting.',body:['This is illustrative content for the Briefings page.','A future MoneyTrail adapter will preserve the original score, direction and independent data timestamps.','Refreshing this screen will never make old research appear current.']}
];
let page='home',lastTouch=0,pageSince=performance.now(),scrollComplete=false,scrollHoldUntil=performance.now()+3000,atBottom=false;
let reminder=null;
try{reminder=JSON.parse(localStorage.getItem('demo-reminder')||'null');}catch(e){}
function persistReminder(){try{localStorage.setItem('demo-reminder',JSON.stringify(reminder));}catch(e){}}
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function showDetail(label,title,paragraphs,actions=[]){
 $('detail-label').textContent=label;$('detail-title').textContent=title;$('detail-body').replaceChildren();$('detail-actions').replaceChildren();
 paragraphs.forEach(p=>$('detail-body').append(make('p','',p)));
 actions.forEach(a=>{const b=make('button','',a.title);b.onclick=a.run;$('detail-actions').append(b);});
 $('detail').showModal();
}
assets.forEach(a=>{
 const row=make('button','watch-row watch-grid');row.setAttribute('aria-label',`${a.symbol}, sample price ${a.price} US dollars, score ${a.score??'unavailable'}, ${a.bias}`);
 const asset=make('span','asset');asset.append(make('span',`coin coin-${a.symbol.toLowerCase()}`,a.glyph),make('span','',a.symbol));
 row.append(asset,make('span','price',`$${a.price}`),make('span','score',a.score??'—'),make('span',`bias ${a.bias==='SHORT'?'down':a.bias==='LONG'?'up':''}`,a.bias));
 const trend=make('span',`trend ${a.change>=0?'up':'down'}`),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 svg.setAttribute('viewBox','0 0 100 26');svg.setAttribute('class','spark');svg.setAttribute('aria-hidden','true');line.setAttribute('points',C.sparkline(a.values));svg.append(line);
 trend.append(svg,make('span','change',`${a.change>0?'+':''}${a.change.toFixed(1)}%`));row.append(trend);
 row.onclick=()=>showDetail('DEMO WATCHLIST · NOT LIVE',`${a.symbol} / ${a.score??'Unscored'}${a.score===null?'':' / 100'}`,['These prices, scores and seven-day charts are sample values for testing the interface.',`Research direction: ${a.bias}. Direction and recent price movement are separate measures.`,a.score===null?'No sample score is supplied. Missing research stays unavailable rather than becoming zero.':'The production app will use the existing MoneyTrail composite score without recalculating it.']);
 $('watch-rows').append(row);
});
[['SOL',89,'LONG','Consolidated research idea. Review the source evidence before interpreting the score.'],['BTC',89,'SHORT','High score, different direction. A ranking is not a buy instruction.']].forEach(a=>idea('top-ideas',a,false));
[['ETH',87,'LONG','Illustrative change: composite score increased from 82 to 87.'],['SUI',89,'LONG','Illustrative change: new supporting research added.']].forEach(a=>idea('changed-ideas',a,true));
function idea(target,a,changed){const b=make('button','idea-card'),top=make('div','idea-card-top');top.append(make('span','idea-symbol',a[0]),make('span',`bias ${a[2]==='LONG'?'up':'down'}`,a[2]));const score=make('span','idea-score',a[1]);score.append(make('small','',' /100'));top.append(score);b.append(top,make('p','',a[3]),make('div','idea-meta',changed?'DEMO CHANGE · SOURCE NOT CONNECTED':'RESEARCH · DEMO SCORE'));b.onclick=()=>showDetail('MONEYTRAIL PREVIEW · DEMO',a[0], [a[3],'Live rank, evidence age and price timestamps will come from MoneyTrail. No orders or agent actions are available in this version.']);$(target).append(b);}
function renderBriefings(){
 $('briefing-list').replaceChildren();briefings.forEach((b,i)=>{const row=make('button','briefing-row'),copy=make('div');copy.append(make('strong','',b.title),make('p','',b.sub));row.append(make('span','briefing-number',String(i+1).padStart(2,'0')),copy,make('span','new-label',readIds.includes(b.id)?'READ':'NEW'));row.onclick=()=>openBriefing(b);$('briefing-list').append(row);});
 const count=briefings.filter(b=>!readIds.includes(b.id)).length;$('unread').textContent=count||'';
}
function openBriefing(b){if(!readIds.includes(b.id))readIds.push(b.id);save();renderBriefings();showDetail('HERMES PREVIEW · DEMO CONTENT',b.title,b.body);}
function renderTicker(){
 const active=reminder&&(!reminder.snoozedUntil||Date.now()>=reminder.snoozedUntil);
 $('ticker').classList.toggle('reminder',!!active);$('ticker').querySelector('use').setAttribute('href',active?'#bell':'#news');$('ticker').querySelector('.ticker-label').textContent=active?'REMINDER':'HERMES';
 $('ticker-text').textContent=active?'Demo · Put the bins out':'Demo briefing · Your morning, in three points  /  Research changes for your watchlist';
 $('ticker-text').classList.toggle('running',!active&&settings.ticker);$('ticker-count').textContent=active?'1/1':'›';
 $('ticker').onclick=()=>active?showDetail('LOCAL DEMONSTRATION', 'Put the bins out', ['This is a demo reminder stored only on this phone. It is not connected to Hermes.'],[{title:'Done',run:()=>{reminder=null;persistReminder();$('detail').close();renderTicker();}},{title:'Snooze 10 min',run:()=>{reminder.snoozedUntil=Date.now()+600000;persistReminder();$('detail').close();renderTicker();}}]):openBriefing(briefings[0]);
}
function switchPage(next){page=next;document.querySelectorAll('.page').forEach(n=>n.classList.toggle('active',n.id===`page-${next}`));document.querySelectorAll('[data-page]').forEach(n=>{n.classList.toggle('selected',n.dataset.page===next);n.setAttribute('aria-current',n.dataset.page===next?'page':'false');});pageSince=performance.now();if(next==='home'){$('watch-scroll').scrollTop=0;scrollComplete=false;atBottom=false;scrollHoldUntil=performance.now()+3000;}}
document.querySelectorAll('[data-page]').forEach(n=>n.onclick=()=>switchPage(n.dataset.page));
const sequence=['home','ideas','briefings'];let start=null;
$('pages').addEventListener('touchstart',e=>{start={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
$('pages').addEventListener('touchend',e=>{if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.7)switchPage(sequence[(sequence.indexOf(page)+(dx<0?1:2))%3]);start=null;},{passive:true});
document.addEventListener('pointerdown',()=>{lastTouch=performance.now();});
document.addEventListener('keydown',e=>{lastTouch=performance.now();if($('detail').open||$('settings').open)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft')switchPage(sequence[(sequence.indexOf(page)+(e.key==='ArrowRight'?1:2))%3]);});
function applySettings(){save();document.documentElement.dataset.theme=C.theme(settings.theme,new Date());$('theme-label').textContent=settings.theme.toUpperCase();$('theme-select').value=settings.theme;$('scroll-setting').checked=settings.scroll;$('rotate-setting').checked=settings.rotate;$('ticker-setting').checked=settings.ticker;renderTicker();}
$('theme-toggle').onclick=()=>{const modes=['auto','light','dark'];settings.theme=modes[(modes.indexOf(settings.theme)+1)%3];applySettings();};
$('theme-select').onchange=e=>{settings.theme=e.target.value;applySettings();};
[['scroll-setting','scroll'],['rotate-setting','rotate'],['ticker-setting','ticker']].forEach(([id,key])=>$(id).onchange=e=>{settings[key]=e.target.checked;pageSince=performance.now();applySettings();});
$('settings-open').onclick=()=>$('settings').showModal();$('settings-close').onclick=()=>$('settings').close();$('detail-close').onclick=()=>$('detail').close();
for(const id of ['detail','settings'])$(id).addEventListener('close',()=>{lastTouch=performance.now();});
$('demo-reminder').onclick=()=>{reminder={snoozedUntil:0};persistReminder();renderTicker();$('settings').close();};
function tick(){const now=new Date();$('local-time').textContent=C.clock(now,C.zone);$('local-date').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:C.zone,weekday:'short',day:'numeric',month:'short'}).format(now).replace(',','').toUpperCase();$('family-clocks').replaceChildren();for(const [name,tz] of [['London','Europe/London'],['Marseille','Europe/Paris'],['Minsk','Europe/Minsk']]){const row=make('div','family-row'),right=make('span'),time=make('time','',C.clock(now,tz));right.append(time);const diff=C.dayOffset(now,tz);if(diff)right.append(make('span','date-offset',`${diff>0?'+':''}${diff}d`));row.append(make('span','',name),right);$('family-clocks').append(row);}document.documentElement.dataset.theme=C.theme(settings.theme,now);const sun=C.sunTimes(now),fmt=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(Math.floor(n%60)).padStart(2,'0')}`;$('sun-times').textContent=`Sydney sun ≈ ${fmt(sun.rise)}–${fmt(sun.set)}`;if(reminder?.snoozedUntil&&Date.now()>=reminder.snoozedUntil){reminder.snoozedUntil=0;persistReminder();renderTicker();}}
let previous=performance.now(),scrollRemainder=0;
function animate(now){const dt=Math.min(now-previous,100);previous=now;const paused=now-lastTouch<15000||$('detail').open||$('settings').open||document.hidden;const scroll=$('watch-scroll'),max=scroll.scrollHeight-scroll.clientHeight;
 $('scroll-status').textContent=!settings.scroll?'MANUAL SCROLL':paused?'Ⅱ TOUCH PAUSED':'↕ AUTO SCROLL';
 if(page==='home'&&max<=1)scrollComplete=true;
 if(page==='home'&&settings.scroll&&!paused&&now>scrollHoldUntil&&max>1){
  if(atBottom){scroll.scrollTop=0;atBottom=false;scrollHoldUntil=now+3000;}
  else if(scroll.scrollTop>=max-1){scrollComplete=true;atBottom=true;scrollHoldUntil=now+4000;}
  else {scrollRemainder+=dt*.012;const pixels=Math.floor(scrollRemainder);if(pixels){scroll.scrollTop+=pixels;scrollRemainder-=pixels;}}
 }
 if(settings.rotate&&!paused&&now-pageSince>30000&&(page!=='home'||scrollComplete||!settings.scroll))switchPage(sequence[(sequence.indexOf(page)+1)%3]);
 requestAnimationFrame(animate);
}
renderBriefings();applySettings();tick();setInterval(tick,1000);requestAnimationFrame(animate);
