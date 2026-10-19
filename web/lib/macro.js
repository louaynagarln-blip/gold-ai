'use strict';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=(n,d=3)=>Number(Number(n).toFixed(d));

function parseFredCsv(text){
  const lines=String(text||'').trim().split(/\r?\n/);if(lines.length<2)return [];
  const out=[];for(const line of lines.slice(1)){const comma=line.indexOf(',');if(comma<0)continue;const date=line.slice(0,comma).replace(/^"|"$/g,'').trim(),value=Number(line.slice(comma+1).replace(/^"|"$/g,'').trim());if(date&&Number.isFinite(value))out.push({date,value})}return out;
}
function parseStooqCsv(text){
  const lines=String(text||'').trim().split(/\r?\n/);if(lines.length<2)return [];
  const headers=lines[0].split(',').map(x=>x.trim().toLowerCase()),dateIndex=headers.indexOf('date'),closeIndex=headers.indexOf('close');if(dateIndex<0||closeIndex<0)return [];
  const out=[];for(const line of lines.slice(1)){const parts=line.split(','),date=String(parts[dateIndex]||'').trim(),value=Number(parts[closeIndex]);if(date&&Number.isFinite(value))out.push({date,value})}return out;
}
function changePct(series,lookback=5){const a=(series||[]).filter(x=>Number.isFinite(Number(x.value)));if(a.length<2)return 0;const last=Number(a.at(-1).value),past=Number(a[Math.max(0,a.length-1-lookback)].value);return past?((last-past)/past)*100:0}
function latest(series){const x=(series||[]).at(-1);return x?Number(x.value):null}
function absoluteChange(series,lookback=5){const a=(series||[]).filter(x=>Number.isFinite(Number(x.value)));if(a.length<2)return 0;return Number(a.at(-1).value)-Number(a[Math.max(0,a.length-1-lookback)].value)}

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
  await Promise.all(series.map(async([key,id])=>{try{data[key]=await fetchFred(id,100)}catch(e){errors.push(`${key}: ${e.message}`);data[key]=[]}}));
  try{data.gold=await fetchStooqGold(300)}catch(e){errors.push(`gold: ${e.message}`);data.gold=[]}
  let articles=[];try{articles=await fetchNews()}catch(e){errors.push(`news: ${e.message}`)}

  const usdChange=changePct(data.usd,5),y10Change=absoluteChange(data.yield10,5),y2Change=absoluteChange(data.yield2,5),fedChange=absoluteChange(data.fedFunds,20),vixChange=changePct(data.vix,5),spChange=changePct(data.sp500,5),nasdaqChange=changePct(data.nasdaq,5),oilChange=changePct(data.oil,5),news=scoreNews(articles);
  const components={
    usd:clamp(-usdChange*20,-38,38),
    yields10:clamp(-y10Change*26,-35,35),
    yields2:clamp(-y2Change*28,-35,35),
    policy:clamp(-fedChange*18,-22,22),
    risk:clamp(vixChange*1.35,-28,28),
    equities:clamp(-(spChange*.8+nasdaqChange*.45),-20,20),
    oil:clamp(oilChange*.5,-12,12),
    news:news.score
  };
  const composite=clamp(components.usd*.22+components.yields10*.16+components.yields2*.15+components.policy*.08+components.risk*.13+components.equities*.08+components.oil*.05+components.news*.13,-100,100);
  const successful=series.filter(([k])=>data[k]?.length>2).length+(data.gold?.length>20?1:0)+(articles.length?1:0),quality=clamp(Math.round(successful/(series.length+2)*100),0,100);
  const reasonsAr=[
    usdChange>0?'قوة الدولار تضغط على الذهب':'ضعف الدولار يدعم الذهب',
    y2Change>0?'ارتفاع عائد السنتين يرفع ضغط توقعات الفائدة':'تراجع عائد السنتين يخفف ضغط الفائدة',
    y10Change>0?'ارتفاع عائد 10 سنوات عامل سلبي للذهب':'تراجع عائد 10 سنوات عامل داعم',
    vixChange>0?'ارتفاع القلق في الأسواق يدعم طلب الملاذ الآمن':'تراجع القلق يقلل طلب الملاذ الآمن',
    (spChange+nasdaqChange)<0?'ضعف الأسهم الأميركية يزيد الطلب الدفاعي':'قوة الأسهم تقلل بعض طلب الملاذ',
    news.score>8?'الأخبار العالمية تميل لدعم الذهب':news.score<-8?'الأخبار العالمية تميل للضغط على الذهب':'الأخبار العالمية متوازنة'
  ];
  const reasons=[
    usdChange>0?'US dollar strength pressures gold':'US dollar weakness supports gold',
    y2Change>0?'Rising 2-year yield adds rate pressure':'Falling 2-year yield reduces rate pressure',
    y10Change>0?'Rising 10-year yield is negative for gold':'Falling 10-year yield supports gold',
    vixChange>0?'Market stress supports safe-haven demand':'Lower stress reduces safe-haven demand',
    (spChange+nasdaqChange)<0?'US equity weakness supports defensive demand':'Equity strength reduces some safe-haven demand',
    news.score>8?'World news leans supportive for gold':news.score<-8?'World news leans negative for gold':'World news is balanced'
  ];
  return {updatedAt:new Date().toISOString(),status:errors.length?'partial':'live',quality,compositeScore:round(composite,1),components,
    factors:{
      usd:{latest:latest(data.usd),changePct:round(usdChange)},yield10:{latest:latest(data.yield10),changePct:round(y10Change,3)},yield2:{latest:latest(data.yield2),changePct:round(y2Change,3)},fedFunds:{latest:latest(data.fedFunds),changePct:round(fedChange,3)},
      vix:{latest:latest(data.vix),changePct:round(vixChange)},sp500:{latest:latest(data.sp500),changePct:round(spChange)},nasdaq:{latest:latest(data.nasdaq),changePct:round(nasdaqChange)},oil:{latest:latest(data.oil),changePct:round(oilChange)}
    },
    news:{...news,count:articles.length,headlines:articles.slice(0,10)},goldDaily:data.gold.slice(-120),reasonsAr,reasons,errors};
}
module.exports={parseFredCsv,parseStooqCsv,changePct,absoluteChange,scoreNews,getMacroSnapshot};
