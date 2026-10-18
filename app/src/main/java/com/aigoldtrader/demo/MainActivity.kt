package com.aigoldtrader.demo

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.provider.Settings
import android.widget.*
import android.view.View
import org.json.JSONObject

class MainActivity : Activity() {
 private val prefs by lazy { getSharedPreferences("screen",MODE_PRIVATE) }
 private val handler=Handler(Looper.getMainLooper())
 private lateinit var body:LinearLayout
 private lateinit var status:TextView
 private lateinit var summary:TextView
 private lateinit var start:Button
 private var foreground=false
 private var exportText=""
 private val refreshLoop=object:Runnable {
  override fun run() { if(foreground) { refresh();handler.postDelayed(this,1000) } }
 }
 override fun onCreate(savedInstanceState:Bundle?) {
  super.onCreate(savedInstanceState)
  window.decorView.layoutDirection=View.LAYOUT_DIRECTION_RTL
  // Opening the dashboard never starts monitoring or replays an action.
  ScreenService.instance?.stop()
  body=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL;setPadding(24,32,24,32);setBackgroundColor(Color.rgb(12,18,28)) }
  label("AI GOLD TRADER",28f,Color.rgb(230,195,105))
  label("تحكم عبر الشاشة • لا يحتاج خادم MT5",18f)
  label("مرحلة معايرة الواجهة — التداول الآلي غير مكتمل",16f,Color.rgb(255,190,100))
  status=label("خدمة الشاشة غير متصلة",18f)
  button("اختيار تطبيق FxPro المثبّت") { chooseApp() }
  button("إعدادات صلاحية Accessibility") {
   AlertDialog.Builder(this).setTitle("صلاحية قراءة الشاشة والتحكم")
    .setMessage("الخدمة تقرأ عناصر التطبيق الذي تختاره وتستطيع الضغط والكتابة فيه. قد تحتوي الشاشة على معلومات حسابك. لا تُرسل البيانات إلى خادم، ولا تُقرأ حقول كلمات المرور. راجع اسم التطبيق قبل منح الصلاحية.")
    .setNegativeButton("إلغاء",null).setPositiveButton("فتح الإعدادات") { _,_ -> startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }.show()
  }
  start=button("بدء مراقبة الشاشة") {
   ScreenService.instance?.start();openTarget();refresh()
  }
  button("STOP — إيقاف التحكم") { ScreenService.instance?.stop();refresh() }.setBackgroundColor(Color.rgb(145,35,48))
  button("فتح تطبيق التداول") { openTarget() }
  summary=label("لا توجد لقطة عناصر بعد",16f)
  button("فحص عناصر آخر شاشة") { inspect() }
  button("تصدير تقرير الشاشة") { export() }
  button("راجعت بنفسي نتيجة الإجراء السابق") {
   AlertDialog.Builder(this).setMessage("استخدم هذا فقط بعد مراجعة شاشة التداول والتأكد من أثر الإجراء السابق. لن يُعاد إرسال أي إجراء.")
    .setNegativeButton("إلغاء",null).setPositiveButton("راجعت الشاشة") { _,_ -> ScreenService.instance?.reviewed();refresh() }.show()
  }
  label("الخطوة الحالية: اختر FxPro، فعّل الخدمة، ابدأ المراقبة وافتح شاشة الذهب أو إنشاء الصفقة. ارجع إلى هنا لفحص العناصر وتصدير التقرير. الإجراء المختار يُرسل مرة واحدة فقط إذا بقيت الشاشة مطابقة؛ لا توجد إحداثيات لمس أو ضغطات عشوائية.",15f)
  label("تغيّر الشاشة أو قبول Android للضغطة لا يثبت نجاح صفقة لدى الوسيط. لم يُختبر هذا التطبيق بعد على نسخة FxPro في هاتفك. لا يوجد في هذه النسخة اختيار آلي لصفقات الذهب أو قراءة موثوقة لشموع الرسم البياني.",14f)
  setContentView(ScrollView(this).apply {
   addView(this@MainActivity.body)
   setOnApplyWindowInsetsListener { v,i -> v.setPadding(0,i.systemWindowInsetTop,0,i.systemWindowInsetBottom);i }
  })
 }
 private fun label(value:String,size:Float,color:Int=Color.rgb(224,231,241)):TextView = TextView(this).apply {
  text=value;textSize=size;setTextColor(color);setPadding(4,12,4,12);this@MainActivity.body.addView(this)
 }
 private fun button(value:String,action:()->Unit):Button = Button(this).apply {
  text=value;setOnClickListener { action() };this@MainActivity.body.addView(this)
 }
 private fun alert(value:String) { AlertDialog.Builder(this).setMessage(value).setPositiveButton("حسناً",null).show() }
 private fun chooseApp() {
  val apps=packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
   .filter { it.loadLabel(packageManager).toString().contains("fxpro",true) }
  if(apps.isEmpty()) { alert("لم يُعثر على تطبيق باسم FxPro ضمن التطبيقات المثبّتة");return }
  AlertDialog.Builder(this).setTitle("اختر تطبيق التداول المقصود")
   .setItems(apps.map { "${it.loadLabel(packageManager)}\n${it.activityInfo.packageName}" }.toTypedArray()) { _,index ->
    ScreenService.instance?.stop()
    val app=apps[index]
    if(prefs.getString("pending",null)!=null) alert("راجع الإجراء السابق أولاً قبل تغيير التطبيق")
    else prefs.edit().putString("package",app.activityInfo.packageName).putString("app",app.loadLabel(packageManager).toString()).remove("snapshot").apply()
    refresh()
   }.show()
 }
 private fun openTarget() {
  val pkg=prefs.getString("package","") ?: ""
  val launch=packageManager.getLaunchIntentForPackage(pkg)
  if(launch==null) alert("اختر تطبيق FxPro المثبّت أولاً")
  else try { startActivity(launch) } catch (_:Exception) { ScreenService.instance?.stop();alert("تعذر فتح التطبيق المختار") }
 }
 private fun snapshot():JSONObject? = try { JSONObject(prefs.getString("snapshot","") ?: "") } catch (_:Exception) { null }
 private fun refresh() {
  val connected=ScreenService.instance!=null
  start.isEnabled=connected && !prefs.getString("package","").isNullOrBlank() && prefs.getString("pending",null)==null
  status.text="الخدمة: ${if(connected) "متصلة" else "غير متصلة"}\nالتطبيق: ${prefs.getString("app","لم يُختر")}\nالحالة: ${prefs.getString("state","STOPPED")}\n${prefs.getString("message","")}"
  val shot=snapshot()
  summary.text=if(shot==null) "لا توجد لقطة عناصر بعد" else
   "آخر شاشة: ${shot.optString("package")}\nعدد العناصر: ${shot.optJSONArray("nodes")?.length()}\nعمر اللقطة: ${((System.currentTimeMillis()-shot.optLong("timestamp"))/1000).coerceAtLeast(0)} ثانية\nحالة حساب التداول ونجاح الصفقات: غير متحققين"
 }
 private fun inspect() {
  val shot=snapshot() ?: run { alert("ابدأ المراقبة وافتح شاشة داخل FxPro أولاً");return }
  val nodes=shot.getJSONArray("nodes")
  val list=(0 until nodes.length()).map { nodes.getJSONObject(it) }.filter { it.optBoolean("visible") && !it.optBoolean("password") }
  if(list.isEmpty()) { alert("لا توجد عناصر مكشوفة. قد تكون الواجهة رسماً أو WebView لا يكشف البيانات");return }
  AlertDialog.Builder(this).setTitle("العناصر المقروءة — دون إحداثيات")
   .setItems(list.map { "${it.optString("label").ifBlank { it.optString("description").ifBlank { "عنصر بلا اسم" } }}\n${it.optString("id")} • ${it.optString("type").substringAfterLast('.')}" }.toTypedArray()) { _,i ->
    actionDialog(shot,list[i])
   }.setNegativeButton("إغلاق",null).show()
 }
 private fun actionDialog(shot:JSONObject,node:JSONObject) {
  val options=mutableListOf<String>()
  if(node.optBoolean("clickable")) options.add("ضغط العنصر المختار مرة واحدة")
  if(node.optBoolean("editable") && node.optString("id").isNotEmpty()) options.add("كتابة قيمة في الحقل المختار")
  if(options.isEmpty()) { alert("هذا العنصر للقراءة فقط أو لا يملك محدداً فريداً\n${node.toString(2)}");return }
  AlertDialog.Builder(this).setTitle(node.optString("label").ifBlank { node.optString("id") })
   .setItems(options.toTypedArray()) { _,i ->
    if(options[i].startsWith("ضغط")) submit(shot,node,"click","")
    else {
     val input=EditText(this).apply { hint="القيمة التي تريد إدخالها";isSaveEnabled=false }
     AlertDialog.Builder(this).setTitle("كتابة في العنصر المختار").setView(input).setNegativeButton("إلغاء",null)
      .setPositiveButton("إدخال") { _,_ -> submit(shot,node,"text",input.text.toString()) }.show()
    }
   }.setNegativeButton("إلغاء",null).show()
 }
 private fun submit(shot:JSONObject,node:JSONObject,action:String,value:String) {
  val service=ScreenService.instance ?: run { alert("فعّل خدمة Accessibility أولاً");return }
  service.start()
  if(service.queue(shot,node.getInt("index"),action,value)) openTarget()
  else alert("لم يُرسل الإجراء. حدّث لقطة الشاشة وتحقق من عدم وجود إجراء غير مؤكد")
  refresh()
 }
 private fun export() {
  val shot=snapshot() ?: run { alert("لا توجد لقطة لتصديرها");return }
  exportText=shot.toString(2)
  startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
   .setType("application/json").putExtra(Intent.EXTRA_TITLE,"FxPro-Screen-Report.json"),41)
 }
 @Deprecated("Legacy activity result for native Android without extra dependencies")
 override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?) {
  super.onActivityResult(requestCode,resultCode,data)
  if(requestCode==41 && resultCode==RESULT_OK) try {
   data?.data?.let { uri -> contentResolver.openOutputStream(uri)?.use { it.write(exportText.toByteArray(Charsets.UTF_8)) } }
   exportText="";alert("حُفظ التقرير. يمكنك إرفاقه بهذه المحادثة لتحديد عناصر FxPro الفعلية")
  } catch (_:Exception) { alert("تعذر حفظ التقرير") }
 }
 override fun onResume() { super.onResume();foreground=true;handler.post(refreshLoop) }
 override fun onPause() { foreground=false;handler.removeCallbacks(refreshLoop);super.onPause() }
 override fun onDestroy() { handler.removeCallbacksAndMessages(null);super.onDestroy() }
}
