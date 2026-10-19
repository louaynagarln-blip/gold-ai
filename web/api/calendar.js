const {verify,bearer}=require('../lib/auth');
const {getCalendarSnapshot}=require('../lib/calendar');
let auth={};try{auth=require('../server-data/auth')}catch{}
let cache={value:null,at:0};
module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!verify(bearer(req),auth.secret))return res.status(401).json({error:'Unauthorized'});
  try{
    if(!cache.value||Date.now()-cache.at>20*60*1000){cache.value=await getCalendarSnapshot();cache.at=Date.now()}
    res.setHeader('Cache-Control','private, max-age=300');return res.status(200).json(cache.value);
  }catch(e){return res.status(502).json({error:'Calendar unavailable',details:e.message})}
};
