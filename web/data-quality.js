(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GoldDataQuality=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const VERSION='4.10.0',INTERVALS={M1:60000,M5:300000,M15:900000};
 const positive=x=>typeof x!=='boolean'&&x!==null&&x!==''&&Number.isFinite(Number(x))&&Number(x)>0;
 function timestamp(value){
  if(typeof value==='string'){value=value.trim();if(/^\d+(\.\d+)?$/.test(value))value=Number(value);else if(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value))return Number.isFinite(Date.parse(value))?Date.parse(value):null;else return null;}
  if(typeof value!=='number'||!Number.isFinite(value)||value<=0)return null;
  const ms=value<1e12?value*1000:value;return ms>=946684800000&&Number.isSafeInteger(ms)?ms:null;
 }
 function quote(raw,now=Date.now(),maxAgeMs=30000){
  const price=Number(raw?.price??raw?.data?.price??raw?.result?.price??raw?.close);
  const sourceTime=timestamp(raw?.sourceTime??raw?.updatedAt??raw?.timestamp??raw?.time??raw?.data?.updatedAt);
  const ageMs=sourceTime===null?null:now-sourceTime;
  let status=!positive(price)?'INVALID_PRICE':sourceTime===null?'UNKNOWN_TIME':ageMs< -2000?'FUTURE_TIME':ageMs>maxAgeMs?'STALE':'FRESH';
  return {price:positive(price)?price:null,sourceTime,ageMs,status,usable:status==='FRESH'};
 }
 function symbol(value){return String(value||'').toUpperCase().replace(/[^A-Z]/g,'');}
 function candles(raw,timeframe,now=Date.now(),minimum=22,maxAgeMs){
  const duration=INTERVALS[timeframe],fail=(code,reasonAr)=>({ready:false,code,reasonAr,timeframe,bars:[]});
  if(!duration)return fail('INTERVAL','إطار زمني غير مدعوم');
  const instrument=symbol(raw?.symbol??raw?.instrument?.symbol);
  if(instrument!=='XAUUSD')return fail('SYMBOL','مصدر الشموع لا يثبت الرمز XAUUSD');
  if(typeof raw.source!=='string'||!raw.source.trim())return fail('SOURCE','مصدر الشموع غير محدد');
  const selected=raw.timeframes?.[timeframe]??raw.candles?.[timeframe]??(raw.timeframe===timeframe?raw.candles:null);
  const rows=Array.isArray(selected)?selected:selected?.candles;
  if(!Array.isArray(rows)||rows.length>10000)return fail('MISSING','لا تتوفر شموع '+timeframe+' من المصدر');
  const bars=[];let previous=null;
  for(const r of rows){
   const time=timestamp(r?.openTime??r?.time??r?.timestamp),end=time===null?null:time+duration;
   if(time===null||time%duration!==0)return fail('TIME','توقيت شموع غير صالح أو غير محاذى للإطار');
   if(previous!==null&&time!==previous+duration)return fail('GAP','فجوة أو تكرار أو ترتيب غير صحيح بالشموع');previous=time;
   if(r.closeTime!=null&&timestamp(r.closeTime)!==end)return fail('CLOSE_TIME','وقت إغلاق الشمعة لا يطابق الإطار');
   const vals=['open','high','low','close'].map(k=>r[k]);if(!vals.every(positive))return fail('OHLC','بيانات OHLC ناقصة أو غير صالحة');
   const [open,high,low,close]=vals.map(Number);if(low>Math.min(open,close)||high<Math.max(open,close)||low>high)return fail('RANGE','حدود الشمعة غير صحيحة');
   if(time>now+2000)return fail('FUTURE','شموع بتوقيت مستقبلي');
   if(r.closed===false&&end<=now)return fail('INCOMPLETE','شمعة سابقة غير مؤكدة الإغلاق');
   if(end>now)continue;
   bars.push({time,end,open,high,low,close});
  }
  if(bars.length<minimum)return fail('WARMUP','يلزم '+minimum+' شمعة مغلقة على '+timeframe+'؛ المتاح '+bars.length);
  if(now-bars.at(-1).end>(maxAgeMs??duration+30000))return fail('STALE','شموع '+timeframe+' متأخرة؛ التحليل معلّق');
  return {ready:true,code:'READY',reasonAr:'شموع مغلقة موثقة من المصدر',timeframe,source:raw.source.trim().slice(0,120),symbol:instrument,bars};
 }
 function atr(bars,period=14){if(bars.length<period+1)return null;const tr=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));let v=tr.slice(0,period).reduce((a,b)=>a+b,0)/period;for(let i=period;i<tr.length;i++)v=(v*(period-1)+tr[i])/period;return v;}
 const reasons={UNKNOWN_TIME:'وقت السعر غير معروف؛ الإشارات معلّقة',STALE:'السعر قديم؛ الإشارات معلّقة',FUTURE_TIME:'وقت السعر مستقبلي؛ الإشارات معلّقة',INVALID_PRICE:'السعر غير صالح',DISCONNECTED:'الاتصال مقطوع؛ الإشارات معلّقة',FRESH:'سعر حديث'};
 return {VERSION,INTERVALS,timestamp,quote,candles,atr,reasons};
});
