const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const page=await browser.newPage({viewport:{width:890,height:400},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../web/index.html')).href);
 await page.locator('[data-page=ideas]').click();
 assert.equal(await page.locator('.idea-card').count(),4);
 await page.locator('.idea-card').first().click();
 assert.match(await page.locator('#detail-title').textContent(),/SOL/);
 assert.match(await page.locator('#trade-panel').textContent(),/Illustrative/);
 await page.getByRole('tab',{name:'Levels',exact:true}).click();
 assert.match(await page.locator('#trade-panel').textContent(),/\$112 – \$118/);
 assert.match(await page.locator('#trade-panel').textContent(),/TARGET 3—/);
 assert.ok(await page.locator('#trade-panel').evaluate(e=>e.scrollHeight>e.clientHeight),'detail body can scroll');
 if(process.env.SCREENSHOT_DIR){await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'fridge-trade-levels-dark.png')});}
 await page.getByRole('button',{name:'Next →',exact:true}).click();
 assert.match(await page.locator('#detail-title').textContent(),/BTC \/ SHORT/);
 assert.equal(await page.getByRole('tab',{name:'Levels',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'Thesis',exact:true}).click();
 assert.match(await page.locator('#trade-panel').textContent(),/opposing market scenario/);
 await page.getByRole('tab',{name:'Thesis',exact:true}).press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Sources',exact:true}).getAttribute('aria-selected'),'true');
 await page.locator('#detail-close').click();
 // Legacy cached payloads must remain usable without new fields.
 const legacy={symbol:'OLD',bias:'LONG',score:null,thesis:'<script>text only</script>',price:1};
 await page.evaluate(a=>openTradeIdea(a,[a]),legacy);
 assert.match(await page.locator('#trade-panel').textContent(),/Not supplied/);
 assert.equal(await page.locator('#trade-panel script').count(),0);
 await page.locator('#detail-close').click();
 await page.evaluate(()=>openTradeIdea(demoIdeas[0],demoIdeas,true));
 await page.getByRole('tab',{name:'Thesis',exact:true}).click();
 if(process.env.SCREENSHOT_DIR){await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'fridge-trade-thesis-light.png')});}
 const bounds=await page.locator('#detail-actions').boundingBox();assert.ok(bounds.y+bounds.height<=400,'navigation stays on screen');
 await page.locator('#detail-close').click();
 await page.evaluate(()=>showDetail('Plain','Briefing',['Paragraph']));
 assert.equal(await page.locator('#detail').evaluate(e=>e.classList.contains('trade-detail')),false);
 assert.deepEqual(errors,[]);
 console.log('PASS: entry cards, tabs/keyboard, levels, missing fields, previous/next, legacy cache, safe text and landscape scrolling.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
