'use strict';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};

function stripHtml(html){
  return String(html||'')
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&ndash;|&#8211;/gi,'-')
    .replace(/&mdash;|&#8212;/gi,'-')
    .replace(/\s+/g,' ').trim();
}

function tzParts(ms,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
  const out={};for(const p of parts)if(p.type!=='literal')out[p.type]=Number(p.value);return out;
}
function zonedToUtc(year,month,day,hour=0,minute=0,second=0,timeZone='America/New_York'){
  let guess=Date.UTC(year,month-1,day,hour,minute,second);
  for(let i=0;i<3;i++){
    const p=tzParts(guess,timeZone),asUtc=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    guess-=asUtc-Date.UTC(year,month-1,day,hour,minute,second);
  }
  return guess;
}

function parseIcsDate(raw,params=''){
  const v=String(raw||'').trim();if(!v)return null;
  if(/^\d{8}$/.test(v))return Date.UTC(+v.slice(0,4),+v.slice(4,6)-1,+v.slice(6,8),12,0,0);
  const m=v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);if(!m)return null;
  const [,y,mo,d,h,mi,s='00',z]=m;
  if(z)return Date.UTC(+y,+mo-1,+d,+h,+mi,+s);
  const tz=(String(params).match(/TZID=([^;:]+)/i)||[])[1]||'America/New_York';
  return zonedToUtc(+y,+mo,+d,+h,+mi,+s,tz);
}

function impactForSummary(summary){
  const s=String(summary||'').toLowerCase();
  if(/consumer price index|employment situation|fomc|federal open market|interest rate|personal income and outlays|gdp/.test(s))return 'high';
  if(/producer price index|job openings|jolts|employment cost index|productivity and costs|import and export price/.test(s))return 'medium';
  return 'low';
}
function categoryForSummary(summary){
  const s=String(summary||'').toLowerCase();
  if(/consumer price index/.test(s))return 'CPI';
  if(/employment situation/.test(s))return 'JOBS';
  if(/producer price index/.test(s))return 'PPI';
  if(/job openings|jolts/.test(s))return 'JOLTS';
  if(/fomc|federal open market|interest rate/.test(s))return 'FOMC';
  if(/personal income and outlays/.test(s))return 'PCE';
  if(/gdp/.test(s))return 'GDP';
  return 'MACRO';
}

function parseBlsIcs(text){
  const raw=String(text||'').replace(/\r/g,'').split('\n');
  const lines=[];for(const line of raw){if((line.startsWith(' ')||line.startsWith('\t'))&&lines.length)lines[lines.length-1]+=line.slice(1);else lines.push(line)}
  const out=[];let ev=null;
  for(const line of lines){
    if(line==='BEGIN:VEVENT'){ev={};continue}if(line==='END:VEVENT'){if(ev?.summary&&ev?.start){const impact=impactForSummary(ev.summary);if(impact!=='low')out.push({id:ev.uid||`bls-${ev.start}-${ev.summary}`,source:'BLS',title:ev.summary,titleAr:translateEvent(ev.summary),timestamp:ev.start,impact,category:categoryForSummary(ev.summary),url:ev.url||'https://www.bls.gov/schedule/',timeZone:'America/New_York'})}ev=null;continue}if(!ev)continue;
    const ix=line.indexOf(':');if(ix<0)continue;const left=line.slice(0,ix),value=line.slice(ix+1);const [key,...pars]=left.split(';'),params=pars.join(';');
    if(key==='DTSTART')ev.start=parseIcsDate(value,params);else if(key==='SUMMARY')ev.summary=value.replace(/\\,/g,',').replace(/\\n/g,' ');else if(key==='UID')ev.uid=value;else if(key==='URL')ev.url=value;
  }
  return out;
}

function translateEvent(s){
  const x=String(s||'');
  if(/Consumer Price Index/i.test(x))return 'مؤشر أسعار المستهلك CPI';
  if(/Employment Situation/i.test(x))return 'تقرير الوظائف الأميركي';
  if(/Producer Price Index/i.test(x))return 'مؤشر أسعار المنتجين PPI';
  if(/Job Openings|JOLTS/i.test(x))return 'فرص العمل JOLTS';
  if(/Employment Cost Index/i.test(x))return 'مؤشر تكلفة التوظيف';
  if(/Productivity and Costs/i.test(x))return 'الإنتاجية والتكاليف';
  if(/Import and Export Price/i.test(x))return 'أسعار الاستيراد والتصدير';
  return x;
}

const FED_FALLBACK={
  2026:[[1,28],[3,18],[4,29],[6,17],[7,29],[9,16],[10,28],[12,9]],
  2027:[[1,27],[3,17],[4,28],[6,9],[7,28],[9,15],[10,27],[12,8]]
};
function fedEventsFromFallback(){
  const out=[];for(const [year,dates] of Object.entries(FED_FALLBACK))for(const [month,day] of dates){const timestamp=zonedToUtc(+year,month,day,14,0,0,'America/New_York');out.push({id:`fed-fomc-${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,source:'Federal Reserve',title:'FOMC Policy Decision',titleAr:'قرار الفيدرالي FOMC',timestamp,impact:'high',category:'FOMC',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',timeZone:'America/New_York',detailAr:'قرار السياسة النقدية الساعة 2:00 م بتوقيت شرق الولايات المتحدة؛ المؤتمر الصحفي عادةً 2:30 م.'})}return out;
}
function parseFedMeetings(html){
  const text=stripHtml(html),out=[];
  for(const year of [2026,2027]){
    const start=text.search(new RegExp(`${year}\\s+FOMC Meetings`,'i'));if(start<0)continue;
    const tail=text.slice(start),next=tail.slice(20).search(/20\d{2}\s+FOMC Meetings/i),section=next>=0?tail.slice(0,next+20):tail.slice(0,5000);
    const re=/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*[-–]\s*(\d{1,2})\*?/gi;let m;
    while((m=re.exec(section))){const month=MONTHS[m[1].toLowerCase()],day=+m[3],timestamp=zonedToUtc(year,month,day,14,0,0,'America/New_York');out.push({id:`fed-fomc-${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,source:'Federal Reserve',title:'FOMC Policy Decision',titleAr:'قرار الفيدرالي FOMC',timestamp,impact:'high',category:'FOMC',url:'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',timeZone:'America/New_York',detailAr:'قرار السياسة النقدية الساعة 2:00 م بتوقيت شرق الولايات المتحدة؛ المؤتمر الصحفي عادةً 2:30 م.'})}
  }
  return out;
}

async function fetchText(url,timeout=15000){
  const r=await fetch(url,{headers:{Accept:'text/calendar,text/html;q=0.9,*/*;q=0.8','User-Agent':'GOLD-AI-Calendar/4.1.0'},signal:AbortSignal.timeout(timeout)});const t=await r.text();if(!r.ok)throw Error(`HTTP ${r.status} for ${new URL(url).hostname}`);return t;
}

async function getCalendarSnapshot(options={}){
  const now=Number(options.now)||Date.now(),errors=[];let bls=[],fed=[];
  try{bls=parseBlsIcs(await fetchText('https://www.bls.gov/schedule/news_release/bls.ics'))}catch(e){errors.push('BLS: '+e.message)}
  try{fed=parseFedMeetings(await fetchText('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'))}catch(e){errors.push('Fed: '+e.message)}
  if(!fed.length)fed=fedEventsFromFallback();
  const map=new Map();for(const e of [...fed,...bls])if(e.timestamp>now-6*3600000&&e.timestamp<now+180*86400000)map.set(e.id,e);
  const events=[...map.values()].sort((a,b)=>a.timestamp-b.timestamp).slice(0,60);
  const nextHigh=events.find(e=>e.impact==='high')||null;
  const minutesToNext=nextHigh?Math.round((nextHigh.timestamp-now)/60000):null;
  const risk24h=Boolean(nextHigh&&nextHigh.timestamp-now<=24*3600000&&nextHigh.timestamp>=now-30*60000);
  const risk48h=Boolean(nextHigh&&nextHigh.timestamp-now<=48*3600000&&nextHigh.timestamp>=now-30*60000);
  const sourceCount=(bls.length?1:0)+(fed.length?1:0);
  return {updatedAt:new Date(now).toISOString(),status:errors.length?'partial':'live',quality:clamp(sourceCount/2*100,0,100),events,nextHigh,risk24h,risk48h,minutesToNext,errors};
}

module.exports={parseBlsIcs,parseFedMeetings,fedEventsFromFallback,zonedToUtc,impactForSummary,getCalendarSnapshot};
