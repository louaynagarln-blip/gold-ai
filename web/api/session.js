const {verify,bearer}=require('../lib/auth');let auth={};try{auth=require('../server-data/auth')}catch{}
module.exports=async function(req,res){if(req.method!=='GET')return res.status(405).json({ok:false});const p=verify(bearer(req),auth.secret);return res.status(p?200:401).json(p?{ok:true,username:p.u}:{ok:false})}
