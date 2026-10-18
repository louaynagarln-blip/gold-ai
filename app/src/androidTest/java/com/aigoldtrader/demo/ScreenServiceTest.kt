package com.aigoldtrader.demo
import android.test.ActivityInstrumentationTestCase2
import android.view.accessibility.AccessibilityEvent
import android.widget.EditText
import android.widget.TextView
import org.json.JSONObject
@Suppress("DEPRECATION")
class ScreenServiceTest : ActivityInstrumentationTestCase2<ScreenFixtureActivity>(ScreenFixtureActivity::class.java) {
 private fun waitFor(message:String,predicate:()->Boolean) {
  val deadline=System.currentTimeMillis()+15000
  while(!predicate() && System.currentTimeMillis()<deadline) Thread.sleep(100)
  if(!predicate()) {
   val auto=instrumentation.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
   for(command in listOf("settings get secure enabled_accessibility_services","settings get secure accessibility_enabled","dumpsys accessibility","dumpsys activity services com.aigoldtrader.demo")) {
    val result=android.os.ParcelFileDescriptor.AutoCloseInputStream(auto.executeShellCommand(command)).use { String(it.readBytes()) }
    println("DIAGNOSTIC $command\n$result")
   }
   println("PREFS: "+activity.getSharedPreferences("screen",0).all.toString())
  }
  assertTrue(message,predicate())
 }
 fun testActualAccessibilityReadWriteClickAndStopOnLocalFixture() {
  val screen=activity
  val prefs=screen.getSharedPreferences("screen",0)
  prefs.edit().putString("package",screen.packageName).remove("pending").remove("snapshot").commit()
  val automation=instrumentation.getUiAutomation(android.app.UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
  fun shell(command:String) { android.os.ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand(command)).use { it.readBytes() } }
  shell("settings delete secure enabled_accessibility_services")
  shell("settings put secure accessibility_enabled 0")
  Thread.sleep(1000) // Let old platform bindings finish teardown before enabling.
  shell("settings put secure enabled_accessibility_services com.aigoldtrader.demo/com.aigoldtrader.demo.ScreenService")
  shell("settings put secure accessibility_enabled 1")
  waitFor("Accessibility service not connected") { ScreenService.instance!=null }
  instrumentation.runOnMainSync {
   ScreenService.instance!!.start()
   screen.window.decorView.sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)
  }
  waitFor("No accessibility nodes captured") { prefs.getString("snapshot",null)!=null }
  fun shot()=JSONObject(prefs.getString("snapshot",null)!!)
  fun index(report:JSONObject,id:String):Int {
   val nodes=report.getJSONArray("nodes")
   return (0 until nodes.length()).map { nodes.getJSONObject(it) }.first { it.getString("id").endsWith("/"+id) }.getInt("index")
  }
  val initial=shot()
  assertEquals(screen.packageName,initial.getString("package"))
  instrumentation.runOnMainSync {
   assertTrue(ScreenService.instance!!.queue(initial,index(initial,"fixture_volume"),"text","0.02"))
  }
  waitFor("ACTION_SET_TEXT did not update local fixture") {
   var value="";instrumentation.runOnMainSync { value=screen.findViewById<EditText>(R.id.fixture_volume).text.toString() };value=="0.02"
  }
  waitFor("Text change not observed") { prefs.getString("state",null)=="SCREEN_CHANGED" && shot().toString().contains("0.02") }
  assertNotNull("Screen changes must not confirm a broker transaction",prefs.getString("pending",null))
  instrumentation.runOnMainSync { ScreenService.instance!!.reviewed();ScreenService.instance!!.start() }
  val next=shot()
  instrumentation.runOnMainSync { assertTrue(ScreenService.instance!!.queue(next,index(next,"fixture_apply"),"click")) }
  waitFor("ACTION_CLICK did not update local fixture") {
   var value="";instrumentation.runOnMainSync { value=screen.findViewById<TextView>(R.id.fixture_result).text.toString() };value=="APPLIED: 0.02"
  }
  waitFor("Click effect not observed") { prefs.getString("state",null)=="SCREEN_CHANGED" }
  assertNotNull("Click must remain unconfirmed until manual review",prefs.getString("pending",null))
  instrumentation.runOnMainSync { ScreenService.instance!!.reviewed() }
  instrumentation.runOnMainSync {
   ScreenService.instance!!.stop()
   assertFalse(ScreenService.instance!!.queue(shot(),index(shot(),"fixture_apply"),"click"))
  }
  assertFalse(prefs.getBoolean("monitoring",true))
  prefs.edit().remove("package").remove("snapshot").commit()
 }
}
