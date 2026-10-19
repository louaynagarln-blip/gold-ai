const test=require('node:test'),assert=require('node:assert/strict'),R=require('../quote-recorder'),Q=require('../data-quality');
const NOW=Date.UTC(2026,9,19,12),quote=(time=NOW,price=4000)=>({price,sourceTime:time,source:'Gold API',symbol:'XAUUSD'});
test('recorder rejects stale, future, unidentified, wrong instrument and unknown source quotes',()=>{
 for(const q of [quote(NOW-31000),quote(NOW+3000),{...quote(),sourceTime:null},{...quote(),source:''},{...quote(),symbol:'XAU'},{...quote(),price:0}])assert.equal(R.append([],q,NOW).length,0);
});
test('recorder persists unchanged prices with advancing source time but never duplicates or rewrites a source timestamp',()=>{
 let rows=R.append([],quote(),NOW);rows=R.append(rows,quote(NOW,4200),NOW+1000);assert.equal(rows.length,1);assert.equal(rows[0].price,4000);rows=R.append(rows,quote(NOW+30000),NOW+30000);assert.equal(rows.length,2);assert.equal(R.append(rows,quote(NOW),NOW+30000).length,2);
});
test('restart restores original source and observation times; old, corrupted and legacy histories are excluded',()=>{
 const rows=R.append([],quote(),NOW),data=JSON.parse(JSON.stringify({schema:R.SCHEMA,samples:rows}));assert.deepEqual(R.restore(data,NOW+10000),rows);assert.deepEqual(R.restore(data,NOW+R.RETENTION+1),[]);assert.deepEqual(R.restore(rows,NOW),[]);assert.deepEqual(R.restore({...data,samples:[{...rows[0],price:'4000'}]},NOW),[]);
});
test('summary exposes real gaps and last-source statistics without interpolating or mixing sources',()=>{
 let rows=R.append([],quote(),NOW);rows=R.append(rows,quote(NOW+120000,4100),NOW+120000);let s=R.summary(rows,NOW+240000);assert.equal(s.count,2);assert.equal(s.gaps,2);assert.equal(s.low,4000);assert.equal(s.high,4100);assert(Math.abs(s.change-2.5)<1e-8);rows=R.append(rows,{...quote(NOW+240000,3000),source:'Other'},NOW+240000);s=R.summary(rows,NOW+240000);assert.equal(s.count,1);assert.equal(s.change,null);assert.equal(s.low,3000);
});
test('sample export schema cannot be mistaken for broker candle input',()=>{
 const rows=R.append([],quote(),NOW);assert.equal(Q.candles({schema:R.SCHEMA,samples:rows},'M1',NOW).ready,false);assert(!('open' in rows[0]));assert(!('high' in rows[0]));
});
