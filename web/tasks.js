'use strict';
// One durable state document holds the last server snapshot and ordered local outbox.
let taskState={server:null,pending:[],message:''},sending=null,lastTaskRender='';
try{const saved=JSON.parse(localStorage.getItem('tasks-v1')||'null');if(saved?.pending&&Array.isArray(saved.pending))taskState=saved;}catch(e){}
function saveTasks(){localStorage.setItem('tasks-v1',JSON.stringify(taskState));}
function taskItems(){
 const items=(taskState.server?.items||[]).map(x=>({...x}));
 for(const op of taskState.pending){const item=items.find(i=>i.id===op.id);if(!item||item.revision>op.expected_revision)continue;if(op.action==='reminder_done')item.completed=1;if(op.action==='reminder_snooze')item.due_at=op.due_at;if(op.action==='shopping_set')item.completed=op.completed?1:0;item.revision=op.expected_revision+1;}
 return items;
}
function dueReminders(){return taskItems().filter(i=>i.kind==='reminder'&&!i.completed&&Date.parse(i.due_at)<=Date.now()).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at)||a.id.localeCompare(b.id));}
function taskTime(value){return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}
function queueTask(item,action,fields={}){
 const op={request_id:`phone-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(3)),v=>v.toString(16)).join('')}`,id:item.id,expected_revision:item.revision,action,...fields};
 taskState.pending.push(op);taskState.message='';
 try{saveTasks();}catch(e){taskState.pending.pop();taskState.message='Could not save this action. Please try again.';renderTasks(true);return;}
 renderTasks(true);flushTasks();
}
function flushTasks(){
 if(!taskState.pending.length||!window.DashboardNative?.sendAction)return;
 if(sending&&Date.now()-sending.started<30000)return;
 sending={id:taskState.pending[0].request_id,started:Date.now()};
 window.DashboardNative.sendAction(JSON.stringify(taskState.pending[0]));
}
window.acceptTasks=data=>{
 if(!data?.instance||!Array.isArray(data.items))return;
 if(taskState.server&&data.instance!==taskState.server.instance){taskState.pending=[];sending=null;taskState.message='Mac task storage changed. Pending actions were cleared; please review the list.';}
 taskState.server=data;
 // A successful server mutation followed by a lost reply must not apply twice.
 // Pending actions remain until their idempotent request receives an acknowledgement.
 try{saveTasks();}catch(e){taskState.message='Offline storage unavailable.';}
 renderTasks(true);flushTasks();
};
window.receiveTaskAction=(data,error)=>{
 const op=taskState.pending[0];if(!op){sending=null;return;}
 if(error&&error!=='invalid_action'){sending=null;taskState.message='Saved on phone · waiting to sync';renderTasks(true);return;}
 if(data?.result?.request_id&&data.result.request_id!==op.request_id)return;
 sending=null;
 if(data?.tasks)taskState.server=data.tasks;
 if(error==='invalid_action'||data?.result?.status!=='ok'){
  taskState.pending=taskState.pending.filter(x=>x.id!==op.id);
  taskState.message='This item changed on the Mac or the action was rejected. Review it and try again.';
 }else{taskState.pending.shift();taskState.message='';}
 try{saveTasks();}catch(e){taskState.message='Offline storage unavailable; reconnect before closing.';}
 renderTasks(true);setTimeout(flushTasks,100);
};
window.clearTasks=()=>{taskState={server:null,pending:[],message:''};sending=null;localStorage.removeItem('tasks-v1');renderTasks(true);};
function openReminder(item){showDetail('REMINDER · SYDNEY TIME',item.title,[`Due ${taskTime(item.due_at)}.`,taskState.pending.length?'Changes are saved on this phone until acknowledged by the Mac.':''],[{title:'Done',run:()=>{queueTask(item,'reminder_done');$('detail').close();}},{title:'Snooze 10 min',run:()=>{queueTask(item,'reminder_snooze',{due_at:new Date(Date.now()+600000).toISOString()});$('detail').close();}}]);}
window.renderReminderTicker=()=>{
 const due=dueReminders();if(!due.length)return false;
 $('ticker').classList.add('reminder');$('ticker').querySelector('use').setAttribute('href','#bell');$('ticker').querySelector('.ticker-label').textContent='REMINDER';$('ticker-text').textContent=due[0].title;$('ticker-text').classList.remove('running');$('ticker-count').textContent=String(due.length);$('ticker').onclick=()=>{switchPage('home');openReminder(due[0]);};return true;
};
function renderTasks(force=false){
 const items=taskItems(),due=dueReminders(),shopping=items.filter(i=>i.kind==='shopping');
 window.hasDueReminder=due.length>0;
 const signature=JSON.stringify([items,due.map(i=>i.id),taskState.pending.length,taskState.message]);if(!force&&signature===lastTaskRender)return;lastTaskRender=signature;
 const card=$('due-reminder');card.replaceChildren();card.hidden=!due.length;$('page-home').classList.toggle('has-reminder',!!due.length);
 if(due.length){const item=due[0],copy=make('button','reminder-copy');copy.append(make('span','eyebrow',`REMINDER · ${taskTime(item.due_at)}${due.length>1?' · +'+(due.length-1)+' MORE':''}`),make('strong','',item.title));copy.onclick=()=>openReminder(item);const done=make('button','task-primary','Done'),snooze=make('button','task-secondary','Snooze 10 min');done.onclick=()=>queueTask(item,'reminder_done');snooze.onclick=()=>queueTask(item,'reminder_snooze',{due_at:new Date(Date.now()+600000).toISOString()});card.append(copy,done,snooze);}
 const remaining=shopping.filter(i=>!i.completed).length;$('shopping-count').textContent=`/ ${remaining} TO GET`;$('shopping-badge').textContent=remaining||'';
 $('tasks-status').textContent=taskState.message||(taskState.pending.length?`${taskState.pending.length} SAVED · SYNC PENDING`:taskState.server?'SYNCED WITH MAC':'PAIR TO SYNC');
 const list=$('shopping-list');list.replaceChildren();
 if(!shopping.length)list.append(make('p','settings-note',taskState.server?'Your shopping list is empty. Ask Hermes in Telegram to add something.':'Shopping items will appear here after pairing with the updated Hermes Mac.'));
 shopping.sort((a,b)=>a.completed-b.completed||a.created_at.localeCompare(b.created_at)).forEach(item=>{const row=make('div','shopping-row'+(item.completed?' checked':'')),button=make('button','shopping-check',item.completed?'✓':'○');button.setAttribute('aria-label',`${item.completed?'Undo':'Check off'} ${item.title}`);button.onclick=()=>queueTask(item,'shopping_set',{completed:!item.completed});row.append(button,make('span','shopping-title',item.title));if(item.completed){const undo=make('button','shopping-undo','Undo');undo.onclick=()=>queueTask(item,'shopping_set',{completed:false});row.append(undo);}list.append(row);});
 if(window.liveMode)renderLiveTicker();else if(due.length)window.renderReminderTicker();
}
$('upcoming-reminders').onclick=()=>{const reminders=taskItems().filter(i=>i.kind==='reminder'&&!i.completed).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at));$('settings').close();showDetail('REMINDERS · SYDNEY TIME','Upcoming & overdue',reminders.length?reminders.map(i=>`${taskTime(i.due_at)} — ${i.title}`):['No active reminders. Ask Hermes to create one in Telegram.']);};
renderTasks();setInterval(renderTasks,1000);setInterval(flushTasks,5000);
