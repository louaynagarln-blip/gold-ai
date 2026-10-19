'use strict';
const Q=require('../data-quality');
function normalizeQuote(raw,hostname,now=Date.now()){
 if(hostname==='api.gold-api.com'){
  // Gold API /price/XAU defaults to USD, but require the explicit response currency.
  if(raw?.symbol!=='XAU'||raw?.currency!=='USD')throw Error('Unexpected market instrument or currency');
  return {...Q.quote(raw,now),symbol:'XAUUSD',source:'Gold API',refreshAfterMs:30000};
 }
 return {...Q.quote(raw,now),source:hostname,refreshAfterMs:3000};
}
module.exports={normalizeQuote};
