'use strict';
// Native transport owns credentials; only dashboard data enters this WebView.
window.liveMode=false;
let snapshot=null, transport='not_paired', receivedAt=null;
function age(iso){const t=Date.parse(iso);if(!Number.isFinite(t))return 'unknown';const m=Math.floor((Date.now()-t)/60000);return m<0?'future time':m<1?'now':m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;}
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
function providerStatus(p){if(!p?.data)return 'UNAVAILABLE';if(transport!=='connected')return 'CACHED · OFFLINE';if(p.error)return 'CACHED · UPDATE FAILED';const t=Date.parse(p.fetched_at);return !Number.isFinite(t)||Date.now()-t>30*60000?'CACHED · OLD':'CONNECTED';}
function renderLiveTicker(){
 if(window.renderReminderTicker?.())return;
 const b=briefings[0];$('ticker').classList.remove('reminder');$('ticker').querySelector('use').setAttribute('href','#news');$('ticker').querySelector('.ticker-label').textContent='HERMES';
 $('ticker-text').textContent=b?briefings.map(x=>x.title).join('  /  '):'Waiting for your first Hermes briefing';$('ticker-count').textContent=b?'›':'';$('ticker-text').classList.toggle('running',!!b&&settings.ticker);$('ticker').onclick=()=>b&&openBriefing(b);
}
function renderLive(){
 window.liveMode=true;
 const providers=snapshot?.providers||{},w=providers.weather,m=providers.market;
 $('connection-status').textContent=transport==='connected'?`Connected · received ${age(receivedAt)}. Refreshes every minute.`:transport==='connecting'?'Connecting to Hermes Mac…':`Connection unavailable · ${snapshot?'last saved data retained':'no saved data'}. Check Wi-Fi, service, token and certificate.`;
 const wx=w?.data;
 $('weather-status').textContent=providerStatus(w);
 $('weather-temperature').textContent=finite(wx?.temperature)?`${Math.round(wx.temperature)}°`:'—';
 const codes={0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',56:'Freezing drizzle',57:'Freezing drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',66:'Freezing rain',67:'Freezing rain',71:'Light snow',73:'Snow',75:'Heavy snow',77:'Snow grains',80:'Rain showers',81:'Rain showers',82:'Heavy showers',85:'Snow showers',86:'Snow showers',95:'Thunderstorm',96:'Thunderstorm / hail',99:'Thunderstorm / hail'};
 $('weather-conditions').textContent=wx?`${codes[wx.code]||'Weather'} · ${age(wx.as_of)}`:'Weather unavailable';
 $('weather-range').textContent=wx?`H ${finite(wx.high)?Math.round(wx.high):'—'}° / L ${finite(wx.low)?Math.round(wx.low):'—'}°`:'Open-Meteo · Sydney';
 document.querySelector('.weather-sun').style.visibility=wx?.code<=2?'visible':'hidden';
 document.querySelectorAll('.market-status').forEach(n=>n.textContent=`${providerStatus(m)} · RESEARCH ONLY`);
 $('market-freshness').textContent=`Source checked ${age(m?.checked_at)} · tap row for ages`;
 const scrollTop=$('watch-scroll').scrollTop;
 $('watch-rows').replaceChildren();
 const rows=m?.data?.assets||[];
 if(!rows.length)$('watch-rows').append(make('p','settings-note','Watchlist unavailable. Configure MoneyTrail on the Hermes Mac.'));
 rows.forEach(a=>{
  const row=make('button','watch-row watch-grid');
  const asset=make('span','asset');asset.append(make('span',`coin coin-${String(a.symbol).toLowerCase()}`,a.symbol==='BTC'?'₿':'◇'),make('span','',a.symbol));
  const quoteAge=Date.parse(a.price_as_of),old=!Number.isFinite(quoteAge)||Date.now()-quoteAge>86400000||quoteAge>Date.now()||a.price_status!=='fresh';
  const price=make('span','price',finite(a.price)?'$'+a.price.toLocaleString('en-US',{maximumFractionDigits:2}):'—');if(old)price.append(make('small','quote-age',` ${age(a.price_as_of)}`));
  row.append(asset,price,make('span','score',a.score??'—'),make('span',`bias ${a.bias==='LONG'?'up':a.bias==='SHORT'?'down':''}`,a.conflict?`${a.bias} ⚑`:a.bias));
  const trend=make('span',`trend ${finite(a.change)?a.change>=0?'up':'down':''}`);
  const chartTime=Date.parse(a.chart_as_of),hasChart=finite(a.change)&&a.values?.length>=2&&Number.isFinite(chartTime)&&Date.now()-chartTime<2*86400000;
  if(hasChart){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS('http://www.w3.org/2000/svg','polyline');svg.setAttribute('viewBox','0 0 100 26');svg.setAttribute('class','spark');line.setAttribute('points',C.sparkline(a.values));svg.append(line);trend.append(svg,make('span','change',`${a.change>0?'+':''}${a.change.toFixed(1)}%`));}else trend.append(make('span','change','—'));
  row.append(trend);row.onclick=()=>openTradeIdea(a,rows);$('watch-rows').append(row);
 });
 $('watch-scroll').scrollTop=scrollTop;
 $('top-ideas').replaceChildren();$('changed-ideas').replaceChildren();
 // Cache ages independently of fetch status. Never keep expired ideas in "top ranked".
 const ideas=(m?.data?.ideas||[]).filter(a=>{const t=Date.parse(a.price_as_of);return Number.isFinite(t)&&Date.now()-t<=7*86400000&&Date.now()>=t;});
 const changed=ideas.filter(a=>Date.parse(a.changed_at)>Date.now()-7*86400000).sort((a,b)=>Date.parse(b.changed_at)-Date.parse(a.changed_at));
 function card(target,a){$(target).append(tradeCard(a,ideas));}
 ideas.slice(0,2).forEach(a=>card('top-ideas',a));changed.slice(0,2).forEach(a=>card('changed-ideas',a));
 if(!ideas.length)$('top-ideas').append(make('p','settings-note','No current ideas with complete fresh evidence, price, levels and review.'));
 if(!changed.length)$('changed-ideas').append(make('p','settings-note','No meaningful changes observed yet. The first sync establishes a baseline.'));
 briefings=(snapshot?.briefings||[]).map(b=>({...b,sub:`Published ${age(b.published_at)}`}));
 $('briefings-status').textContent='FROM HERMES MAC';renderBriefings();renderLiveTicker();
 if(!briefings.length)$('briefing-list').append(make('p','settings-note','Hermes briefings will appear here after publication.'));
 $('demo-reminder').hidden=true;
}
window.receiveDashboard=(data,error)=>{
 if(error==='not_paired'&&!window.liveMode)return;
 if(error==='disconnected'){window.clearTasks?.();localStorage.removeItem('live-dashboard');location.reload();return;}
 if(error==='pairing_changed'){window.clearTasks?.();snapshot=null;receivedAt=null;localStorage.removeItem('live-dashboard');transport='connecting';renderLive();return;}
 if(data&&data.version===1&&data.providers){window.acceptTasks?.(data.tasks);snapshot=data;receivedAt=new Date().toISOString();transport='connected';try{localStorage.setItem('live-dashboard',JSON.stringify({snapshot,receivedAt}));}catch(e){}}
 else transport='failed';
 renderLive();
};
$('connect-mac').onclick=()=>window.DashboardNative?window.DashboardNative.configure():showDetail('ANDROID CONNECTION','Pair from the phone',['Open these settings on the Seeker. Enter the HTTPS URL, certificate fingerprint and device token from the dedicated Mac.']);
$('refresh-data').onclick=()=>window.DashboardNative?.refresh();
try{const saved=JSON.parse(localStorage.getItem('live-dashboard')||'null');if(saved?.snapshot?.version===1){snapshot=saved.snapshot;receivedAt=saved.receivedAt;transport='connecting';renderLive();}}catch(e){}
if(window.DashboardNative?.isConfigured?.()&&!window.liveMode){transport='connecting';renderLive();}
setTimeout(()=>window.DashboardNative?.refresh(),0);
setInterval(()=>{if(window.liveMode)renderLive();window.DashboardNative?.refresh();},60000);
