const test=require('node:test'),assert=require('node:assert/strict');
const {normalizeQuote}=require('../lib/provider-adapter');const NOW=Date.UTC(2026,9,19,12);
test('Gold API adapter confirms XAU and USD and retains source timestamp',()=>{const q=normalizeQuote({symbol:'XAU',currency:'USD',price:4000,updatedAt:new Date(NOW).toISOString()},'api.gold-api.com',NOW);assert.equal(q.symbol,'XAUUSD');assert.equal(q.source,'Gold API');assert.equal(q.sourceTime,NOW);assert.equal(q.refreshAfterMs,30000);assert(q.usable)});
test('Gold API adapter refuses a different asset, currency or unverified currency',()=>{for(const data of [{symbol:'BTC',currency:'USD'},{symbol:'XAU',currency:'EUR'},{symbol:'XAU'}])assert.throws(()=>normalizeQuote({...data,price:4000,updatedAt:NOW},'api.gold-api.com',NOW))});
test('provider cache deduplicates concurrent requests and never renews source time',async()=>{
 const oldFetch=global.fetch,oldNow=Date.now,oldUrl=process.env.MARKET_API_URL;let now=NOW,calls=0;
 process.env.MARKET_API_URL='https://api.gold-api.com/price/XAU';Date.now=()=>now;
 global.fetch=async()=>{calls++;await Promise.resolve();return new Response(JSON.stringify({symbol:'XAU',currency:'USD',price:4000,updatedAt:NOW}),{status:200})};
 delete require.cache[require.resolve('../lib/market-feed')];const feed=require('../lib/market-feed');
 try{const result=await Promise.all([feed.read(),feed.read(),feed.read()]);assert.equal(calls,1);assert(result.every(x=>x.quality.sourceTime===NOW));now=NOW+20000;assert.equal((await feed.read()).quality.sourceTime,NOW);assert.equal(calls,1);now=NOW+31000;const expired=await feed.read();assert.equal(calls,2);assert.equal(expired.quality.status,'STALE');assert.equal(expired.quality.sourceTime,NOW);const before=calls;const missing=await feed.read('candles','M1');assert.equal(missing.code,'CANDLES_NOT_CONFIGURED');assert.equal(calls,before)}
 finally{global.fetch=oldFetch;Date.now=oldNow;if(oldUrl===undefined)delete process.env.MARKET_API_URL;else process.env.MARKET_API_URL=oldUrl;delete require.cache[require.resolve('../lib/market-feed')]}
});
