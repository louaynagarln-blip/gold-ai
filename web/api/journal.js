const {verify,bearer}=require('../lib/auth');const journal=require('../lib/journal');let auth={};try{auth=require('../server-data/auth')}catch{}
module.exports=async(req,res)=>{res.setHeader('Cache-Control','private, no-store');if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const user=verify(bearer(req),auth.secret);if(!user)return res.status(401).json({error:'Unauthorized'});
 if(!journal.configured())return res.status(503).json({status:'NOT_CONFIGURED',entries:[],messageAr:'الحفظ السحابي غير مفعّل؛ صدّر نسخة احتياطية لحماية السجل'});
 try{return res.status(200).json({status:'CONNECTED',entries:await journal.read(user.u)});}catch{return res.status(503).json({status:'UNAVAILABLE',entries:[],messageAr:'تعذّرت مزامنة السجل؛ النسخة المحلية محفوظة'});}
};
