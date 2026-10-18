package com.aigoldtrader.demo
import org.junit.Assert.*
import org.junit.Test
class SafetyPolicyTest {
 @Test fun executionAlwaysLocked() { assertFalse(SafetyPolicy.BROKER_EXECUTION_ENABLED) }
 @Test fun enforceHttps() {
  assertTrue(SafetyPolicy.validateEndpoint("https://demo.example"))
  listOf("http://demo.example", "https://user:password@demo.example", "https://demo.example/?key=x", "https://demo.example/path", "broken").forEach {
   assertFalse(it,SafetyPolicy.validateEndpoint(it))
  }
 }
 @Test fun rejectStaleAndFuture() {
  assertTrue(SafetyPolicy.fresh(10000,12000))
  assertFalse(SafetyPolicy.fresh(10000,16000))
  assertFalse(SafetyPolicy.fresh(15000,12000))
  assertFalse(SafetyPolicy.fresh(0,100))
 }
}
