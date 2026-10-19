(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./data-quality'):root.GoldDataQuality,typeof module==='object'&&module.exports?require('./forecast-engine'):root.GoldForecastEngine,typeof module==='object'&&module.exports?require('./journal-core'):root.GoldJournal);if(typeof module==='object'&&module.exports)module.exports=api;else root.GoldValidation=api;})(typeof self!=='undefined'?self:this,function(Q,F,J){
'use strict';
const MIN_SAMPLES=20,HOUR=3600000;
const direction=(start,end)=>Math.abs((end/start-1)*100)<=.05?'NEUTRAL':end>start?'BULLISH':'BEARISH';
function run(sets,now=Date.now()){
 const verified={};for(const tf of ['M1','M15']){const s=sets?.[tf];const c=Q.candles({symbol:s?.symbol,source:s?.source,timeframe:tf,candles:s?.bars||[]},tf,now,tf==='M1'?1000:22,Number.MAX_SAFE_INTEGER);if(!c.ready)throw Error('لا تتوفر سلسلة '+tf+' تاريخية مكتملة وموثوقة: '+c.reasonAr);verified[tf]=c;}
 const m1=verified.M1,m15=verified.M15;if(m1.source!==m15.source)throw Error('لا يمكن خلط مصدرين في فحص واحد');
 const minuteByEnd=new Map(m1.bars.map(b=>[b.end,b]));
 const within=m15.bars.filter(b=>b.time>=m1.bars[0].time&&b.end<=m1.bars.at(-1).end);
 // All M15 reference candles must agree with their 15 source M1 candles.
 for(const b of within){const g=Array.from({length:15},(_,i)=>minuteByEnd.get(b.time+(i+1)*60000));if(g.some(x=>!x))throw Error('شموع المرجع لا تطابق سلسلة الدقائق');const vals=[g[0].open,Math.max(...g.map(x=>x.high)),Math.min(...g.map(x=>x.low)),g.at(-1).close];if(['open','high','low','close'].some((k,i)=>Math.abs(b[k]-vals[i])>1e-7*Math.max(1,Math.abs(vals[i]))))throw Error('قيم OHLC غير متطابقة بين المرجع والدقائق');}
 if(within.length<22)throw Error('لا توجد فترة مشتركة كافية بين سلسلتي المصدر');
 const end=m1.bars.at(-1).end,splitIndex=Math.floor(m1.bars.length*.7),cutoff=m1.bars[splitIndex].end,byEnd=new Map(m15.bars.map(b=>[b.end,b]));
 const horizon=hours=>{const rows=[];let nextReference=cutoff;for(const bar of within){if(bar.end<nextReference||bar.end<cutoff||bar.end+hours*HOUR>end)continue;const target=minuteByEnd.get(bar.end+hours*HOUR);if(!target)continue;const history=within.filter(b=>b.end<=bar.end);if(history.length<22)continue;const f=F.analyze({symbol:'XAUUSD',source:m15.source,bars:history},{},{now:bar.end});if(!f.ready)continue;const forecast=f[hours===24?'h24':'h48'],actual=direction(bar.close,target.close),prior=byEnd.get(bar.end-hours*HOUR),baselineTrend=prior?direction(prior.close,bar.close):null;
  rows.push({referenceTime:bar.end,targetTime:target.end,referencePrice:bar.close,actualPrice:target.close,predicted:forecast.bias,actual,hit:forecast.bias===actual,flatHit:actual==='NEUTRAL',trendHit:baselineTrend===null?null:baselineTrend===actual,modelAbsoluteErrorPct:Math.abs((target.close-forecast.center)/target.close)*100,flatAbsoluteErrorPct:Math.abs((target.close-bar.close)/target.close)*100});nextReference=bar.end+hours*HOUR;
 }
 const n=rows.length,hits=rows.filter(x=>x.hit).length,trendRows=rows.filter(x=>x.trendHit!==null),mean=(key)=>n?rows.reduce((v,r)=>v+r[key],0)/n:null;
 return {hours,n,hits,accuracy:n>=MIN_SAMPLES?hits/n*100:null,flatHits:rows.filter(x=>x.flatHit).length,flatAccuracy:n>=MIN_SAMPLES?rows.filter(x=>x.flatHit).length/n*100:null,trendN:trendRows.length,trendHits:trendRows.filter(x=>x.trendHit).length,trendAccuracy:trendRows.length>=MIN_SAMPLES?trendRows.filter(x=>x.trendHit).length/trendRows.length*100:null,modelMAE:mean('modelAbsoluteErrorPct'),flatMAE:mean('flatAbsoluteErrorPct'),rows:rows.slice(-12)};
 };
 return {schema:'gold-technical-validation-v1',modelVersion:J.MODEL,source:m15.source,generatedAt:new Date(now).toISOString(),datasetStart:m1.bars[0].time,datasetEnd:end,holdoutStart:cutoff,minutes:m1.bars.length,coverageHours:(end-m1.bars[0].time)/HOUR,minimumSamples:MIN_SAMPLES,mode:'fixed-model-chronological-final-30-percent',technicalOnly:true,livePerformance:false,calibratedProbability:null,h24:horizon(24),h48:horizon(48)};
}
return {run,MIN_SAMPLES};
});
