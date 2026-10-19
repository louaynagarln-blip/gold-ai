'use strict';
const Q=require('../data-quality');
const SOURCE='Twelve Data — OHLC',CACHE_MS=120000;
function utc(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value))throw Error('INVALID_UTC_TIME');
 const iso=value.replace(' ','T')+'Z',time=Date.parse(iso);
 if(!Number.isSafeInteger(time)||new Date(time).toISOString().slice(0,19)!==iso.slice(0,19))throw Error('INVALID_UTC_TIME');
 return time;
}
function normalize(raw,timeframe,now=Date.now()){
 const fail=(code,reasonAr)=>({ready:false,code,timeframe,source:SOURCE,bars:[],reasonAr});
 if(!Q.INTERVALS[timeframe])return fail('INTERVAL','إطار زمني غير مدعوم');
 if(raw?.status!=='ok'||raw?.meta?.symbol!=='XAU/USD'||raw?.meta?.interval!=='1min'||!Array.isArray(raw.values)||!raw.values.length||raw.values.length>5000)return fail('PROVIDER_SCHEMA','مصدر الشموع لا يثبت سلسلة XAU/USD الدقيقة');
 let rows;try{rows=raw.values.map(r=>({time:utc(r.datetime),open:r.open,high:r.high,low:r.low,close:r.close})).reverse()}catch{return fail('PROVIDER_TIME','توقيت المصدر غير صالح؛ التحليل معلّق')}
 // The API contract requests UTC. Never infer a timezone from the device.
 let suffix=0;
 for(let i=1;i<rows.length;i++){
  if(rows[i].time<=rows[i-1].time)return fail('PROVIDER_ORDER','ترتيب أو تكرار غير صالح بالشموع');
  if(rows[i].time-rows[i-1].time!==60000)suffix=i;
 }
 // Drop the older segment across a market closure; never fill missing minutes.
 const input={symbol:'XAUUSD',source:SOURCE,timeframe:'M1',candles:rows.slice(suffix)};
 const minutes=Q.candles(input,'M1',now,1);if(!minutes.ready)return {...minutes,timeframe};
 const duration=Q.INTERVALS[timeframe],count=duration/60000,groups=new Map();
 for(const r of minutes.bars){const start=Math.floor(r.time/duration)*duration;if(!groups.has(start))groups.set(start,[]);groups.get(start).push(r)}
 const candles=[];
 for(const [time,group] of groups){
  if(group.length!==count||group[0].time!==time||group.at(-1).end!==time+duration||time+duration>now)continue;
  candles.push({time,open:group[0].open,high:Math.max(...group.map(r=>r.high)),low:Math.min(...group.map(r=>r.low)),close:group.at(-1).close,closed:true});
 }
 return {...Q.candles({symbol:'XAUUSD',source:SOURCE,timeframe,candles},timeframe,now),aggregation:timeframe==='M1'?'native-minute-ohlc':'complete-native-minute-bars',discardedBeforeGap:suffix,refreshAfterMs:CACHE_MS};
}
function createReader({fetcher=(...args)=>fetch(...args),clock=()=>Date.now()}={}){
 let cache=null,inflight=null,blockedUntil=0,blockedCode='';
 async function read(key,timeframe){
  const now=clock();if(!key||key==='demo')return {ready:false,code:'PROVIDER_KEY_REQUIRED',timeframe,bars:[],reasonAr:'يلزم مفتاح Twelve Data خاص بعد اختبار صلاحية البيانات'};
  if(cache?.key===key&&now-cache.at<CACHE_MS)return normalize(cache.raw,timeframe,now);
  if(blockedUntil>now)return {ready:false,code:blockedCode,timeframe,bars:[],retryAt:blockedUntil,reasonAr:'المصدر متوقف مؤقتاً بسبب حد الاستخدام أو صلاحية المفتاح؛ التحليل معلّق'};
  if(!inflight||inflight.key!==key){
   const url=new URL('https://api.twelvedata.com/time_series');for(const [k,v] of Object.entries({symbol:'XAU/USD',interval:'1min',outputsize:'5000',timezone:'UTC',apikey:key}))url.searchParams.set(k,v);
   const promise=(async()=>{
    try{
     const response=await fetcher(url,{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(10000)});
     if(!response.ok){const code=[401,403].includes(response.status)?'PROVIDER_ACCESS':response.status===429?'PROVIDER_LIMIT':'PROVIDER_UNAVAILABLE';blockedCode=code;blockedUntil=clock()+([401,403,429].includes(response.status)?3600000:30000);return null}
     const raw=await response.json();if(raw.status!=='ok'){blockedCode='PROVIDER_REJECTED';blockedUntil=clock()+3600000;return null}
     cache={key,raw,at:clock()};return raw;
    }catch{blockedCode='PROVIDER_UNAVAILABLE';blockedUntil=clock()+30000;return null}
   })();inflight={key,promise};
  }
  const pending=inflight,raw=await pending.promise;if(inflight===pending)inflight=null;
  if(!raw)return {ready:false,code:blockedCode,timeframe,bars:[],retryAt:blockedUntil,reasonAr:'تعذّر جلب شموع موثقة؛ التحليل معلّق'};
  return normalize(raw,timeframe,clock());
 }
 return {read};
}
module.exports={normalize,utc,createReader,...createReader()};
