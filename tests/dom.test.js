// Run with jsdom installed in the test environment. No external resources loaded.
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://local.invalid/'}),w=dom.window,d=w.document;w.TextDecoder=TextDecoder;w.scrollTo=()=>{};w.print=()=>{};
for(const s of d.scripts)w.eval(s.src?fs.readFileSync(path.join(root,new URL(s.src).pathname),'utf8'):s.textContent);
const $=s=>d.querySelector(s),click=s=>$(s).click(),change=(s,value)=>{$(s).value=value;$(s).dispatchEvent(new w.Event('change',{bubbles:true}));},input=(s,value)=>{$(s).value=value;$(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
const csv='月日,借方科目コード,借方科目名,借方取引金額,借方税抜き金額,貸方科目コード,貸方科目名,貸方取引金額,貸方税抜き金額\n2025/01/01,1122,売掛金,110,110,4111,製品売上高,110,100\n2025/01/31,5412,材料仕入高,55,50,2112,買掛金,55,55\n2025/02/28,1132,製品,10,10,5311,期末棚卸高,10,10';
const tick=()=>new Promise(r=>setTimeout(r,0));
async function upload(text=csv,wait){const b=Buffer.from(text);Object.defineProperty($('#journalFile'),'files',{configurable:true,value:[{size:b.length,arrayBuffer:()=>wait||Promise.resolve(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))}]});$('#journalFile').dispatchEvent(new w.Event('change'));await tick();}
(async()=>{
 click('#sampleBtn');assert.match($('#vCCC').textContent,/125/);click('[data-value=auto]');for(const [k,v] of Object.entries({sales:100,cogs:50,ar:20,inv:10,ap:5}))input('#'+k,''+v);assert.match($('#vCCC').textContent,/109.5/);
 click('[data-value=csv]');assert.equal($('#csvBox').style.display,'block');assert.equal($('#result').style.display,'none');await upload();assert.match($('#journalStatus').textContent,/3行/);
 for(const g of ['sales','cogs','ar','inv','ap'])click('#confirm-'+g);click('#journalBasis');assert.match($('[data-result=ccc]').textContent,/未算出/);for(const [g,v] of Object.entries({ar:100,inv:20,ap:100}))input('#opening-'+g,''+v);assert.doesNotMatch($('[data-result=ccc]').textContent,/未算出/);
 change('[data-map="1122"]','');for(const g of ['ar','inv','ap'])assert.equal($('#opening-'+g).value,'');assert.equal($('#journalBasis').checked,false);
 await upload();assert.equal($('#confirm-sales').checked,false);await upload('broken');assert.equal($('#journalResults').textContent,'');assert.equal($('#journalExport').disabled,true);assert.match($('#journalStatus').textContent,/読込できません/);
 await upload();input('#opening-ar','100');change('#journalStart','2025-01-02');assert.equal($('#opening-ar').value,'');
 let release;await upload(csv,new Promise(r=>release=r));click('#journalClear');release(Buffer.from(csv).buffer);await tick();assert.equal($('#journalSetup').hidden,true);assert.equal($('#journalResults').textContent,'');
 await upload();click('[data-value=direct]');assert.equal($('#result').style.display,'block');click('#resetBtn');click('[data-value=csv]');assert.equal($('#journalSetup').hidden,true);
 assert.ok(!/https?:/.test([...d.scripts].map(s=>s.getAttribute('src')||'').join('')));assert.match($('meta[http-equiv="Content-Security-Policy"]').content,/connect-src 'none'/);
 console.log('PASS DOM: legacy calculations, mode transitions, CSV parsing, missing gating, valid result, mapping/opening invalidation, failed/repeated/racing uploads, clear/reset. No layout/browser-network claims.');dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;dom.window.close();});
