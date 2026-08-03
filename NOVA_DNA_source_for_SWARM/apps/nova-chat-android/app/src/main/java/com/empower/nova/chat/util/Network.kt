package com.empower.nova.chat.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import retrofit2.HttpException
import java.io.IOException

fun Context.isNetworkAvailable(): Boolean =
    runCatching {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return@runCatching true
        val network = cm.activeNetwork ?: return@runCatching false
        val caps = cm.getNetworkCapabilities(network) ?: return@runCatching false
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }.getOrDefault(true)

fun Throwable.isOfflineError(): Boolean =
    this is IOException ||
        (message?.contains("Unable to resolve host", ignoreCase = true) == true) ||
        (message?.contains("Cannot reach server", ignoreCase = true) == true) ||
        (message?.contains("failed to connect", ignoreCase = true) == true) ||
        (message?.contains("timeout", ignoreCase = true) == true)

/**
 * True only for definitive HTTP 401 / known session-revoked codes.
 * Avoids logging users out on transient network failures or generic error text.
 */
fun Throwable.isUnauthorizedError(): Boolean {
    var current: Throwable? = this
    while (current != null) {
        if (current is HttpException && current.code() == 401) return true
        val message = current.message.orEmpty()
        if (
            message.contains("SESSION_EXPIRED", ignoreCase = true) ||
            message.contains("SESSION_REVOKED", ignoreCase = true) ||
            message.contains("REFRESH_TOKEN_EXPIRED", ignoreCase = true) ||
            message.contains("INVALID_REFRESH_TOKEN", ignoreCase = true) ||
            message.contains("invalid_token", ignoreCase = true)
        ) {
            return true
        }
        current = current.cause
    }
    return false
}
