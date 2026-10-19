'use strict';
const crypto=require('node:crypto');const J=require('../journal-core');
function configured(){return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);}
function prefix(user){return 'gold-journal/'+crypto.createHash('sha256').update(String(user).toLowerCase()).digest('hex')+'/';}
function monthOf(time){return new Date(time).toISOString().slice(0,7);}
function createJournal(load){
 async function readMonth(b,user,month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('INVALID_MONTH');
  const path=prefix(user)+month+'.json',result=await b.get(path,{access:'private',useCache:false});
  if(!result)return {path,etag:null,entries:[]};
  if(result.statusCode!==200)throw Error('STORAGE_READ_FAILED');
  const body=JSON.parse(await new Response(result.stream).text());
  if(body.schema!=='gold-monthly-journal-v1'||!Array.isArray(body.entries)||body.entries.length>4000)throw Error('INVALID_JOURNAL');
  return {path,etag:result.blob.etag,entries:body.entries};
 }
 async function mutate(user,month,transform){
  const b=await load();let lastError;
  for(let attempt=0;attempt<4;attempt++){
   const current=await readMonth(b,user,month),next=transform(current.entries);
   if(next.unchanged)return next.result;
   if(next.entries.length>4000)throw Error('MONTH_LIMIT');
   try{await b.put(current.path,JSON.stringify({schema:'gold-monthly-journal-v1',entries:next.entries}),{access:'private',addRandomSuffix:false,contentType:'application/json',...(current.etag?{ifMatch:current.etag}:{allowOverwrite:false})});return next.result;}
   catch(e){lastError=e;}
  }
  throw lastError||Error('STORAGE_WRITE_FAILED');
 }
 async function read(user,selectedMonth){
  const b=await load(),months=[];let cursor;
  do{const page=await b.list({prefix:prefix(user),limit:1000,...(cursor?{cursor}:{})});for(const x of page.blobs){const match=x.pathname.slice(prefix(user).length).match(/^(\d{4}-(?:0[1-9]|1[0-2]))\.json$/);if(match)months.push(match[1]);}cursor=page.hasMore?page.cursor:null;}while(cursor);
  months.sort();const chosen=selectedMonth?[selectedMonth]:months.slice(-2),entries=[];
  for(const month of chosen)entries.push(...(await readMonth(b,user,month)).entries);
  return {entries:entries.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)),availableMonths:months,selectedMonth:selectedMonth||'recent'};
 }
 async function record(user,f){
  if(!f.ready||f.modelVersion!==J.MODEL||!Number.isSafeInteger(f.referenceTime)||f.referenceTime%900000!==0||!Number.isFinite(f.currentPrice)||f.currentPrice<=0||!Number.isFinite(Date.parse(f.generatedAt))||!f.h24||!f.h48)throw Error('UNVERIFIED_FORECAST');
  const entry={id:J.MODEL+'-'+f.referenceTime,modelVersion:J.MODEL,referenceTime:f.referenceTime,createdAt:f.generatedAt,price:f.currentPrice,h24:f.h24,h48:f.h48,action:f.action,evaluations:{}};
  return mutate(user,monthOf(f.referenceTime),rows=>{const existing=rows.find(x=>x.id===entry.id);return existing?{unchanged:true,result:existing}:{entries:[...rows,entry],result:entry}});
 }
 async function reconcile(user,bars){
  const data=await read(user);const months=[...new Set(data.entries.map(e=>monthOf(e.referenceTime)))];
  for(const month of months)await mutate(user,month,rows=>{let changed=false;const entries=rows.map(e=>{const next=J.evaluate(e,bars);if(JSON.stringify(next.evaluations)!==JSON.stringify(e.evaluations||{}))changed=true;return next});return {entries,unchanged:!changed,result:null}});
 }
 return {read,record,reconcile};
}
async function sdk(){if(!configured())throw Error('STORAGE_NOT_CONFIGURED');return import('@vercel/blob');}
module.exports={configured,createJournal,...createJournal(sdk)};
