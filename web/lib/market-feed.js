'use strict';
const Q=require('../data-quality');
const {normalizeQuote}=require('./provider-adapter');
let market={};try{market=require('../server-data/market')}catch{}
let quoteCache=null,inflight=null;
async function read(kind='quote',timeframe='M1'){
 if(kind==='candles'&&process.env.MARKET_CANDLES_PROVIDER==='twelvedata')return require('./twelve-candles').read(String(process.env.TWELVE_DATA_API_KEY||'').trim(),timeframe);
 const configured=kind==='candles'?(market.candlesUrl||process.env.MARKET_CANDLES_API_URL):(market.apiUrl||process.env.MARKET_API_URL);
 // A quote response may include documented OHLC arrays. Never synthesize candles from ticks.
 const url=String(configured||market.apiUrl||process.env.MARKET_API_URL||'').trim();
 if(!url.startsWith('https://'))throw Error('Market source is not configured');
 const target=new URL(url);if(kind==='candles'&&configured)target.searchParams.set('timeframe',timeframe);
 if(kind==='candles'&&!configured&&target.hostname==='api.gold-api.com')return {ready:false,code:'CANDLES_NOT_CONFIGURED',timeframe,bars:[],reasonAr:'مصدر السعر Gold API لا يرسل سلسلة شموع؛ يلزم ربط خدمة OHLC'};
 const headers={Accept:'application/json','Cache-Control':'no-cache'},key=String(market.apiKey||process.env.MARKET_API_KEY||'').trim();if(key)headers['X-API-Key']=key;
 const cacheKey=url+'\n'+key;
 if(kind==='quote'&&target.hostname==='api.gold-api.com'){
  if(quoteCache?.key===cacheKey&&Date.now()-quoteCache.at<30000)return {quality:normalizeQuote(quoteCache.raw,target.hostname)};
  if(inflight?.key===cacheKey)return inflight.promise;
  const promise=(async()=>{const response=await fetch(target,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Market source failed');const raw=await response.json();const quality=normalizeQuote(raw,target.hostname);quoteCache={key:cacheKey,at:Date.now(),raw};return {quality};})();
  inflight={key:cacheKey,promise};try{return await promise}finally{if(inflight?.promise===promise)inflight=null}
 }
 const response=await fetch(target,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Market source failed');
 const raw=await response.json();
 if(kind==='candles')return Q.candles(raw,timeframe);
 return {quality:normalizeQuote(raw,target.hostname)};
}
module.exports={read};
