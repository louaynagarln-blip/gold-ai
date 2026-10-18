package com.aigoldtrader.demo

object SafetyPolicy {
    const val BROKER_EXECUTION_ENABLED = false
    fun validateEndpoint(value: String): Boolean = try {
        val uri = java.net.URI(value)
        uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null &&
            uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")
    } catch (_: Exception) { false }
    fun fresh(timestamp: Long, now: Long): Boolean = timestamp > 0 && now - timestamp in 0..5000
}
