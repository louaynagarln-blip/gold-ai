const {verify,bearer}=require('../lib/auth');const feed=require('../lib/market-feed');
let auth={};try{auth=require('../server-data/auth')}catch{}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!verify(bearer(req),auth.secret))return res.status(401).json({error:'Unauthorized'});
 const timeframe=String(req.query?.timeframe||'M1');if(!['M1','M5','M15','ALL'].includes(timeframe))return res.status(400).json({error:'Unsupported timeframe'});
 const started=performance.now();
 try{
  if(timeframe==='ALL'){
   const sets=await Promise.all(['M1','M5','M15'].map(tf=>feed.read('candles',tf)));
   return res.status(200).json({timeframes:Object.fromEntries(sets.map((s,i)=>[['M1','M5','M15'][i],s])),refreshAfterMs:process.env.MARKET_CANDLES_PROVIDER==='twelvedata'?120000:60000,requestMs:Math.round(performance.now()-started)});
  }
  return res.status(200).json(await feed.read('candles',timeframe));
 }catch{return res.status(502).json({ready:false,code:'UNAVAILABLE',timeframe,bars:[],reasonAr:'تعذّر الوصول إلى مصدر الشموع؛ التحليل معلّق'});}
};
