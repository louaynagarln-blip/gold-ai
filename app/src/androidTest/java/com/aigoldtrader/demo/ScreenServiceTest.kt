package com.aigoldtrader.demo
import android.test.ActivityInstrumentationTestCase2
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject
@Suppress("DEPRECATION")
class ScreenServiceTest : ActivityInstrumentationTestCase2<MainActivity>(MainActivity::class.java) {
 fun testActualAccessibilityCaptureOnNativeFixture() {
  val screen=activity
  val prefs=screen.getSharedPreferences("screen",0)
  prefs.edit().putString("package",screen.packageName).remove("pending").remove("snapshot").commit()
  val deadline=System.currentTimeMillis()+15000
  while(ScreenService.instance==null && System.currentTimeMillis()<deadline) Thread.sleep(100)
  assertNotNull("Accessibility service must be enabled by emulator workflow",ScreenService.instance)
  instrumentation.runOnMainSync {
   ScreenService.instance!!.start()
   screen.window.decorView.sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)
  }
  while(prefs.getString("snapshot",null)==null && System.currentTimeMillis()<deadline) Thread.sleep(100)
  val report=JSONObject(prefs.getString("snapshot",null) ?: error("No accessibility nodes captured"))
  assertEquals(screen.packageName,report.getString("package"))
  assertTrue(report.getJSONArray("nodes").length()>5)
  assertTrue(report.toString().contains("STOP"))
  instrumentation.runOnMainSync { ScreenService.instance!!.stop() }
  assertFalse(prefs.getBoolean("monitoring",true))
  prefs.edit().remove("package").remove("snapshot").commit()
 }
}
