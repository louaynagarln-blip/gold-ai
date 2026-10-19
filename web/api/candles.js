const {verify,bearer}=require('../lib/auth');const feed=require('../lib/market-feed');
let auth={};try{auth=require('../server-data/auth')}catch{}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 if(!verify(bearer(req),auth.secret))return res.status(401).json({error:'Unauthorized'});
 const timeframe=String(req.query?.timeframe||'M1');if(!['M1','M5','M15'].includes(timeframe))return res.status(400).json({error:'Unsupported timeframe'});
 try{return res.status(200).json(await feed.read('candles',timeframe));}catch{return res.status(502).json({ready:false,code:'UNAVAILABLE',timeframe,bars:[],reasonAr:'تعذّر الوصول إلى مصدر الشموع؛ التحليل معلّق'});}
};
