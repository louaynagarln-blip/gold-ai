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
 return {SCHEMA,TROY_OUNCE,MAX,presets,piece,restore,summary};
});
