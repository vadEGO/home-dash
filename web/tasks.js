'use strict';
// One durable state document holds the last server snapshot and ordered local outbox.
let taskState={server:null,pending:[],message:''},sending=null,lastTaskRender='';
try{const saved=JSON.parse(localStorage.getItem('tasks-v1')||'null');if(saved?.pending&&Array.isArray(saved.pending))taskState=saved;}catch(e){}
function saveTasks(){localStorage.setItem('tasks-v1',JSON.stringify(taskState));}
function taskItems(){
 const items=(taskState.server?.items||[]).map(x=>({...x}));
 for(const op of taskState.pending){
  if(op.action==='reminder_add'||op.action==='shopping_add'){
   if(!items.some(i=>i.id===op.id))items.push({id:op.id,kind:op.action==='reminder_add'?'reminder':'shopping',title:op.title,due_at:op.due_at||null,completed:0,revision:1,created_at:op.created_at});
   continue;
  }
  const item=items.find(i=>i.id===op.id);if(!item||item.revision>op.expected_revision)continue;
  if(op.action==='reminder_done')item.completed=1;if(op.action==='reminder_snooze')item.due_at=op.due_at;if(op.action==='shopping_set')item.completed=op.completed?1:0;item.revision=op.expected_revision+1;
 }
 return items;
}
function dueReminders(){return taskItems().filter(i=>i.kind==='reminder'&&!i.completed&&Date.parse(i.due_at)<=Date.now()).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at)||a.id.localeCompare(b.id));}
function taskTime(value){return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Sydney',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}
function taskID(){return `phone-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(3)),v=>v.toString(16)).join('')}`;}
function queueTask(item,action,fields={}){
 const op={request_id:taskID(),id:item.id,expected_revision:item.revision,action,...fields};
 taskState.pending.push(op);taskState.message='';
 try{saveTasks();}catch(e){taskState.pending.pop();taskState.message='Could not save this action. Please try again.';renderTasks(true);return false;}
 renderTasks(true);flushTasks();return true;
}
function flushTasks(){
 if(!taskState.pending.length||taskState.blockedRequest===taskState.pending[0].request_id||!window.DashboardNative?.sendAction)return;
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
 if(error==='invalid_action'&&(op.action==='reminder_add'||op.action==='shopping_add')){
  taskState.blockedRequest=op.request_id;taskState.message='New item kept on phone. Update the Mac service or resolve its limit, then Retry sync.';
  try{saveTasks();}catch(e){}renderTasks(true);return;
 }
 if(error==='invalid_action'||data?.result?.status!=='ok'){
  taskState.pending=taskState.pending.filter(x=>x.id!==op.id);
  taskState.message='This item changed on the Mac or the action was rejected. Review it and try again.';
 }else{
  taskState.pending.shift();taskState.message='';
  // Server shopping deduplication can return an existing item with a different ID.
  if((op.action==='shopping_add'||op.action==='reminder_add')&&data.result.item){
   let revision=data.result.item.revision;
   for(const next of taskState.pending)if(next.id===op.id){next.id=data.result.item.id;next.expected_revision=revision++;}
  }
 }
 try{saveTasks();}catch(e){taskState.message='Offline storage unavailable; reconnect before closing.';}
 renderTasks(true);setTimeout(flushTasks,100);
};
window.prepareTaskPairing=()=>{if(taskState.server)window.clearTasks();};
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
 $('tasks-retry').hidden=!taskState.pending.length;
 const remaining=shopping.filter(i=>!i.completed).length;$('shopping-count').textContent=`/ ${remaining} TO GET`;$('shopping-badge').textContent=remaining||'';
 $('tasks-status').textContent=taskState.message||(taskState.pending.length?`${taskState.pending.length} SAVED · SYNC PENDING`:taskState.server?'SYNCED WITH MAC':'LOCAL · PAIR TO SYNC');
 const list=$('shopping-list');list.replaceChildren();
 if(!shopping.length)list.append(make('p','settings-note',taskState.server?'Your shopping list is empty. Add an item here or ask Hermes in Telegram.':'Add an item here now. Pair with the Hermes Mac whenever you want to sync.'));
 shopping.sort((a,b)=>a.completed-b.completed||a.created_at.localeCompare(b.created_at)).forEach(item=>{const row=make('div','shopping-row'+(item.completed?' checked':'')),button=make('button','shopping-check',item.completed?'✓':'○');button.setAttribute('aria-label',`${item.completed?'Undo':'Check off'} ${item.title}`);button.onclick=()=>queueTask(item,'shopping_set',{completed:!item.completed});row.append(button,make('span','shopping-title',item.title));if(item.completed){const undo=make('button','shopping-undo','Undo');undo.onclick=()=>queueTask(item,'shopping_set',{completed:false});row.append(undo);}list.append(row);});
 renderReminderList();
 if(window.liveMode)renderLiveTicker();else if(due.length)window.renderReminderTicker();else renderTicker();
}
function renderReminderList(){
 const list=$('reminder-items');list.replaceChildren();
 const reminders=taskItems().filter(i=>i.kind==='reminder'&&!i.completed).sort((a,b)=>Date.parse(a.due_at)-Date.parse(b.due_at));
 if(!reminders.length)list.append(make('p','settings-note','No active reminders. Add one here or ask Hermes in Telegram.'));
 for(const item of reminders){const row=make('div','reminder-list-row'),copy=make('button','reminder-list-copy');copy.append(make('strong','',item.title),make('span','',`${taskTime(item.due_at)}${Date.parse(item.due_at)<=Date.now()?' · DUE':''}`));copy.onclick=()=>{$('reminder-list-dialog').close();openReminder(item);};const done=make('button','task-primary','Done');done.setAttribute('aria-label',`Mark ${item.title} done`);done.onclick=()=>queueTask(item,'reminder_done');row.append(copy,done);list.append(row);}
}
function showReminders(){$('settings').close();renderReminderList();$('reminder-list-dialog').showModal();}
$('upcoming-reminders').onclick=showReminders;$('manage-reminders').onclick=showReminders;
$('reminder-list-close').onclick=()=>$('reminder-list-dialog').close();
let editingTaskKind='shopping';
function sydneyInput(date){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Sydney',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;}
function sydneyDate(value){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Choose a date and time.');
 const [year,month,day,hour,minute]=value.split(/[-T:]/).map(Number),wall=Date.UTC(year,month-1,day,hour,minute),matches=[];
 // Resolve wall-clock input with Intl/IANA rules, without the device's local zone.
 for(let offset=-14*60;offset<=14*60;offset+=15){const candidate=new Date(wall-offset*60000);if(sydneyInput(candidate)===value)matches.push(candidate);}
 if(matches.length!==1)throw new Error('That Sydney time is skipped or repeated by daylight saving. Choose another time.');
 return matches[0].toISOString();
}
function showTaskEditor(kind){
 editingTaskKind=kind;$('settings').close();$('reminder-list-dialog').close();$('task-form').reset();$('task-form-error').textContent='';
 $('task-editor-label').textContent=kind==='reminder'?'ADD REMINDER':'ADD SHOPPING ITEM';$('task-time-field').hidden=kind!=='reminder';$('task-due').required=kind==='reminder';
 $('task-title').placeholder=kind==='reminder'?'e.g. Put the bins out':'e.g. Milk — 2 litres';
 if(kind==='reminder')$('task-due').value=sydneyInput(new Date(Date.now()+3600000));
 $('task-editor').showModal();$('task-title').focus();
}
$('tasks-retry').onclick=()=>{taskState.blockedRequest=null;sending=null;saveTasks();flushTasks();};
$('add-shopping').onclick=()=>showTaskEditor('shopping');$('add-reminder').onclick=()=>showTaskEditor('reminder');$('reminder-list-add').onclick=()=>showTaskEditor('reminder');
$('task-editor-close').onclick=()=>$('task-editor').close();
for(const id of ['task-editor','reminder-list-dialog'])$(id).addEventListener('close',()=>{lastTouch=performance.now();});
$('task-form').onsubmit=e=>{
 e.preventDefault();const title=$('task-title').value.trim().replace(/\s+/g,' ');
 if(!title){$('task-form-error').textContent='Enter a title.';return;}
 if(editingTaskKind==='shopping'&&taskItems().some(i=>i.kind==='shopping'&&!i.completed&&i.title.toLocaleLowerCase()===title.toLocaleLowerCase())){$('task-form-error').textContent='That item is already on your shopping list.';return;}
 let due;try{if(editingTaskKind==='reminder')due=sydneyDate($('task-due').value);}catch(error){$('task-form-error').textContent=error.message;return;}
 const id=taskID(),fields={title,created_at:new Date().toISOString()};if(due)fields.due_at=due;
 if(queueTask({id},editingTaskKind==='reminder'?'reminder_add':'shopping_add',fields)){$('task-editor').close();if(editingTaskKind==='reminder')showReminders();else switchPage('shopping');}else $('task-form-error').textContent='Could not save on this phone. Please try again.';
};
renderTasks();setInterval(renderTasks,1000);setInterval(flushTasks,5000);
