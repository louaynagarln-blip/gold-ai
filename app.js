// Previous random-price simulation removed: do not present invented prices as market data.
document.getElementById('status').textContent='غير متصل — لا توجد تغذية أسعار مباشرة';
for (const id of ['price','change','strength','rsi','ema','macd','entry','sl','tp1','tp2']) {
 document.getElementById(id).textContent='—';
}
document.getElementById('signal').textContent='WAIT';
document.getElementById('reason').textContent='لا توجد بيانات من وسيط متحقق. استخدم تطبيق Android مع طرفية MT5 Demo وخادم HTTPS. تنفيذ التداول مقفل حتى التأهيل والموافقة.';
