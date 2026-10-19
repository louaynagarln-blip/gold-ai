'use strict';
// Explicit deployment preflight only. Never run as part of fixture unit tests.
(async()=>{
 const feed=require('../lib/market-feed'),start=performance.now();
 const sets=await Promise.all(['M1','M5','M15'].map(tf=>feed.read('candles',tf)));
 const result={source:'Twelve Data',requestMs:Math.round(performance.now()-start),timeframes:sets.map((s,i)=>({timeframe:['M1','M5','M15'][i],ready:s.ready,code:s.code,count:s.bars.length,lastClosed:s.bars.at(-1)?.end??null,ageMs:s.bars.length?Date.now()-s.bars.at(-1).end:null}))};
 console.log('GOLD_LIVE_CANDLES '+JSON.stringify(result));
 if(!sets.every(s=>s.ready))process.exitCode=1;
})().catch(()=>{console.log('GOLD_LIVE_CANDLES {"ready":false,"reason":"provider_unavailable"}');process.exitCode=1});
