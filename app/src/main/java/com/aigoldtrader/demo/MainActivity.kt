package com.aigoldtrader.demo
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
class MainActivity : Activity() {
 private lateinit var status:TextView
 override fun onCreate(savedInstanceState:Bundle?) {
  super.onCreate(savedInstanceState)
  State.enabled=false
  val layout=LinearLayout(this).apply { orientation=LinearLayout.VERTICAL; setPadding(35,55,35,35) }
  fun label(s:String){layout.addView(TextView(this).apply{text=s; textSize=18f; setPadding(0,16,0,16)})}
  label("AI GOLD TRADER V0.2 — DEMO MONITOR")
  label("مراقبة فقط — ممنوع فتح أو إغلاق أي صفقة")
  status=TextView(this).apply{textSize=17f}
  layout.addView(status)
  layout.addView(Button(this).apply{text="بدء المراقبة";setOnClickListener{State.enabled=true;State.lastStatus="بانتظار FxPro";refresh()}})
  layout.addView(Button(this).apply{text="إيقاف فوري";setOnClickListener{State.enabled=false;State.lastStatus="متوقف";refresh()}})
  layout.addView(Button(this).apply{text="إعدادات Accessibility";setOnClickListener{startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))}})
  layout.addView(Button(this).apply{text="تحديث الحالة";setOnClickListener{refresh()}})
  label("التداول التلقائي غير متاح بهذه النسخة.")
  setContentView(ScrollView(this).apply{addView(layout)})
  refresh()
 }
 private fun refresh(){status.text="الحالة: ${State.lastStatus}\nالمراقبة: ${State.enabled}\nآخر تطبيق: ${State.lastPackage}\nالأحداث: ${State.eventCount}"}
 override fun onDestroy(){State.enabled=false;super.onDestroy()}
}
