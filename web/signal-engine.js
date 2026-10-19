(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./data-quality'):root.GoldDataQuality);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.GoldSignalEngine=api;
})(typeof self!=='undefined'?self:this,function(Q){
  'use strict';
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const round=(n,d=2)=>Number(Number(n).toFixed(d));
  function ema(values,period){
    if(!Array.isArray(values)||values.length<period)return null;
    let value=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
    const k=2/(period+1);
    for(let i=period;i<values.length;i++)value=values[i]*k+value*(1-k);
    return value;
  }
  function rsi(values,period=14){
    if(!Array.isArray(values)||values.length<period+1)return null;
    let gains=0,losses=0;
    for(let i=1;i<=period;i++){
      const d=values[i]-values[i-1];
      if(d>=0)gains+=d;else losses-=d;
    }
    let avgGain=gains/period,avgLoss=losses/period;
    for(let i=period+1;i<values.length;i++){
      const d=values[i]-values[i-1];
      avgGain=(avgGain*(period-1)+Math.max(d,0))/period;
      avgLoss=(avgLoss*(period-1)+Math.max(-d,0))/period;
    }
    if(avgLoss===0)return avgGain===0?50:100;
    return 100-(100/(1+avgGain/avgLoss));
  }
  function averageMove(values,period=14){
    if(values.length<2)return 0;
    const start=Math.max(1,values.length-period);
    let total=0,count=0;
    for(let i=start;i<values.length;i++){total+=Math.abs(values[i]-values[i-1]);count++;}
    return count?total/count:0;
  }
  function streak(values,lookback=6){
    let up=0,down=0;
    const start=Math.max(1,values.length-lookback);
    for(let i=start;i<values.length;i++){
      if(values[i]>values[i-1])up++;
      if(values[i]<values[i-1])down++;
    }
    return {up,down,total:Math.max(1,values.length-start)};
  }
  function analyzeValues(input,config={}){
    const values=(input||[]).map(x=>typeof x==='number'?x:Number(x&&x.price)).filter(Number.isFinite);
    const minimum=22;
    const latest=values.at(-1)||0;
    if(values.length<minimum){
      return {side:'WAIT',strength:0,ready:false,samples:values.length,minimum,price:latest,rsi:null,ema9:null,ema21:null,momentum:0,volatility:0,reasons:['Collecting live samples'],reasonsAr:['جاري تجميع قراءات حقيقية']};
    }
    const e9=ema(values,9),e21=ema(values,21),r=rsi(values,14),vol=averageMove(values,14);
    const lookback=clamp(Number(config.momentumLookback)||6,2,20);
    const past=values[Math.max(0,values.length-1-lookback)]||latest;
    const momentum=past?((latest-past)/past)*100:0;
    const spread=e9-e21;
    const base=Math.max(vol,latest*0.00003,0.01);
    const trendUnits=spread/base;
    const st=streak(values,7);
    let buy=0,sell=0;
    if(spread>0)buy+=clamp(18+trendUnits*7,18,38); else sell+=clamp(18+(-trendUnits)*7,18,38);
    if(r>=52&&r<=70)buy+=clamp(14+(r-52)*0.7,14,27);
    else if(r>70)buy+=4;
    if(r<=48&&r>=30)sell+=clamp(14+(48-r)*0.7,14,27);
    else if(r<30)sell+=4;
    if(momentum>0)buy+=clamp(8+momentum*120,8,22);
    if(momentum<0)sell+=clamp(8+(-momentum)*120,8,22);
    if(latest>e9)buy+=8;else sell+=8;
    buy+=clamp((st.up/st.total)*10,0,10);
    sell+=clamp((st.down/st.total)*10,0,10);
    buy=clamp(Math.round(buy),0,99);sell=clamp(Math.round(sell),0,99);
    const buyThreshold=clamp(Number(config.buyThreshold)||75,50,99);
    const sellThreshold=clamp(Number(config.sellThreshold)||75,50,99);
    let side='WAIT',strength=Math.max(buy,sell);
    if(buy>=buyThreshold&&buy>=sell+8)side='BUY';
    if(sell>=sellThreshold&&sell>=buy+8)side='SELL';
    const stopMin=Math.max(0,Number(config.stopDistance)||0);
    const risk=Math.max(stopMin,vol*4,latest*0.00065);
    const tp1Min=Math.max(0,Number(config.tp1Distance)||0);
    const tp2Min=Math.max(0,Number(config.tp2Distance)||0);
    const tp1Risk=Math.max(tp1Min,risk*1.5);
    const tp2Risk=Math.max(tp2Min,risk*2.5);
    const plan=side==='SELL'?{
      entry:latest,stopLoss:latest+risk,takeProfit1:latest-tp1Risk,takeProfit2:latest-tp2Risk
    }:{
      entry:latest,stopLoss:latest-risk,takeProfit1:latest+tp1Risk,takeProfit2:latest+tp2Risk
    };
    const reasons=[],reasonsAr=[];
    if(spread>0){reasons.push('EMA 9 is above EMA 21');reasonsAr.push('EMA 9 أعلى من EMA 21');}
    else{reasons.push('EMA 9 is below EMA 21');reasonsAr.push('EMA 9 أدنى من EMA 21');}
    reasons.push(`RSI ${round(r,1)}`);reasonsAr.push(`RSI عند ${round(r,1)}`);
    reasons.push(`Momentum ${round(momentum,3)}%`);reasonsAr.push(`الزخم ${round(momentum,3)}%`);
    if(side==='WAIT'){reasons.push('Conditions are not aligned');reasonsAr.push('الشروط غير متوافقة بما يكفي');}
    return {side,strength,ready:true,samples:values.length,minimum,price:latest,rsi:round(r,1),ema9:round(e9,3),ema21:round(e21,3),momentum:round(momentum,4),volatility:round(vol,4),buyScore:buy,sellScore:sell,plan:Object.fromEntries(Object.entries(plan).map(([k,v])=>[k,round(v,2)])),reasons,reasonsAr};
  }
  function analyze(input,config={}){
    const wait=reason=>({side:'WAIT',strength:0,ready:false,price:input?.quote?.price||0,reasonsAr:[reason],reasons:[reason]});
    if(!input?.connected)return wait('الاتصال مقطوع؛ الإشارات معلّقة');
    const q=Q.quote(input.quote,config.now??Date.now());if(!q.usable)return wait(Q.reasons[q.status]);
    const checked={};for(const tf of ['M1','M5']){const set=input.candles?.[tf];checked[tf]=Q.candles({symbol:set?.symbol,source:set?.source,timeframe:tf,candles:set?.bars||[]},tf,config.now??Date.now());if(!checked[tf].ready)return wait(checked[tf].reasonAr);}
    const values=checked.M1.bars.map(b=>b.close),higher=checked.M5.bars.map(b=>b.close),a=analyzeValues(values,config),direction=ema(higher,9)-ema(higher,21);
    a.reasonsAr.push('الدخول M1 وتأكيد الاتجاه M5؛ شموع مغلقة من '+checked.M1.source);a.atr=Q.atr(checked.M1.bars);
    if((a.side==='BUY'&&direction<=0)||(a.side==='SELL'&&direction>=0)){a.side='WAIT';a.reasonsAr.push('اتجاه M5 لا يؤكد إشارة M1');}
    if(a.side==='WAIT'){delete a.plan;return a;}
    const risk=Math.max(Number(config.stopDistance)||0,a.atr*1.5),sign=a.side==='BUY'?1:-1;
    a.plan={entry:q.price,stopLoss:round(q.price-sign*risk),takeProfit1:round(q.price+sign*risk*1.5),takeProfit2:round(q.price+sign*risk*2.5)};a.modelScore=a.strength;a.calibratedProbability=null;return a;
  }
  return {analyze,ema,rsi,averageMove};
});
