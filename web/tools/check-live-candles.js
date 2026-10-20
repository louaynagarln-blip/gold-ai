'use strict';
// Explicit deployment preflight only. Never run as part of fixture unit tests.
(async()=>{
 if(process.env.MARKET_CANDLES_PROVIDER!=='twelvedata'||!process.env.TWELVE_DATA_API_KEY){console.log('GOLD_LIVE_CANDLES skipped: provider not configured');return}
 const feed=require('../lib/market-feed'),start=performance.now();
 const sets=await Promise.all(['M1','M5','M15'].map(tf=>feed.read('candles',tf)));
 const result={source:'Twelve Data',requestMs:Math.round(performance.now()-start),timeframes:sets.map((s,i)=>({timeframe:['M1','M5','M15'][i],ready:s.ready,code:s.code,count:s.bars.length,lastClosed:s.bars.at(-1)?.end??null,ageMs:s.bars.length?Date.now()-s.bars.at(-1).end:null,latestNativeClosedEnd:s.latestNativeClosedEnd??null,nativeMinuteAgeMs:s.latestNativeClosedEnd?Date.now()-s.latestNativeClosedEnd:null}))};
 console.log('GOLD_LIVE_CANDLES '+JSON.stringify(result));
 if(sets[0].ready&&sets[2].ready){try{console.log('GOLD_VALIDATION '+JSON.stringify(require('../validation-engine').run({M1:sets[0],M15:sets[2]})))}catch{console.log('GOLD_VALIDATION '+JSON.stringify({ready:false,reason:'history_validation_failed'}))}}else console.log('GOLD_VALIDATION '+JSON.stringify({ready:false,reason:'history_unavailable'}));
 try{const history=await require('../lib/probability-history').read(process.env.TWELVE_DATA_API_KEY);const report=require('../lib/probability-engine').run(history);console.log('GOLD_PROBABILITY '+JSON.stringify({...report,requests:history.requests,requestMs:history.requestMs}))}catch{console.log('GOLD_PROBABILITY '+JSON.stringify({ready:false,reason:'hourly_history_unavailable'}))}
 if(!sets.some(s=>s.ready))process.exitCode=1;
})().catch(()=>{console.log('GOLD_LIVE_CANDLES {"ready":false,"reason":"provider_unavailable"}');process.exitCode=1});
