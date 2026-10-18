package com.aigoldtrader.demo
import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityEvent
object State {
 @Volatile var enabled = false
 @Volatile var lastStatus = "المراقبة متوقفة"
 @Volatile var lastPackage = "—"
 @Volatile var eventCount = 0
}
class FxProObserverService : AccessibilityService() {
 override fun onServiceConnected() { super.onServiceConnected(); State.enabled=false; State.lastStatus="خدمة Accessibility متصلة" }
 override fun onAccessibilityEvent(event: AccessibilityEvent?) {
  if (!State.enabled || event == null) return
  val pkg=event.packageName?.toString() ?: return
  if(pkg==packageName) return
  State.lastPackage=pkg; State.eventCount++; State.lastStatus="مراقبة فقط: $pkg"
 }
 override fun onInterrupt(){ State.enabled=false; State.lastStatus="توقفت الخدمة" }
 override fun onDestroy(){ State.enabled=false; super.onDestroy() }
}
