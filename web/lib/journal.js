'use strict';
const crypto=require('node:crypto');const J=require('../journal-core');
function configured(){return Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN);}
function prefix(user){return 'gold-journal/'+crypto.createHash('sha256').update(String(user).toLowerCase()).digest('hex')+'/';}
async function sdk(){if(!configured())throw Error('STORAGE_NOT_CONFIGURED');return import('@vercel/blob');}
async function read(user){const b=await sdk(),items=[];let cursor;
 do{const page=await b.list({prefix:prefix(user),limit:1000,...(cursor?{cursor}:{})});for(const item of page.blobs){const data=await b.get(item.pathname,{access:'private',useCache:false});if(data?.statusCode===200)items.push(JSON.parse(await new Response(data.stream).text()));}cursor=page.hasMore?page.cursor:null;if(items.length>5000)throw Error('JOURNAL_LIMIT');}while(cursor);
 return J.merge([],items);
}
async function record(user,f){const b=await sdk();if(!f.ready||f.modelVersion!==J.MODEL)throw Error('UNVERIFIED_FORECAST');
 const entry={id:J.MODEL+'-'+f.referenceTime,modelVersion:J.MODEL,referenceTime:f.referenceTime,createdAt:f.generatedAt,price:f.currentPrice,h24:f.h24,h48:f.h48,action:f.action,evaluations:{}};
 try{await b.put(prefix(user)+entry.id+'.json',JSON.stringify(entry),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'});}catch(e){if(e.name!=='BlobAlreadyExistsError')throw e;}
 return entry;
}
module.exports={configured,read,record};
