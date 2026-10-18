package com.aigoldtrader.demo
import android.test.ActivityInstrumentationTestCase2
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
@Suppress("DEPRECATION")
class DashboardTest : ActivityInstrumentationTestCase2<MainActivity>(MainActivity::class.java) {
 private fun widgets(view: View): List<View> = listOf(view) +
  if(view is ViewGroup) (0 until view.childCount).flatMap { widgets(view.getChildAt(it)) } else emptyList()
 fun testColdStartLockedAndRtl() {
  val screen=activity
  assertNotNull(screen)
  assertFalse(SafetyPolicy.BROKER_EXECUTION_ENABLED)
  instrumentation.runOnMainSync {
   assertEquals(View.LAYOUT_DIRECTION_RTL,screen.window.decorView.layoutDirection)
   val run=widgets(screen.window.decorView).filterIsInstance<Button>().first { it.text.toString().contains("بدء مراقبة الشاشة") }
   assertFalse(run.isEnabled)
  }
 }
 fun testEmergencyStopWorksOffline() {
  val screen=activity
  instrumentation.runOnMainSync {
   val views=widgets(screen.window.decorView)
   views.filterIsInstance<Button>().first { it.text.toString().contains("STOP") }.performClick()
   assertFalse(views.filterIsInstance<Button>().first { it.text.toString().contains("بدء مراقبة الشاشة") }.isEnabled)
   assertFalse(views.filterIsInstance<Button>().first { it.text.toString().contains("بدء مراقبة الشاشة") }.isEnabled)
  }
 }
 fun testResumeCannotEnableTrading() {
  val screen=activity
  instrumentation.runOnMainSync {
   instrumentation.callActivityOnPause(screen)
   instrumentation.callActivityOnResume(screen)
   val run=widgets(screen.window.decorView).filterIsInstance<Button>().first { it.text.toString().contains("بدء مراقبة الشاشة") }
   assertFalse(run.isEnabled)
   assertFalse(SafetyPolicy.BROKER_EXECUTION_ENABLED)
  }
 }
}
