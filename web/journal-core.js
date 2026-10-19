(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GoldJournal=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const MODEL='gold-ohlc-4.2',MAX=5000;
 function evaluate(entry,bars,now=Date.now()){
  const result={...entry,evaluations:{...(entry.evaluations||{})}},start=Number(entry.referenceTime);
  if(entry.modelVersion!==MODEL||!Number.isSafeInteger(start)||!(entry.price>0))return result;
  for(const key of ['h24','h48']){
   const target=start+(key==='h24'?24:48)*3600000;
   if(result.evaluations[key]||now<target||!entry[key])continue;
   const bar=(bars||[]).find(b=>b.end===target);if(!bar)continue;
   const f=entry[key],actual=Number(bar.close),change=(actual/entry.price-1)*100;
   if(!(actual>0)||!Number.isFinite(change))continue;
   const direction=Math.abs(change)<=0.05?'NEUTRAL':change>0?'BULLISH':'BEARISH';
   result.evaluations[key]={targetAt:new Date(target).toISOString(),evaluatedAt:new Date(now).toISOString(),sourceTime:target,actualPrice:actual,direction,directionHit:f.bias===direction,rangeHit:actual>=f.low&&actual<=f.high,actualChangePct:change,absoluteErrorPct:Math.abs((actual/(f.center||entry.price)-1)*100)};
  }
  return result;
 }
 function stats(entries,key){const rows=entries.filter(e=>e.modelVersion===MODEL&&!e.importedUnverified&&e.evaluations?.[key]?.sourceTime===e.referenceTime+(key==='h24'?24:48)*3600000).map(e=>e.evaluations[key]),n=rows.length,hits=rows.filter(x=>x.directionHit===true).length;
  if(!n)return {n:0,hits:0,accuracy:null,interval:null};
  const p=hits/n,z=1.96,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  return {n,hits,accuracy:100*p,interval:[100*(center-half),100*(center+half)],calibrated:false};
 }
 function importBackup(raw){if(raw?.schema!=='gold-journal-backup-v1'||!Array.isArray(raw.entries)||raw.entries.length>MAX)throw Error('ملف سجل غير صالح');
  return raw.entries.map(e=>{if(!e||typeof e.id!=='string'||e.id.length>150||!Number.isFinite(e.price)||e.price<=0||!Number.isFinite(Date.parse(e.createdAt)))throw Error('سجل غير صالح');return {...e,importedUnverified:true,evaluations:{}};});
 }
 function merge(a,b){const out=new Map();for(const e of [...a,...b])if(e?.id&&!out.has(e.id))out.set(e.id,e);return [...out.values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).slice(-MAX);}
 return {MODEL,evaluate,stats,importBackup,merge};
});
