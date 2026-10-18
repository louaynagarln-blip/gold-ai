package com.aigoldtrader.demo
import org.junit.Assert.*
import org.junit.Test
class ScreenPolicyTest {
 private val button=ScreenElement(0,"broker:id/buy","BUY","","Button",true,true,true,false,false)
 @Test fun uniqueResourceId() { assertTrue(ScreenPolicy.allowed(button,listOf(button),"click")) }
 @Test fun duplicateRejected() { assertFalse(ScreenPolicy.allowed(button,listOf(button,button.copy(index=1)),"click")) }
 @Test fun hiddenRejected() { val x=button.copy(visible=false);assertFalse(ScreenPolicy.allowed(x,listOf(x),"click")) }
 @Test fun disabledRejected() { val x=button.copy(enabled=false);assertFalse(ScreenPolicy.allowed(x,listOf(x),"click")) }
 @Test fun passwordRejected() { val x=button.copy(password=true);assertFalse(ScreenPolicy.allowed(x,listOf(x),"click")) }
 @Test fun unnamedNoIdRejected() { val x=button.copy(id="",label="");assertFalse(ScreenPolicy.allowed(x,listOf(x),"click")) }
 @Test fun uniqueExactTextAllowed() { val x=button.copy(id="");assertTrue(ScreenPolicy.allowed(x,listOf(x),"click")) }
 @Test fun unknownActionRejected() { assertFalse(ScreenPolicy.allowed(button,listOf(button),"swipe")) }
 @Test fun textRequiresEditableId() { assertFalse(ScreenPolicy.allowed(button,listOf(button),"text")) }
 @Test fun editableFieldAllowed() { val x=button.copy(editable=true);assertTrue(ScreenPolicy.allowed(x,listOf(x),"text")) }
 @Test fun anonymousInputRejected() { val x=button.copy(editable=true,id="");assertFalse(ScreenPolicy.allowed(x,listOf(x),"text")) }
 @Test fun packageChangeInvalidatesScreen() { assertNotEquals(ScreenPolicy.signature("a",1,listOf(button)),ScreenPolicy.signature("b",1,listOf(button))) }
 @Test fun versionChangeInvalidatesScreen() { assertNotEquals(ScreenPolicy.signature("a",1,listOf(button)),ScreenPolicy.signature("a",2,listOf(button))) }
 @Test fun changedLabelInvalidatesScreen() { assertNotEquals(ScreenPolicy.signature("a",1,listOf(button)),ScreenPolicy.signature("a",1,listOf(button.copy(label="SELL")))) }
 @Test fun changedEnabledInvalidatesScreen() { assertNotEquals(ScreenPolicy.signature("a",1,listOf(button)),ScreenPolicy.signature("a",1,listOf(button.copy(enabled=false)))) }
 @Test fun noPasswordInFingerprint() { assertEquals(ScreenPolicy.signature("a",1,listOf(button.copy(password=true,label="secret"))),ScreenPolicy.signature("a",1,listOf(button.copy(password=true,label="other")))) }
}
