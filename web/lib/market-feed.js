'use strict';
const Q=require('../data-quality');
let market={};try{market=require('../server-data/market')}catch{}
async function read(kind='quote',timeframe='M1'){
 const configured=kind==='candles'?(market.candlesUrl||process.env.MARKET_CANDLES_API_URL):(market.apiUrl||process.env.MARKET_API_URL);
 // A quote response may include documented OHLC arrays. Never synthesize candles from ticks.
 const url=String(configured||market.apiUrl||process.env.MARKET_API_URL||'').trim();
 if(!url.startsWith('https://'))throw Error('Market source is not configured');
 const target=new URL(url);if(kind==='candles'&&configured)target.searchParams.set('timeframe',timeframe);
 const headers={Accept:'application/json','Cache-Control':'no-cache'},key=String(market.apiKey||process.env.MARKET_API_KEY||'').trim();if(key)headers['X-API-Key']=key;
 const response=await fetch(target,{headers,cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Market source failed');
 const raw=await response.json();
 if(kind==='candles')return Q.candles(raw,timeframe);
 return {raw,quality:Q.quote(raw)};
}
module.exports={read};
