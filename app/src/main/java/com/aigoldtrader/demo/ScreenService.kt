package com.aigoldtrader.demo

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class ScreenService : AccessibilityService() {
 companion object { @Volatile var instance: ScreenService? = null }
 private val main=Handler(Looper.getMainLooper())
 private val prefs by lazy { getSharedPreferences("screen",MODE_PRIVATE) }
 private var monitoring=false
 private var queued: (() -> Unit)? = null
 private var awaitingSignature: String? = null
 private var pendingToken: String? = null
 private var lastCapture=0L
 data class Captured(val pkg:String,val version:Long,val elements:List<ScreenElement>,val raw:List<AccessibilityNodeInfo>)
 override fun onServiceConnected() {
  instance=this; monitoring=false
  prefs.edit().putBoolean("monitoring",false).apply()
  if(prefs.getString("pending",null)!=null) result("UNKNOWN","إجراء سابق غير مؤكد — راجع شاشة التطبيق قبل متابعة التحكم")
  else result("STOPPED","خدمة الشاشة متصلة؛ المراقبة متوقفة")
 }
 private fun result(state:String,message:String) {
  prefs.edit().putString("state",state).putString("message",message).apply()
 }
 fun start() {
  if(prefs.getString("pending",null)!=null) { result("UNKNOWN","راجع الإجراء السابق أولاً"); return }
  monitoring=true; prefs.edit().putBoolean("monitoring",true).apply()
  result("OBSERVING","بانتظار فتح التطبيق المختار")
 }
 fun stop() {
  monitoring=false; queued=null
  prefs.edit().putBoolean("monitoring",false).apply()
  if(awaitingSignature!=null) result("UNKNOWN","STOP: أُرسل الإجراء السابق؛ أثره غير مؤكد. لا توجد إعادة إرسال")
  else if(prefs.getString("pending",null)==null) result("STOPPED","متوقف — لن تُرسل ضغطات جديدة")
 }
 fun reviewed() {
  stop(); pendingToken=null; awaitingSignature=null
  prefs.edit().remove("pending").apply()
  result("STOPPED","سُجلت مراجعتك اليدوية. ابدأ المراقبة من جديد")
 }
 private fun capture(): Captured? {
  val expected=prefs.getString("package","") ?: return null
  if(expected.isEmpty()) return null
  val root=rootInActiveWindow ?: return null
  if(root.packageName?.toString()!=expected) return null
  val info=packageManager.getPackageInfo(expected,0)
  val version=if(android.os.Build.VERSION.SDK_INT>=28) info.longVersionCode else @Suppress("DEPRECATION") info.versionCode.toLong()
  val raw=mutableListOf<AccessibilityNodeInfo>()
  var exceeded=false
  fun walk(node:AccessibilityNodeInfo,depth:Int) {
   if(raw.size>=400 || depth>35) { exceeded=true;return }
   if(node.packageName?.toString()!=expected) { exceeded=true;return }
   raw.add(node)
   for(i in 0 until node.childCount) node.getChild(i)?.let { walk(it,depth+1) }
  }
  walk(root,0)
  if(exceeded) { result("BLOCKED","واجهة كبيرة أو نافذة مختلطة — مُنع التحكم"); return null }
  val nodes=raw.mapIndexed { i,n -> ScreenElement(i,n.viewIdResourceName ?: "",
   if(n.isPassword) "" else n.text?.toString()?.take(256) ?: "",
   if(n.isPassword) "" else n.contentDescription?.toString()?.take(256) ?: "",
   n.className?.toString() ?: "",n.isEnabled,n.isVisibleToUser,n.isClickable,n.isEditable,n.isPassword) }
  if(nodes.any { it.password && it.visible }) { result("BLOCKED","شاشة كلمة مرور — لا تُقرأ ولا يُتحكم بها");return null }
  return Captured(expected,version,nodes,raw)
 }
 private fun json(c:Captured): JSONObject {
  val items=JSONArray()
  c.elements.forEach { n -> items.put(JSONObject().put("index",n.index).put("id",n.id).put("label",n.label)
   .put("description",n.description).put("type",n.type).put("enabled",n.enabled).put("visible",n.visible)
   .put("clickable",n.clickable).put("editable",n.editable).put("password",n.password)) }
  return JSONObject().put("package",c.pkg).put("version",c.version).put("timestamp",System.currentTimeMillis())
   .put("signature",ScreenPolicy.signature(c.pkg,c.version,c.elements)).put("nodes",items)
   .put("note","واجهة مرصودة فقط؛ لا تُثبت نوع الحساب أو نجاح صفقة. لا توجد أسعار مولدة أو API.")
 }
 override fun onAccessibilityEvent(event:AccessibilityEvent?) {
  if(event==null || (!monitoring && awaitingSignature==null)) return
  if(event.packageName?.toString()!=prefs.getString("package","")) return
  main.removeCallbacks(observe)
  main.postDelayed(observe,250)
 }
 private val observe=Runnable {
  try {
   val c=capture() ?: return@Runnable
   val report=json(c)
   prefs.edit().putString("snapshot",report.toString()).apply()
   @Suppress("DEPRECATION")
   c.raw.forEach { it.recycle() }
   lastCapture=System.currentTimeMillis()
   val before=awaitingSignature
   if(before!=null && report.getString("signature")!=before) {
    awaitingSignature=null
    result("SCREEN_CHANGED","تغيّر الشاشة مرصود، لكنه ليس تأكيد صفقة. راجع النتيجة بنفسك قبل أي إجراء آخر")
   }
   val task=queued
   if(monitoring && task!=null) { queued=null;task() }
  } catch (_:Exception) { stop();result("BLOCKED","تعذر قراءة الواجهة — توقف التحكم") }
 }
 fun queue(snapshot:JSONObject,index:Int,action:String,value:String=""): Boolean {
  if(!monitoring || queued!=null || prefs.getString("pending",null)!=null) return false
  if(System.currentTimeMillis()-snapshot.optLong("timestamp") !in 0..60000) {
   result("BLOCKED","اللقطة قديمة. افتح التطبيق لتحديثها");return false
  }
  if(snapshot.optString("package")!=prefs.getString("package","") || value.length>100) return false
  val expected=snapshot.optString("signature")
  queued={
   val c=capture()
   if(!monitoring || c==null || expected!=ScreenPolicy.signature(c.pkg,c.version,c.elements)) {
    result("BLOCKED","تغيّرت الشاشة أو إصدار التطبيق — مُنع الإجراء، التقط الحالة الحالية");
   } else {
    val target=c.elements.getOrNull(index)
    if(target==null || !ScreenPolicy.allowed(target,c.elements,action)) {
     result("BLOCKED","العنصر غير فريد أو لا يدعم الإجراء — لن تُستخدم إحداثيات")
    } else {
     val match=ScreenPolicy.matches(target,c.elements).single()
     val token=UUID.randomUUID().toString()
     // Durable reservation before side effect. UNKNOWN is never automatically retried.
     if(prefs.edit().putString("pending",token).commit()) {
      pendingToken=token;awaitingSignature=expected
      val node=c.raw[match.index]
      val accepted=when(action) {
       "click" -> node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
       "text" -> node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value) })
       else -> false
      }
      if(!accepted) {
       awaitingSignature=null;pendingToken=null;prefs.edit().remove("pending").apply()
       result("REJECTED","رفض Android الإجراء. لم تُجرَ إعادة محاولة")
      } else {
       result("PENDING","أرسل Android الإجراء؛ أثره غير مؤكد بعد")
       main.postDelayed({
        if(pendingToken==token) {
         stop();result("UNKNOWN","لم يتأكد أثر الإجراء. راجع الشاشة؛ لا إعادة إرسال تلقائية")
        }
       },4000)
      }
     } else { stop();result("BLOCKED","تعذر تسجيل الإجراء قبل إرساله") }
    }
   }
   @Suppress("DEPRECATION")
   c?.raw?.forEach { it.recycle() }
  }
  result("QUEUED","إجراء واحد قيد الانتظار. افتح التطبيق المختار؛ أي اختلاف في الشاشة يمنعه")
  main.post(observe)
  main.postDelayed({ if(queued!=null) { queued=null;result("BLOCKED","انتهت مهلة الانتظار دون إرسال الإجراء") } },10000)
  return true
 }
 override fun onInterrupt() { stop();result("STOPPED","قاطع Android خدمة التحكم") }
 override fun onDestroy() { stop();instance=null;main.removeCallbacksAndMessages(null);super.onDestroy() }
}
