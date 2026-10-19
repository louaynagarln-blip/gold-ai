const {verify,bearer}=require('../lib/auth');
const Forecast=require('../forecast-engine');
const {getMacroSnapshot}=require('../lib/macro');
const {getCalendarSnapshot}=require('../lib/calendar');
let auth={},market={};try{auth=require('../server-data/auth')}catch{}try{market=require('../server-data/market')}catch{}
let macroCache={value:null,at:0},calendarCache={value:null,at:0};
const feed=require('../lib/market-feed'),journal=require('../lib/journal');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const user=verify(bearer(req),auth.secret);if(!user)return res.status(401).json({error:'Unauthorized'});
  try{
    const candles=await feed.read('candles','M15'),now=Date.now();if(!candles.ready)return res.status(200).json({forecast:{ready:false,action:'WAIT',messageAr:candles.reasonAr},storage:journal.configured()?'CONFIGURED':'NOT_CONFIGURED'});
    await Promise.all([
      (async()=>{if(!macroCache.value||now-macroCache.at>30*60*1000){macroCache.value=await getMacroSnapshot();macroCache.at=now}})(),
      (async()=>{if(!calendarCache.value||now-calendarCache.at>20*60*1000){calendarCache.value=await getCalendarSnapshot();calendarCache.at=now}})()
    ]);
    const calendar=calendarCache.value,macro={...macroCache.value,calendar,eventRisk24h:calendar.risk24h,eventRisk48h:calendar.risk48h};
    const forecast=Forecast.analyze(candles,macro);let storage=journal.configured()?'CONFIGURED':'NOT_CONFIGURED';if(forecast.ready&&journal.configured())try{await journal.record(user.u,forecast);const evaluationBars=await feed.read('candles','M1');if(evaluationBars.ready)await journal.reconcile(user.u,evaluationBars.bars)}catch{storage='UNAVAILABLE'}
    res.setHeader('Cache-Control','private, no-store');return res.status(200).json({forecast,macro,calendar,storage,analysisBasis:'closed-M15',context:Forecast.context(candles)});
  }catch(e){return res.status(502).json({error:'Forecast unavailable',details:'Market or intelligence source unavailable'})}
};
