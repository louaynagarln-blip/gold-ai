package com.aigoldtrader.demo

import java.security.MessageDigest

data class ScreenElement(
 val index: Int, val id: String, val label: String, val description: String,
 val type: String, val enabled: Boolean, val visible: Boolean,
 val clickable: Boolean, val editable: Boolean, val password: Boolean
)
object ScreenPolicy {
 fun signature(pkg: String, version: Long, nodes: List<ScreenElement>): String {
  val parts = listOf(pkg,version.toString()) + nodes.flatMap {
   listOf(it.id,if(it.password) "" else it.label,if(it.password) "" else it.description,it.type,
    it.enabled.toString(),it.visible.toString(),it.clickable.toString(),it.editable.toString())
  }
  val value=parts.joinToString("") { "${it.length}:$it" }
  return MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
 }
 fun matches(target: ScreenElement, all: List<ScreenElement>): List<ScreenElement> {
  if(target.password || (!target.enabled) || !target.visible) return emptyList()
  return all.filter {
   !it.password && it.enabled && it.visible && it.type==target.type &&
    if(target.id.isNotEmpty()) it.id==target.id else
     (target.label.isNotEmpty() || target.description.isNotEmpty()) &&
     it.label==target.label && it.description==target.description
  }
 }
 fun allowed(target: ScreenElement, nodes: List<ScreenElement>, action: String): Boolean =
  matches(target,nodes).size==1 && when(action) {
   "click" -> target.clickable
   "text" -> target.editable && target.id.isNotEmpty()
   else -> false
  }
}
