const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const csv='月日,借方科目コード,借方科目名,借方取引金額,借方税抜き金額,貸方科目コード,貸方科目名,貸方取引金額,貸方税抜き金額\n2025/01/01,1122,売掛金,110,110,4111,製品売上高,110,100\n2025/01/31,5412,材料仕入高,55,50,2112,買掛金,55,55\n2025/02/28,1132,製品,10,10,5311,期末棚卸高,10,10';
(async()=>{
 const server=http.createServer((req,res)=>{const p=path.join(root,decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(p,(err,b)=>{if(err){res.writeHead(404);res.end();}else {res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.html')?'text/html':'image/png');res.end(b);}});});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;let browser;try{browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});}catch(e){await new Promise(r=>server.close(r));throw e;}const page=await browser.newPage();let errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()));
 try{
 await page.goto(origin);await page.click('#sampleBtn');assert.match(await page.textContent('#vCCC'),/125/);
 await page.click('[data-value=auto]');await page.fill('#sales','100');await page.fill('#cogs','50');await page.fill('#ar','20');await page.fill('#inv','10');await page.fill('#ap','5');assert.match(await page.textContent('#vCCC'),/109.5/);
 await page.click('[data-value=csv]');assert.equal(await page.isVisible('#result'),true);assert.equal(await page.isVisible('#csvBox'),true);
 const upload=()=>page.setInputFiles('#journalFile',{name:'fictional.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await upload();assert.match(await page.textContent('#journalStatus'),/3行/);assert.match(await page.textContent('#vCCC'),/未算出/);
 for(const g of ['sales','cogs','ar','inv','ap'])await page.check('#confirm-'+g);
 await page.check('#journalBasis');await page.fill('#opening-ar','100');await page.fill('#opening-inv','20');await page.fill('#opening-ap','100');assert.doesNotMatch(await page.textContent('#vCCC'),/未算出/);
 await page.locator('#journalMapping').evaluate(n=>n.closest('details').open=true);await page.selectOption('[data-map="1122"]','');assert.equal(await page.inputValue('#opening-ar'),'');assert.equal(await page.inputValue('#opening-inv'),'');assert.equal(await page.isChecked('#confirm-sales'),false);
 await upload();assert.equal(await page.inputValue('#opening-ar'),'');assert.equal(await page.isChecked('#journalBasis'),false);
 await page.setInputFiles('#journalFile',{name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('broken')});assert.match(await page.textContent('#journalStatus'),/読込できません/);assert.equal(await page.textContent('#journalResults'),'');assert.equal(await page.isDisabled('#journalExport'),true);
 await upload();await page.click('#journalClear');assert.equal(await page.textContent('#journalResults'),'');assert.equal(await page.isVisible('#journalSetup'),false);
 await upload();await page.fill('#opening-ar','100');await page.fill('#journalStart','2025-01-02');await page.locator('#journalEnd').focus();assert.equal(await page.inputValue('#opening-ar'),'');
 await page.click('[data-value=direct]');assert.equal(await page.isVisible('#csvBox'),false);assert.equal(await page.isVisible('#result'),true);await page.click('#resetBtn');await page.click('[data-value=csv]');assert.equal(await page.isVisible('#journalSetup'),false);
 await upload();await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.deepEqual(errors,[]);assert.ok(requests.every(u=>u.startsWith(origin+'/')),'External request detected');
 console.log('PASS: legacy modes, CSV gating, valid upload, mapping/reset/new upload invalidation, malformed upload, clear, period change, 390px layout, zero JS errors, zero external requests.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
