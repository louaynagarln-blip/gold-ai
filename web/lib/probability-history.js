'use strict';
const {utc}=require('./twelve-candles');
const HOUR=3600000;
function normalize(raw,now=Date.now()){
 if(raw?.status!=='ok'||raw.meta?.symbol!=='XAU/USD'||raw.meta?.interval!=='1h'||!Array.isArray(raw.values)||!raw.values.length||raw.values.length>5000)throw Error('HISTORY_SCHEMA');
 const bars=raw.values.map(r=>{const time=utc(r.datetime),nums=['open','high','low','close'].map(k=>{if(r[k]===''||r[k]==null||typeof r[k]==='boolean')throw Error('HISTORY_PRICE');return Number(r[k])});const [open,high,low,close]=nums;if(time%HOUR||time>now||!nums.every(n=>Number.isFinite(n)&&n>0)||high<Math.max(open,close,low)||low>Math.min(open,close))throw Error('HISTORY_BAR');return {time,end:time+HOUR,open,high,low,close}}).reverse();
 for(let i=1;i<bars.length;i++)if(bars[i].time<=bars[i-1].time)throw Error('HISTORY_ORDER');
 return bars.filter(b=>b.end<=now);
}
function createReader({fetcher=(...args)=>fetch(...args),clock=()=>Date.now()}={}){
 let cached=null,inflight=null,cooldown=0;
 async function read(key){
  if(!key||key==='demo')throw Error('HISTORY_KEY_REQUIRED');
  if(cached?.key===key&&clock()-cached.at<3600000)return cached.data;
  if(cooldown>clock())throw Error('HISTORY_COOLDOWN');
  if(inflight)return inflight;
  inflight=(async()=>{try{let bars=[],end=null,requests=0;const started=clock();
   for(let page=0;page<6;page++){
    const url=new URL('https://api.twelvedata.com/time_series');for(const [k,v] of Object.entries({symbol:'XAU/USD',interval:'1h',outputsize:'5000',timezone:'UTC',apikey:key,...(end?{end_date:end}:{})}))url.searchParams.set(k,v);
    const remaining=23000-(clock()-started);if(remaining<=0)throw Error('HISTORY_TIMEOUT');
    const response=await fetcher(url,{signal:AbortSignal.timeout(Math.min(7000,remaining)),headers:{Accept:'application/json'},cache:'no-store'});requests++;
    if(!response.ok)throw Error('HISTORY_ACCESS_OR_LIMIT');const raw=await response.json();const part=normalize(raw,clock());if(!part.length)throw Error('HISTORY_EMPTY');
    if(bars.length&&part.at(-1).time>=bars[0].time)throw Error('HISTORY_PAGINATION');
    bars=[...part,...bars];if(raw.values.length<5000)break;end=new Date(part[0].time-1000).toISOString().slice(0,19).replace('T',' ');
   }
   const data={bars,source:'Twelve Data — native H1',requests,requestMs:clock()-started,fetchedAt:clock()};cached={key,at:clock(),data};return data;
  }catch(e){cooldown=clock()+3600000;throw Error('HISTORY_UNAVAILABLE')}finally{inflight=null}})();return inflight;
 }
 return {read};
}
module.exports={normalize,createReader,...createReader()};
