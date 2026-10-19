const {verify,bearer}=require('../lib/auth');
const {getMacroSnapshot}=require('../lib/macro');
let auth={};try{auth=require('../server-data/auth')}catch{}
let cache={value:null,at:0};
module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!verify(bearer(req),auth.secret))return res.status(401).json({error:'Unauthorized'});
  try{
    if(!cache.value||Date.now()-cache.at>30*60*1000){cache.value=await getMacroSnapshot();cache.at=Date.now()}
    res.setHeader('Cache-Control','private, max-age=300');return res.status(200).json(cache.value);
  }catch(e){return res.status(502).json({error:'Macro feeds unavailable',details:e.message})}
};
