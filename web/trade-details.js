'use strict';
// Illustrative only; live records always come from the Mac and never inherit these levels.
const demoIdeas=[
 {symbol:'SOL',score:89,bias:'LONG',state:'research',title:'SOL · network activity thesis',price:122.04,entry_min:112,entry_max:118,stop_loss:104,take_profit_1:140,take_profit_2:155,take_profit_3:null,do_not_chase_above:125,thesis:'Illustrative thesis: sustained network activity could support demand. This is example text for exploring the detail view, not current research.',why_now:'Demo catalyst: review the next network activity release.',what_to_watch:'Activity, liquidity and whether price returns to the planned entry zone.',invalidation:'Demo: activity weakens and the stated support level fails.',levels_freshness_status:'demo',source:'Demo research',thesis_score:18,entry_score:16},
 {symbol:'BTC',score:89,bias:'SHORT',state:'research',title:'BTC · downside scenario',price:64280,entry_min:65000,entry_max:67000,stop_loss:70000,take_profit_1:60000,take_profit_2:56000,thesis:'Illustrative opposing market scenario. A high score represents the source ranking, not a long recommendation.',why_now:'Demo: watch the next liquidity update.',invalidation:'Demo: price holds above the scenario’s resistance.',source:'Demo research'},
 {symbol:'ETH',score:87,bias:'LONG',state:'research',title:'ETH · research update',price:2640,entry_min:2500,entry_max:2600,stop_loss:2350,take_profit_1:2900,thesis:'Illustrative research update with an entry zone and explicit invalidation.',what_to_watch:'Confirmation from new evidence.',source:'Demo research'},
 {symbol:'SUI',score:89,bias:'LONG',state:'research',title:'SUI · emerging thesis',price:1.82,thesis:'Illustrative thesis with no supplied trade levels. Missing levels remain blank.',source:'Demo research'}
];
function tradeMoney(value){return typeof value==='number'&&Number.isFinite(value)?'$'+value.toLocaleString('en-US',{maximumFractionDigits:Math.abs(value)<1?6:2}):'—';}
function entryText(a){return a.entry_min!=null&&a.entry_max!=null?`${tradeMoney(a.entry_min)} – ${tradeMoney(a.entry_max)}`:a.ideal_entry!=null?tradeMoney(a.ideal_entry):a.entry_min!=null?`From ${tradeMoney(a.entry_min)}`:a.entry_max!=null?`Up to ${tradeMoney(a.entry_max)}`:'Not supplied';}
function tradeCard(a,list,demo=false){
 const b=make('button','idea-card'),top=make('div','idea-card-top');
 top.append(make('span','idea-symbol',a.symbol),make('span',`bias ${a.bias==='SHORT'?'down':'up'}`,a.bias||'—'));
 const score=make('span','idea-score',a.score??'—');score.append(make('small','',' /100'));top.append(score);
 b.append(top,make('p','idea-teaser',a.thesis||a.why_now||a.title||'No thesis supplied.'));
 const levels=make('div','card-entry');levels.append(make('span','','ENTRY'),make('strong','',entryText(a)));b.append(levels);
 b.append(make('div','idea-meta',`${demo?'DEMO · ':''}${(a.state||'research').replaceAll('_',' ').toUpperCase()}${a.conflict?' · CONFLICTING VIEWS':''} · DETAILS →`));
 b.onclick=()=>openTradeIdea(a,list,demo);return b;
}
function openTradeIdea(initial,list=[initial],demo=false){
 let index=Math.max(0,list.indexOf(initial)),tab='Overview';
 const dialog=$('detail');
 function draw(){
  const a=list[index];if(!a)return;
  dialog.classList.add('trade-detail');$('detail-label').textContent=demo?'DEMO IDEA · ILLUSTRATIVE ONLY':'MONEYTRAIL · RESEARCH ONLY';
  $('detail-title').textContent=`${a.symbol} / ${a.bias||'—'}`;
  const body=$('detail-body');body.replaceChildren();$('detail-actions').replaceChildren();
  const summary=make('div','trade-summary');summary.append(make('strong','trade-score',`${a.score??'—'} / 100`),make('span','',`${(a.state||'research').replaceAll('_',' ')} · ${tab==='Levels'?'LEVELS: '+(demo?'DEMO':a.levels_freshness_status||'UNKNOWN'):a.title||a.symbol}`));body.append(summary);
  const tabs=make('div','trade-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Idea details');
  const content=make('div','trade-content');content.id='trade-panel';content.setAttribute('role','tabpanel');content.tabIndex=0;
  for(const name of ['Overview','Levels','Thesis','Sources']){
   const b=make('button',name===tab?'active':'',name);b.id='trade-tab-'+name.toLowerCase();b.setAttribute('role','tab');b.setAttribute('aria-selected',String(name===tab));b.setAttribute('aria-controls','trade-panel');
   b.tabIndex=name===tab?0:-1;
   b.onclick=()=>{tab=name;draw();document.getElementById(b.id).focus();};
   b.onkeydown=e=>{const names=['Overview','Levels','Thesis','Sources'];let next;if(e.key==='ArrowRight')next=(names.indexOf(tab)+1)%4;if(e.key==='ArrowLeft')next=(names.indexOf(tab)+3)%4;if(e.key==='Home')next=0;if(e.key==='End')next=3;if(next!==undefined){e.preventDefault();tab=names[next];draw();document.getElementById('trade-tab-'+tab.toLowerCase()).focus();}};
   tabs.append(b);
  }
  content.setAttribute('aria-labelledby','trade-tab-'+tab.toLowerCase());body.append(tabs,content);
  function section(label,text,kind=''){const box=make('section','trade-section '+kind);box.append(make('h3','',label),make('p','',text||'Not supplied by the source.'));content.append(box);}
  function tile(grid,label,value,kind=''){const box=make('div','level-tile '+kind);box.append(make('span','',label),make('strong','',value));grid.append(box);}
  if(tab==='Overview'){
   if(demo)section('Demo preview','These entries, prices and text are examples, not live trade research.','trade-caution');
   if(a.conflict)section('Conflicting directions','MoneyTrail has both long and short views. Read the alternative thesis below.','trade-caution');
   const grid=make('div','level-grid');tile(grid,'MARKET · USD',tradeMoney(a.price));tile(grid,'ENTRY ZONE',entryText(a));tile(grid,'STOP LOSS',tradeMoney(a.stop_loss),'down');content.append(grid);
   section('Thesis',a.thesis||a.title);section('Why now',a.why_now);
   section('Freshness',demo?'Illustrative data only.':`Quote: ${a.price_as_of||'not supplied'} (${a.price_status||'unknown'}). Evidence: ${a.evidence_as_of||'not supplied'} (${a.evidence_status||'unknown'}).`);
   if(a.actionability_reason)section('Source assessment',a.actionability_reason);
  }else if(tab==='Levels'){
   const grid=make('div','level-grid');tile(grid,'ENTRY ZONE',entryText(a));tile(grid,'STOP LOSS',tradeMoney(a.stop_loss),'down');tile(grid,'DO NOT CHASE ABOVE',tradeMoney(a.do_not_chase_above));for(let i=1;i<=3;i++)tile(grid,`TARGET ${i}`,tradeMoney(a['take_profit_'+i]),'up');content.append(grid);
   section('Level freshness',demo?'Demo levels — not a trading plan.':`${a.levels_freshness_status||'Unknown'} · revalidated ${a.levels_last_revalidated_at||'not supplied'}. ${a.levels_review_reason||''}`,a.levels_freshness_status==='fresh'?'':'trade-caution');
   section('Invalidation · what breaks the thesis',a.invalidation,'trade-caution');section('Trailing exit',a.trailing_exit_trigger);
   if(a.expires_at)section('Source expiry',a.expires_at);
  }else if(tab==='Thesis'){
   section('Investment thesis',a.thesis);section('Why now / catalyst',a.why_now);section('What to watch',a.what_to_watch);section('Invalidation',a.invalidation,'trade-caution');
   section('Source’s next step · information only',a.next_action);
   for(const other of a.other_views||[])section(`Other view · ${other.direction||'unspecified'} · ${other.source||'source unknown'}`,`${other.thesis||other.title||'Thesis not supplied.'}${other.invalidation?' Invalidation: '+other.invalidation:''}`);
  }else{
   section('Source',`${a.source||'Not supplied'}${a.source_url?'\n'+a.source_url:''}`);
   for(const source of a.source_details||[])section(source.source||'Supporting source',[source.author,source.notes,source.confirmed_at,source.source_url].filter(Boolean).join('\n'));
   section('Research timestamps',`Evidence: ${a.evidence_as_of||'not supplied'}. Reviewed: ${a.reviewed_at||'not supplied'}. Score calculation time is not supplied; fetching data does not make the research newer.`);
   section('Quote provenance',`${a.price_source||'Source unknown'} · ${a.price_as_of||'undated'} · ${a.price_status||'unknown status'}.`);
   section('Chart history',`${a.chart_status||'Unavailable'} · last daily close ${a.chart_as_of||'not supplied'}. Seven-day returns use daily closes, not the current quote.`);
   if(a.evidence_review_reason)section('Evidence review',a.evidence_review_reason);
   const scores=make('div','score-components');
   for(const [key,label,max] of [['thesis_score','Thesis',20],['entry_score','Entry',20],['risk_reward_score','Risk / reward',15],['catalyst_score','Catalyst',15],['source_score','Source quality',15],['liquidity_score','Liquidity',10],['portfolio_fit_score','Portfolio fit',5]]){const line=make('div','');line.append(make('span','',label),make('strong','',`${a[key]??'—'} / ${max}`));scores.append(line);}content.append(scores);
  }
  const previous=make('button','','← Previous'),next=make('button','','Next →');previous.disabled=index===0;next.disabled=index===list.length-1;
  previous.onclick=()=>{index--;draw();};next.onclick=()=>{index++;draw();};
  $('detail-actions').append(previous,make('span','trade-position',`${index+1} / ${list.length}`),next);
 }
 draw();if(!dialog.open)dialog.showModal();
}
// Replace prototype idea cards with the same drill-down interaction, clearly marked demo.
$('top-ideas').replaceChildren(...demoIdeas.slice(0,2).map(a=>tradeCard(a,demoIdeas,true)));
$('changed-ideas').replaceChildren(...demoIdeas.slice(2).map(a=>tradeCard(a,demoIdeas,true)));
