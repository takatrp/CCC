(function(){
'use strict';
const $=s=>document.querySelector(s), J=window.CCCJournal, labels={sales:'売上高',cogs:'売上原価',ar:'売上債権',inv:'棚卸資産',ap:'仕入債務'};
const fmt=n=>n===null?'未算出':new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(n);
let data=null,last=null,version=0,industry=null;
function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function mapping(){return Object.fromEntries([...document.querySelectorAll('[data-map]')].map(n=>[n.dataset.map,n.value]));}
function notify(){document.dispatchEvent(new CustomEvent('ccc-journal-change',{detail:last}));}
function clear(){version++;data=null;last=null;$('#journalFile').value='';$('#journalSetup').hidden=true;$('#journalMapping').replaceChildren();$('#journalConfirmations').replaceChildren();$('#journalOpeningFields').replaceChildren();$('#journalResults').replaceChildren();$('#journalBasis').checked=false;$('#journalStatus').textContent='CSVを選択してください。';$('#journalExport').disabled=true;notify();}
function summaries(){const m=mapping();for(const g of J.groups){const names=data.accounts.filter(a=>m[a.code]===g).map(a=>`${a.code} ${a.name}`);$('#summary-'+g).textContent=names.length?names.join('、'):'対象科目なし（確認するとこの区分の仕訳増減は0になります）';$('#confirm-'+g).checked=false;}}
function options(){const m=mapping(),confirmed=Object.fromEntries(J.groups.map(g=>[g,$('#confirm-'+g).checked&&$('#journalBasis').checked])),openings=Object.fromEntries(['ar','inv','ap'].map(g=>[g,$('#opening-'+g).value]));return {mapping:m,confirmed,openings,coverageConfirmed:$('#journalBasis').checked,start:$('#journalStart').value,end:$('#journalEnd').value,method:$('#journalMethod').value};}
function render(){
 const out=$('#journalResults');out.replaceChildren();last=null;$('#journalExport').disabled=true;if(!data){notify();return;}
 try{
  const r=J.calculate(data,options());last=r;
  const h=el('h3','集計根拠（計算結果は下部に表示）');out.append(h);
  out.append(el('p',`${r.start}〜${r.end}（${r.days}日）／${r.method==='monthly'?'対象月の月末残高平均':'開始直前・終了時の2点平均'}／損益は税抜・残高は帳簿額`));
  if(!$('#journalBasis').checked)out.append(el('p','税処理・対象期間の確認チェックが必要です。'));
  const table=el('table');table.className='csv-table';
  const header=el('tr');['項目','集計額（円）','根拠'].forEach(x=>header.append(el('th',x)));table.append(header);
  for(const g of J.groups){const tr=el('tr'),v=r.detail[g];let reason=`採用 ${v.codes.length}科目 / ${v.count}明細`;
   if(v.opening!==undefined)reason+=` / 開始 ${fmt(v.opening)} → 終了 ${fmt(v.closing)}`;
   if(r.values[g]===null)reason+=' / 科目確認・開始残高・税処理を確認';
   tr.append(el('td',labels[g]+(['ar','inv','ap'].includes(g)?'（平均）':'')),el('td',fmt(r.values[g])),el('td',reason));table.append(tr);
  }const wrap=el('div');wrap.className='csv-table-wrap';wrap.append(table);out.append(wrap);
  if(r.warnings.length){const p=el('p',r.warnings.map(w=>w.replace(/^ar：/,'売上債権：').replace(/^inv：/,'棚卸資産：').replace(/^ap：/,'仕入債務：')).join('\n'));p.className='csv-caution';out.append(p);}
  const ds=el('details'),sum=el('summary','月末残高の内訳');ds.append(sum);
  for(const g of ['ar','inv','ap']){const v=r.detail[g];if(v.balances)ds.append(el('p',labels[g]+'：'+v.monthEnds.map((day,i)=>`${day} ${fmt(v.balances[i])}円`).join(' ／ ')));}out.append(ds);
  out.append(el('p','CCC＝DIO＋DSO−DPO。DIO＝平均棚卸資産÷売上原価×実日数、DSO＝平均売上債権÷売上高×実日数、DPO＝平均仕入債務÷売上原価×実日数。未確認は0で補完しません。'));
  $('#journalExport').disabled=false;
 }catch(e){const p=el('p',e.message);p.className='csv-caution';out.append(p);}
 notify();
}
function build(){
 const body=$('#journalMapping');
 for(const a of data.accounts){const row=el('tr'),select=el('select');select.dataset.map=a.code;select.setAttribute('aria-label',a.code+' '+a.name+' 集計先');
  for(const [key,name] of [['','対象外'],...Object.entries(labels)]){const opt=el('option',name);opt.value=key;select.append(opt);}select.value=a.group;
  select.addEventListener('change',()=>{document.querySelectorAll('[id^="opening-"]').forEach(n=>n.value='');$('#journalBasis').checked=false;summaries();render();});const td=el('td');td.append(select);row.append(el('td',a.code),el('td',a.name),td);body.append(row);
 }
 for(const g of J.groups){const box=el('div');box.className='csv-confirm';const label=el('label'),cb=el('input');cb.type='checkbox';cb.id='confirm-'+g;cb.addEventListener('change',render);label.append(cb,document.createTextNode(labels[g]+'の科目対応を確認した'));const p=el('p');p.id='summary-'+g;p.className='sub';box.append(label,p);$('#journalConfirmations').append(box);}
 for(const g of ['ar','inv','ap']){const label=el('label',labels[g]+'の開始残高（円）'),input=el('input');input.id='opening-'+g;input.type='text';input.inputMode='numeric';input.placeholder='未確認（0と区別）';input.addEventListener('input',render);label.append(input);$('#journalOpeningFields').append(label);}
 summaries();$('#journalStart').value=data.start;$('#journalEnd').value=data.end;
 $('#journalMethod').value=data.start.endsWith('-01')&&new Date(Date.parse(data.end)+86400000).getUTCDate()===1?'monthly':'endpoints';
 $('#journalSetup').hidden=false;
 $('#journalStatus').textContent=`${data.rowCount.toLocaleString()}行を読込／${data.accounts.length}科目／片側仕訳 ${data.oneSided}行／借貸差 ${fmt(data.imbalance)}円。対象期間と科目候補を確認してください。`;
 render();
}
async function readFile(){const file=$('#journalFile').files[0];clear();if(!file)return;const token=version;$('#journalStatus').textContent='読込中…';
 try{if(file.size>20*1024*1024)throw Error('20MB以下のCSVを選択してください。');const bytes=await file.arrayBuffer();if(token!==version)return;
  const text=new TextDecoder($('#journalEncoding').value,{fatal:true}).decode(bytes);data=J.load(text);build();
 }catch(e){if(token!==version)return;data=null;last=null;$('#journalSetup').hidden=true;$('#journalResults').replaceChildren();$('#journalExport').disabled=true;$('#journalStatus').textContent='読込できませんでした：'+e.message+'（文字化け時は文字コードを変更して再選択）';}
}
$('#journalFile').addEventListener('change',readFile);$('#journalEncoding').addEventListener('change',clear);$('#journalClear').addEventListener('click',clear);
$('#journalStart').addEventListener('change',()=>{document.querySelectorAll('[id^="opening-"]').forEach(n=>n.value='');$('#journalBasis').checked=false;render();});
$('#journalEnd').addEventListener('change',()=>{$('#journalBasis').checked=false;render();});$('#journalMethod').addEventListener('change',render);$('#journalBasis').addEventListener('change',render);
$('#journalExport').addEventListener('click',()=>{
 if(!last)return;const r=last,rows=[['CCC 仕訳CSV計算（未確認は未算出）'],['開始日',r.start],['終了日',r.end],['実日数',r.days],['平均方式',r.method==='monthly'?'各月末単純平均':'開始直前・終了時2点平均'],['税処理','損益は税抜き金額、残高は取引金額'],['税処理・期間確認',$('#journalBasis').checked?'確認済':'未確認']];
 for(const g of J.groups){rows.push([labels[g],r.values[g]===null?'未算出':r.values[g]],['採用コード',r.detail[g].codes.join(' / ')],['科目確認',$('#confirm-'+g).checked?'確認済':'未確認']);const d=r.detail[g];if(d.opening!==undefined){rows.push(['開始残高',d.opening],['終了残高',d.closing]);d.monthEnds.forEach((day,i)=>rows.push([labels[g]+' '+day,d.balances[i]]));}}
 for(const key of ['dio','dso','dpo','ccc'])rows.push([key.toUpperCase(),r[key]===null?'未算出':r[key]]);
 if(industry)rows.push(['業種',industry.name],['業種平均CCC（365日基準）',industry.base.dio+industry.base.dso-industry.base.dpo]);
 rows.push(['資金負担インパクト',document.querySelector('#impactSummary').textContent]);
 r.warnings.forEach(w=>rows.push(['警告',w]));
 const escape=v=>'"'+String(v).replace(/^[=+@\t\r]/,"'$&").replace(/"/g,'""')+'"';
 const blob=new Blob(['\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='ccc_journal_result.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.CCCImport={clear,render,getResult(){return last;},setIndustry(name,base){industry={name,base};}};
})();
