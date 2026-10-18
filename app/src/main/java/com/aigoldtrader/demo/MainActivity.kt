package com.aigoldtrader.demo

import android.app.Activity
import android.app.AlertDialog
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.graphics.Color
import android.content.Intent
import android.widget.*
import android.view.View
import org.json.JSONObject
import java.net.URL
import javax.net.ssl.HttpsURLConnection
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val urgent = Executors.newSingleThreadExecutor()
    private lateinit var layout: LinearLayout
    private lateinit var status: TextView
    private lateinit var details: TextView
    private lateinit var events: TextView
    private lateinit var endpoint: EditText
    private lateinit var token: EditText
    private lateinit var run: Button
    private var base = ""
    private var secret = "" // session memory only; never saved or logged
    private var active = false
    private var foreground = false
    private var busy = false
    private var generation = 0
    private var snapshot = JSONObject()
    private val poll = object : Runnable {
        override fun run() {
            if (foreground && base.isNotEmpty() && !busy) request(if(active) "/heartbeat" else "/status", active)
            if (foreground) handler.postDelayed(this, 2000)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.layoutDirection = View.LAYOUT_DIRECTION_RTL
        layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 40, 24, 36)
            setBackgroundColor(Color.rgb(12,18,28))
        }
        label("AI GOLD TRADER", 28f, Color.rgb(230,195,105))
        label("XAUUSD • M1 / M5 • إصدار تأهيل الأمان", 16f)
        label("تنفيذ الوسيط مقفل • المحاكاة لا ترسل صفقات", 17f, Color.rgb(255,190,100))
        status = label("غير متصل — الحساب غير متحقق", 20f)
        run = button("تشغيل محاكاة على بيانات Demo") {
            if (!active) request("/dry-run", true) else stop()
        }.apply { isEnabled = false }
        button("STOP — إيقاف طارئ") { stop() }.setBackgroundColor(Color.rgb(145,35,48))
        label("الربط مع طرفية MT5", 20f)
        endpoint = input("https://your-bridge.example", false)
        endpoint.setText(getPreferences(0).getString("endpoint", ""))
        token = input("رمز ربط الخادم — يُحفظ في الذاكرة فقط", true)
        button("اتصال آمن") {
            val value = endpoint.text.toString().trim().trimEnd('/')
            if (!SafetyPolicy.validateEndpoint(value) || token.text.length < 32) {
                alert("أدخل عنوان HTTPS دون مسار ورمز ربط لا يقل عن 32 حرفاً")
            } else {
                generation++
                active = false
                base = value
                secret = token.text.toString()
                token.text.clear()
                getPreferences(0).edit().putString("endpoint", value).apply()
                request("/stop", true)
            }
        }
        details = label("السعر: —\nالإشارة: WAIT\nالصفقات والربح: غير متاحين\nزمن التنفيذ: لم يُقَس", 17f)
        button("إعدادات الاستراتيجية والمخاطر") { settings() }
        button("فتح تطبيق FxPro المثبّت") {
            val candidates=packageManager.queryIntentActivities(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),0)
                .filter { it.loadLabel(packageManager).toString().contains("fxpro",ignoreCase=true) }
            if(candidates.isEmpty()) alert("لم يُعثر على تطبيق باسم FxPro. فتح التطبيق لا يثبت هوية حساب التداول.")
            else AlertDialog.Builder(this).setTitle("اختر التطبيق")
                .setItems(candidates.map { it.loadLabel(packageManager).toString() }.toTypedArray()) { _,index ->
                    val item=candidates[index].activityInfo
                    startActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setClassName(item.packageName,item.name))
                }.show()
        }
        label("سجل القرارات والتنبيهات", 20f)
        events = label("لا توجد قرارات من خادم موثوق بعد", 14f)
        label("عند مغادرة التطبيق تتوقف المحاكاة. الخادم يتوقف أيضاً بعد 10 ثوانٍ دون نبض. يلزم MT5 على خادم دائم للربط؛ لا توجد صلاحية Accessibility مطلوبة في هذه البنية.", 14f)
        setContentView(ScrollView(this).apply {
            addView(this@MainActivity.layout)
            setOnApplyWindowInsetsListener { view, insets ->
                view.setPadding(0,insets.systemWindowInsetTop,0,insets.systemWindowInsetBottom)
                insets
            }
        })
    }
    private fun label(value: String, size: Float, color: Int = Color.rgb(224,231,241)): TextView {
        return TextView(this).apply {
            text = value; textSize = size; setTextColor(color); setPadding(4,12,4,12)
            this@MainActivity.layout.addView(this)
        }
    }
    private fun button(value: String, action: () -> Unit): Button = Button(this).apply {
        text=value; setOnClickListener { action() }; this@MainActivity.layout.addView(this)
    }
    private fun input(hintText: String, password: Boolean): EditText = EditText(this).apply {
        hint=hintText; setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        inputType=if(password) 129 else 17
        isSaveEnabled=false
        this@MainActivity.layout.addView(this)
    }
    private fun alert(message: String) { AlertDialog.Builder(this).setMessage(message).setPositiveButton("حسناً", null).show() }
    private fun stop() {
        active=false; generation++
        if (::run.isInitialized) run.isEnabled=false
        if (::status.isInitialized) status.text="توقف محلياً — تأكيد توقف الخادم قيد الانتظار"
        if (base.isNotEmpty()) request("/stop", true, emergency=true)
    }
    private fun request(path: String, post: Boolean, body: JSONObject = JSONObject(), emergency: Boolean=false) {
        if (base.isEmpty()) return
        if (busy && !emergency) return
        val epoch=generation
        val host=base
        val auth=secret
        if (!emergency) busy=true
        (if(emergency) urgent else io).execute {
            var conn: HttpsURLConnection? = null
            try {
                conn=URL(host+path).openConnection() as HttpsURLConnection
                conn.instanceFollowRedirects=false
                conn.connectTimeout=3000; conn.readTimeout=4000
                conn.setRequestProperty("Authorization", "Bearer $auth")
                conn.setRequestProperty("Cache-Control", "no-store")
                if(post) {
                    conn.requestMethod="POST"; conn.doOutput=true
                    conn.setRequestProperty("Content-Type", "application/json")
                    conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                }
                val code=conn.responseCode
                val stream=if(code==200) conn.inputStream else conn.errorStream
                val data=stream?.use {
                    val output=java.io.ByteArrayOutputStream()
                    val buffer=ByteArray(4096)
                    while(true) {
                        val count=it.read(buffer)
                        if(count<0) break
                        output.write(buffer,0,count)
                        if(output.size()>262144) throw IllegalStateException("oversized response")
                    }
                    output.toByteArray()
                } ?: byteArrayOf()
                if(data.size>262144) throw IllegalStateException("oversized response")
                val json=JSONObject(String(data,Charsets.UTF_8))
                if(code!=200) throw IllegalStateException(json.optString("error","HTTP $code"))
                handler.post {
                    if (!emergency) busy=false
                    if(epoch==generation && foreground) render(json)
                }
            } catch (_: Exception) {
                handler.post {
                    if (!emergency) busy=false
                    if(epoch==generation) {
                        active=false; generation++; run.isEnabled=false
                        status.text="انقطع الربط أو رُفض الطلب — توقف آمن؛ حالة الخادم غير مؤكدة"
                        details.text="الأسعار والحساب غير مؤكدة. يلزم إعادة اتصال. لا توجد أوامر وسيط متاحة بهذا الإصدار."
                    }
                }
            } finally { conn?.disconnect() }
        }
    }
    private fun render(data: JSONObject) {
        snapshot=data
        val fresh=SafetyPolicy.fresh(data.optLong("timestamp_ms"),System.currentTimeMillis())
        val verified=fresh && data.optBoolean("demo_verified")
        active=verified && data.optString("mode")=="DRY_RUN"
        run.isEnabled=verified && data.optString("mode")!="FAULT"
        run.text=if(active) "إيقاف المحاكاة" else "تشغيل محاكاة على بيانات Demo"
        status.text="${data.optString("mode")} • ${data.opt("account")}\nDemo: ${if(verified) "متحقق من الطرفية" else "غير متحقق أو بيانات قديمة"}\n${data.optString("reason")}"
        val metrics=data.optJSONObject("metrics") ?: JSONObject()
        details.text=if(fresh) "السعر: ${data.opt("price")}\nالإشارة: ${data.optString("signal","WAIT")}\nالربح المحقق اليوم: ${data.opt("pnl")} USD\nالصفقات: ${data.optJSONArray("positions")}\nالأوامر: ${data.optJSONArray("orders")}\nالخطة المحاكية: ${data.opt("plan")}\nعمر السعر: ${metrics.opt("tick_age_ms")} ms\nزمن التحليل: ${metrics.opt("decision_ms")} ms\nتأكيد التنفيذ: لم يُقَس — مقفل" else "بيانات قديمة أو مفقودة — لا تعتمد عليها"
        val rows=data.optJSONArray("events")
        events.text=if(rows!=null) (0 until rows.length()).joinToString("\n\n") {
            val e=rows.getJSONObject(it)
            "${e.optString("kind")} • ${e.opt("utc")}\n${e.opt("payload")}"
        } else "لا يوجد سجل"
    }
    private fun settings() {
        val config=snapshot.optJSONObject("config")
        if(config==null) { alert("اربط طرفية Demo أولاً لقراءة الإعدادات وتعديلها"); return }
        val panel=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(20,10,20,10) }
        val fields=linkedMapOf<String,EditText>()
        val names=linkedMapOf("fast" to "EMA السريع", "slow" to "EMA البطيء", "period" to "RSI / ATR", "buy_rsi" to "RSI شراء", "sell_rsi" to "RSI بيع", "stop_atr" to "مضاعف ATR للوقف", "reward_risk" to "الهدف / المخاطرة", "risk_usd" to "المخاطرة بالدولار", "daily_loss_usd" to "حد الخسارة اليومي", "max_spread" to "أقصى سبريد سعري", "slippage" to "احتياط الانزلاق السعري", "commission_per_lot" to "عمولة الذهاب والإياب لكل لوت", "max_tick_age_ms" to "أقصى عمر سعر ms")
        names.forEach { (key,name) ->
            panel.addView(TextView(this).apply { text=name })
            val edit=EditText(this).apply { setText(config.optString(key)); inputType=8194 }
            fields[key]=edit; panel.addView(edit)
        }
        val costs=CheckBox(this).apply { text="تحققت من تكاليف حساب الوسيط"; isChecked=config.optBoolean("costs_confirmed") }
        panel.addView(costs)
        AlertDialog.Builder(this).setTitle("الإعدادات — الحفظ يوقف المحاكاة")
            .setView(ScrollView(this).apply { addView(panel) })
            .setNegativeButton("إلغاء", null).setPositiveButton("حفظ") { _,_ ->
                try {
                    val values=JSONObject(config.toString())
                    fields.forEach { (key,edit) ->
                        val raw=edit.text.toString()
                        if(key in listOf("fast","slow","period","max_tick_age_ms")) values.put(key,raw.toInt())
                        else values.put(key,raw.toDouble().also { require(it.isFinite()) })
                    }
                    values.put("costs_confirmed",costs.isChecked)
                    active=false; generation++
                    request("/config",true,values)
                } catch (_: Exception) { alert("قيمة غير صحيحة — لم تُحفظ الإعدادات") }
            }.show()
    }
    override fun onResume() { super.onResume(); foreground=true; handler.post(poll) }
    override fun onPause() { foreground=false; handler.removeCallbacks(poll); stop(); super.onPause() }
    override fun onDestroy() { secret=""; io.shutdown(); urgent.shutdown(); super.onDestroy() }
}
