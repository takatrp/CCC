/* Local-only journal parser and CCC calculation. No network or storage APIs. */
(function(root){
'use strict';
const groups=['sales','cogs','ar','inv','ap'];
function parseCSV(text){
 text=text.replace(/^\uFEFF/,''); const rows=[]; let row=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;}
  else if(c==='"'){if(cell!==''||closed)throw Error('引用符の位置が不正です。');quoted=true;}
  else if(c===','){row.push(cell);cell='';closed=false;}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v!==''))rows.push(row);row=[];cell='';closed=false;}
  else {if(closed)throw Error('引用符の後に不正な文字があります。');cell+=c;}
 }
 if(quoted)throw Error('閉じていない引用符があります。');
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 if(rows.length<2)throw Error('ヘッダーと仕訳明細が必要です。');
 const headers=rows.shift().map(x=>x.trim());
 if(new Set(headers).size!==headers.length)throw Error('重複する列名があります。');
 const required=['月日',...['借方','貸方'].flatMap(s=>['科目コード','科目名','取引金額','税抜き金額'].map(x=>s+x))];
 for(const h of required)if(!headers.includes(h))throw Error('必要な列がありません：'+h);
 return rows.map((r,i)=>{if(r.length!==headers.length)throw Error(`${i+2}行目の列数が一致しません。`);return Object.fromEntries(headers.map((h,j)=>[h,r[j]]));});
}
function number(s){
 if(s==null||String(s).trim()==='')return null;
 const n=String(s).trim().replace(/,/g,'');
 if(!/^[+-]?\d+(\.\d+)?$/.test(n)||!Number.isFinite(+n)||Math.abs(+n)>Number.MAX_SAFE_INTEGER)throw Error('数値の形式または大きさが不正です。');return +n;
}
// Preserve the numeric characters on each side of the caret, including decimals/sign.
// Do not silently discard invalid input or convert an empty field to zero.
function formatAmount(value,start=value.length,end=start){
 const normalize=s=>s.replace(/[０-９＋－，．]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0));
 const raw=normalize(value),plain=raw.replace(/,/g,'');
 if(!/^[+-]?\d+(?:\.\d*)?$/.test(plain))return {value:raw,start,end};
 const count=p=>raw.slice(0,p).replace(/,/g,'').length;
 const parts=plain.split('.');parts[0]=parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,',');const formatted=parts.join('.');
 const locate=n=>{if(n===0)return 0;let k=0;for(let i=0;i<formatted.length;i++){if(formatted[i]!==',')k++;if(k===n)return i+1;}return formatted.length;};
 return {value:formatted,start:locate(count(start)),end:locate(count(end))};
}
function date(s){const m=String(s).match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);if(!m)throw Error('会計日付は西暦の年月日が必要です。');const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));if(d.getUTCFullYear()!==+m[1]||d.getUTCMonth()!==+m[2]-1||d.getUTCDate()!==+m[3])throw Error('存在しない日付です。');return d.toISOString().slice(0,10);}
function guess(code,name){
 if(/^41\d\d$/.test(code))return 'sales';
 if(/^5\d\d\d$/.test(code))return 'cogs';
 if(['売掛金','受取手形','電子記録債権'].includes(name))return 'ar';
 if(['商品','製品','原材料','仕掛品','仕掛品（半成品）','貯蔵品'].includes(name))return 'inv';
 if(['買掛金','支払手形','電子記録債務'].includes(name))return 'ap';return '';
}
function load(text){
 const rows=parseCSV(text), accounts=new Map(), entries=[];let debit=0,credit=0,oneSided=0;
 rows.forEach((row,i)=>{
  try{
   const day=date(row['月日']);let sides=0;
   for(const [s,sign] of [['借方',1],['貸方',-1]]){
    const code=row[s+'科目コード'].trim(),name=row[s+'科目名'].trim(),gross=number(row[s+'取引金額']),net=number(row[s+'税抜き金額']);
    if(!code&&!name){if(gross!==null||net!==null)throw Error('科目が空欄なのに金額があります。');continue;}
    if(!code||!name||gross===null||net===null)throw Error('科目または金額が不足しています。');
    if(accounts.has(code)&&accounts.get(code).name!==name)throw Error('同じ科目コードに複数の名称があります。');
    accounts.set(code,{code,name,group:guess(code,name)});entries.push({day,code,gross,net,sign});sides++;
    if(sign===1)debit+=gross;else credit+=gross;
   }
   if(!sides)throw Error('借方・貸方とも空欄です。');if(sides===1)oneSided++;
  }catch(e){throw Error(`${i+2}行目：${e.message}`);}
 });
 entries.sort((a,b)=>a.day.localeCompare(b.day));
 return {entries,accounts:[...accounts.values()].sort((a,b)=>a.code.localeCompare(b.code)),rowCount:rows.length,oneSided,imbalance:debit-credit,start:entries[0].day,end:entries.at(-1).day};
}
function calculate(data,{start,end,mapping,confirmed,openings,method,coverageConfirmed=false}){
 start=date(start);end=date(end);if(start>end)throw Error('開始日と終了日が逆です。');
 if((start<data.start||end>data.end)&&!coverageConfirmed)throw Error('仕訳の初日・最終日を超える期間です。CSVの抽出対象期間内であることを確認し、税処理・対象期間の確認にチェックしてください。');
 const days=(Date.parse(end)-Date.parse(start))/86400000+1;
 const selected=data.entries.filter(e=>e.day>=start&&e.day<=end);
 if(!selected.length)throw Error('対象期間に仕訳がありません。');
 const monthEnds=[];let d=new Date(start+'T00:00:00Z');
 while(d.toISOString().slice(0,10)<=end){const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10);if(last<=end)monthEnds.push(last);d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));}
 if(method==='monthly'&&(start.slice(8)!=='01'||end!==monthEnds.at(-1)))throw Error('月末平均は月初から月末までの期間を指定してください。端数期間は期首・期末平均を選んでください。');
 const values={},detail={},warnings=[];
 const months=new Set(selected.map(e=>e.day.slice(0,7)));
 const absent=monthEnds.map(x=>x.slice(0,7)).filter(m=>!months.has(m));
 if(absent.length)warnings.push('仕訳がない月：'+absent.join('、')+'。データ欠落ではなく取引なしと確認した期間のみ計算に使用してください。');
 if(start<data.start||end>data.end)warnings.push('最初・最後の仕訳日より対象期間を延長しています。取引のない日も抽出範囲に含まれることを確認済みとして計算。');
 const delta=selected.reduce((a,e)=>a+e.sign*e.gross,0);
 if(Math.abs(delta)>0.5)warnings.push('対象期間の借貸合計が一致しません。抽出範囲・欠落を確認してください。');
 for(const g of groups){
  const codes=new Set(data.accounts.filter(a=>mapping[a.code]===g).map(a=>a.code));
  const es=selected.filter(e=>codes.has(e.code));
  detail[g]={codes:[...codes],count:es.length};
  if(!confirmed[g]||(absent.length&&!coverageConfirmed)){values[g]=null;continue;}
  if(g==='sales'||g==='cogs'){values[g]=es.reduce((s,e)=>s+e.sign*e.net*(g==='sales'?-1:1),0);continue;}
  const opening=number(openings[g]);if(opening===null){values[g]=null;continue;}
  if(opening<0)throw Error('開始残高は0以上で入力してください。');
  const signed=e=>e.sign*e.gross*(g==='ap'?-1:1);
  const closing=opening+es.reduce((s,e)=>s+signed(e),0);
  const balances=monthEnds.map(day=>opening+es.filter(e=>e.day<=day).reduce((s,e)=>s+signed(e),0));
  detail[g]={...detail[g],opening,closing,monthEnds,balances};
  if(closing<0||balances.some(x=>x<0)){values[g]=null;warnings.push(g+'：残高が負になっています。開始残高・科目対応を確認してください。');continue;}
  values[g]=method==='monthly'?balances.reduce((a,b)=>a+b,0)/balances.length:(opening+closing)/2;
 }
 const ratio=(g,den)=>values[g]!==null&&values[den]>0?values[g]/values[den]*days:null;
 const dio=ratio('inv','cogs'),dso=ratio('ar','sales'),dpo=ratio('ap','cogs');
 if(values.sales!==null&&values.sales<=0)warnings.push('売上高が0以下のためDSOを算出できません。');
 if(values.cogs!==null&&values.cogs<=0)warnings.push('売上原価が0以下のためDIO・DPOを算出できません。');
 return {start,end,days,method,values,detail,warnings,dio,dso,dpo,ccc:[dio,dso,dpo].every(x=>x!==null)?dio+dso-dpo:null};
}
const api={version:'r24.2-csv',parseCSV,number,formatAmount,date,load,calculate,groups};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CCCJournal=api;
})(typeof globalThis!=='undefined'?globalThis:this);
