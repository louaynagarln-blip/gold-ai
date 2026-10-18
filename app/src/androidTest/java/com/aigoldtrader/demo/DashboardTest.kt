package com.aigoldtrader.demo
import android.test.ActivityInstrumentationTestCase2
@Suppress("DEPRECATION")
class DashboardTest : ActivityInstrumentationTestCase2<MainActivity>(MainActivity::class.java) {
 fun testColdStartLockedAndRtl() {
  val screen=activity
  assertNotNull(screen)
  assertFalse(SafetyPolicy.BROKER_EXECUTION_ENABLED)
  instrumentation.runOnMainSync {
   assertEquals(android.view.View.LAYOUT_DIRECTION_RTL,screen.window.decorView.layoutDirection)
  }
 }
}
