const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:890,height:400}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>window.DashboardNative={refresh(){},isConfigured(){return true;},configure(){}});
 await page.goto(pathToFileURL(path.resolve(__dirname,'../web/index.html')).href);
 assert.equal(await page.locator('.watch-row').count(),0,'paired mode must not show demo assets');
 assert.equal(await page.locator('#weather-temperature').textContent(),'—');
 const now=new Date().toISOString();
 const payload={version:1,providers:{weather:{data:{temperature:19,code:3,high:22,low:13,as_of:now},fetched_at:now},market:{data:{assets:[{symbol:'SOL',price:100,score:null,bias:'LONG',conflict:true,price_as_of:'2020-01-01T00:00:00Z',price_status:'stale',values:[],change:null}],ideas:[]},fetched_at:now}},briefings:[{id:'test',title:'Real brief <script>',body:['Text only <b>not HTML</b>'],published_at:now}]};
 await page.evaluate(data=>receiveDashboard(data,''),payload);
 assert.equal(await page.locator('.watch-row').count(),1);
 assert.equal(await page.locator('.score').textContent(),'—');
 assert.equal(await page.locator('.spark').count(),0);
 assert.match(await page.locator('.quote-age').textContent(),/d ago/);
 assert.equal(await page.locator('#weather-temperature').textContent(),'19°');
 await page.locator('.watch-row').click();assert.match(await page.locator('#detail-body').textContent(),/Conflicting/);
 await page.locator('#detail-close').click();
 await page.evaluate(()=>receiveDashboard(null,'connection_failed'));
 assert.match(await page.locator('.market-status').first().textContent(),/OFFLINE/);
 assert.equal(await page.locator('.watch-row').count(),1,'keep last good snapshot');
 await page.reload();assert.equal(await page.locator('.watch-row').count(),1,'persist snapshot across restart');
 await page.locator('#ticker').click();assert.match(await page.locator('#detail-body').textContent(),/<b>not HTML<\/b>/);
 assert.equal(await page.locator('#detail-body b').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: live mode hides demos; missing scores/charts, quote age, conflict, offline cache/restart and safe briefing text.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
