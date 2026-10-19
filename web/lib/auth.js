const crypto=require('crypto');
const b64=s=>Buffer.from(s).toString('base64url');
function sign(data,secret){return crypto.createHmac('sha256',String(secret)).update(data).digest('base64url')}
function issue(username,secret,ttlSeconds=604800){if(typeof secret!=='string'||secret.length<32)throw Error('Authentication not configured');const payload={u:String(username),exp:Math.floor(Date.now()/1000)+ttlSeconds};const body=b64(JSON.stringify(payload));return body+'.'+sign(body,secret)}
function verify(token,secret){try{if(typeof secret!=='string'||secret.length<32||String(token||'').split('.').length!==2)return null;const [body,sig]=String(token||'').split('.');if(!body||!sig)return null;const expected=sign(body,secret);if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));if(typeof payload.u!=='string'||!payload.u||!Number.isSafeInteger(payload.exp)||payload.exp<=Math.floor(Date.now()/1000))return null;return payload}catch{return null}}
function bearer(req){return String(req.headers&&req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim()}
module.exports={issue,verify,bearer};
