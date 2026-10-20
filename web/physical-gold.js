(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GoldPhysical=api;})(typeof self!=='undefined'?self:this,function(){
 'use strict';
 const SCHEMA='gold-physical-portfolio-v1',TROY_OUNCE=31.1034768,MAX=200;
 const presets={coin:{name:'ليرة',grams:8,karat:21},half:{name:'نصف ليرة',grams:4,karat:21},quarter:{name:'ربع ليرة',grams:2,karat:21},ounce:{name:'أونصة تروي',grams:TROY_OUNCE,fineness:999.9},bar:{name:'سبيكة',grams:10,fineness:999.9},jewelry:{name:'مصاغ',grams:1,karat:18},custom:{name:'قطعة مخصّصة',grams:1,karat:21}};
 function number(value){if(typeof value==='boolean'||value==null||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null;}
 function piece(raw){
  if(!raw||typeof raw.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id))throw Error('معرّف القطعة غير صالح');
  const grams=number(raw.grams),quantity=number(raw.quantity),unitCost=number(raw.unitCost);
  if(!(grams>0&&grams<=100000))throw Error('أدخل الوزن الفعلي للقطعة بالغرام');
  if(!Number.isInteger(quantity)||quantity<1||quantity>100000)throw Error('عدد القطع يجب أن يكون عدداً صحيحاً موجباً');
  if(!(unitCost!==null&&unitCost>=0&&unitCost<=1e9))throw Error('أدخل الكلفة الكاملة للقطعة بالدولار');
  if(!['karat','fineness'].includes(raw.purityMode))throw Error('اختر طريقة النقاوة');
  if(Math.abs(unitCost*100-Math.round(unitCost*100))>1e-5||unitCost*quantity>1e12)throw Error('الكلفة بالدولار يجب أن تكون بحد أقصى منزلتين عشريتين وضمن الحدود');
  const mode=raw.purityMode,purityValue=number(raw.purityValue),divisor=mode==='karat'?24:1000;
  if(!(purityValue>0&&purityValue<=divisor))throw Error('العيار يجب أن يكون حتى 24، أو النقاوة حتى 1000');
  const bid=number(raw.netBid),bidAt=number(raw.bidAt);
  if(bid!==null&&(Math.abs(bid*100-Math.round(bid*100))>1e-5||bid*quantity>1e12))throw Error('عرض الصائغ يجب أن يكون بحد أقصى منزلتين عشريتين وضمن الحدود');
  if(raw.netBid!=null&&raw.netBid!==''&&(!(bid!==null&&bid>=0&&bid<=1e9)||!Number.isSafeInteger(bidAt)||bidAt<=0))throw Error('عرض الصائغ أو وقته غير صالح');
  if(raw.purchaseDate&&(!/^\d{4}-\d\d-\d\d$/.test(raw.purchaseDate)||!Number.isFinite(Date.parse(raw.purchaseDate+'T00:00:00Z'))||new Date(raw.purchaseDate+'T00:00:00Z').toISOString().slice(0,10)!==raw.purchaseDate))throw Error('تاريخ الشراء غير صالح');
  return {id:raw.id,name:String(raw.name||'قطعة ذهب').trim().slice(0,80),grams,quantity,purityMode:mode,purityValue,unitCost,purchaseDate:raw.purchaseDate||'',netBid:bid,bidAt:bid===null?null:bidAt};
 }
 function restore(raw){
  if(raw?.schema!==SCHEMA||!Array.isArray(raw.pieces)||raw.pieces.length>MAX)throw Error('نسخة المحفظة غير صالحة');
  if(raw.pieces.reduce((n,p)=>n+(number(p.unitCost)||0)*(number(p.quantity)||0),0)>1e12)throw Error('المحفظة تتجاوز الحدود');
  const ids=new Set();return raw.pieces.map(x=>{const p=piece(x);if(ids.has(p.id))throw Error('معرّف مكرر');ids.add(p.id);return p});
 }
 function summary(rows,spot,now=Date.now()){
  if(!Array.isArray(rows)||rows.length>MAX)throw Error('المحفظة غير صالحة');
  const price=number(spot),details=rows.map(raw=>{const p=piece(raw),purity=p.purityValue/(p.purityMode==='karat'?24:1000),pureGrams=p.grams*p.quantity*purity,totalCost=Math.round(p.unitCost*100)*p.quantity/100,reference=price>0?pureGrams/TROY_OUNCE*price:null,bidFresh=p.netBid!==null&&now-p.bidAt>=0&&now-p.bidAt<=86400000;
   return {...p,pureGrams,totalCost,reference,bidFresh,netOffer:bidFresh?Math.round(p.netBid*100)*p.quantity/100:null,offerProfit:bidFresh?(Math.round(p.netBid*100)-Math.round(p.unitCost*100))*p.quantity/100:null,breakEvenPerPiece:p.unitCost};
  });
  if(details.reduce((n,p)=>n+p.totalCost,0)>1e12)throw Error('الكلفة الإجمالية تتجاوز الحدود');
  const sum=key=>details.reduce((total,p)=>total+p[key],0),cash=key=>details.reduce((total,p)=>total+Math.round(p[key]*100),0)/100,hasAllBids=details.length>0&&details.every(p=>p.bidFresh);
  return {details,quantity:sum('quantity'),grams:details.reduce((n,p)=>n+p.grams*p.quantity,0),pureGrams:sum('pureGrams'),cost:cash('totalCost'),reference:details.length&&price>0?sum('reference'):null,netOffer:hasAllBids?cash('netOffer'):null,offerProfit:hasAllBids?cash('offerProfit'):null,hasAllBids};
 }
 // Cash comparisons only: never infer a future jeweller quote from spot forecasts.
 function purchase(raw,spot){
  const p=piece({...raw,id:'purchase_plan',netBid:null,bidAt:null}),target=number(raw.targetProfit),owned=raw.mode==='owned';
  if(p.unitCost<=0)throw Error('سعر الشراء يجب أن يكون أكبر من صفر');
  if(target===null||target<0||target>1e9||Math.abs(target*100-Math.round(target*100))>1e-5)throw Error('أدخل الربح المستهدف لكل قطعة بالدولار، أو صفر للتعادل');
  const askCents=Math.round(p.unitCost*100),targetCents=Math.round(target*100),totalTarget=(askCents+targetCents)*p.quantity;
  if(totalTarget>1e14)throw Error('مجموع الكلفة والهدف يتجاوز الحدود');
  const bid=number(raw.resaleBid);
  if(raw.resaleBid!==undefined&&raw.resaleBid!==null&&raw.resaleBid!==''&&(!(bid>0&&bid<=1e9)||Math.abs(bid*100-Math.round(bid*100))>1e-5))throw Error('أدخل صافي عرض إعادة البيع الصحيح، أو اتركه فارغاً');
  const purePerPiece=p.grams*p.purityValue/(p.purityMode==='karat'?24:1000),reference=number(spot)>0?purePerPiece/TROY_OUNCE*number(spot):null,bidCents=bid===null?null:Math.round(bid*100),delta=bidCents===null?null:bidCents-askCents;
  return {mode:owned?'owned':'new',purePerPiece,pureGrams:purePerPiece*p.quantity,quantity:p.quantity,totalCost:askCents*p.quantity/100,referencePerPiece:reference,premiumPerPiece:reference===null?null:p.unitCost-reference,premiumPct:reference===null?null:(p.unitCost/reference-1)*100,netResale:bidCents===null?null:bidCents*p.quantity/100,immediateDifference:delta===null?null:delta*p.quantity/100,immediateDifferencePct:delta===null?null:delta/askCents*100,breakEvenPerPiece:p.unitCost,targetPerPiece:(askCents+targetCents)/100,targetTotal:totalTarget/100,requiredResaleRisePct:bidCents===null?null:((askCents+targetCents)/bidCents-1)*100,invertedQuote:!owned&&bidCents!==null&&bidCents>askCents};
 }
 // Converts model scenarios to contained-metal value only, never a dealer bid or profit.
 function impact(raw,forecast){
  const v=purchase(raw,null),reference=forecast?.currentPrice;
  if(!forecast?.ready||typeof reference!=='number'||!Number.isFinite(reference)||reference<=0)throw Error('لا يوجد توقع صالح للمقارنة');
  const ounces=v.pureGrams/TROY_OUNCE,spread=v.immediateDifference===null?null:Math.max(0,-v.immediateDifference);
  const horizons=[24,48].map(hours=>{const h=forecast['h'+hours];if(!h||![h.low,h.high].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)||h.low>h.high)throw Error('نطاق التوقع غير صالح');
   const low=h.low*ounces,high=h.high*ounces,base=reference*ounces,lowChange=low-base,highChange=high-base;
   return {hours,low,high,base,lowChange,highChange,spread,comparison:v.mode==='owned'?'OWNED':spread===null?'NO_BID':v.invertedQuote?'CHECK_QUOTES':spread===0?'NO_GAP':Math.max(0,highChange)<spread?'BELOW_GAP':'NOT_PROOF'};
  });
  return {quantity:v.quantity,pureGrams:v.pureGrams,reference,referenceTime:forecast.referenceTime,horizons,metalOnly:true};
 }
 return {SCHEMA,TROY_OUNCE,MAX,presets,piece,restore,summary,purchase,impact};
});
