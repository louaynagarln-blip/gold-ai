'use strict';
const {ema,rsi}=require('../signal-engine');
const H=3600000,MODEL='gold-h1-frequency-v2',MIN_TRAIN=50,MIN_TEST=100,MIN_GROUP_TEST=30;
const classes=['UP','DOWN','FLAT'],groupNames={UP:'اتجاه وزخم صاعدان',DOWN:'اتجاه وزخم هابطان',MIXED:'مؤشرات مختلطة'};
function regime(bars,i){if(i<47)return null;const a=bars.slice(i-47,i+1);if(a.at(-1).end-a[0].time>7*24*H||a.some((b,j)=>j&&b.end-a[j-1].end>72*H))return null;const c=a.map(b=>b.close),fast=ema(c,9),slow=ema(c,21),r=rsi(c,14);return fast>slow&&r>=55?'UP':fast<slow&&r<=45?'DOWN':'MIXED'}
function outcome(a,b){const d=(b/a-1)*100;return Math.abs(d)<=.05?'FLAT':d>0?'UP':'DOWN'}
function counts(rows){return Object.fromEntries(classes.map(c=>[c,rows.filter(r=>r.actual===c).length]))}
function distribution(rows){const n=counts(rows);return Object.fromEntries(classes.map(c=>[c,(n[c]+1)/(rows.length+3)]))}
function brier(p,actual){return classes.reduce((s,c)=>s+(p[c]-(actual===c?1:0))**2,0)}
function interval(hits,n){if(!n)return null;const z=1.96,p=hits/n,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [center-half,center+half]}
function run(input,now=Date.now()){
 const bars=input?.bars;if(!Array.isArray(bars)||bars.length<100||bars.length>30000)throw Error('HISTORY_TOO_SHORT');
 bars.forEach((b,i)=>{if(!Number.isSafeInteger(b.time)||b.time%H||b.end!==b.time+H||b.end>now||![b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0)||b.high<Math.max(b.open,b.close,b.low)||b.low>Math.min(b.open,b.close)||(i&&b.time<=bars[i-1].time))throw Error('HISTORY_INVALID')});
 const last=bars.at(-1),currentGroup=regime(bars,bars.length-1),cut=bars[Math.floor(bars.length*.6)].end,byEnd=new Map(bars.map(b=>[b.end,b])),fresh=now-last.end<=90*60000;
 const horizons=[24,48].map(hours=>{const duration=hours*H,samples=[];let next=0;
  for(let i=47;i<bars.length;i++){const b=bars[i];if(b.end<next)continue;const target=byEnd.get(b.end+duration),group=regime(bars,i);if(!target||!group)continue;samples.push({reference:b.end,target:target.end,group,actual:outcome(b.close,target.close)});next=target.end;}
  const train=samples.filter(s=>s.target<=cut),test=samples.filter(s=>s.reference>=cut+48*H),base=distribution(train),groups={};
  for(const group of Object.keys(groupNames)){const fit=train.filter(s=>s.group===group);groups[group]={n:fit.length,p:distribution(fit)}}
  const evaluated=test.filter(s=>groups[s.group].n>0),matched=evaluated.filter(s=>s.group===currentGroup),fit=groups[currentGroup]||{n:0,p:null},observed=counts(matched);
  const modelBrier=evaluated.length?evaluated.reduce((s,r)=>s+brier(groups[r.group].p,r.actual),0)/evaluated.length:null,baselineBrier=evaluated.length?evaluated.reduce((s,r)=>s+brier(base,r.actual),0)/evaluated.length:null;
  const error=matched.length?Math.max(...classes.map(c=>Math.abs(observed[c]/matched.length-fit.p[c]))):null;
  const reasons=[];if(!fresh)reasons.push('مرجع الساعة قديم');if(!currentGroup)reasons.push('يلزم 48 شمعة ساعة متاحة بلا فجوة تتجاوز 72 ساعة وضمن سبعة أيام');if(fit.n<MIN_TRAIN)reasons.push('حالات بناء النموذج المشابهة أقل من '+MIN_TRAIN);if(evaluated.length<MIN_TEST)reasons.push('نتائج الاختبار المنفصلة أقل من '+MIN_TEST);if(matched.length<MIN_GROUP_TEST)reasons.push('حالات الاختبار المشابهة أقل من '+MIN_GROUP_TEST);if(modelBrier!==null&&modelBrier>=baselineBrier)reasons.push('النموذج لم يتفوق على تكرار الاتجاهات التاريخي البسيط');if(error!==null&&error>.10)reasons.push('فرق التوقع عن التكرار المرصود يتجاوز 10 نقاط مئوية');
  return {hours,ready:reasons.length===0,reasons,trainingCases:fit.n,validationCases:evaluated.length,matchingValidationCases:matched.length,modelBrier,baselineBrier,maxGroupCalibrationError:error,probabilities:reasons.length?null:fit.p,validationObserved:matched.length?Object.fromEntries(classes.map(c=>[c,{n:observed[c],rate:observed[c]/matched.length,interval:interval(observed[c],matched.length)}])):null};
 });
 return {model:MODEL,method:'fixed-regime-frequencies-60-40-with-48h-embargo',source:input.source,generatedAt:now,referenceTime:last.end,referencePrice:last.close,expiresAt:last.end+90*60000,start:bars[0].time,end:last.end,bars:bars.length,splitAt:cut,currentGroup,groupName:groupNames[currentGroup]||'غير مكتملة',neutralThresholdPct:.05,featureBars:48,featureSpanHours:(last.end-bars[Math.max(0,bars.length-48)].time)/H,featureMissingHours:(last.end-bars[Math.max(0,bars.length-48)].time)/H-48,technicalOnly:true,liveValidated:false,horizons};
}
module.exports={run,regime,MODEL,MIN_TRAIN,MIN_TEST,MIN_GROUP_TEST};
