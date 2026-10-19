(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data-quality'):root.GoldDataQuality);if(typeof module==='object'&&module.exports)module.exports=api;else root.GoldQuoteRecorder=api;})(typeof self!=='undefined'?self:this,function(Q){
 'use strict';
 const SCHEMA='gold-observed-quotes-v1',RETENTION=7*86400000,LIMIT=20160,GAP=90000;
 function valid(row,now){return row&&row.symbol==='XAUUSD'&&typeof row.source==='string'&&row.source.length>0&&row.source.length<=120&&Number.isFinite(row.price)&&row.price>0&&Number.isSafeInteger(row.sourceTime)&&row.sourceTime>=now-RETENTION&&row.sourceTime<=now+2000&&Number.isSafeInteger(row.observedAt)&&row.observedAt>=row.sourceTime-2000&&row.observedAt-row.sourceTime<=30000&&row.observedAt<=now+2000;}
 function restore(data,now=Date.now()){
  if(data?.schema!==SCHEMA||!Array.isArray(data.samples)||data.samples.length>LIMIT)return [];
  const out=[],last=new Map();
  for(const r of data.samples){if(!valid(r,now)||r.sourceTime<=(last.get(r.source)||0))continue;out.push({symbol:'XAUUSD',source:r.source,price:r.price,sourceTime:r.sourceTime,observedAt:r.observedAt});last.set(r.source,r.sourceTime);}
  return out;
 }
 function append(rows,raw,now=Date.now()){
  const current=restore({schema:SCHEMA,samples:rows},now),q=Q.quote(raw,now),source=String(raw?.source||'').trim().slice(0,120);
  if(!q.usable||raw?.symbol!=='XAUUSD'||!source)return current;
  const last=current.filter(r=>r.source===source).at(-1);
  if(last&&q.sourceTime<=last.sourceTime)return current;
  return [...current,{symbol:'XAUUSD',source,price:q.price,sourceTime:q.sourceTime,observedAt:now}].slice(-LIMIT);
 }
 function summary(rows,now=Date.now()){
  const all=restore({schema:SCHEMA,samples:rows},now),source=all.at(-1)?.source||'',samples=all.filter(r=>r.source===source&&r.sourceTime>=now-86400000);
  let gaps=0;for(let i=1;i<samples.length;i++)if(samples[i].sourceTime-samples[i-1].sourceTime>GAP)gaps++;
  if(samples.length&&now-samples.at(-1).sourceTime>GAP)gaps++;
  return {source,samples,count:samples.length,gaps,first:samples[0]?.sourceTime??null,last:samples.at(-1)?.sourceTime??null,low:samples.length?Math.min(...samples.map(r=>r.price)):null,high:samples.length?Math.max(...samples.map(r=>r.price)):null,change:samples.length>1?(samples.at(-1).price/samples[0].price-1)*100:null};
 }
 return {SCHEMA,RETENTION,LIMIT,GAP,restore,append,summary};
});
