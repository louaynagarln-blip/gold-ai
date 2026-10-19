'use strict';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=(n,d=3)=>Number(Number(n).toFixed(d));

function parseFredCsv(text){
  const lines=String(text||'').trim().split(/\r?\n/);if(lines.length<2)return [];
  const out=[];for(const line of lines.slice(1)){const comma=line.indexOf(',');if(comma<0)continue;const date=line.slice(0,comma).replace(/^"|"$/g,'').trim(),raw=line.slice(comma+1).replace(/^"|"$/g,'').trim(),value=Number(raw);if(date&&raw!==''&&raw!=='.'&&Number.isFinite(value))out.push({date,value})}return out;
}
function parseStooqCsv(text){
  const lines=String(text||'').trim().split(/\r?\n/);if(lines.length<2)return [];
  const headers=lines[0].split(',').map(x=>x.trim().toLowerCase()),dateIndex=headers.indexOf('date'),closeIndex=headers.indexOf('close');if(dateIndex<0||closeIndex<0)return [];
  const out=[];for(const line of lines.slice(1)){const parts=line.split(','),date=String(parts[dateIndex]||'').trim(),raw=String(parts[closeIndex]??'').trim(),value=Number(raw);if(date&&raw!==''&&raw!=='.'&&Number.isFinite(value))out.push({date,value})}return out;
}
const validValue=x=>x!==null&&x!==undefined&&x!==''&&typeof x!=='boolean'&&Number.isFinite(Number(x));
function clean(series){return (series||[]).filter(x=>validValue(x.value))}
function changePct(series,lookback=5){const a=clean(series);if(a.length<2)return null;const last=Number(a.at(-1).value),past=Number(a[Math.max(0,a.length-1-lookback)].value);return past?((last-past)/past)*100:null}
function latest(series){const x=clean(series).at(-1);return x?Number(x.value):null}
function absoluteChange(series,lookback=5){const a=clean(series);if(a.length<2)return null;return Number(a.at(-1).value)-Number(a[Math.max(0,a.length-1-lookback)].value)}
function factor(series,absolute=false,lookback=5,now=Date.now()){
 const a=clean(series),last=a.at(-1),date=last?.date,time=typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date)?Date.parse(date+'T00:00:00Z'):NaN;
 const status=!last?'missing':!Number.isFinite(time)||time>now?'invalid':now-time>7*86400000?'stale':a.length<2?'insufficient':'available';
 return {latest:latest(a),changePct:status==='available'?(absolute?absoluteChange(a,lookback):changePct(a,lookback)):null,date:date||null,status,unit:absolute?'percentage-points':'percent'};
}

function scoreNews(articles){
  const bullish=['war','conflict','attack','missile','sanction','crisis','escalat','uncertainty','recession','inflation','rate cut','fed cut','safe haven','invasion','tariff','geopolit','central bank buying','bank stress','default','توتر','حرب','هجوم','عقوبات','أزمة','تصعيد','تضخم','خفض الفائدة','ملاذ آمن'];
  const bearish=['ceasefire','peace deal','de-escalat','rate hike','hawkish','strong dollar','risk-on','هدنة','سلام','خفض التصعيد','رفع الفائدة','دولار قوي'];
  let raw=0,bull=0,bear=0;const hits=[];
  for(const a of articles||[]){const t=String(a.title||'').toLowerCase();let local=0;for(const k of bullish)if(t.includes(k)){raw+=1;local++;bull++}for(const k of bearish)if(t.includes(k)){raw-=1;local--;bear++}if(local)hits.push({title:a.title,score:local,domain:a.domain||''})}
  const score=clamp(raw*4.5,-48,48);return {score,bullishCount:bull,bearishCount:bear,hits:hits.slice(0,10)};
}
async function fetchText(url,timeout=15000){const r=await fetch(url,{headers:{Accept:'text/csv,application/json;q=0.9,*/*;q=0.8','User-Agent':'GOLD-AI-Forecast/4.1.0'},signal:AbortSignal.timeout(timeout)}),text=await r.text();if(!r.ok)throw Error(`HTTP ${r.status} for ${new URL(url).hostname}`);return text}
async function fetchFred(id,days=220){const start=new Date(Date.now()-days*86400000).toISOString().slice(0,10),url=`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${start}`;return parseFredCsv(await fetchText(url))}
async function fetchStooqGold(days=260){const end=new Date().toISOString().slice(0,10).replaceAll('-',''),start=new Date(Date.now()-days*86400000).toISOString().slice(0,10).replaceAll('-',''),url=`https://stooq.com/q/d/l/?s=xauusd&i=d&d1=${start}&d2=${end}`;return parseStooqCsv(await fetchText(url))}
async function fetchNews(){const query='gold OR "Federal Reserve" OR inflation OR interest rates OR war OR sanctions OR ceasefire OR tariffs OR central bank OR stocks OR bond yields';const url='https://api.gdeltproject.org/api/v2/doc/doc?query='+encodeURIComponent(query)+'&mode=ArtList&maxrecords=40&format=json&timespan=24h';const j=JSON.parse(await fetchText(url));return Array.isArray(j.articles)?j.articles.slice(0,40).map(x=>({title:String(x.title||''),url:String(x.url||''),domain:String(x.domain||''),seenDate:x.seendate||null})) : []}

async function getMacroSnapshot(){
  const errors=[],data={};
  const series=[['usd','DTWEXBGS'],['yield10','DGS10'],['yield2','DGS2'],['fedFunds','DFF'],['vix','VIXCLS'],['sp500','SP500'],['nasdaq','NASDAQCOM'],['oil','DCOILWTICO']];
  let articles=[];
  await Promise.all([
    ...series.map(async([key,id])=>{try{data[key]=await fetchFred(id,100)}catch(e){errors.push(`${key}: ${e.message}`);data[key]=[]}}),
    (async()=>{try{data.gold=await fetchStooqGold(300)}catch(e){errors.push(`gold: ${e.message}`);data.gold=[]}})(),
    (async()=>{try{articles=await fetchNews()}catch(e){errors.push(`news: ${e.message}`)}})()
  ]);

  return buildSnapshot(data,articles,errors);
}
function buildSnapshot(data={},articles=[],errors=[],now=Date.now()){
 const factors={};for(const k of ['usd','yield10','yield2','fedFunds','vix','sp500','nasdaq','oil'])factors[k]=factor(data[k],['yield10','yield2','fedFunds'].includes(k),k==='fedFunds'?20:5,now);
 const v=k=>factors[k].changePct,scale=(value,m,lo,hi)=>value===null?null:(clamp(value*m,lo,hi)||0),news=scoreNews(articles);
 const components={usd:scale(v('usd'),-20,-38,38),yields10:scale(v('yield10'),-26,-35,35),yields2:scale(v('yield2'),-28,-35,35),policy:scale(v('fedFunds'),-18,-22,22),risk:scale(v('vix'),1.35,-28,28),equities:v('sp500')===null||v('nasdaq')===null?null:clamp(-(v('sp500')*.8+v('nasdaq')*.45),-20,20),oil:scale(v('oil'),.5,-12,12),news:articles.length?news.score:null};
 const weights={usd:.22,yields10:.16,yields2:.15,policy:.08,risk:.13,equities:.08,oil:.05,news:.13},known=Object.entries(components).filter(([,x])=>x!==null);
 // Missing components contribute no invented evidence; retain original weights without amplifying a lone source.
 const composite=known.length?round(known.reduce((sum,[k,x])=>sum+x*weights[k],0),1):null;
 const labels={usd:'الدولار',yields10:'عائد 10 سنوات',yields2:'عائد السنتين',policy:'الفائدة الفعلية',risk:'تقلب الأسواق',equities:'الأسهم الأميركية',oil:'النفط',news:'الأخبار العالمية'};
 const reasonsAr=known.map(([k,x])=>`${labels[k]}: ${x===0?'لا تغير اتجاهي محسوب':x>0?'أثر داعم محتمل للذهب':'أثر ضاغط محتمل على الذهب'}`),reasons=known.map(([k,x])=>`${k}: ${x===0?'no measured directional change':x>0?'potential support for gold':'potential pressure on gold'}`);
 if(known.length<8){reasonsAr.push('بعض العوامل مفقودة أو قديمة؛ لا تُعامل كإشارات محايدة أو أسباب مؤكدة.');reasons.push('Missing or old factors are excluded from directional evidence.')}
 const quality=Math.round(known.reduce((sum,[k])=>sum+weights[k],0)*100);
 return {updatedAt:new Date(now).toISOString(),status:quality===0?'unavailable':quality===100?'live':'partial',quality,compositeScore:composite,components,factors,news:{...news,count:articles.length,status:articles.length?'available':'missing',headlines:articles.slice(0,10)},goldDaily:(data.gold||[]).slice(-120),reasonsAr,reasons,errors};
}

module.exports={parseFredCsv,parseStooqCsv,changePct,absoluteChange,scoreNews,factor,buildSnapshot,getMacroSnapshot};
