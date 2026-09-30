const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:890,height:400},timezoneId:'America/Los_Angeles'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>window.DashboardNative={refresh(){},isConfigured(){return false;},sendAction(){}});
 await page.goto(pathToFileURL(path.resolve(__dirname,'../web/index.html')).href);
 await page.locator('[data-page=shopping]').click();
 await page.locator('#add-shopping').click();await page.locator('#task-title').fill('Milk');await page.locator('#task-form').getByRole('button',{name:'Save',exact:true}).click();
 assert.equal(await page.locator('.shopping-title').textContent(),'Milk');
 await page.getByRole('button',{name:'Check off Milk',exact:true}).click();
 await page.reload();await page.locator('[data-page=shopping]').click();assert.equal(await page.locator('.shopping-row.checked').count(),1);
 await page.locator('.completed-shopping summary').click();
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await page.locator('#add-shopping').click();await page.locator('#task-title').fill('  MILK  ');await page.locator('#task-form').getByRole('button',{name:'Save',exact:true}).click();
 assert.match(await page.locator('#task-form-error').textContent(),/already/);await page.locator('#task-editor-close').click();
 // First pairing retains local entries that have never belonged to a server.
 await page.evaluate(()=>receiveDashboard(null,'pairing_changed'));
 assert.equal(await page.locator('.shopping-title').textContent(),'Milk');
 await page.locator('#add-reminder').click();await page.locator('#task-title').fill('Call Mum');await page.locator('#task-due').fill('2026-12-01T20:00');
 await page.locator('#task-form').getByRole('button',{name:'Save',exact:true}).click();
 assert.equal(await page.evaluate(()=>taskState.pending.find(x=>x.action==='reminder_add').due_at),'2026-12-01T09:00:00.000Z','Sydney timezone independent of device timezone');
 await page.getByRole('button',{name:'Mark Call Mum done',exact:true}).click();
 assert.match(await page.locator('#reminder-items').textContent(),/No active/);
 await page.locator('#reminder-list-close').click();
 // DST gap is rejected locally, without discarding the form.
 await page.locator('#add-reminder').click();await page.locator('#task-title').fill('DST');await page.locator('#task-due').fill('2026-10-04T02:30');await page.locator('#task-form').getByRole('button',{name:'Save',exact:true}).click();
 assert.match(await page.locator('#task-form-error').textContent(),/daylight saving/);await page.locator('#task-editor-close').click();
 const op=await page.evaluate(()=>taskState.pending[0]);
 // A backend shopping duplicate resolves to an older item; dependent offline edits follow it.
 const existing={id:'existing',kind:'shopping',title:'Milk',completed:0,revision:4,created_at:'2026-09-01T00:00:00Z'};
 await page.evaluate(({op,item})=>receiveTaskAction({result:{request_id:op.request_id,status:'ok',item},tasks:{instance:'mac',items:[item]}},''),{op,item:existing});
 assert.deepEqual(await page.evaluate(()=>taskState.pending.slice(0,2).map(x=>[x.id,x.expected_revision])),[['existing',4],['existing',5]]);
 // A server too old to accept creates must not discard a manually entered item.
 await page.evaluate(()=>{taskState.pending=taskState.pending.filter(x=>x.action==='reminder_add');receiveTaskAction(null,'invalid_action');});
 assert.equal(await page.evaluate(()=>taskState.pending.length),1);
 assert.match(await page.locator('#tasks-status').textContent(),/kept on phone/);
 assert.deepEqual(errors,[]);
 console.log('PASS: manual offline creation/check/undo, first-pair preservation, Sydney timezone/DST, pre-due completion, duplicate mapping and rejected-create retention.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
