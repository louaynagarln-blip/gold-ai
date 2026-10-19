'use strict';
// Chronological holdout only. This does not fit probabilities or simulate broker fills.
const Q=require('../data-quality'),F=require('../forecast-engine'),J=require('../journal-core');
function run(raw){
 const rows=raw?.timeframes?.M1;if(!Array.isArray(rows)||rows.length<1000)throw Error('At least 1000 source M1 candles are required');
 const last=Q.timestamp(rows.at(-1).openTime??rows.at(-1).time??rows.at(-1).timestamp),end=last+60000;
 const m1=Q.candles(raw,'M1',end,1000),m15=Q.candles(raw,'M15',end,22);if(!m1.ready||!m15.ready)throw Error(m1.reasonAr||m15.reasonAr);
 const split=Math.floor(m1.bars.length*.7),cutoff=m1.bars[split].end,entries=[];
 for(const bar of m15.bars){if(bar.end<cutoff)continue;const available=m15.bars.filter(x=>x.end<=bar.end).slice(-120),f=F.analyze({symbol:'XAUUSD',source:raw.source,bars:available},{},{now:bar.end});if(!f.ready)continue;
  const entry={id:J.MODEL+'-'+f.referenceTime,modelVersion:J.MODEL,referenceTime:f.referenceTime,createdAt:new Date(bar.end).toISOString(),price:f.currentPrice,h24:f.h24,h48:f.h48,evaluations:{}};
  entries.push(J.evaluate(entry,m1.bars,end));
 }
 return {modelVersion:J.MODEL,inputSource:raw.source,mode:'chronological-holdout-no-fitting',holdoutStart:new Date(cutoff).toISOString(),calibratedProbability:null,forecasts:entries.length,h24:J.stats(entries,'h24'),h48:J.stats(entries,'h48'),notes:['Only the final 30% is evaluated; earlier candles provide warm-up.','No future candles enter any forecast.','No live performance or broker execution is represented.','Overlapping forecast horizons are dependent; Wilson intervals are descriptive, not a calibration claim.']};
}
module.exports={run};
if(require.main===module){try{const file=process.argv[2];if(!file)throw Error('Usage: node tools/holdout.js verified-source-candles.json');const result=run(JSON.parse(require('node:fs').readFileSync(file,'utf8')));console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
